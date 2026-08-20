import { Context } from "@deepseek-ai/cordis";
import { MemoryService, type RecallOptions, type RecallResult, type SaveInput, type SaveResult } from "./memory.ts";
import { RemexClient, type MemoryType } from "./remex-client.ts";
export interface RemexProviderConfig {
    baseUrl?: string;
    tenantId: string;
    userId: string;
    timeoutMs?: number;
    tokenBudget?: number;
    limit?: number;
    rememberType?: MemoryType;
    /** Optional client override (tests only). */
    client?: RemexClient;
}
export declare class RemexMemoryProvider extends MemoryService {
    private readonly client;
    private readonly rememberType;
    private readonly defaultTokenBudget;
    private readonly defaultLimit;
    constructor(ctx: Context, config: RemexProviderConfig);
    recall(query: string, options?: RecallOptions): Promise<RecallResult>;
    save(input: SaveInput): Promise<SaveResult>;
    private logRetrieveFailure;
}
export default RemexMemoryProvider;
//# sourceMappingURL=remex-provider.d.ts.map