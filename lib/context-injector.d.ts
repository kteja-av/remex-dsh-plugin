import type { Context } from "@deepseek-ai/cordis";
import { type Message, type UserMessage } from "@deepseek-ai/dsh-llm";
import type { RecallResult } from "./memory.ts";
import { RemexClient } from "./remex-client.ts";
export declare const PLUGIN_NAME = "remex-dsh-plugin";
export interface CoreMemoryInjectConfig {
    enabled?: boolean;
    baseUrl?: string;
    tenantId?: string;
    userId?: string;
    timeoutMs?: number;
}
export interface ContextInjectorConfig {
    enabled?: boolean;
    tokenBudget?: number;
    limit?: number;
    coreMemory?: CoreMemoryInjectConfig;
}
export interface PreStepDecision {
    kind: "enter" | "reject" | string;
    messages: Message[];
}
export interface PreStepPayload {
    agent: {
        session?: object;
    };
    messages: Message[];
    step: number;
    signal: {
        throwIfAborted(): void;
    };
}
declare module "@deepseek-ai/cordis" {
    interface Events {
        "agent/pre-step": (payload: PreStepPayload, next: () => Promise<PreStepDecision>) => PreStepDecision | Promise<PreStepDecision>;
    }
}
export interface PreStepInjectionInput {
    claimedMessages: readonly Message[];
    decision: PreStepDecision;
    recallResult: RecallResult;
    lastFingerprint?: string | undefined;
}
export interface PreStepInjectionResult {
    decision: PreStepDecision;
    fingerprint?: string | undefined;
}
/** Extract query text from the last durable user message in the claimed batch. */
export declare function extractLastUserMessageText(messages: readonly Message[]): string | undefined;
/** Fold injected context immediately after the claimed batch in the waterfall. */
export declare function foldAfterClaimed(allMessages: readonly Message[], claimedBatch: readonly Message[], injected: Message): Message[];
export declare function createRemexContextMessage(block: string): UserMessage;
export declare function foldCoreMemoryBlock(decision: PreStepDecision, claimedMessages: readonly Message[], block: string): PreStepDecision;
export declare function buildCoreMemoryClient(config: CoreMemoryInjectConfig): RemexClient | undefined;
export declare function handlePreStepInjection(input: PreStepInjectionInput): PreStepInjectionResult;
export declare function apply(ctx: Context, config?: ContextInjectorConfig): void;
export declare namespace apply {
    var inject: string[];
}
export default apply;
//# sourceMappingURL=context-injector.d.ts.map