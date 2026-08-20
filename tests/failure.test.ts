import { createUserMessage } from "@deepseek-ai/dsh-llm";
import type { Context } from "@deepseek-ai/cordis";
import { describe, expect, it, vi } from "vitest";

import {
  extractLastUserMessageText,
  handlePreStepInjection,
} from "../src/context-injector.ts";
import { EMPTY_RECALL } from "../src/memory.ts";
import { RemexMemoryProvider } from "../src/remex-provider.ts";
import { RemexClient } from "../src/remex-client.ts";
import type { RemexIdentity } from "../src/identity.ts";

const identity: RemexIdentity = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockContext(): Context {
  return {
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
    reflect: {
      provide: vi.fn(),
    },
  } as unknown as Context;
}

function userMessage(text: string) {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "user" },
  });
}

function stoppedApiClient(
  failure: () => Response | Promise<Response> | never,
): RemexClient {
  const fetchImpl = vi.fn(async () => failure());
  return new RemexClient({
    baseUrl: "http://localhost:8000",
    identity,
    timeoutMs: 100,
    fetchImpl,
  });
}

async function recallThroughProvider(client: RemexClient, query: string) {
  const provider = new RemexMemoryProvider(mockContext(), {
    tenantId: identity.tenantId,
    userId: identity.userId,
    client,
  });
  return provider.recall(query);
}

async function simulatePreStep(query: string, client: RemexClient) {
  const claimed = [userMessage(query)];
  const decision = { kind: "enter" as const, messages: [...claimed] };
  const recallResult = await recallThroughProvider(client, query);
  const injection = handlePreStepInjection({
    claimedMessages: claimed,
    decision,
    recallResult,
  });
  return { decision, recallResult, injection };
}

describe("fail-open when Remex API is stopped", () => {
  it("returns empty recall on HTTP 503 (service stopped)", async () => {
    const client = stoppedApiClient(() =>
      jsonResponse({ detail: "service unavailable" }, 503),
    );

    const result = await recallThroughProvider(client, "anything");

    expect(result).toEqual(EMPTY_RECALL);
  });

  it("returns empty recall when fetch fails (connection refused)", async () => {
    const client = stoppedApiClient(() => {
      throw new TypeError("fetch failed");
    });

    const result = await recallThroughProvider(client, "anything");

    expect(result).toEqual(EMPTY_RECALL);
  });

  it("returns empty recall when Remex responds degraded", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          memories: [],
          token_count: 0,
          degraded: true,
        },
        200,
      ),
    );
    const client = new RemexClient({
      baseUrl: "http://localhost:8000",
      identity,
      fetchImpl,
    });

    const result = await recallThroughProvider(client, "anything");

    expect(result).toEqual(EMPTY_RECALL);
  });
});

describe("agent continues with empty memory context", () => {
  it("pre-step does not throw when retrieve fails", async () => {
    const client = stoppedApiClient(() =>
      jsonResponse({ detail: "upstream unavailable" }, 503),
    );

    await expect(
      simulatePreStep("What do you know about my work?", client),
    ).resolves.toBeDefined();
  });

  it("pre-step leaves messages unchanged when recall is empty", async () => {
    const client = stoppedApiClient(() =>
      jsonResponse({ detail: "upstream unavailable" }, 503),
    );

    const { decision, injection } = await simulatePreStep(
      "What do you know about my work?",
      client,
    );

    expect(injection.decision).toEqual(decision);
    expect(injection.fingerprint).toBeUndefined();
    for (const message of injection.decision.messages) {
      const text = message.content
        .filter((block): block is { type: "text"; text: string } => block.type === "text")
        .map((block) => block.text)
        .join("\n");
      expect(text).not.toContain("<remex_memory>");
    }
  });

  it("extracts the user query and proceeds without remex_memory injection", async () => {
    const client = stoppedApiClient(() => {
      throw new TypeError("fetch failed");
    });
    const query = "Tell me what you remember.";

    const { injection } = await simulatePreStep(query, client);
    const extracted = extractLastUserMessageText(injection.decision.messages);

    expect(extracted).toBe(query);
    expect(injection.decision.messages).toHaveLength(1);
    expect(injection.decision.kind).toBe("enter");
  });

  it("never propagates retrieve errors to the agent loop", async () => {
    const ctx = mockContext();
    const fetchImpl = vi.fn(async () => jsonResponse({ detail: "gone" }, 503));
    const client = new RemexClient({
      baseUrl: "http://localhost:8000",
      identity,
      fetchImpl,
    });
    const provider = new RemexMemoryProvider(ctx, {
      tenantId: identity.tenantId,
      userId: identity.userId,
      client,
    });

    await expect(provider.recall("hello")).resolves.toEqual(EMPTY_RECALL);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });
});
