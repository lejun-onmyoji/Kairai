import * as vscode from 'vscode';

/**
 * 示例状态栏：展示配置项内容，并监听配置变化实时刷新。
 * 演示：StatusBarItem、getConfiguration、onDidChangeConfiguration。
 */
export function registerStatusBar(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = 'kairai.helloWorld'; // 点击状态栏触发命令
  context.subscriptions.push(item);

  const update = (): void => {
    const config = vscode.workspace.getConfiguration('kairai');
    const greeting = config.get<string>('greeting', 'Hello, Kairai!');
    item.text = `$(smiley) ${greeting}`;
    item.tooltip = 'Kairai Scaffold — 点击打个招呼';
    item.show();
  };
  update();

  // 配置项变化时刷新状态栏（比如用户在设置里改了 kairai.greeting）
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('kairai.greeting')) {
        update();
      }
    }),
  );
}
