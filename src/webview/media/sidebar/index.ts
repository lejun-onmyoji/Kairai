import type {
  SidebarFeatureId,
  SidebarFeatureInfo,
  SidebarResponse,
} from '../../../shared/sidebar.js';
import { onHostMessage, postFeatureMessage, postToHost } from './bridge.js';
import { el } from './dom.js';
import type { SidebarView } from './types.js';
import { createAgentHarnessView } from './views/agentHarness.js';
import { createTictactoeView } from './views/tictactoe.js';
import { createWelcomeView } from './views/welcome.js';

/**
 * 侧栏 Webview 入口：一个极简的「路由器 + 消息桥」。
 *
 * 它不认识任何业务逻辑，只做三件事：
 *   1. 按 `init` 消息渲染顶部功能切换栏；
 *   2. 把当前功能对应的视图挂载到内容区（切走时先卸载）；
 *   3. 把功能消息按 featureId 转发给对应视图。
 * 新增功能：写 views/xxx.ts，然后在这里登记一次即可。
 */

/**
 * Webview 侧的功能表。
 *
 * 类型 `Record<SidebarFeatureId, SidebarView>` 是道保险：往共享契约里加了新 ID
 * 却忘了写界面，`npm run check-types` 会直接报错。
 */
function createViews(): Record<SidebarFeatureId, SidebarView> {
  return {
    welcome: createWelcomeView(),
    agentHarness: createAgentHarnessView(),
    tictactoe: createTictactoeView(),
  };
}

// 这些元素在 media/sidebar.html 中必然存在，断言非空是安全的
const navEl = document.getElementById('feature-nav') as HTMLElement;
const contentEl = document.getElementById('feature-content') as HTMLElement;

const views = createViews();
let features: SidebarFeatureInfo[] = [];
let activeFeatureId: SidebarFeatureId | undefined;

/** 渲染顶部切换栏：按钮完全由宿主下发的功能清单生成。 */
function renderNav(): void {
  navEl.replaceChildren(
    ...features.map((feature) => {
      const tab = el('button', {
        className: 'feature-tab',
        text: feature.title,
        attrs: { type: 'button', title: feature.description },
        // 只上报意图，真正改状态的是宿主——宿主再把 switchFeature 下发回来
        on: { click: () => postToHost({ type: 'switchFeature', featureId: feature.id }) },
      });
      if (feature.id === activeFeatureId) {
        tab.classList.add('is-active');
        tab.setAttribute('aria-current', 'true');
      }
      return tab;
    }),
  );
}

/** 切换当前显示的功能：卸载旧视图 → 清空内容区 → 挂载新视图。 */
function showFeature(featureId: SidebarFeatureId): void {
  if (featureId === activeFeatureId) {
    return;
  }

  if (activeFeatureId !== undefined) {
    views[activeFeatureId].unmount?.();
  }
  activeFeatureId = featureId;

  contentEl.replaceChildren();
  views[featureId].mount(contentEl, {
    featureId,
    post: (message) => postFeatureMessage(featureId, message),
  });

  renderNav();
}

onHostMessage((message: SidebarResponse) => {
  switch (message.type) {
    case 'init':
      // Webview 每次加载（含被销毁后重建）都会走到这里，界面从这里完整恢复
      features = message.features;
      renderNav();
      showFeature(message.activeFeatureId);
      return;
    case 'switchFeature':
      showFeature(message.featureId);
      return;
    case 'featureMessage':
      // 只投递给当前挂载的视图：被切走的功能其 DOM 已经卸载
      if (message.featureId === activeFeatureId) {
        views[message.featureId].onMessage?.(message.message);
      }
      return;
    default:
      return;
  }
});

// 告诉宿主「我准备好了」——宿主收到后才下发 init，
// 这样能避免初始化消息早于监听器注册而丢失。
postToHost({ type: 'ready' });
