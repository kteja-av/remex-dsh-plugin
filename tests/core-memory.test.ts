import { describe, expect, it } from "vitest";

import {
  CORE_MEMORY_BLOCK_ORDER,
  formatRemexCoreMemoryBlock,
  isRemexCoreMemoryBlock,
} from "../src/core-memory.ts";
import type { CoreMemoryBlock } from "../src/remex-client.ts";

const blocks: CoreMemoryBlock[] = [
  {
    block: "human",
    content: "The user works on autonomous driving simulation.",
    version: 2,
    maxTokens: 512,
    updatedAt: "2026-08-27T12:00:00Z",
    sourceTurnIds: ["11111111-1111-4111-8111-111111111111"],
  },
  {
    block: "persona",
    content: "Assistant is concise and factual.",
    version: 1,
    maxTokens: 512,
    updatedAt: "2026-08-27T12:00:00Z",
    sourceTurnIds: ["22222222-2222-4222-8222-222222222222"],
  },
];

describe("formatRemexCoreMemoryBlock", () => {
  it("renders a distinct core-memory block with persona before human", () => {
    const block = formatRemexCoreMemoryBlock(blocks);

    expect(block).toContain("<remex_core_memory>");
    expect(block).toContain("</remex_core_memory>");
    expect(block).toContain("persona: Assistant is concise and factual.");
    expect(block).toContain("human: The user works on autonomous driving simulation.");
    expect(block!.indexOf("persona:")).toBeLessThan(block!.indexOf("human:"));
    expect(isRemexCoreMemoryBlock(block!)).toBe(true);
  });

  it("returns undefined for empty block lists", () => {
    expect(formatRemexCoreMemoryBlock([])).toBeUndefined();
  });

  it("skips whitespace-only blocks", () => {
    const whitespace: CoreMemoryBlock[] = [
      { ...blocks[0]!, content: "   " },
    ];
    expect(formatRemexCoreMemoryBlock(whitespace)).toBeUndefined();
  });

  it("keeps declared block priority order", () => {
    expect(CORE_MEMORY_BLOCK_ORDER).toEqual(["persona", "human", "task_scratchpad"]);
  });
});
