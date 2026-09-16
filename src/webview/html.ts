import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as vscode from 'vscode';

/**
 * Webview 的 HTML 渲染工具：CSP/nonce 注入 + 本地静态资源地址转换。
 *
 * WebviewPanel（src/webview/panel.ts）与侧栏 WebviewView（src/sidebar/provider.ts）
 * 的渲染流程完全一样，所以抽到这里共用；新增任何 Webview 界面都从这里取工具，
 * 不要在各自的类里重复实现 nonce 生成逻辑。
 */

/** 生成密码学安全的 32 字节随机 nonce，用于 CSP 白名单（不能用 Math.random）。 */
export function getNonce(): string {
  return randomBytes(32).toString('base64url');
}

/** 读取扩展目录下的文本模板，例如 `readTemplate(context.extensionUri, 'media', 'panel.html')`。 */
export function readTemplate(extensionUri: vscode.Uri, ...segments: string[]): string {
  return readFileSync(join(extensionUri.fsPath, ...segments), 'utf8');
}

/**
 * 把本地文件转成 Webview 可访问的 `vscode-webview://` 地址。
 * 对应目录必须出现在 `localResourceRoots` 白名单里，否则加载会被拒绝。
 */
export function asWebviewUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  ...segments: string[]
): string {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...segments)).toString();
}

/**
 * 替换模板里的 `{{占位符}}`。
 * 只替换显式传入的键——漏注入的占位符会原样留在 HTML 里，便于一眼看出问题。
 */
export function renderTemplate(template: string, values: Record<string, string>): string {
  let html = template;
  for (const [key, value] of Object.entries(values)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
  return html;
}
