import { Context, Service } from "@deepseek-ai/cordis";
import type { MemoryType, RetrievedMemory } from "./remex-client.ts";
export interface RecallOptions {
    tokenBudget?: number;
    limit?: number;
}
export interface RecallResult {
    memories: RetrievedMemory[];
    tokenCount: number;
    degraded: boolean;
}
export interface SaveInput {
    type?: MemoryType;
    content: string;
    sourceTurnIds: string[];
    importance?: number;
    participants?: string[];
    parentEpisodeId?: string;
}
export interface SaveResult {
    jobId: string;
}
export declare const EMPTY_RECALL: RecallResult;
declare module "@deepseek-ai/cordis" {
    interface Context {
        memory: MemoryService;
    }
}
/**
 * Abstract cross-session memory seam (`ctx.memory`). The Remex-backed
 * implementation lives in `remex-provider.ts`.
 */
export declare abstract class MemoryService extends Service {
    constructor(ctx: Context);
    abstract recall(query: string, options?: RecallOptions): Promise<RecallResult>;
    abstract save(input: SaveInput): Promise<SaveResult>;
}
export default MemoryService;
//# sourceMappingURL=memory.d.ts.map