/**
 * remex-dsh-plugin — Cordis MemoryService over Remex HTTP.
 */
export declare const PLUGIN_NAME: "@your-scope/remex-dsh-plugin";
export declare const PLUGIN_VERSION: "0.1.0";
export { default as RemexMemoryProvider } from "./remex-provider.ts";
export { default as contextInjector } from "./context-injector.ts";
export { default as remember } from "./remember.ts";
export { default as memoryTools, MEMORY_SEARCH_TOOL_NAME } from "./memory-tools.ts";
export { MemoryService, EMPTY_RECALL } from "./memory.ts";
export { RemexClient, RemexHttpError } from "./remex-client.ts";
export { messageIdToTurnUuid, buildAuthHeaders } from "./identity.ts";
export { formatRemexMemoryBlock, recallFingerprint } from "./format-context.ts";
export { formatRemexCoreMemoryBlock, isRemexCoreMemoryBlock } from "./core-memory.ts";
//# sourceMappingURL=index.d.ts.map