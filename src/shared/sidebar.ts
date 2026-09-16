/**
 * 侧栏（Sidebar）框架的共享契约：功能 ID + 消息格式。
 *
 * 这份文件同时被两侧导入，是「功能 ID」与「消息 type」的单一来源：
 *   - 宿主侧：src/sidebar/（跑在 Extension Host，能访问 vscode API 与 Node.js）
 *   - Webview 侧：src/webview/media/sidebar/（跑在浏览器沙箱，只管界面）
 * 两侧各维护一份「按 featureId 索引的功能表」，靠这里的类型对齐：
 * ID 写错或漏注册会在 `npm run check-types` 阶段直接报错，而不是运行时静默失联。
 *
 * 注意：本文件会被打包进浏览器环境，只能包含纯类型与常量，
 * 不得导入 `node:*`，也不得使用 DOM API。
 */

/**
 * 侧栏中已注册的功能 ID。
 * 新增一个功能时先在这里登记，类型系统会强制你在宿主侧与 Webview 侧都补齐实现。
 */
export const SidebarFeatureIds = {
  /** 概览：唯一「已实现」的示例功能，用于验证框架链路是否通畅。 */
  welcome: 'welcome',
  /** Agent Harness：占位骨架，后续接入消息循环与工具调用。 */
  agentHarness: 'agentHarness',
  /** 井字棋：占位骨架，后续实现对局逻辑。 */
  tictactoe: 'tictactoe',
} as const;

/** 功能 ID 的联合类型，如 `'welcome' | 'agentHarness' | 'tictactoe'`。 */
export type SidebarFeatureId = (typeof SidebarFeatureIds)[keyof typeof SidebarFeatureIds];

/**
 * 功能自定义的消息体：`type` 由各功能自行约定，框架只按 featureId 做路由，
 * 不关心里面装的是什么——这样新增功能不需要改动框架代码。
 *
 * 跨进程传递的消息都是未经验证的 JSON，读取字段时请用下面的 `readString` 等
 * 辅助函数做防御式取值，不要直接断言类型。
 */
export interface FeatureMessage {
  type: string;
  [key: string]: unknown;
}

/** 功能元信息：由宿主侧的注册表派生，下发到 Webview 用于渲染顶部切换栏。 */
export interface SidebarFeatureInfo {
  id: SidebarFeatureId;
  title: string;
  description: string;
}

/** Webview → 扩展宿主。 */
export type SidebarMessage =
  /** Webview 脚本加载完成，请求初始化（框架收到后才下发 init，避免消息早于监听器丢失）。 */
  | { type: 'ready' }
  /** 用户在切换栏点了另一个功能。 */
  | { type: 'switchFeature'; featureId: SidebarFeatureId }
  /** 某个功能发往宿主的消息，由框架按 featureId 投递。 */
  | { type: 'featureMessage'; featureId: SidebarFeatureId; message: FeatureMessage };

/** 扩展宿主 → Webview。 */
export type SidebarResponse =
  /** 初始化：功能清单 + 上次打开的功能（Webview 据此重建整个界面）。 */
  | { type: 'init'; features: SidebarFeatureInfo[]; activeFeatureId: SidebarFeatureId }
  /** 宿主侧要求切换功能（例如通过命令面板切换）。 */
  | { type: 'switchFeature'; featureId: SidebarFeatureId }
  /** 宿主回给某个功能的消息（框架自动补 featureId）。 */
  | { type: 'featureMessage'; featureId: SidebarFeatureId; message: FeatureMessage };

/**
 * 从消息中安全读取字符串字段。
 * Webview 与宿主之间的消息未经校验，直接断言类型会在收到畸形消息时静默出错。
 */
export function readString(message: FeatureMessage, key: string): string | undefined {
  const value = message[key];
  return typeof value === 'string' ? value : undefined;
}
