import { EMPTY_RECALL, MemoryService, } from "./memory.js";
import { RemexClient } from "./remex-client.js";
const DEFAULT_BASE_URL = "http://localhost:8000";
const DEFAULT_TOKEN_BUDGET = 512;
const DEFAULT_LIMIT = 5;
export class RemexMemoryProvider extends MemoryService {
    client;
    rememberType;
    defaultTokenBudget;
    defaultLimit;
    constructor(ctx, config) {
        super(ctx);
        this.defaultTokenBudget = config.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
        this.defaultLimit = config.limit ?? DEFAULT_LIMIT;
        this.rememberType = config.rememberType ?? "semantic";
        if (config.client !== undefined) {
            this.client = config.client;
        }
        else {
            const identity = {
                tenantId: config.tenantId,
                userId: config.userId,
            };
            this.client = new RemexClient({
                baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
                identity,
                ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
                defaultTokenBudget: this.defaultTokenBudget,
                defaultLimit: this.defaultLimit,
            });
        }
    }
    async recall(query, options) {
        try {
            const result = await this.client.retrieve({
                query: query.trim(),
                tokenBudget: options?.tokenBudget ?? this.defaultTokenBudget,
                limit: options?.limit ?? this.defaultLimit,
            });
            if (result.degraded) {
                this.logRetrieveFailure("Remex retrieve returned degraded=true");
                return EMPTY_RECALL;
            }
            return {
                memories: result.memories,
                tokenCount: result.tokenCount,
                degraded: false,
            };
        }
        catch (error) {
            this.logRetrieveFailure("Remex retrieve failed", error);
            return EMPTY_RECALL;
        }
    }
    async save(input) {
        const evaluateInput = {
            type: input.type ?? this.rememberType,
            content: input.content,
            sourceTurnIds: input.sourceTurnIds,
            ...(input.importance !== undefined ? { importance: input.importance } : {}),
            ...(input.participants !== undefined ? { participants: input.participants } : {}),
            ...(input.parentEpisodeId !== undefined ? { parentEpisodeId: input.parentEpisodeId } : {}),
        };
        const result = await this.client.evaluate(evaluateInput);
        return { jobId: result.jobId };
    }
    logRetrieveFailure(message, error) {
        if (error === undefined) {
            this.ctx.logger.warn(`[remex-memory] ${message}`);
            return;
        }
        this.ctx.logger.warn(`[remex-memory] ${message}:`, error);
    }
}
export default RemexMemoryProvider;
//# sourceMappingURL=remex-provider.js.map