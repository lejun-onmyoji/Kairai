import * as vscode from 'vscode';

import type { KairaiSidebarProvider } from '../sidebar/provider.js';

/**
 * 侧栏相关命令。
 * 命令本身只做薄封装，真正的逻辑在 src/sidebar/provider.ts 中——
 * 与 openPanel.ts 的分工保持一致。
 */
export function registerSidebarCommands(
  context: vscode.ExtensionContext,
  provider: KairaiSidebarProvider,
): void {
  context.subscriptions.push(
    // 打开侧栏：命令面板入口（侧栏本身也可以直接点活动栏图标打开）
    vscode.commands.registerCommand('kairai.openSidebar', () => provider.reveal()),

    // 切换功能：复用注册表生成 QuickPick，新增功能会自动出现在列表里
    vscode.commands.registerCommand('kairai.switchFeature', async () => {
      await provider.reveal();

      const picked = await vscode.window.showQuickPick(
        provider.listFeatures().map((feature) => ({
          label: feature.title,
          description: feature.description,
          id: feature.id,
        })),
        { title: '切换 Kairai 侧栏功能', placeHolder: '选择要显示的功能' },
      );

      if (picked) {
        await provider.switchFeature(picked.id);
      }
    }),
  );
}
