import * as vscode from 'vscode';

import { createDefaultRegistry } from './features/index.js';
import { KairaiSidebarProvider } from './provider.js';

/**
 * 注册侧栏：把「活动栏图标 + 侧栏容器 + WebviewView」挂到 VS Code 上。
 *
 * 三处配置缺一不可，分别写在不同的地方：
 *   - `package.json` → `contributes.viewsContainers`：活动栏上的入口图标；
 *   - `package.json` → `contributes.views`：容器里的视图（`type: "webview"`）；
 *   - 本函数 → `registerWebviewViewProvider`：视图的具体实现（HTML + 消息处理）。
 * 视图 ID 必须三处一致，这里复用 `KairaiSidebarProvider.viewType` 避免写错。
 *
 * @returns provider 实例，供命令层调用（如切换功能）；它已挂到 subscriptions 上。
 */
export function registerSidebar(context: vscode.ExtensionContext): KairaiSidebarProvider {
  const provider = new KairaiSidebarProvider(context, createDefaultRegistry());

  context.subscriptions.push(
    // 这里刻意不传 retainContextWhenHidden：切走活动栏时 Webview 文档会被销毁
    // （省内存），再切回来时 resolveWebviewView 重新执行、界面按 init 消息重建，
    // 当前功能由 provider 的 globalState 恢复，用户感受不到差别。
    // 后续 Agent Harness 若需要「流式输出不中断」，可在此开启该选项，
    // 代价是内存常驻，且 Webview 隐藏期间无法收发消息。
    vscode.window.registerWebviewViewProvider(KairaiSidebarProvider.viewType, provider),
    provider,
  );

  return provider;
}
