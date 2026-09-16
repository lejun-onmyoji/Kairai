import { SidebarFeatureIds, readString } from '../../shared/sidebar.js';
import type { SidebarFeature } from '../types.js';

/**
 * 井字棋的**占位功能**——只渲染棋盘骨架，不含对局逻辑。
 *
 * 后续实现的落点：
 *   1. 棋盘状态放在宿主侧（用 `context.state` 持久化），Webview 只做展示与点击上报。
 *      这样即使用户切走活动栏导致 Webview 文档被销毁重建，对局也不会丢；
 *   2. `onMessage` 的 `'place'` 分支：校验落子合法性 → 判定胜负 → 走一步 AI →
 *      用 `context.post()` 回传整个新棋盘（状态整体下发，比增量消息更难出错）；
 *   3. 想让 AI 由 agent 驱动的话，可以复用 agentHarness 功能里的模型客户端。
 */
export const tictactoeFeature: SidebarFeature = {
  id: SidebarFeatureIds.tictactoe,
  title: '井字棋',
  description: '小游戏示例（当前为占位骨架）。',

  onMessage(message, context) {
    if (message.type !== 'start') {
      return;
    }

    // TODO(game): 这里初始化对局状态并发起第一步
    const mode = readString(message, 'mode') ?? '未指定';
    context.post({
      type: 'notice',
      level: 'info',
      text: `已请求新对局（模式：${mode}），但对局逻辑尚未实现。`,
    });
  },
};
