import * as vscode from 'vscode';

/**
 * 示例命令：从配置项读取问候语并弹出提示。
 * 演示：command 注册、executeCommand 联动、配置读取。
 */
export function registerHelloWorldCommand(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('kairai.helloWorld', async () => {
    const config = vscode.workspace.getConfiguration('kairai');
    const greeting = config.get<string>('greeting', 'Hello, Kairai!');

    const choice = await vscode.window.showInformationMessage(`${greeting} 👋`, '再来一次');
    if (choice === '再来一次') {
      // 通过 executeCommand 再次触发自身，演示命令间的相互调用
      await vscode.commands.executeCommand('kairai.helloWorld');
    }
  });

  context.subscriptions.push(disposable);
}
