/**
 * Webview ↔ 扩展的消息契约。
 * 扩展侧（src/webview/panel.ts）与 Webview 侧（src/webview/media/main.ts）
 * 共用这份类型定义，保证消息的 type 字段是单一来源，不会因两侧手写而漂移。
 */

/** Webview → 扩展。 */
export type PanelMessage = {
  type: 'increment';
};

/** 扩展 → Webview。 */
export type PanelResponse = {
  type: 'update';
  count: number;
};
