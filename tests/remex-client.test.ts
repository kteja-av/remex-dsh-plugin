import { describe, expect, it, vi } from "vitest";

import {
  RemexClient,
  RemexHttpError,
  type EvaluateInput,
  type RetrieveInput,
} from "../src/remex-client.ts";
import {
  buildAuthHeaders,
  messageIdToTurnUuid,
  type RemexIdentity,
} from "../src/identity.ts";

const identity: RemexIdentity = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("identity", () => {
  it("builds Remex auth headers", () => {
    expect(buildAuthHeaders(identity)).toEqual({
      "X-Tenant-ID": identity.tenantId,
      "X-User-ID": identity.userId,
    });
  });

  it("maps message ids to stable UUID v5 turn ids", () => {
    const first = messageIdToTurnUuid("msg-abc");
    const second = messageIdToTurnUuid("msg-abc");
    const other = messageIdToTurnUuid("msg-xyz");

    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});

describe("RemexClient", () => {
  it("checks health without auth headers", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ status: "ok", dependencies: { postgres: { reachable: true } } }),
    );
    const client = new RemexClient({
      baseUrl: "http://localhost:8000",
      identity,
      fetchImpl,
    });

    const result = await client.health();

    expect(result.status).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/v1/health");
    expect(init.method).toBe("GET");
    expect(init.headers).not.toHaveProperty("X-Tenant-ID");
  });

  it("retrieves memories using query param and auth headers", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        memories: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            type: "semantic",
            content: "User prefers dosa.",
            source_turn_ids: ["44444444-4444-4444-8444-444444444444"],
            created_at: "2026-08-20T12:00:00Z",
            score: 0.91,
          },
        ],
        token_count: 12,
        degraded: false,
      }),
    );
    const client = new RemexClient({
      baseUrl: "http://localhost:8000/",
      identity,
      fetchImpl,
    });
    const input: RetrieveInput = {
      query: "dosa preference",
      tokenBudget: 256,
      limit: 3,
    };

    const result = await client.retrieve(input);

    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]?.content).toBe("User prefers dosa.");
    expect(result.memories[0]?.sourceTurnIds).toEqual([
      "44444444-4444-4444-8444-444444444444",
    ]);
    expect(result.tokenCount).toBe(12);
    expect(result.degraded).toBe(false);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/memories:retrieve?");
    expect(url).toContain("query=dosa+preference");
    expect(url).not.toContain("q=");
    expect(url).toContain("token_budget=256");
    expect(url).toContain("limit=3");
    expect(init.headers).toMatchObject(buildAuthHeaders(identity));
    expect(init.signal).toBeDefined();
  });

  it("omits historical param by default", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ memories: [], token_count: 0, degraded: false }),
    );
    const client = new RemexClient({ baseUrl: "http://localhost:8000", identity, fetchImpl });

    await client.retrieve({ query: "active only" });

    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("historical=");
  });

  it("emits historical=true only when opted in", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ memories: [], token_count: 0, degraded: false }),
    );
    const client = new RemexClient({ baseUrl: "http://localhost:8000", identity, fetchImpl });

    await client.retrieve({ query: "history", historical: true });

    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("historical=true");
  });

  it("does not emit historical=false when explicitly opted out", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ memories: [], token_count: 0, degraded: false }),
    );
    const client = new RemexClient({ baseUrl: "http://localhost:8000", identity, fetchImpl });

    await client.retrieve({ query: "active only", historical: false });

    const [url] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain("historical=");
  });

  it("maps degraded retrieve responses", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ memories: [], token_count: 0, degraded: true }),
    );
    const client = new RemexClient({ baseUrl: "http://localhost:8000", identity, fetchImpl });

    const result = await client.retrieve({ query: "anything" });

    expect(result.memories).toEqual([]);
    expect(result.tokenCount).toBe(0);
    expect(result.degraded).toBe(true);
  });

  it("throws RemexHttpError on retrieve failures for provider fail-open handling", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ detail: "upstream error" }, 503));
    const client = new RemexClient({ baseUrl: "http://localhost:8000", identity, fetchImpl });

    await expect(client.retrieve({ query: "fail" })).rejects.toBeInstanceOf(RemexHttpError);
    await expect(client.retrieve({ query: "fail" })).rejects.toMatchObject({ status: 503 });
  });

  it("enqueues evaluate jobs and returns job_id on 202", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        ...buildAuthHeaders(identity),
        "Content-Type": "application/json",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        type: "semantic",
        content: "User said they drive autonomously.",
        source_turn_ids: [messageIdToTurnUuid("turn-1")],
        participants: ["user", "assistant"],
      });
      return jsonResponse({ job_id: "job-123" }, 202);
    });
    const client = new RemexClient({ baseUrl: "http://localhost:8000", identity, fetchImpl });
    const input: EvaluateInput = {
      type: "semantic",
      content: "User said they drive autonomously.",
      sourceTurnIds: [messageIdToTurnUuid("turn-1")],
      participants: ["user", "assistant"],
    };

    const result = await client.evaluate(input);

    expect(result.jobId).toBe("job-123");
  });

  it("throws on evaluate 429 queue backpressure", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ detail: "write gate queue is at capacity" }, 429),
    );
    const client = new RemexClient({ baseUrl: "http://localhost:8000", identity, fetchImpl });

    await expect(
      client.evaluate({
        type: "semantic",
        content: "overflow",
        sourceTurnIds: [messageIdToTurnUuid("turn-2")],
      }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("uses configured timeout on outbound requests", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "ok" }));
    const client = new RemexClient({
      baseUrl: "http://localhost:8000",
      identity,
      timeoutMs: 2500,
      fetchImpl,
    });

    await client.health();

    expect(timeoutSpy).toHaveBeenCalledWith(2500);
    timeoutSpy.mockRestore();
  });
});
