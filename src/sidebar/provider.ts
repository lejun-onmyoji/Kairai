import * as vscode from 'vscode';

import type {
  FeatureMessage,
  SidebarFeatureId,
  SidebarFeatureInfo,
  SidebarMessage,
  SidebarResponse,
} from '../shared/sidebar.js';
import { asWebviewUri, getNonce, readTemplate, renderTemplate } from '../webview/html.js';
import type { SidebarFeatureRegistry } from './registry.js';
import { toFeatureInfo, type SidebarFeatureContext } from './types.js';

/** 记住用户上次打开的功能（存 globalState：属于界面偏好，跨工作区保留）。 */
const ACTIVE_FEATURE_KEY = 'kairai.sidebar.activeFeature';

/**
 * 侧栏的 WebviewView 提供者：**框架的全部宿主侧逻辑都在这里**。
 *
 * 它负责四件事：
 *   1. 渲染 HTML（CSP + nonce 注入，与 WebviewPanel 同一套流程）；
 *   2. 收发消息，并按 featureId 在功能之间路由；
 *   3. 维护「当前功能」这唯一一份状态（持久化到 globalState）；
 *   4. 处理视图生命周期——视图会被销毁重建，重建后自动恢复到原来的功能。
 *
 * 功能层（src/sidebar/features/）完全不接触 WebviewView，只通过 `SidebarFeatureContext`
 * 与界面通信，因此切走 / 切回不会出现「往已销毁的视图发消息」这类问题。
 */
export class KairaiSidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  /** 必须与 package.json 中 `contributes.views.kairai[].id` 一致。 */
  public static readonly viewType = 'kairai.sidebar';

  private view: vscode.WebviewView | undefined;
  /**
   * 与「当前这一个 view」绑定的监听器。
   * 视图每次被重建都会重新 resolve，所以这里用独立数组存放，
   * 避免把上一个视图的监听器留在 context.subscriptions 里越积越多。
   */
  private viewDisposables: vscode.Disposable[] = [];
  private activeFeatureId: SidebarFeatureId;

  constructor(
    private readonly extension: vscode.ExtensionContext,
    private readonly registry: SidebarFeatureRegistry,
  ) {
    this.activeFeatureId = this.resolveInitialFeatureId();
  }

  // ---------------------------------------------------------------- 对外 API

  /** 显示侧栏（命令面板入口用）。 */
  public async reveal(): Promise<void> {
    // 视图 ID 对应的 `<viewId>.focus` 命令由 VS Code 自动生成；
    // 兜底再用容器命令，避免命令未生成时点不动。
    try {
      await vscode.commands.executeCommand(`${KairaiSidebarProvider.viewType}.focus`);
    } catch {
      await vscode.commands.executeCommand('workbench.view.extension.kairai');
    }
  }

  /**
   * 切换当前显示的功能。
   * 无论触发方是命令面板还是 Webview 里的点击，都收敛到这一个入口，
   * 保证「当前功能」始终只有一个真相来源。
   */
  public async switchFeature(featureId: SidebarFeatureId): Promise<void> {
    if (featureId === this.activeFeatureId) {
      return;
    }

    const next = this.registry.get(featureId);
    if (!next) {
      console.warn(`[kairai] 侧栏功能未注册，忽略切换请求：${featureId}`);
      return;
    }

    this.registry.get(this.activeFeatureId)?.onDeactivate?.(this.createContext(this.activeFeatureId));

    this.activeFeatureId = featureId;
    await this.extension.globalState.update(ACTIVE_FEATURE_KEY, featureId);

    // 先通知界面换页，再激活功能（功能可能在 onActivate 里立刻推消息）
    this.send({ type: 'switchFeature', featureId });
    await next.onActivate?.(this.createContext(featureId));
  }

  /** 功能清单，供命令层（QuickPick 等）使用。 */
  public listFeatures(): SidebarFeatureInfo[] {
    return this.registry.list().map(toFeatureInfo);
  }

  // ------------------------------------------------------- WebviewViewProvider

  /**
   * 由 VS Code 调用：
   *   - 侧栏第一次显示时；
   *   - 之后每次 Webview 文档被重建时（例如用户切到别的活动栏图标再切回来）。
   * 因此这里必须**幂等**：每次都要重建监听器、重新渲染 HTML。
   */
  public resolveWebviewView(view: vscode.WebviewView): void {
    this.disposeView();

    this.view = view;
    view.webview.options = {
      enableScripts: true,
      // 只允许加载 media/（HTML/CSS）与 dist/media/（打包产物）下的资源
      localResourceRoots: [
        vscode.Uri.joinPath(this.extension.extensionUri, 'media'),
        vscode.Uri.joinPath(this.extension.extensionUri, 'dist', 'media'),
      ],
    };
    view.webview.html = this.renderHtml(view);

    view.webview.onDidReceiveMessage(
      (message: SidebarMessage) => void this.handleMessage(message),
      null,
      this.viewDisposables,
    );
    view.onDidDispose(() => this.disposeView(), null, this.viewDisposables);
  }

  public dispose(): void {
    this.disposeView();
  }

  // --------------------------------------------------------------- 消息处理

  private async handleMessage(message: SidebarMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        return this.initializeSidebar();
      case 'switchFeature':
        return this.switchFeature(message.featureId);
      case 'featureMessage':
        return this.dispatchFeatureMessage(message.featureId, message.message);
      default:
        return;
    }
  }

  /**
   * Webview 每次加载完成都会发来 `ready`。
   * 框架先回 `init`（界面据此重建切换栏与当前页面），再激活当前功能。
   */
  private async initializeSidebar(): Promise<void> {
    this.send({
      type: 'init',
      features: this.listFeatures(),
      activeFeatureId: this.activeFeatureId,
    });
    await this.registry
      .get(this.activeFeatureId)
      ?.onActivate?.(this.createContext(this.activeFeatureId));
  }

  /** 把消息投递给对应功能——框架不认识消息内容，只认 featureId。 */
  private async dispatchFeatureMessage(
    featureId: SidebarFeatureId,
    message: FeatureMessage,
  ): Promise<void> {
    const feature = this.registry.get(featureId);
    if (!feature) {
      console.warn(`[kairai] 收到未注册功能的消息，已丢弃：${featureId}`);
      return;
    }
    await feature.onMessage?.(message, this.createContext(featureId));
  }

  // ----------------------------------------------------------------- 内部工具

  /** 构造功能上下文；`post` 由框架套上 featureId 信封，功能不需要自己拼协议。 */
  private createContext(featureId: SidebarFeatureId): SidebarFeatureContext {
    return {
      featureId,
      extension: this.extension,
      state: this.extension.workspaceState,
      post: (message: FeatureMessage) => {
        this.send({ type: 'featureMessage', featureId, message });
      },
    };
  }

  /** 下发框架级消息；视图不存在时静默丢弃（侧栏没打开时功能也可能在推消息）。 */
  private send(message: SidebarResponse): void {
    void this.view?.webview.postMessage(message);
  }

  private resolveInitialFeatureId(): SidebarFeatureId {
    const saved = this.extension.globalState.get<string>(ACTIVE_FEATURE_KEY);
    if (saved !== undefined && this.registry.has(saved)) {
      return saved; // has() 是类型谓词，这里已经被收窄成 SidebarFeatureId
    }

    const [first] = this.registry.list();
    if (!first) {
      throw new Error('Kairai 侧栏未注册任何功能，请检查 src/sidebar/features/index.ts');
    }
    return first.id;
  }

  /**
   * 释放当前视图的监听器。
   * 只有确实存在过视图时才通知功能「你被切走了」——否则第一次 resolve 时
   * 会对着一个从未激活过的功能调用 onDeactivate。
   */
  private disposeView(): void {
    const hadView = this.view !== undefined;

    this.view = undefined;
    while (this.viewDisposables.length > 0) {
      this.viewDisposables.pop()!.dispose();
    }

    if (hadView) {
      this.registry
        .get(this.activeFeatureId)
        ?.onDeactivate?.(this.createContext(this.activeFeatureId));
    }
  }

  /** 读取 HTML 模板并注入 nonce / CSP 来源 / 本地资源地址。 */
  private renderHtml(view: vscode.WebviewView): string {
    const template = readTemplate(this.extension.extensionUri, 'media', 'sidebar.html');

    return renderTemplate(template, {
      cspSource: view.webview.cspSource,
      nonce: getNonce(),
      styleUri: asWebviewUri(view.webview, this.extension.extensionUri, 'media', 'sidebar.css'),
      // src/webview/media/sidebar/index.ts 经 esbuild 打包到 dist/media/sidebar.js
      scriptUri: asWebviewUri(view.webview, this.extension.extensionUri, 'dist', 'media', 'sidebar.js'),
    });
  }
}
