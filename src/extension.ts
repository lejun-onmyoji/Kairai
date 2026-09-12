/// <reference types="node" />

import * as vscode from 'vscode';

import { registerHelloWorldCommand } from './commands/helloWorld.js';
import { registerOpenPanelCommand } from './commands/openPanel.js';
import { registerStatusBar } from './statusBar.js';

/**
 * 扩展入口：VS Code 在扩展被激活时调用。
 * 激活时机由 package.json 中的 activationEvents / contributes 决定。
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('[kairai] 扩展已激活');

  registerHelloWorldCommand(context);
  registerOpenPanelCommand(context);
  registerStatusBar(context);
}

/**
 * 扩展被停用时调用（VS Code 退出、扩展被禁用或更新时）。
 * 通过 context.subscriptions 注册的资源会被 VS Code 自动释放，无需手动清理；
 * 只有无法挂到 subscriptions 上的全局资源才需要在这里清理。
 */
export function deactivate(): void {}
