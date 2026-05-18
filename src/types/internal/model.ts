/**
 * model 能力层内部领域类型。
 *
 * 将 runtime-core.ts、model/index.ts 等文件中与具体逻辑无关的
 * 模型相关内部接口集中在此处，方便在多文件间共享且不引入循环依赖。
 */

import type { ModelInstance } from '../../capabilities/model';

/**
 * 运行时 _modelInstances Map 的值类型。
 * 通过 revision 字段支持热重载检测：当 Model.getRevision() 变化时，
 * 运行时会销毁并重建对应 ModelInstance，使新 schema 生效。
 */
export interface ModelInstanceCacheEntry<TDocument = Record<string, unknown>> {
    /**
     * 上次缓存时的 Model schema 版本号（来自 Model.getRevision()）。
     * revision 不一致时触发实例重建。
     */
    revision: number;
    /** 已装配完成的 ModelInstance 实例。 */
    instance: ModelInstance<TDocument>;
}
