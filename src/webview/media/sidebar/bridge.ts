import type {
  FeatureMessage,
  SidebarFeatureId,
  SidebarMessage,
  SidebarResponse,
} from '../../../shared/sidebar.js';

/**
 * Webview 与扩展宿主之间的唯一通道。
 *
 * 上行消息统一在这里补 featureId 信封，功能代码不需要关心协议细节；
 * 下行消息统一在这里拆包，再由路由器分发给对应视图。
 */

// acquireVsCodeApi 每个 Webview 只能调用一次，必须在模块顶层调用并复用
const vscode = window.acquireVsCodeApi();

/** 上报框架级消息（ready、请求切换功能等）。 */
export function postToHost(message: SidebarMessage): void {
  vscode.postMessage(message);
}

/** 上报属于某个功能的消息，框架会自动补上 featureId。 */
export function postFeatureMessage(featureId: SidebarFeatureId, message: FeatureMessage): void {
  vscode.postMessage({ type: 'featureMessage', featureId, message });
}

/** 订阅宿主下发的消息。 */
export function onHostMessage(handler: (message: SidebarResponse) => void): void {
  window.addEventListener('message', (event: MessageEvent<SidebarResponse>) => {
    handler(event.data);
  });
}
