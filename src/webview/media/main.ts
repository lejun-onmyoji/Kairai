// Webview 侧脚本（TypeScript 源码，经 esbuild 打包为 dist/media/main.js）。
// 注意：Webview 内没有 Node.js，只有浏览器 API 与 acquireVsCodeApi()
// （其类型声明见 src/webview/media/vscode-api.d.ts，与侧栏脚本共用）。
import type { PanelResponse } from '../../shared/messages.js';

// 每个 Webview 只能调用一次 acquireVsCodeApi()
const vscode = window.acquireVsCodeApi();

// 这些元素在 media/panel.html 中必然存在，断言非空是安全的
const counterButton = document.getElementById('counter') as HTMLButtonElement;
const countEl = document.getElementById('count') as HTMLSpanElement;
const logEl = document.getElementById('log') as HTMLElement;

/** 追加一条日志到页面。 */
function appendLog(text: string): void {
  const line = document.createElement('div');
  line.className = 'log-line';
  line.textContent = text;
  logEl.appendChild(line);
}

// 接收扩展发来的消息
window.addEventListener('message', (event: MessageEvent<PanelResponse>) => {
  const message = event.data;
  switch (message.type) {
    case 'update':
      countEl.textContent = String(message.count);
      appendLog(`[来自扩展] 已收到点击，当前计数：${message.count}`);
      break;
    default:
      break;
  }
});

// 点击按钮 → 向扩展发送消息
counterButton.addEventListener('click', () => {
  vscode.postMessage({ type: 'increment' });
});
