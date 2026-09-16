import { readString } from '../../../../shared/sidebar.js';
import { el } from '../dom.js';
import type { SidebarView } from '../types.js';

/** 棋盘格子数：3 × 3。 */
const CELL_COUNT = 9;

/**
 * 井字棋的**占位界面**——画一块 3×3 棋盘骨架，格子暂时禁用。
 *
 * 后续接入时的分工建议（也是这套框架推荐的写法）：
 *   - 对局状态（棋盘数组、轮到谁、胜负）**放在宿主侧**，用 context.state 持久化；
 *   - Webview 只做两件事：把点击上报成 `{ type: 'place', index }`，
 *     收到宿主的 `{ type: 'board', cells }` 后整体重画。
 *   状态整体下发比增量消息更难出错，也不怕 Webview 被销毁重建。
 * 宿主侧对应 src/sidebar/features/tictactoe.ts。
 */
export function createTictactoeView(): SidebarView {
  let noticeEl: HTMLElement | undefined;

  return {
    mount(root, context) {
      const notice = el('p', { className: 'notice', attrs: { 'aria-live': 'polite' } });
      noticeEl = notice;

      // 棋盘骨架：data-cell 预留了落子索引，接上逻辑后去掉 disabled 即可点击
      const board = el(
        'div',
        { className: 'board', attrs: { role: 'grid', 'aria-label': '井字棋棋盘' } },
        ...Array.from({ length: CELL_COUNT }, (_, index) =>
          el('button', {
            className: 'cell',
            attrs: {
              type: 'button',
              'data-cell': String(index),
              'aria-label': `第 ${index + 1} 格`,
              disabled: 'true',
            },
          }),
        ),
      );

      root.append(
        el('h2', { text: '井字棋' }),
        el('p', { className: 'hint', text: '占位骨架：对局逻辑尚未实现，棋盘暂时不可落子。' }),
        board,
        el(
          'div',
          { className: 'toolbar' },
          el('button', {
            className: 'primary',
            text: '开始对局（待实现）',
            attrs: { type: 'button' },
            on: { click: () => context.post({ type: 'start', mode: 'human-vs-agent' }) },
          }),
        ),
        notice,
      );
    },

    unmount() {
      noticeEl = undefined;
    },

    onMessage(message) {
      if (message.type === 'notice' && noticeEl) {
        noticeEl.textContent = readString(message, 'text') ?? '';
      }
    },
  };
}
