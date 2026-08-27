import type { Context } from "@deepseek-ai/cordis";
import { type ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { MemoryService } from "./memory.ts";
export declare const MEMORY_SEARCH_TOOL_NAME: "memory_search";
export interface MemoryToolsConfig {
    enabled?: boolean;
    tokenBudget?: number;
    limit?: number;
}
export interface MemorySearchArgs {
    query: string;
    tokenBudget?: number;
    limit?: number;
}
export interface MemorySearchEntry {
    id: string;
    type: string;
    content: string;
    score: number;
}
export interface MemorySearchResult {
    memories: MemorySearchEntry[];
    tokenCount: number;
    formatted?: string;
}
/** Canonical output for `memory_search` (JSON lossless payload). */
export type MemorySearchValue = MemorySearchResult;
declare module "@deepseek-ai/cordis" {
    interface Context {
        tools: import("@deepseek-ai/dsh-tools").ToolRuntime;
    }
}
export declare function memoryOf(ctx: Context): MemoryService;
export declare function executeMemorySearch(memory: MemoryService, args: MemorySearchArgs, defaults?: Pick<MemoryToolsConfig, "tokenBudget" | "limit">): Promise<MemorySearchResult>;
export declare function buildMemorySearchToolDefinition(getMemory: () => MemoryService, config?: MemoryToolsConfig): ToolDefinition;
export declare function apply(ctx: Context, config?: MemoryToolsConfig): void;
export declare namespace apply {
    var inject: string[];
}
export default apply;
//# sourceMappingURL=memory-tools.d.ts.map