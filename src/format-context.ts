import { createHash } from "node:crypto";

import type { RetrievedMemory } from "./remex-client.ts";

const BLOCK_OPEN = "<remex_memory>";
const BLOCK_CLOSE = "</remex_memory>";

export function formatRemexMemoryBlock(
  memories: readonly RetrievedMemory[],
): string | undefined {
  if (memories.length === 0) {
    return undefined;
  }

  const lines = memories.map((memory, index) => `${index + 1}. ${memory.content.trim()}`);
  return [
    BLOCK_OPEN,
    "Relevant memories retrieved from persistent memory:",
    ...lines,
    "Use these memories only when relevant.",
    BLOCK_CLOSE,
  ].join("\n");
}

/** Stable fingerprint for dedupe across tool-continuation pre-steps. */
export function recallFingerprint(memories: readonly RetrievedMemory[]): string {
  const payload = memories
    .map((memory) => `${memory.id}:${memory.content}:${memory.score}`)
    .join("|");
  return createHash("sha1").update(payload).digest("hex");
}

export function isRemexMemoryBlock(content: string): boolean {
  return content.includes(BLOCK_OPEN) && content.includes(BLOCK_CLOSE);
}
