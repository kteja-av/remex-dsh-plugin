import { Service } from "@deepseek-ai/cordis";
export const EMPTY_RECALL = {
    memories: [],
    tokenCount: 0,
    degraded: false,
};
/**
 * Abstract cross-session memory seam (`ctx.memory`). The Remex-backed
 * implementation lives in `remex-provider.ts`.
 */
export class MemoryService extends Service {
    constructor(ctx) {
        if (new.target === MemoryService) {
            throw new Error("remex-dsh-plugin: MemoryService is abstract; load remex-provider instead");
        }
        super(ctx, "memory");
    }
}
export default MemoryService;
//# sourceMappingURL=memory.js.map