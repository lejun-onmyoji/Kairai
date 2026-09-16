import type { SidebarFeatureId } from '../../shared/sidebar.js';
import { SidebarFeatureRegistry } from '../registry.js';
import type { SidebarFeature } from '../types.js';
import { agentHarnessFeature } from './agentHarness.js';
import { tictactoeFeature } from './tictactoe.js';
import { welcomeFeature } from './welcome.js';

/**
 * 内置功能清单。
 *
 * 这里的类型是 `Record<SidebarFeatureId, SidebarFeature>`：往
 * `src/shared/sidebar.ts` 的 `SidebarFeatureIds` 里加一个 ID 之后，
 * 不在这里补上实现就会类型检查失败——新增功能不会「忘了注册」。
 *
 * 对象键顺序 = 顶部切换栏的显示顺序。
 */
const builtinFeatures: Record<SidebarFeatureId, SidebarFeature> = {
  welcome: welcomeFeature,
  agentHarness: agentHarnessFeature,
  tictactoe: tictactoeFeature,
};

/** 组装侧栏默认使用的功能注册表。 */
export function createDefaultRegistry(): SidebarFeatureRegistry {
  return new SidebarFeatureRegistry().registerAll(Object.values(builtinFeatures));
}
