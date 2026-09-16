import { readString } from '../../../../shared/sidebar.js';
import { el } from '../dom.js';
import type { SidebarView } from '../types.js';

/**
 * Agent Harness 的**占位界面**——只有一个输入框和一块消息区。
 *
 * 后续接入时要补的东西：
 *   1. 渲染流式增量（宿主会持续推 `delta` 之类的消息，这里 append 即可）；
 *   2. 工具调用卡片（显示工具名、参数、执行结果）；
 *   3. 「停止」按钮，对应宿主侧 onDeactivate / 中止会话。
 * 宿主侧对应 src/sidebar/features/agentHarness.ts。
 */
export function createAgentHarnessView(): SidebarView {
  let transcriptEl: HTMLElement | undefined;

  const appendEntry = (role: 'user' | 'agent' | 'system', text: string): void => {
    transcriptEl?.append(
      el('div', { className: `entry entry-${role}` }, el('span', { className: 'entry-role', text: roleLabel(role) }), el('span', { text })),
    );
  };

  return {
    mount(root, context) {
      const transcript = el('div', {
        className: 'transcript',
        attrs: { 'aria-live': 'polite' },
      });
      transcriptEl = transcript;

      const input = el('textarea', {
        className: 'composer-input',
        attrs: {
          rows: '2',
          placeholder: '描述一个任务，例如「列出当前目录」…（骨架阶段不会有回复）',
        },
      });

      const submit = (): void => {
        const text = input.value.trim();
        if (text.length === 0) {
          return;
        }
        appendEntry('user', text);
        context.post({ type: 'submit', text });
        input.value = '';
      };

      root.append(
        el('h2', { text: 'Agent Harness' }),
        el('p', {
          className: 'hint',
          text: '占位骨架：会话循环、工具调用、流式输出尚未接入，先把交互通道打通。',
        }),
        el(
          'ol',
          { className: 'roadmap' },
          el('li', { text: '会话与消息循环（多轮迭代直到收敛）' }),
          el('li', { text: '工具调用（schema 定义、执行、结果回灌）' }),
          el('li', { text: '流式输出与中断' }),
          el('li', { text: '会话持久化（切走再切回不丢上下文）' }),
        ),
        transcript,
        el(
          'div',
          { className: 'composer' },
          input,
          el('button', {
            className: 'primary',
            text: '发送',
            attrs: { type: 'button' },
            on: { click: submit },
          }),
        ),
      );
    },

    unmount() {
      transcriptEl = undefined;
    },

    onMessage(message) {
      if (message.type === 'notice') {
        appendEntry('system', readString(message, 'text') ?? '');
      }
    },
  };
}

function roleLabel(role: 'user' | 'agent' | 'system'): string {
  switch (role) {
    case 'user':
      return '你';
    case 'agent':
      return 'Agent';
    default:
      return '系统';
  }
}
