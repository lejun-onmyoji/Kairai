import * as assert from 'assert';

import * as vscode from 'vscode';

import { createDefaultRegistry } from '../sidebar/features/index.js';
import { KairaiSidebarProvider } from '../sidebar/provider.js';
import { SidebarFeatureRegistry } from '../sidebar/registry.js';
import { SidebarFeatureIds, type SidebarMessage, type SidebarResponse } from '../shared/sidebar.js';

const EXTENSION_ID = 'kairai.kairai-scaffold'; // 即 package.json 中 publisher.name

/** 让 provider 内部未 await 的异步消息处理跑完。 */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** 内存版 Memento，替代 VS Code 的持久化存储。 */
function createMemento(): vscode.Memento {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      store.has(key) ? (store.get(key) as T) : defaultValue,
    update: async (key: string, value: unknown): Promise<void> => {
      store.set(key, value);
    },
    keys: () => [...store.keys()],
  } as vscode.Memento;
}

/**
 * 极简的 WebviewView 测试替身：
 *   - 记录 provider 写进去的 HTML 与下发过的消息；
 *   - 通过 `emit()` 伪造「Webview 发消息给扩展」，走真实的 onDidReceiveMessage 通路。
 */
function createFakeWebviewView(extensionUri: vscode.Uri) {
  const posted: SidebarResponse[] = [];
  let receive: ((message: SidebarMessage) => void) | undefined;

  const webview = {
    html: '',
    options: {} as vscode.WebviewOptions,
    cspSource: 'vscode-webview://fake-source',
    asWebviewUri: (uri: vscode.Uri) => uri,
    postMessage: (message: unknown) => {
      posted.push(message as SidebarResponse);
      return Promise.resolve(true);
    },
    onDidReceiveMessage: (
      handler: (message: unknown) => void,
      _thisArg: unknown,
      disposables: vscode.Disposable[],
    ) => {
      receive = handler as (message: SidebarMessage) => void;
      const disposable = {
        dispose: () => {
          receive = undefined;
        },
      };
      disposables.push(disposable);
      return disposable;
    },
  };

  const view = {
    viewType: KairaiSidebarProvider.viewType,
    webview,
    visible: true,
    onDidDispose: (_handler: () => void, _thisArg: unknown, disposables: vscode.Disposable[]) => {
      const disposable = { dispose: () => undefined };
      disposables.push(disposable);
      return disposable;
    },
  };

  return {
    view: view as unknown as vscode.WebviewView,
    posted,
    emit: (message: SidebarMessage) => receive?.(message),
    webview,
    extensionUri,
  };
}

/** 构造一个仅包含 provider 实际用到的字段的扩展上下文。 */
function createFakeContext(
  extensionUri: vscode.Uri,
  globalState: vscode.Memento = createMemento(),
): vscode.ExtensionContext {
  return {
    extensionUri,
    globalState,
    workspaceState: createMemento(),
    subscriptions: [],
  } as unknown as vscode.ExtensionContext;
}

suite('Kairai 侧栏框架测试', () => {
  suiteSetup(async () => {
    await vscode.extensions.getExtension(EXTENSION_ID)?.activate();
  });

  test('侧栏命令已在 package.json 中登记并注册成功', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('kairai.openSidebar'), '缺少命令 kairai.openSidebar');
    assert.ok(commands.includes('kairai.switchFeature'), '缺少命令 kairai.switchFeature');
  });

  test('视图已由 VS Code 注册（viewType 与 package.json 的 views 一致）', async () => {
    // VS Code 会为每个已注册的视图自动生成 `<viewId>.focus` 命令；
    // 它存在即说明 contributes.views 里的 ID 与 provider.viewType 对上了。
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes(`${KairaiSidebarProvider.viewType}.focus`),
      `未找到 ${KairaiSidebarProvider.viewType}.focus：` +
        'package.json 的 contributes.viewsContainers / views 与 KairaiSidebarProvider.viewType 可能不一致',
    );
  });

  test('内置功能覆盖共享契约声明的全部 ID', () => {
    const registry = createDefaultRegistry();
    const registered = registry.list().map((feature) => feature.id);
    const declared = Object.values(SidebarFeatureIds);

    assert.deepStrictEqual(
      [...registered].sort(),
      [...declared].sort(),
      'src/sidebar/features/index.ts 注册的功能与 src/shared/sidebar.ts 声明的 ID 不一致',
    );
  });

  test('重复注册同一个功能 ID 会抛错', () => {
    const feature = createDefaultRegistry().list()[0];
    const registry = new SidebarFeatureRegistry().register(feature);

    assert.throws(() => registry.register(feature), /重复注册/, '重复 ID 应当直接抛错');
  });

  test('切换功能会持久化选择并触发生命周期钩子', async () => {
    const calls: string[] = [];
    const globalState = createMemento();
    const registry = new SidebarFeatureRegistry().registerAll([
      {
        id: SidebarFeatureIds.welcome,
        title: '第一个',
        description: '',
        onActivate: () => void calls.push('activate:welcome'),
        onDeactivate: () => void calls.push('deactivate:welcome'),
      },
      {
        id: SidebarFeatureIds.tictactoe,
        title: '第二个',
        description: '',
        onActivate: () => void calls.push('activate:tictactoe'),
      },
    ]);
    const provider = new KairaiSidebarProvider(
      createFakeContext(vscode.Uri.file('/tmp/kairai-test'), globalState),
      registry,
    );

    await provider.switchFeature(SidebarFeatureIds.tictactoe);

    assert.deepStrictEqual(
      calls,
      ['deactivate:welcome', 'activate:tictactoe'],
      '切换功能应先停用旧功能、再激活新功能',
    );
    assert.strictEqual(
      globalState.get('kairai.sidebar.activeFeature'),
      SidebarFeatureIds.tictactoe,
      '当前功能应被持久化',
    );
  });

  test('持久化了非法功能 ID 时回退到第一个功能', () => {
    const globalState = createMemento();
    void globalState.update('kairai.sidebar.activeFeature', 'not-a-feature');

    const provider = new KairaiSidebarProvider(
      createFakeContext(vscode.Uri.file('/tmp/kairai-test'), globalState),
      createDefaultRegistry(),
    );

    assert.strictEqual(
      provider.listFeatures()[0].id,
      SidebarFeatureIds.welcome,
      '非法 ID 应被忽略并回退到首个功能',
    );
  });

  test('渲染的 HTML 已完成占位符替换（CSP + nonce + 资源地址）', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `未找到扩展 ${EXTENSION_ID}`);

    const provider = new KairaiSidebarProvider(
      createFakeContext(extension!.extensionUri),
      createDefaultRegistry(),
    );
    const fake = createFakeWebviewView(extension!.extensionUri);

    provider.resolveWebviewView(fake.view);

    const html = fake.webview.html;
    assert.ok(html.includes('vscode-webview://fake-source'), 'CSP 来源未注入');
    assert.ok(html.includes("script-src 'nonce-"), 'nonce 未注入到 CSP');
    assert.ok(!html.includes('{{'), 'HTML 模板里仍残留未替换的占位符');
  });

  test('ready 握手后下发 init，并能把功能消息路由回功能', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `未找到扩展 ${EXTENSION_ID}`);

    const provider = new KairaiSidebarProvider(
      createFakeContext(extension!.extensionUri),
      createDefaultRegistry(),
    );
    const fake = createFakeWebviewView(extension!.extensionUri);
    provider.resolveWebviewView(fake.view);

    // 1. Webview 加载完成后握手
    fake.emit({ type: 'ready' });
    await tick();

    const init = fake.posted[0];
    assert.strictEqual(init.type, 'init', 'ready 之后应先下发 init');
    assert.strictEqual(
      init.type === 'init' ? init.activeFeatureId : undefined,
      SidebarFeatureIds.welcome,
      '默认应打开第一个功能',
    );

    // 2. 概览功能主动推送的问候语（宿主 → Webview 方向）
    fake.posted.length = 0;

    // 3. 模拟界面点击「打个招呼」（Webview → 宿主 → Webview 完整往返）
    fake.emit({
      type: 'featureMessage',
      featureId: SidebarFeatureIds.welcome,
      message: { type: 'greet' },
    });
    await tick();

    const reply = fake.posted.at(-1);
    assert.ok(reply, '宿主未回传任何消息');
    assert.strictEqual(reply.type, 'featureMessage');
    assert.strictEqual(
      reply.type === 'featureMessage' ? reply.featureId : undefined,
      SidebarFeatureIds.welcome,
      '回传消息应带上 featureId，供 Webview 路由',
    );
    assert.strictEqual(
      reply.type === 'featureMessage' ? reply.message.type : undefined,
      'greeting',
      '概览功能应回传 greeting 消息',
    );
  });

  test('未注册功能的消息被安全丢弃', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `未找到扩展 ${EXTENSION_ID}`);

    const provider = new KairaiSidebarProvider(
      createFakeContext(extension!.extensionUri),
      createDefaultRegistry(),
    );
    const fake = createFakeWebviewView(extension!.extensionUri);
    provider.resolveWebviewView(fake.view);

    fake.emit({ type: 'ready' });
    await tick();
    fake.posted.length = 0;

    fake.emit({
      type: 'featureMessage',
      featureId: 'ghost' as never,
      message: { type: 'greet' },
    });
    await tick();

    assert.strictEqual(fake.posted.length, 0, '未知 featureId 的消息不应产生任何回传');
  });
});
