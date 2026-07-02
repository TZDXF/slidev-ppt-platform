/**
 * @slidev-ppt/shared 入口
 *
 * 平台共享层：Slidev MD 分页器、AI 编辑 ops 类型、ops 应用器。
 * 所有 app（web / render-service / build-worker）与 AI 链路共用此包，
 * 保证「MD 是唯一真相源」的数据结构一致。
 */
export * from './slidev.js';
export * from './ops.js';
export * from './apply-ops.js';
export * from './publish.js';
