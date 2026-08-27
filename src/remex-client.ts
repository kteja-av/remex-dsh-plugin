import { buildAuthHeaders, type RemexIdentity } from "./identity.ts";

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

export class RemexHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RemexHttpError";
    this.status = status;
  }
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_TOKEN_BUDGET = 512;
const DEFAULT_LIMIT = 5;

interface RetrieveResponseBody {
  memories: Array<{
    id: string;
    type: MemoryType;
    content: string;
    source_turn_ids: string[];
    created_at: string;
    score: number;
  }>;
  token_count: number;
  degraded: boolean;
}

interface EvaluateResponseBody {
  job_id: string;
}

export class RemexClient {
  private readonly baseUrl: string;
  private readonly identity: RemexIdentity;
  private readonly timeoutMs: number;
  private readonly defaultTokenBudget: number;
  private readonly defaultLimit: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: RemexClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.identity = config.identity;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultTokenBudget = config.defaultTokenBudget ?? DEFAULT_TOKEN_BUDGET;
    this.defaultLimit = config.defaultLimit ?? DEFAULT_LIMIT;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async health(): Promise<HealthResult> {
    const response = await this.request("GET", "/v1/health", { auth: false });
    const body = (await response.json()) as HealthResult;
    return body;
  }

  async retrieve(input: RetrieveInput): Promise<RetrieveResult> {
    const tokenBudget = input.tokenBudget ?? this.defaultTokenBudget;
    const limit = input.limit ?? this.defaultLimit;
    const params = new URLSearchParams({
      query: input.query,
      token_budget: String(tokenBudget),
      limit: String(limit),
    });

    if (input.historical === true) {
      params.set("historical", "true");
    }

    const response = await this.request("GET", `/v1/memories:retrieve?${params.toString()}`);
    const body = (await response.json()) as RetrieveResponseBody;

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

  async evaluate(input: EvaluateInput): Promise<EvaluateResult> {
    const payload: Record<string, unknown> = {
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
    const body = (await response.json()) as EvaluateResponseBody;
    return { jobId: body.job_id };
  }

  private async request(
    method: string,
    path: string,
    options: {
      auth?: boolean;
      body?: Record<string, unknown>;
      expectedStatus?: number;
    } = {},
  ): Promise<Response> {
    const auth = options.auth ?? true;
    const expectedStatus = options.expectedStatus ?? 200;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (auth) {
      Object.assign(headers, buildAuthHeaders(this.identity));
    }

    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.timeoutMs),
    };
    if (body !== undefined) {
      init.body = body;
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);

    if (response.status !== expectedStatus) {
      const detail = await response.text();
      throw new RemexHttpError(
        response.status,
        `Remex ${method} ${path} failed with ${response.status}: ${detail}`,
      );
    }

    return response;
  }
}
