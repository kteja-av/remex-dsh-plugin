import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { formatRemexCoreMemoryBlock, isRemexCoreMemoryBlock } from "./core-memory.js";
import { formatRemexMemoryBlock, isRemexMemoryBlock, recallFingerprint, } from "./format-context.js";
import { RemexClient } from "./remex-client.js";
export const PLUGIN_NAME = "remex-dsh-plugin";
function textFromMessage(message) {
    return message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
}
/** Extract query text from the last durable user message in the claimed batch. */
export function extractLastUserMessageText(messages) {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message === undefined || message.role !== "user") {
            continue;
        }
        if (message.source.kind !== "user") {
            continue;
        }
        const text = textFromMessage(message).trim();
        if (text.length > 0) {
            return text;
        }
    }
    return undefined;
}
/** Fold injected context immediately after the claimed batch in the waterfall. */
export function foldAfterClaimed(allMessages, claimedBatch, injected) {
    const lastClaimedIndex = allMessages.findLastIndex((message) => claimedBatch.includes(message));
    if (lastClaimedIndex === -1) {
        return [...allMessages, injected];
    }
    return allMessages.toSpliced(lastClaimedIndex + 1, 0, injected);
}
function hasInjectedBlock(messages, block) {
    return messages.some((message) => {
        if (message.role !== "user") {
            return false;
        }
        if (message.source.kind !== "plugin" || message.source.plugin !== PLUGIN_NAME) {
            return false;
        }
        return textFromMessage(message) === block;
    });
}
export function createRemexContextMessage(block) {
    return createUserMessage({
        content: [{ type: "text", text: block }],
        source: {
            kind: "plugin",
            plugin: PLUGIN_NAME,
            form: "recall",
        },
    });
}
function createCoreMemoryContextMessage(block) {
    return createUserMessage({
        content: [{ type: "text", text: block }],
        source: {
            kind: "plugin",
            plugin: PLUGIN_NAME,
            form: "snapshot",
            sections: [{ name: "remex_core_memory", text: block }],
        },
    });
}
export function foldCoreMemoryBlock(decision, claimedMessages, block) {
    const coreMessage = createCoreMemoryContextMessage(block);
    const messages = foldAfterLastRecall(decision.messages, coreMessage, claimedMessages);
    return {
        kind: "enter",
        messages,
    };
}
/** Insert after the last injected recall block so core memory follows `<remex_memory>`. */
function foldAfterLastRecall(allMessages, injected, fallbackClaimed) {
    const lastRecallIndex = allMessages.findLastIndex((message) => message.role === "user" &&
        message.source.kind === "plugin" &&
        message.source.plugin === PLUGIN_NAME &&
        message.source.form === "recall");
    if (lastRecallIndex === -1) {
        return foldAfterClaimed(allMessages, fallbackClaimed, injected);
    }
    return allMessages.toSpliced(lastRecallIndex + 1, 0, injected);
}
export function buildCoreMemoryClient(config) {
    if (config.tenantId === undefined || config.userId === undefined) {
        return undefined;
    }
    return new RemexClient({
        baseUrl: config.baseUrl ?? "http://localhost:8000",
        identity: { tenantId: config.tenantId, userId: config.userId },
        ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    });
}
export function handlePreStepInjection(input) {
    const { claimedMessages, decision, recallResult, lastFingerprint } = input;
    if (decision.kind === "reject") {
        return { decision };
    }
    const block = formatRemexMemoryBlock(recallResult.memories);
    if (block === undefined || !isRemexMemoryBlock(block)) {
        return { decision };
    }
    const fingerprint = recallFingerprint(recallResult.memories);
    if (fingerprint === lastFingerprint) {
        return { decision };
    }
    if (hasInjectedBlock(decision.messages, block)) {
        return { decision, fingerprint };
    }
    const contextMessage = createRemexContextMessage(block);
    return {
        decision: {
            kind: "enter",
            messages: foldAfterClaimed(decision.messages, claimedMessages, contextMessage),
        },
        fingerprint,
    };
}
export function apply(ctx, config = {}) {
    const lastFingerprintBySession = new WeakMap();
    ctx.inject(["memory"], (scopedCtx) => {
        scopedCtx.on("agent/pre-step", async (payload, next) => {
            const decision = (await next());
            if (config.enabled === false) {
                return decision;
            }
            payload.signal.throwIfAborted();
            const query = extractLastUserMessageText(payload.messages);
            if (query === undefined) {
                return decision;
            }
            const recallResult = await scopedCtx.memory.recall(query, {
                ...(config.tokenBudget !== undefined ? { tokenBudget: config.tokenBudget } : {}),
                ...(config.limit !== undefined ? { limit: config.limit } : {}),
            });
            const session = payload.agent.session;
            const lastFingerprint = session === undefined ? undefined : lastFingerprintBySession.get(session);
            const result = handlePreStepInjection({
                claimedMessages: payload.messages,
                decision,
                recallResult,
                lastFingerprint,
            });
            if (session !== undefined && result.fingerprint !== undefined) {
                lastFingerprintBySession.set(session, result.fingerprint);
            }
            if (config.coreMemory?.enabled !== true) {
                return result.decision;
            }
            const coreClient = buildCoreMemoryClient(config.coreMemory);
            if (coreClient === undefined) {
                return result.decision;
            }
            let coreBlocks = [];
            try {
                coreBlocks = (await coreClient.readCoreMemory()).blocks;
            }
            catch (error) {
                scopedCtx.logger.warn("[remex-memory] core-memory read failed", error);
                return result.decision;
            }
            const coreBlockText = formatRemexCoreMemoryBlock(coreBlocks);
            if (coreBlockText === undefined || !isRemexCoreMemoryBlock(coreBlockText)) {
                return result.decision;
            }
            return foldCoreMemoryBlock(result.decision, payload.messages, coreBlockText);
        }, { prepend: true });
    });
}
apply.inject = ["memory"];
export default apply;
//# sourceMappingURL=context-injector.js.map