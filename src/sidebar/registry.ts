import type { SidebarFeatureId } from '../shared/sidebar.js';
import type { SidebarFeature } from './types.js';

/**
 * 宿主侧的功能注册表：侧栏里「有哪些功能」的唯一权威来源。
 *
 * Webview 的顶部切换栏就是由它派生的（`list()` → init 消息），
 * 所以新增功能只需要写一个 feature 文件并注册进来，界面不用手写任何一个按钮。
 */
export class SidebarFeatureRegistry {
  private readonly features = new Map<SidebarFeatureId, SidebarFeature>();

  /**
   * 注册一个功能。
   * 重复 ID 直接抛错而不是覆盖——两个功能抢同一个路由属于代码 bug，
   * 应该在扩展激活时立刻炸掉，而不是等到用户点击时才发现消息投递给了错误的页面。
   */
  public register(feature: SidebarFeature): this {
    if (this.features.has(feature.id)) {
      throw new Error(`侧栏功能 ID 重复注册：${feature.id}`);
    }
    this.features.set(feature.id, feature);
    return this;
  }

  /** 批量注册，保持传入顺序。 */
  public registerAll(features: readonly SidebarFeature[]): this {
    for (const feature of features) {
      this.register(feature);
    }
    return this;
  }

  /** 类型谓词：用于把外部来源的字符串（如持久化状态）收窄成合法的功能 ID。 */
  public has(id: string): id is SidebarFeatureId {
    return this.features.has(id as SidebarFeatureId);
  }

  public get(id: SidebarFeatureId): SidebarFeature | undefined {
    return this.features.get(id);
  }

  /** 按注册顺序返回全部功能。 */
  public list(): SidebarFeature[] {
    return [...this.features.values()];
  }
}
