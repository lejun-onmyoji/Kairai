import type * as vscode from 'vscode';

import type { FeatureMessage, SidebarFeatureId, SidebarFeatureInfo } from '../shared/sidebar.js';

/**
 * 宿主侧「功能」（Feature）契约。
 *
 * 一个功能 = 侧栏里的一个页面，由两半组成，靠同一个 featureId 对齐：
 *   - 宿主侧（本文件定义的 `SidebarFeature`）：跑在 Extension Host，
 *     可以读写文件、起子进程、调 vscode API——**逻辑都写在这边**；
 *   - Webview 侧（`src/webview/media/sidebar/views/` 下的 `SidebarView`）：
 *     跑在浏览器沙箱，只负责画界面和上报交互。
 *
 * 功能之间互不感知：框架按 featureId 收发消息，新增功能不需要改动框架代码。
 */

/**
 * 框架注入给功能的运行上下文。
 *
 * 功能**拿不到** WebviewView 本身——视图随时可能被销毁重建，直接持有极易踩到
 * 「往已销毁的视图发消息」的坑；统一通过 `post` 发消息，由框架处理生命周期。
 */
export interface SidebarFeatureContext {
  /** 向本功能在 Webview 中的界面发送一条消息（框架自动套上 featureId 信封）。 */
  post(message: FeatureMessage): void;
  /** 本功能的 ID。 */
  readonly featureId: SidebarFeatureId;
  /** 本功能可用的持久化存储（workspaceState，随工作区保存）。 */
  readonly state: vscode.Memento;
  /** 扩展上下文，用于访问 extensionUri、globalState 等。 */
  readonly extension: vscode.ExtensionContext;
}

/** 一个侧栏功能在宿主侧需要实现的部分，所有钩子都是可选的。 */
export interface SidebarFeature {
  /** 唯一标识，取自 `SidebarFeatureIds`。 */
  readonly id: SidebarFeatureId;
  /** 顶部切换栏与概览页展示的标题。 */
  readonly title: string;
  /** 一句话说明，显示在切换栏的 tooltip 与概览页上。 */
  readonly description: string;
  /**
   * 功能被切到前台时调用。
   * 触发时机：切换到该功能、或 Webview 文档被重建后恢复（例如用户切走再切回活动栏）。
   */
  onActivate?(context: SidebarFeatureContext): void | Promise<void>;
  /** 功能被切走、或侧栏被关闭时调用，用于中止定时器 / 子进程 / 进行中的请求。 */
  onDeactivate?(context: SidebarFeatureContext): void;
  /** 处理来自本功能界面的消息。 */
  onMessage?(message: FeatureMessage, context: SidebarFeatureContext): void | Promise<void>;
}

/** 提取可下发给 Webview 的元信息（Webview 不需要、也不该拿到钩子函数）。 */
export function toFeatureInfo(feature: SidebarFeature): SidebarFeatureInfo {
  return {
    id: feature.id,
    title: feature.title,
    description: feature.description,
  };
}
