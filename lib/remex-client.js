import { buildAuthHeaders } from "./identity.js";
export class RemexHttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.name = "RemexHttpError";
        this.status = status;
    }
}
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_TOKEN_BUDGET = 512;
const DEFAULT_LIMIT = 5;
export class RemexClient {
    baseUrl;
    identity;
    timeoutMs;
    defaultTokenBudget;
    defaultLimit;
    fetchImpl;
    constructor(config) {
        this.baseUrl = config.baseUrl.replace(/\/$/, "");
        this.identity = config.identity;
        this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.defaultTokenBudget = config.defaultTokenBudget ?? DEFAULT_TOKEN_BUDGET;
        this.defaultLimit = config.defaultLimit ?? DEFAULT_LIMIT;
        this.fetchImpl = config.fetchImpl ?? fetch;
    }
    async health() {
        const response = await this.request("GET", "/v1/health", { auth: false });
        const body = (await response.json());
        return body;
    }
    async retrieve(input) {
        const tokenBudget = input.tokenBudget ?? this.defaultTokenBudget;
        const limit = input.limit ?? this.defaultLimit;
        const params = new URLSearchParams({
            query: input.query,
            token_budget: String(tokenBudget),
            limit: String(limit),
        });
        const response = await this.request("GET", `/v1/memories:retrieve?${params.toString()}`);
        const body = (await response.json());
        return {
            memories: body.memories.map((memory) => ({
                id: memory.id,
                type: memory.type,
                content: memory.content,
                sourceTurnIds: memory.source_turn_ids,
                createdAt: memory.created_at,
                score: memory.score,
            })),
            tokenCount: body.token_count,
            degraded: body.degraded,
        };
    }
    async evaluate(input) {
        const payload = {
            type: input.type,
            content: input.content,
            source_turn_ids: input.sourceTurnIds,
        };
        if (input.importance !== undefined) {
            payload.importance = input.importance;
        }
        if (input.participants !== undefined) {
            payload.participants = input.participants;
        }
        if (input.parentEpisodeId !== undefined) {
            payload.parent_episode_id = input.parentEpisodeId;
        }
        const response = await this.request("POST", "/v1/memories:evaluate", {
            body: payload,
            expectedStatus: 202,
        });
        const body = (await response.json());
        return { jobId: body.job_id };
    }
    async request(method, path, options = {}) {
        const auth = options.auth ?? true;
        const expectedStatus = options.expectedStatus ?? 200;
        const headers = {
            Accept: "application/json",
        };
        if (auth) {
            Object.assign(headers, buildAuthHeaders(this.identity));
        }
        let body;
        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(options.body);
        }
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method,
            headers,
            body,
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (response.status !== expectedStatus) {
            const detail = await response.text();
            throw new RemexHttpError(response.status, `Remex ${method} ${path} failed with ${response.status}: ${detail}`);
        }
        return response;
    }
}
//# sourceMappingURL=remex-client.js.map