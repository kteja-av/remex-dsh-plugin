import type { Context } from "@deepseek-ai/cordis";
import type { UserMessage } from "@deepseek-ai/dsh-llm";
import type { SaveInput } from "./memory.ts";
import { type MemoryType } from "./remex-client.ts";
export interface RememberConfig {
    enabled?: boolean;
    rememberType?: MemoryType;
}
export interface TurnRememberBuffer {
    turn: number;
    userMessageId?: string;
    userText?: string;
    assistantMessages: Array<{
        id: string;
        text: string;
    }>;
}
export interface TurnEndReasonLike {
    kind: string;
}
export interface SessionEventLike {
    type: string;
    data: unknown;
}
export interface RememberState {
    activeTurn?: number;
    buffers: Map<number, TurnRememberBuffer>;
    enqueuedTurns: Set<number>;
}
/** Only durable human prompts — skip plugin injects and tool results. */
export declare function isDurableUserMessage(message: UserMessage): boolean;
export declare function shouldRememberTurn(reason: TurnEndReasonLike): boolean;
export declare function createRememberState(): RememberState;
/**
 * Format durable user text for Remex Write Gate admission.
 * remex-ai local_rule_judge admits only candidates starting with "the user"
 * and rejects any content containing "assistant".
 */
export declare function formatUserFactForEvaluate(userText: string): string | undefined;
export declare function buildRememberContent(buffer: TurnRememberBuffer): string | undefined;
export declare function buildSaveInput(buffer: TurnRememberBuffer, rememberType?: MemoryType): SaveInput | undefined;
/**
 * Pure session/event reducer. Returns a save candidate when a completed turn
 * ends with durable user input; otherwise undefined.
 */
export declare function handleSessionEvent(state: RememberState, event: SessionEventLike, rememberType?: MemoryType): SaveInput | undefined;
export declare function enqueueRemember(save: (input: SaveInput) => Promise<{
    jobId: string;
}>, input: SaveInput, log: (message: string, error?: unknown) => void): Promise<void>;
export declare function apply(ctx: Context, config?: RememberConfig): void;
export declare namespace apply {
    var inject: string[];
}
export default apply;
//# sourceMappingURL=remember.d.ts.map