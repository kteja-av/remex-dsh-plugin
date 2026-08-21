import { messageIdToTurnUuid } from "./identity.js";
import { RemexHttpError } from "./remex-client.js";
function textFromMessage(message) {
    return message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
}
/** Only durable human prompts — skip plugin injects and tool results. */
export function isDurableUserMessage(message) {
    return message.source.kind === "user";
}
export function shouldRememberTurn(reason) {
    return reason.kind === "completed";
}
export function createRememberState() {
    return { buffers: new Map(), enqueuedTurns: new Set() };
}
/**
 * Format durable user text for Remex Write Gate admission.
 * remex-ai local_rule_judge admits only candidates starting with "the user"
 * and rejects any content containing "assistant".
 */
export function formatUserFactForEvaluate(userText) {
    const trimmed = userText.trim();
    if (trimmed.length === 0) {
        return undefined;
    }
    const lowered = trimmed.toLowerCase();
    if (lowered.includes("assistant")) {
        return undefined;
    }
    if (lowered.startsWith("the user")) {
        return trimmed;
    }
    if (/^my name is\b/i.test(trimmed)) {
        return trimmed.replace(/^my name is\b/i, "The user's name is");
    }
    if (/^i am\b/i.test(trimmed)) {
        return trimmed.replace(/^i am\b/i, "The user is");
    }
    if (/^i'm\b/i.test(trimmed)) {
        return trimmed.replace(/^i'm\b/i, "The user is");
    }
    if (/^i have\b/i.test(trimmed)) {
        return trimmed.replace(/^i have\b/i, "The user has");
    }
    if (/^i've\b/i.test(trimmed)) {
        return trimmed.replace(/^i've\b/i, "The user has");
    }
    if (/^i work on\b/i.test(trimmed)) {
        return trimmed.replace(/^i work on\b/i, "The user works on");
    }
    if (/^i work\b/i.test(trimmed)) {
        return trimmed.replace(/^i work\b/i, "The user works");
    }
    if (/^i like\b/i.test(trimmed)) {
        return trimmed.replace(/^i like\b/i, "The user likes");
    }
    if (/^i prefer\b/i.test(trimmed)) {
        return trimmed.replace(/^i prefer\b/i, "The user prefers");
    }
    if (/^today i\b/i.test(trimmed)) {
        return trimmed.replace(/^today i\b/i, "Today the user");
    }
    if (/^my\b/i.test(trimmed)) {
        return trimmed.replace(/^my\b/i, "The user's");
    }
    if (/^i\b/i.test(trimmed)) {
        return trimmed.replace(/^i\b/i, "The user");
    }
    return `The user said: ${trimmed}`;
}
export function buildRememberContent(buffer) {
    if (buffer.userText === undefined) {
        return undefined;
    }
    return formatUserFactForEvaluate(buffer.userText);
}
export function buildSaveInput(buffer, rememberType = "semantic") {
    const content = buildRememberContent(buffer);
    if (content === undefined) {
        return undefined;
    }
    const sourceTurnIds = [];
    if (buffer.userMessageId !== undefined) {
        sourceTurnIds.push(messageIdToTurnUuid(buffer.userMessageId));
    }
    for (const assistant of buffer.assistantMessages) {
        sourceTurnIds.push(messageIdToTurnUuid(assistant.id));
    }
    if (sourceTurnIds.length === 0) {
        return undefined;
    }
    return {
        type: rememberType,
        content,
        sourceTurnIds,
        participants: ["user", "assistant"],
    };
}
/**
 * Pure session/event reducer. Returns a save candidate when a completed turn
 * ends with durable user input; otherwise undefined.
 */
export function handleSessionEvent(state, event, rememberType = "semantic") {
    switch (event.type) {
        case "turn/start": {
            const data = event.data;
            state.activeTurn = data.turn;
            state.buffers.set(data.turn, { turn: data.turn, assistantMessages: [] });
            return undefined;
        }
        case "user/message": {
            const message = event.data;
            if (!isDurableUserMessage(message)) {
                return undefined;
            }
            const turn = state.activeTurn;
            if (turn === undefined) {
                return undefined;
            }
            const buffer = state.buffers.get(turn) ?? { turn, assistantMessages: [] };
            buffer.userMessageId = message.id;
            buffer.userText = textFromMessage(message);
            state.buffers.set(turn, buffer);
            return undefined;
        }
        case "assistant/message": {
            const data = event.data;
            const buffer = state.buffers.get(data.turn) ?? {
                turn: data.turn,
                assistantMessages: [],
            };
            buffer.assistantMessages.push({
                id: data.message.id,
                text: textFromMessage(data.message),
            });
            state.buffers.set(data.turn, buffer);
            return undefined;
        }
        case "turn/end": {
            const data = event.data;
            if (!shouldRememberTurn(data.reason)) {
                state.buffers.delete(data.turn);
                return undefined;
            }
            if (state.enqueuedTurns.has(data.turn)) {
                return undefined;
            }
            const buffer = state.buffers.get(data.turn);
            if (buffer === undefined) {
                return undefined;
            }
            const saveInput = buildSaveInput(buffer, rememberType);
            state.enqueuedTurns.add(data.turn);
            state.buffers.delete(data.turn);
            if (state.activeTurn === data.turn) {
                delete state.activeTurn;
            }
            return saveInput;
        }
        default:
            return undefined;
    }
}
export async function enqueueRemember(save, input, log) {
    try {
        await save(input);
    }
    catch (error) {
        if (error instanceof RemexHttpError && error.status === 429) {
            log("Remex evaluate rate limited (429); dropping enqueue", error);
            return;
        }
        log("Remex evaluate failed", error);
    }
}
export function apply(ctx, config = {}) {
    const rememberType = config.rememberType ?? "semantic";
    const stateBySession = new WeakMap();
    ctx.inject(["memory"], (scopedCtx) => {
        scopedCtx.on("session/event", (session, event) => {
            if (config.enabled === false) {
                return;
            }
            let state = stateBySession.get(session);
            if (state === undefined) {
                state = createRememberState();
                stateBySession.set(session, state);
            }
            const saveInput = handleSessionEvent(state, event, rememberType);
            if (saveInput === undefined) {
                return;
            }
            void enqueueRemember((input) => scopedCtx.memory.save(input), saveInput, (message, error) => {
                if (error === undefined) {
                    scopedCtx.logger.warn(`[remex-memory] ${message}`);
                }
                else {
                    scopedCtx.logger.warn(`[remex-memory] ${message}:`, error);
                }
            });
        });
    });
}
apply.inject = ["memory"];
export default apply;
//# sourceMappingURL=remember.js.map