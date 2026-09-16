import { readString } from '../../../../shared/sidebar.js';
import { el } from '../dom.js';
import type { SidebarView } from '../types.js';

/**
 * 概览功能（Webview 侧）——脚手架里唯一**已实现**的界面。
 *
 * 它演示了一个功能界面该有的三板斧：
 *   mount     → 用 el() 搭出结构，需要跨消息复用的元素存进闭包变量；
 *   post      → 把用户操作上报给宿主（这里点了「打个招呼」）；
 *   onMessage → 响应宿主回传的数据（这里把问候语追加到日志）。
 *
 * 用工厂函数而不是模块级单例，闭包变量天然随视图创建/销毁，不会串味。
 */
export function createWelcomeView(): SidebarView {
  let logEl: HTMLElement | undefined;

  const appendLog = (text: string): void => {
    logEl?.append(el('div', { className: 'log-line', text }));
  };

  return {
    mount(root, context) {
      const log = el('div', { className: 'log', attrs: { 'aria-live': 'polite' } });
      logEl = log;

      root.append(
        el('h2', { text: 'Kairai 侧栏' }),
        el('p', {
          className: 'hint',
          text: '这是一个 WebviewView 框架示例：界面跑在 Webview 沙箱里，逻辑跑在扩展宿主里，两者靠消息通信。',
        }),
        el(
          'div',
          { className: 'toolbar' },
          el('button', {
            className: 'primary',
            text: '打个招呼',
            attrs: { type: 'button' },
            // 点击 → 交给宿主处理（宿主读配置后把问候语回传）
            on: { click: () => context.post({ type: 'greet' }) },
          }),
        ),
        el('h3', { text: '通信日志' }),
        log,
      );
    },

    unmount() {
      // 视图被切走：丢掉 DOM 引用，避免后续消息写到已经卸载的节点上
      logEl = undefined;
    },

    onMessage(message) {
      if (message.type !== 'greeting') {
        return;
      }
      const at = readString(message, 'at') ?? '';
      const text = readString(message, 'text') ?? '';
      appendLog(`[${at}] 宿主回复：${text}`);
    },
  };
}
