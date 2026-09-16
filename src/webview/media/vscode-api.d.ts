/**
 * VS Code 注入到 Webview 的全局 API 声明。
 *
 * Webview 跑在浏览器沙箱里，没有 `@types/vscode`（那个包是给扩展宿主用的），
 * 所以这里手工声明 `acquireVsCodeApi`。本文件不含 import/export，属于**全局声明**，
 * 会同时作用于面板脚本（media/main.ts）与侧栏脚本（media/sidebar/）。
 */

/** `acquireVsCodeApi()` 的返回值。 */
interface WebviewApi {
  /** 向扩展宿主发送消息。 */
  postMessage(message: unknown): void;
  /** 读取 VS Code 为该 Webview 持久化的状态。 */
  getState<T>(): T | undefined;
  /** 写入状态；Webview 被销毁重建后可恢复。 */
  setState<T>(state: T): void;
}

interface Window {
  /**
   * VS Code 注入的 Webview API。
   * 每个 Webview 实例只能调用一次，重复调用会抛错——所以要在模块顶层调用并复用。
   */
  acquireVsCodeApi(): WebviewApi;
}
