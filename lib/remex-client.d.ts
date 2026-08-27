import { type RemexIdentity } from "./identity.ts";
export type MemoryType = "episodic" | "semantic" | "procedural";
export interface RemexClientConfig {
    baseUrl: string;
    identity: RemexIdentity;
    timeoutMs?: number;
    defaultTokenBudget?: number;
    defaultLimit?: number;
    fetchImpl?: typeof fetch;
}
export interface RetrieveInput {
    query: string;
    tokenBudget?: number;
    limit?: number;
    /** Opt in to expired/superseded assertions (remex-ai M14 `historical=true`). */
    historical?: boolean;
}
export interface RetrievedMemory {
    id: string;
    type: MemoryType;
    content: string;
    sourceTurnIds: string[];
    createdAt: string;
    score: number;
}
export interface RetrieveResult {
    memories: RetrievedMemory[];
    tokenCount: number;
    degraded: boolean;
}
export interface EvaluateInput {
    type: MemoryType;
    content: string;
    sourceTurnIds: string[];
    importance?: number;
    participants?: string[];
    parentEpisodeId?: string;
}
export interface EvaluateResult {
    jobId: string;
}
export interface HealthResult {
    status: "ok" | "degraded";
    dependencies?: Record<string, unknown>;
}
export type CoreMemoryBlockKey = "persona" | "human" | "task_scratchpad";
export interface CoreMemoryBlock {
    block: CoreMemoryBlockKey;
    content: string;
    version: number;
    maxTokens: number;
    updatedAt: string;
    sourceTurnIds: string[];
}
export interface CoreMemorySnapshot {
    blocks: CoreMemoryBlock[];
}
export declare class RemexHttpError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
export declare class RemexClient {
    private readonly baseUrl;
    private readonly identity;
    private readonly timeoutMs;
    private readonly defaultTokenBudget;
    private readonly defaultLimit;
    private readonly fetchImpl;
    constructor(config: RemexClientConfig);
    health(): Promise<HealthResult>;
    retrieve(input: RetrieveInput): Promise<RetrieveResult>;
    readCoreMemory(): Promise<CoreMemorySnapshot>;
    evaluate(input: EvaluateInput): Promise<EvaluateResult>;
    private request;
}
//# sourceMappingURL=remex-client.d.ts.map