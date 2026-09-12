import * as assert from 'assert';

import * as vscode from 'vscode';

const EXTENSION_ID = 'kairai.kairai-scaffold'; // 即 package.json 中 publisher.name

suite('Kairai 扩展测试', () => {
  test('扩展可以被正常激活', async () => {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(ext, `未找到扩展 ${EXTENSION_ID}，请检查 package.json 中的 publisher 与 name`);

    await ext!.activate();
    assert.strictEqual(ext!.isActive, true, '扩展未能成功激活');
  });

  test('示例命令已注册', async () => {
    await vscode.extensions.getExtension(EXTENSION_ID)?.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('kairai.helloWorld'), '缺少命令 kairai.helloWorld');
    assert.ok(commands.includes('kairai.openPanel'), '缺少命令 kairai.openPanel');
  });
});
