import type { FeatureMessage, SidebarFeatureId } from '../../../shared/sidebar.js';

/**
 * 一个侧栏功能在 Webview 侧的契约。
 *
 * 与宿主侧的 `SidebarFeature`（src/sidebar/types.ts）一一对应，靠同一个 featureId 对齐：
 * 这里只管界面与交互，**不碰任何 vscode API**——需要数据就 post 消息问宿主。
 */

/** 框架注入给视图的上下文。 */
export interface SidebarViewContext {
  /** 本视图所属的功能 ID。 */
  readonly featureId: SidebarFeatureId;
  /** 向宿主发送本功能的消息（框架自动补 featureId）。 */
  post(message: FeatureMessage): void;
}

/** 侧栏功能的界面实现。 */
export interface SidebarView {
  /**
   * 挂载界面。
   * `root` 是本次挂载专属的容器（框架已清空），往里面 append 即可；
   * 需要跨消息保留的 DOM 引用，用工厂函数的闭包变量存起来。
   */
  mount(root: HTMLElement, context: SidebarViewContext): void;
  /** 被切走时清理定时器、订阅等；DOM 本身由框架统一清空。 */
  unmount?(): void;
  /** 收到宿主发来的、属于本功能的消息。 */
  onMessage?(message: FeatureMessage): void;
}
