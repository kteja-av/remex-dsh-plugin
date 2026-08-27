import type { CoreMemoryBlock, CoreMemoryBlockKey } from "./remex-client.ts";

const BLOCK_OPEN = "<remex_core_memory>";
const BLOCK_CLOSE = "</remex_core_memory>";

/** Owner-scoped working-memory block order (M19 compiler priority). */
export const CORE_MEMORY_BLOCK_ORDER: readonly CoreMemoryBlockKey[] = [
  "persona",
  "human",
  "task_scratchpad",
];

export function formatRemexCoreMemoryBlock(
  blocks: readonly CoreMemoryBlock[],
): string | undefined {
  const present = blocks.filter((block) => block.content.trim().length > 0);
  if (present.length === 0) {
    return undefined;
  }

  const ordered = [...present].sort((a, b) => {
    const aIndex = CORE_MEMORY_BLOCK_ORDER.indexOf(a.block);
    const bIndex = CORE_MEMORY_BLOCK_ORDER.indexOf(b.block);
    return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
      (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
  });

  const lines = ordered.map((block) => `${block.block}: ${block.content.trim()}`);
  return [
    BLOCK_OPEN,
    "Persistent working memory owned by this user:",
    ...lines,
    "Use these only when relevant to the current request.",
    BLOCK_CLOSE,
  ].join("\n");
}

export function isRemexCoreMemoryBlock(content: string): boolean {
  return content.includes(BLOCK_OPEN) && content.includes(BLOCK_CLOSE);
}
