import type { Context } from "@deepseek-ai/cordis";
import { describe, expect, it, vi } from "vitest";

import { EMPTY_RECALL } from "../src/memory.ts";
import type { MemoryService } from "../src/memory.ts";
import {
  MEMORY_SEARCH_TOOL_NAME,
  apply,
  buildMemorySearchToolRegistration,
  executeMemorySearch,
  memoryOf,
} from "../src/memory-tools.ts";
import type { RetrievedMemory } from "../src/remex-client.ts";

const sampleMemories: RetrievedMemory[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    type: "semantic",
    content: "User works on autonomous driving simulation.",
    sourceTurnIds: ["44444444-4444-4444-8444-444444444444"],
    createdAt: "2026-08-20T12:00:00Z",
    score: 0.92,
  },
];

function mockMemory(overrides: Partial<MemoryService> = {}): MemoryService {
  return {
    recall: vi.fn(async () => ({
      memories: sampleMemories,
      tokenCount: 12,
      degraded: false,
    })),
    save: vi.fn(),
    ...overrides,
  } as unknown as MemoryService;
}

describe("executeMemorySearch", () => {
  it("delegates to ctx.memory.recall with the query", async () => {
    const recall = vi.fn(async () => ({
      memories: sampleMemories,
      tokenCount: 12,
      degraded: false,
    }));
    const memory = mockMemory({ recall });

    const result = await executeMemorySearch(
      memory,
      { query: "autonomous driving work" },
      { tokenBudget: 256, limit: 3 },
    );

    expect(recall).toHaveBeenCalledWith("autonomous driving work", {
      tokenBudget: 256,
      limit: 3,
    });
    expect(result.memories).toHaveLength(1);
    expect(result.formatted).toContain("<remex_memory>");
    expect(result.formatted).toContain("autonomous driving");
  });

  it("returns empty memories without formatted block on fail-open recall", async () => {
    const memory = mockMemory({
      recall: vi.fn(async () => EMPTY_RECALL),
    });

    const result = await executeMemorySearch(memory, { query: "anything" });

    expect(result.memories).toEqual([]);
    expect(result.tokenCount).toBe(0);
    expect(result.formatted).toBeUndefined();
  });

  it("rejects an empty query", async () => {
    const memory = mockMemory();

    await expect(executeMemorySearch(memory, { query: "   " })).rejects.toThrow(
      /non-empty string/,
    );
  });
});

describe("buildMemorySearchToolRegistration", () => {
  it("registers memory_search with recall-backed execute", async () => {
    const memory = mockMemory();
    const tool = buildMemorySearchToolRegistration(() => memory, {
      tokenBudget: 512,
      limit: 5,
    });

    expect(tool.name).toBe(MEMORY_SEARCH_TOOL_NAME);
    const result = await tool.execute({ query: "What work do I do?" });

    expect(memory.recall).toHaveBeenCalledWith("What work do I do?", {
      tokenBudget: 512,
      limit: 5,
    });
    expect(result.memories[0]?.content).toContain("autonomous driving");
  });
});

describe("apply", () => {
  it("registers memory_search on ctx.tools when enabled", () => {
    const register = vi.fn(() => () => {});
    const memory = mockMemory();
    const ctx = {
      inject: vi.fn((_deps: string[], callback: (scoped: Context) => void) => {
        callback({
          memory,
          tools: { register },
          get: (name: string) => (name === "memory" ? memory : undefined),
        } as unknown as Context);
      }),
    } as unknown as Context;

    apply(ctx, { enabled: true, tokenBudget: 512, limit: 5 });

    expect(register).toHaveBeenCalledOnce();
    expect(register.mock.calls[0]?.[0]?.name).toBe(MEMORY_SEARCH_TOOL_NAME);
  });

  it("skips registration when disabled", () => {
    const register = vi.fn();
    const ctx = {
      inject: vi.fn((_deps: string[], callback: (scoped: Context) => void) => {
        callback({
          memory: mockMemory(),
          tools: { register },
        } as unknown as Context);
      }),
    } as unknown as Context;

    apply(ctx, { enabled: false });

    expect(register).not.toHaveBeenCalled();
  });
});

describe("memoryOf", () => {
  it("throws when memory service is absent", () => {
    const ctx = {
      get: () => undefined,
    } as unknown as Context;

    expect(() => memoryOf(ctx)).toThrow(/memory service unavailable/);
  });
});
