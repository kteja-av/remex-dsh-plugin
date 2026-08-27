import type { CoreMemoryBlock, CoreMemoryBlockKey } from "./remex-client.ts";
/** Owner-scoped working-memory block order (M19 compiler priority). */
export declare const CORE_MEMORY_BLOCK_ORDER: readonly CoreMemoryBlockKey[];
export declare function formatRemexCoreMemoryBlock(blocks: readonly CoreMemoryBlock[]): string | undefined;
export declare function isRemexCoreMemoryBlock(content: string): boolean;
//# sourceMappingURL=core-memory.d.ts.map