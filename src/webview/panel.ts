import * as vscode from 'vscode';

import type { PanelMessage, PanelResponse } from '../shared/messages.js';
import { asWebviewUri, getNonce, readTemplate, renderTemplate } from './html.js';

/**
 * 示例 Webview 面板，演示四个核心机制：
 *   1. 创建与单例复用（createOrShow）；
 *   2. CSP + nonce 注入，安全加载本地静态资源（asWebviewUri）；
 *   3. 双向消息通信（postMessage / onDidReceiveMessage，契约见 src/shared/messages.ts）；
 *   4. 生命周期管理（onDidDispose → 释放监听器）。
 */
export class KairaiPanel {
  public static readonly viewType = 'kairai.panel';

  private static current: KairaiPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private count = 0;

  /** 创建或聚焦面板（单例）。 */
  public static createOrShow(context: vscode.ExtensionContext): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // 已存在则直接聚焦，避免重复创建
    if (KairaiPanel.current) {
      KairaiPanel.current.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      KairaiPanel.viewType,
      'Kairai 面板',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        // 只允许 webview 加载 media/（静态模板）与 dist/media/（打包产物）下的资源
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'media'),
          vscode.Uri.joinPath(context.extensionUri, 'dist', 'media'),
        ],
      },
    );

    KairaiPanel.current = new KairaiPanel(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;

    panel.webview.html = this.renderHtml(context);

    // 面板关闭时释放自身及所有监听器
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
    panel.webview.onDidReceiveMessage(
      (message: PanelMessage) => this.handleMessage(message),
      null,
      this.disposables,
    );
  }

  /** 处理来自 Webview 的消息（契约见 src/shared/messages.ts）。 */
  private handleMessage(message: PanelMessage): void {
    switch (message.type) {
      case 'increment': {
        this.count += 1;
        const response: PanelResponse = { type: 'update', count: this.count };
        // 注意：运行时消息未经格式校验，生产代码建议增加运行时校验
        void this.panel.webview.postMessage(response);
        return;
      }
    }
  }

  /**
   * 读取静态 HTML 模板，注入 nonce、CSP 来源与本地资源地址。
   * 模板占位符：{{cspSource}} {{nonce}} {{styleUri}} {{scriptUri}}
   * 注入逻辑与侧栏（src/sidebar/provider.ts）共用 src/webview/html.ts。
   */
  private renderHtml(context: vscode.ExtensionContext): string {
    const webview = this.panel.webview;
    const template = readTemplate(context.extensionUri, 'media', 'panel.html');

    return renderTemplate(template, {
      cspSource: webview.cspSource,
      nonce: getNonce(),
      styleUri: asWebviewUri(webview, context.extensionUri, 'media', 'style.css'),
      // main.ts 经 esbuild 打包到 dist/media/main.js（见 esbuild.js）
      scriptUri: asWebviewUri(webview, context.extensionUri, 'dist', 'media', 'main.js'),
    });
  }

  private dispose(): void {
    KairaiPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length > 0) {
      this.disposables.pop()!.dispose();
    }
  }
}
