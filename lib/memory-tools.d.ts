import type { Context } from "@deepseek-ai/cordis";
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
/** Minimal tool registry seam — raw definitions are accepted by `ctx.tools.register`. */
export interface ToolRegistrar {
    register(definition: MemorySearchToolRegistration): () => void;
}
export interface MemorySearchToolRegistration {
    name: typeof MEMORY_SEARCH_TOOL_NAME;
    description: string;
    parameters: Record<string, unknown>;
    execute(args: MemorySearchArgs): Promise<MemorySearchResult>;
}
declare module "@deepseek-ai/cordis" {
    interface Context {
        tools: ToolRegistrar;
    }
}
export declare function memoryOf(ctx: Context): MemoryService;
export declare function executeMemorySearch(memory: MemoryService, args: MemorySearchArgs, defaults?: Pick<MemoryToolsConfig, "tokenBudget" | "limit">): Promise<MemorySearchResult>;
export declare function buildMemorySearchToolRegistration(getMemory: () => MemoryService, config?: MemoryToolsConfig): MemorySearchToolRegistration;
export declare function apply(ctx: Context, config?: MemoryToolsConfig): void;
export declare namespace apply {
    var inject: string[];
}
export default apply;
//# sourceMappingURL=memory-tools.d.ts.map