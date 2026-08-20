import type { Context } from "@deepseek-ai/cordis";
import { describe, expect, it, vi } from "vitest";

import { messageIdToTurnUuid } from "../src/identity.ts";
import { EMPTY_RECALL } from "../src/memory.ts";
import { RemexMemoryProvider } from "../src/remex-provider.ts";
import {
  RemexClient,
  RemexHttpError,
  type EvaluateResult,
  type RetrieveResult,
} from "../src/remex-client.ts";

const baseConfig = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
};

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

function mockClient(overrides: Partial<RemexClient> = {}): RemexClient {
  return {
    retrieve: vi.fn(),
    evaluate: vi.fn(),
    health: vi.fn(),
    ...overrides,
  } as unknown as RemexClient;
}

describe("RemexMemoryProvider", () => {
  it("delegates recall to the Remex client and maps memories", async () => {
    const retrieve = vi.fn(async (): Promise<RetrieveResult> => ({
      memories: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          type: "semantic",
          content: "User prefers dosa.",
          sourceTurnIds: ["44444444-4444-4444-8444-444444444444"],
          createdAt: "2026-08-20T12:00:00Z",
          score: 0.88,
        },
      ],
      tokenCount: 8,
      degraded: false,
    }));
    const provider = new RemexMemoryProvider(mockContext(), {
      ...baseConfig,
      client: mockClient({ retrieve }),
    });

    const result = await provider.recall("dosa", { tokenBudget: 256, limit: 3 });

    expect(retrieve).toHaveBeenCalledWith({
      query: "dosa",
      tokenBudget: 256,
      limit: 3,
    });
    expect(result.memories).toHaveLength(1);
    expect(result.memories[0]?.content).toBe("User prefers dosa.");
    expect(result.tokenCount).toBe(8);
    expect(result.degraded).toBe(false);
  });

  it("returns empty recall when the client throws (fail-open)", async () => {
    const retrieve = vi.fn(async () => {
      throw new RemexHttpError(503, "upstream unavailable");
    });
    const ctx = mockContext();
    const provider = new RemexMemoryProvider(ctx, {
      ...baseConfig,
      client: mockClient({ retrieve }),
    });

    const result = await provider.recall("anything");

    expect(result).toEqual(EMPTY_RECALL);
    expect(ctx.logger.warn).toHaveBeenCalled();
  });

  it("returns empty recall when Remex marks the response degraded", async () => {
    const retrieve = vi.fn(async (): Promise<RetrieveResult> => ({
      memories: [],
      tokenCount: 0,
      degraded: true,
    }));
    const provider = new RemexMemoryProvider(mockContext(), {
      ...baseConfig,
      client: mockClient({ retrieve }),
    });

    const result = await provider.recall("anything");

    expect(result).toEqual(EMPTY_RECALL);
  });

  it("delegates save to evaluate and returns job id", async () => {
    const evaluate = vi.fn(async (): Promise<EvaluateResult> => ({ jobId: "job-456" }));
    const turnId = messageIdToTurnUuid("turn-9");
    const provider = new RemexMemoryProvider(mockContext(), {
      ...baseConfig,
      rememberType: "semantic",
      client: mockClient({ evaluate }),
    });

    const result = await provider.save({
      content: "User drives autonomously.",
      sourceTurnIds: [turnId],
      participants: ["user", "assistant"],
    });

    expect(evaluate).toHaveBeenCalledWith({
      type: "semantic",
      content: "User drives autonomously.",
      sourceTurnIds: [turnId],
      participants: ["user", "assistant"],
    });
    expect(result.jobId).toBe("job-456");
  });
});
