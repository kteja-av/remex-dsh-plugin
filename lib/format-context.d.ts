import type { RetrievedMemory } from "./remex-client.ts";
export declare function formatRemexMemoryBlock(memories: readonly RetrievedMemory[]): string | undefined;
/** Stable fingerprint for dedupe across tool-continuation pre-steps. */
export declare function recallFingerprint(memories: readonly RetrievedMemory[]): string;
export declare function isRemexMemoryBlock(content: string): boolean;
//# sourceMappingURL=format-context.d.ts.map