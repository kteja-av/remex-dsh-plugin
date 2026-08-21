/**
 * remex-dsh-plugin — Cordis MemoryService over Remex HTTP.
 */
export const PLUGIN_NAME = "@your-scope/remex-dsh-plugin";
export const PLUGIN_VERSION = "0.1.0";
export { default as RemexMemoryProvider } from "./remex-provider.js";
export { default as contextInjector } from "./context-injector.js";
export { default as remember } from "./remember.js";
export { default as memoryTools, MEMORY_SEARCH_TOOL_NAME } from "./memory-tools.js";
export { MemoryService, EMPTY_RECALL } from "./memory.js";
export { RemexClient, RemexHttpError } from "./remex-client.js";
export { messageIdToTurnUuid, buildAuthHeaders } from "./identity.js";
export { formatRemexMemoryBlock, recallFingerprint } from "./format-context.js";
//# sourceMappingURL=index.js.map