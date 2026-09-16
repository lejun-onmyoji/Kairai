import { SidebarFeatureIds, readString } from '../../shared/sidebar.js';
import type { SidebarFeature } from '../types.js';

/**
 * Agent Harness 的**占位功能**——只搭骨架，不含任何 harness 实现。
 *
 * 后续接入时的落点已经预留好，照着 TODO 填即可：
 *   1. `onActivate`：创建会话（模型客户端、系统提示词、工具注册表）；
 *   2. `onMessage` 的 `'submit'` 分支：把用户输入推进 agent 循环，
 *      边跑边用 `context.post()` 把增量内容流式推给界面；
 *   3. `onDeactivate`：中止正在跑的循环、释放子进程 / 网络连接；
 *   4. `context.state`：把会话记录存进 workspaceState，做到切走再切回不丢上下文。
 *
 * 界面侧对应 src/webview/media/sidebar/views/agentHarness.ts，两边靠消息契约对齐。
 */
export const agentHarnessFeature: SidebarFeature = {
  id: SidebarFeatureIds.agentHarness,
  title: 'Agent Harness',
  description: 'Agent 循环与工具调用的练习场（当前为占位骨架）。',

  onMessage(message, context) {
    if (message.type !== 'submit') {
      return;
    }

    // TODO(harness): 在这里接入真正的 agent 循环
    const text = readString(message, 'text') ?? '';
    context.post({
      type: 'notice',
      level: 'info',
      text:
        text.length > 0
          ? `已收到输入「${text}」，但 Agent Harness 尚未实现，暂时不会有回复。`
          : '请先输入内容再发送。',
    });
  },
};
