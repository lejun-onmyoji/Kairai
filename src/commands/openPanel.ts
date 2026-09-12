import * as vscode from 'vscode';

import { KairaiPanel } from '../webview/panel.js';

/**
 * 示例命令：打开（或聚焦）Webview 面板。
 * 命令本身只做薄封装，真正的 Webview 逻辑在 src/webview/panel.ts 中。
 */
export function registerOpenPanelCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('kairai.openPanel', () => {
    KairaiPanel.createOrShow(context);
  });

  context.subscriptions.push(disposable);
}
