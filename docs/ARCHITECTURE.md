# Kairai 脚手架原理

本文解释本脚手架的**工作原理**：VS Code 扩展的运行模型、每个文件/字段的职责，以及构建系统为什么这样设计。发布流程请见 [编译与发布流程](BUILD_PUBLISH.md)。

---

## 1. VS Code 扩展的运行模型

VS Code 本身是一个 Electron 应用，由两个关键进程组成：

```
┌──────────────────────────────────────────────┐
│  Main Process（Electron 主进程）              │
│  - 窗口管理、插件发现与装载                     │
└──────────────┬───────────────────────────────┘
               │ 装载 & 进程间通信 (RPC)
┌──────────────▼───────────────────────────────┐
│  Extension Host（扩展宿主，Node.js 进程）      │
│  - 运行所有扩展的 activate() 等 JS 代码        │
│  - 与 UI 线程之间只能通过 vscode API 交互      │
└──────────────┬───────────────────────────────┘
               │
┌──────────────▼───────────────────────────────┐
│  Renderer（渲染进程，即用户看到的界面）         │
│  - 编辑器 UI、状态栏、Webview（iframe 沙箱）    │
└──────────────────────────────────────────────┘
```

要点：

- **扩展运行在 Extension Host**——一个独立的 Node.js 进程。你写的 `activate()` 在这里执行，可以自由使用 Node 内置模块（`fs`、`path` 等，见 [src/webview/panel.ts](../src/webview/panel.ts) 中的 `readFileSync`）。
- **扩展不能直接操作 DOM**。所有 UI 交互（编辑器、状态栏、通知、Webview）都必须通过 `vscode` 模块提供的 API，由 VS Code 内部跨进程转发。
- **Webview 例外**：Webview 是一个沙箱 iframe，运行在渲染进程中，只有浏览器 API + 极少数 `acquireVsCodeApi()` 提供的 API（详见 [第 6 节](#6-webview-原理)）。

理解了这个模型，就理解了脚手架里几乎所有设计：为什么 `vscode` 模块必须 `external`、为什么入口文件是 CommonJS、为什么 Webview 的消息要靠 `postMessage`。

---

## 2. 目录结构与职责

```
.
├── .github/workflows/        # CI（三平台测试+打包）与发布工作流
├── .vscode/
│   ├── launch.json           # F5 调试配置（extensionHost 类型）
│   ├── tasks.json            # watch 后台任务（esbuild + tsc 并行）
│   └── extensions.json       # 推荐安装的辅助扩展
├── docs/                     # 本文档（原理）与发布流程文档
├── media/                    # Webview 静态模板（HTML/CSS/图标），运行时读取
│   ├── panel.html            # 面板 HTML 模板（含 {{...}} 占位符，由扩展注入）
│   ├── sidebar.html          # 侧栏 HTML 模板（同上）
│   ├── style.css             # 面板样式（使用 VS Code 主题变量，自动适配深浅色）
│   ├── sidebar.css           # 侧栏样式（同上，间距更紧凑）
│   └── icons/kairai.svg      # 活动栏图标（24×24 单色 SVG）
├── src/
│   ├── extension.ts          # 入口：activate / deactivate
│   ├── commands/             # 示例命令
│   │   ├── helloWorld.ts     #   命令注册 + 配置读取 + executeCommand 联动
│   │   ├── openPanel.ts      #   打开 Webview 面板（薄封装）
│   │   └── sidebar.ts        #   打开侧栏 / 切换侧栏功能（薄封装）
│   ├── shared/
│   │   ├── messages.ts       # 面板 ↔ Webview 共享消息契约（类型单一来源）
│   │   └── sidebar.ts        # 侧栏共享契约：功能 ID + 消息格式
│   ├── sidebar/              # 侧栏框架（宿主侧）
│   │   ├── index.ts          #   registerSidebar()：把侧栏挂到 VS Code 上
│   │   ├── provider.ts       #   WebviewViewProvider：渲染、路由、生命周期
│   │   ├── registry.ts       #   功能注册表
│   │   ├── types.ts          #   SidebarFeature / SidebarFeatureContext 契约
│   │   └── features/         #   各个功能（逻辑写在这里）
│   │       ├── index.ts      #     内置功能清单（新增功能在此登记）
│   │       ├── welcome.ts    #     概览：唯一已实现的示例功能
│   │       ├── agentHarness.ts #   Agent Harness 占位骨架
│   │       └── tictactoe.ts  #     井字棋占位骨架
│   ├── webview/
│   │   ├── html.ts           # CSP + nonce + 模板占位符（面板与侧栏共用）
│   │   ├── panel.ts          # Webview 面板类：CSP 注入、消息通信、生命周期
│   │   └── media/
│   │       ├── vscode-api.d.ts #  acquireVsCodeApi 的全局类型声明（两侧共用）
│   │       ├── main.ts       #   面板脚本 → 打包为 dist/media/main.js
│   │       └── sidebar/      #   侧栏脚本 → 打包为 dist/media/sidebar.js
│   │           ├── index.ts  #     路由器：渲染切换栏、挂载/卸载视图、消息分发
│   │           ├── bridge.ts #     与宿主的消息通道（自动补 featureId 信封）
│   │           ├── dom.ts    #     el() 等 DOM 工具（只用 textContent 写文本）
│   │           ├── types.ts  #     SidebarView / SidebarViewContext 契约
│   │           └── views/    #     各个功能的界面
│   ├── statusBar.ts          # 状态栏 + 配置监听
│   └── test/                 # 集成测试（运行在真实 VS Code 实例中）
│       ├── extension.test.ts #   激活与示例命令
│       └── sidebar.test.ts   #   侧栏框架：注册表、切换、渲染、消息路由
├── esbuild.js                # 打包脚本：扩展宿主 + 两个 Webview，共三产物、三模式
├── .vscode-test.mjs          # @vscode/test-cli 测试配置
├── .vscodeignore             # .vsix 打包排除清单
├── package.json              # 扩展清单（唯一被 VS Code 读取的配置文件）
├── tsconfig.json             # 扩展侧类型检查（Node 环境，不含 DOM）
└── tsconfig.webview.json     # Webview 侧类型检查（浏览器环境，含 DOM lib）
```

---

## 3. package.json：扩展的「身份证」

`package.json` 是 VS Code 识别一个扩展的**唯一入口**，所有字段都在其中声明：

| 字段 | 作用 |
| --- | --- |
| `name` + `publisher` | 组成扩展全局唯一 ID（本脚手架为 `kairai.kairai-scaffold`）。发布后不可更改 |
| `engines.vscode` | 声明支持的最低 VS Code 版本；`devDependencies` 中 `@types/vscode` 的版本必须与之匹配（`^1.96.0`） |
| `main` | 入口文件路径，指向 esbuild 打包产物 `./dist/extension.js` |
| `activationEvents` | 声明激活时机（见下节） |
| `contributes` | **贡献点**：向 VS Code 声明本扩展提供了什么——命令、菜单、配置、图标等 |

### 3.1 contributes 与自动激活

`contributes.commands` 里每登记一条命令，VS Code 就会：

1. 在命令面板（`Ctrl/Cmd+Shift+P`）中显示对应条目（`title` + `category`）；
2. **自动生成对应的 `onCommand:xxx` 激活事件**（VS Code ≥ 1.74），用户第一次执行该命令时自动加载扩展——所以本脚手架无需在 `activationEvents` 里手动写 `onCommand`。

`menus` 把命令挂到具体 UI 位置（本例的 `kairai.openPanel` 挂在 `editor/title` 编辑器标题栏，`kairai.switchFeature` 挂在 `view/title` 侧栏标题栏），配合 `icon`、`group`、`when` 子句控制显示条件。

`contributes.viewsContainers` + `contributes.views` 用来声明侧栏界面（活动栏图标与视图），详见 [第 7 节](#7-侧栏框架webviewview)。

### 3.2 为什么保留 `onStartupFinished`

状态栏问候语希望「打开 VS Code 就能看到」，这要求扩展在启动阶段就激活。`activationEvents: ["onStartupFinished"]` 是官方推荐的做法——它在窗口启动完成后才激活，既保证了状态栏可见，又避免拖慢启动。若你的扩展没有此类需求，直接删掉整段 `activationEvents`，完全依赖自动激活即可。

---

## 4. 生命周期与资源管理

```ts
export function activate(context: vscode.ExtensionContext): void
export function deactivate(): void
```

- **activate(context)**：扩展被激活时调用，用于注册命令、监听器、创建 UI。`context` 提供：
  - `context.subscriptions`：把 `Disposable` 挂上去，VS Code 会在扩展停用时**自动释放**——脚手架中所有 `registerCommand` 返回值都 `push` 到这里，这就是「无需手动清理」的由来；
  - `context.extensionUri` / `extensionPath`：扩展安装目录（开发时是项目目录本身），用于定位 `media/` 等资源；
  - `context.globalState` / `workspaceState`：基于 Memento 的轻量持久化（比写文件更简单）。
- **deactivate()**：停用时调用。凡是已挂到 `subscriptions` 的资源都会被自动 dispose，这里只放真正无法自动管理的清理逻辑。
- **停用时机**：VS Code 退出、扩展被禁用、扩展被更新（重新加载新版本）。

---

## 5. 命令系统

一条命令的完整链路：

```
package.json contributes.commands 登记
        │
        ▼
用户触发（命令面板 / 菜单 / 快捷键）
        │
        ▼
（若扩展未激活）VS Code 激活扩展 → activate()
        │
        ▼
vscode.commands.registerCommand('kairai.helloWorld', handler) 被调用
        │
        ▼
handler 执行 → 返回结果
```

- **注册**必须发生在 `activate()` 内、且 `Disposable` 要挂到 `subscriptions`。
- **执行**使用 `vscode.commands.executeCommand('命令ID', ...args)`——脚手架在 [helloWorld.ts](../src/commands/helloWorld.ts) 中演示了「命令递归调用自身」。
- 命令 ID 建议用 `扩展名.动作名` 格式（`kairai.helloWorld`），避免与其他扩展冲突。
- 菜单项的 `when` 子句是条件渲染的关键（如 `when: "editorHasSelection"`），本脚手架暂未演示，可在 [VS Code 官方文档](https://code.visualstudio.com/api/references/when-clause-contexts) 查阅。

---

## 6. Webview 原理

Webview 是扩展创建 UI 的主要手段，本脚手架在 [src/webview/panel.ts](../src/webview/panel.ts) + [media/](../media/) 中给出了完整示例。

### 6.1 沙箱模型

Webview 是一个受控 iframe，与扩展宿主**跨进程隔离**：

- 里面没有 Node.js、没有 `require`，只有浏览器 API；
- 默认禁用脚本，必须在 `createWebviewPanel` 选项中显式 `enableScripts: true`；
- 与扩展通信的唯一通道是消息机制。

### 6.2 安全加载资源：CSP + nonce

在 HTML 模板中声明内容安全策略：

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src {{cspSource}}; script-src 'nonce-{{nonce}}';">
```

- `default-src 'none'` 禁止加载任何外部资源；
- `{{cspSource}}` 由扩展注入，是 VS Code 分配给该 Webview 的合法资源来源；
- `{{nonce}}` 是每次渲染用 `node:crypto` 的 `randomBytes` 生成的密码学安全随机串（见 `getNonce()`，**不能用 `Math.random()`**——那不可预测性不够），脚本标签必须携带相同 nonce 才被放行——即使有恶意内容注入也无法执行脚本。

### 6.3 本地资源加载：asWebviewUri

静态模板（`media/panel.html`、`media/style.css`）与打包产物（`dist/media/main.js`）都不能用相对路径引用（Webview 的虚拟文档上不存在这些路径），必须：

1. 用 `vscode.Uri.joinPath(context.extensionUri, ...)` 构造 URI；
2. 用 `webview.asWebviewUri()` 转换成 Webview 可访问的 `vscode-webview://` 协议地址；
3. 同时在 `createWebviewPanel` 选项里声明 `localResourceRoots: [media/, dist/media/]`——**未声明的目录一律不可访问**，这是防止 Webview 越权读取任意文件的最后一道闸。

模板中的 `{{styleUri}}` / `{{scriptUri}}` 占位符就是这两个地址，由 `renderHtml()` 注入（面板与侧栏共用 [src/webview/html.ts](../src/webview/html.ts)）。注意脚本地址指向 `dist/media/main.js`：它是 `src/webview/media/main.ts` 经 esbuild 打包的产物（见 [第 9 节](#9-构建原理)）。

### 6.4 双向消息通信

```
扩展宿主 (Node.js)                     Webview (浏览器)
      │  panel.webview.postMessage(...)      │
      │ ───────────────────────────────────► │
      │                                      │  window.addEventListener('message')
      │                                      │  (media/main.js)
      │  panel.webview.onDidReceiveMessage   │
      │ ◄─────────────────────────────────── │
      │         vscode.postMessage(...)      │
```

- **Webview → 扩展**：`acquireVsCodeApi().postMessage()`（每个 Webview 只能调用 `acquireVsCodeApi()` 一次）；
- **扩展 → Webview**：`panel.webview.postMessage()`；
- 消息是纯 JSON，两边各自维护 `type` 字段做分发（`switch (message.type)`）。

两侧共享的消息类型定义在 `src/shared/messages.ts`，扩展侧（`panel.ts`）与 Webview 侧（`media/main.ts`）导入同一份契约——保证 `type` 字段是单一来源，不会因两侧手写而漂移。

### 6.5 生命周期

- 面板被用户关闭时触发 `onDidDispose`——脚手架在这里释放所有监听器并清空单例引用；
- 想要面板切走不销毁状态，可设置 `retainContextWhenHidden: true`（内存换体验，默认关闭）；
- 更「原生」的常驻型界面用 `WebviewView`（挂在侧边栏），API 与本节的 `WebviewPanel` 高度相似但生命周期不同——脚手架已把它做成一套功能框架，见 [第 7 节](#7-侧栏框架webviewview)。

---

## 7. 侧栏框架（WebviewView）

第 6 节的 Webview **面板**是「打开一个大页面」；侧栏则是「常驻在活动栏里的界面」。两者 API 高度相似，但用途和生命周期完全不同，本脚手架把侧栏单独做成了一套**可插拔的功能框架**，后续的 Agent Harness、小游戏都作为「功能」挂进去。

### 7.1 面板 vs 侧栏

| | Webview **Panel**（`kairai.openPanel`） | 侧栏 **WebviewView**（活动栏图标） |
| --- | --- | --- |
| 创建方式 | `window.createWebviewPanel` | `window.registerWebviewViewProvider` |
| 位置 | 编辑器区域（和文件标签并排） | 侧边栏的活动栏容器里 |
| 数量 | 可多开（脚手架用单例约束成 1 个） | 每个视图只会有 1 个实例 |
| 声明位置 | 无需声明 | 必须在 `contributes.viewsContainers` + `contributes.views` 中登记 |
| 隐藏时 | 标签切走仍保留 | **文档被销毁**，回来时重新 `resolveWebviewView` |

最后一行是侧栏最需要小心的地方，也是本框架所有设计取舍的来源。

### 7.2 三处配置，缺一不可

```
package.json  contributes.viewsContainers.activitybar   → 活动栏上的图标（media/icons/kairai.svg）
package.json  contributes.views["kairai"]               → 容器里的视图（type: "webview"）
src/sidebar/index.ts  registerWebviewViewProvider(...)  → 视图的实现（HTML + 消息处理）
```

三处的视图 ID 必须一致（`kairai.sidebar`）。脚手架用 `KairaiSidebarProvider.viewType` 这一个常量拼装，避免手写漂移；容器 ID `kairai` 还被 `reveal()` 里的兜底命令 `workbench.view.extension.kairai` 引用。

> 图标约定：24×24 单色 SVG，用 `fill="currentColor"`，VS Code 会按主题着色。

### 7.3 框架的分层

```
              ┌───────────────────── 宿主侧（Extension Host） ─────────────────────┐
              │  src/sidebar/provider.ts   渲染 HTML / 路由消息 / 维护当前功能      │
              │  src/sidebar/registry.ts   功能注册表（有哪些功能）                 │
              │  src/sidebar/features/*    各功能的逻辑（能读写文件、调 vscode API）│
              └───────────────▲──────────────────────────────┬─────────────────────┘
                              │  featureMessage（带 featureId）│  init / switchFeature
                              ▼                               ▼
              ┌───────────────────── Webview 侧（浏览器沙箱） ────────────────────┐
              │  src/webview/media/sidebar/index.ts   路由器 + 切换栏             │
              │  src/webview/media/sidebar/views/*    各功能的界面（只画界面）     │
              └──────────────────────────────────────────────────────────────────┘
```

一个「功能」= 宿主侧一个 `SidebarFeature` + Webview 侧一个 `SidebarView`，靠同一个 `featureId` 对齐。

消息分两类，都在 [src/shared/sidebar.ts](../src/shared/sidebar.ts) 里定义：

- **框架级**：`ready`（Webview 加载完成）、`init`（下发功能清单 + 当前功能）、`switchFeature`；
- **功能级**：`featureMessage` 信封，内层 `message` 由各功能自己约定，框架只按 `featureId` 路由、不理解内容——所以新增功能不需要改动框架代码。

### 7.4 为什么功能拿不到 WebviewView

`SidebarFeatureContext` 只提供 `post()` / `state` / `extension`，**刻意不暴露 `WebviewView`**：

- 视图随时可能被销毁重建（用户切一下活动栏就会），功能若持有视图引用，很容易在它销毁后继续发消息、监听事件，导致内存泄漏或异常；
- 统一走 `post()`，由 provider 判断视图是否存在（不存在就静默丢弃），功能代码不需要写任何防御逻辑。

这与第 4 节「资源挂到 subscriptions 由 VS Code 自动释放」是同一个思路：**把生命周期集中在框架层，功能只写业务**。

### 7.5 状态放在哪：三种状态的归属

| 状态 | 存放位置 | 原因 |
| --- | --- | --- |
| 当前打开哪个功能 | 宿主 `globalState` | 界面偏好，跨工作区保留；文档重建后由 provider 恢复 |
| 功能的业务数据（如棋局） | 宿主 `workspaceState`（`context.state`） | 随工作区保存，且不受 Webview 重建影响 |
| 纯界面临时状态（如输入框草稿） | Webview 的 `getState/setState` | 便宜、就地恢复；文档销毁即丢，适合放可丢弃的东西 |

**状态一律放宿主侧**是这套框架的核心约定：Webview 只是「投影」，随时可以重建。这也解释了 `src/sidebar/index.ts` 里为什么**不开** `retainContextWhenHidden`——用状态恢复比用内存常驻更划算（该选项的代价见 `registerWebviewViewProvider` 的类型注释：内存常驻，且隐藏期间无法收发消息）。将来 Agent Harness 若要「流式输出不中断」，再按注释打开它。

### 7.6 新增一个侧栏功能

以加一个「备忘录」功能为例，四步：

1. `src/shared/sidebar.ts` 的 `SidebarFeatureIds` 里加 `memo: 'memo'`；
2. 宿主侧写 `src/sidebar/features/memo.ts`：定 `id/title/description`，在 `onMessage` 里 `switch (message.type)` 处理界面来的消息，需要推送就用 `context.post()`；
3. Webview 侧写 `src/webview/media/sidebar/views/memo.ts`：`mount()` 画界面，`context.post()` 上报交互，`onMessage()` 响应宿主；
4. 在两处清单里登记：`src/sidebar/features/index.ts` 与 `src/webview/media/sidebar/index.ts`。

第 1 步之后如果漏了第 4 步，`npm run check-types` 会直接报错——两处清单的类型都是 `Record<SidebarFeatureId, ...>`，这是刻意设计的「漏注册编译不过」。顶部切换栏的按钮完全由注册表生成，**不需要手写任何 UI**。

---

## 8. 配置系统

```
package.json contributes.configuration 声明配置项
        │
        ▼
用户：设置界面 / settings.json 修改
        │
        ▼
扩展：vscode.workspace.getConfiguration('kairai').get('greeting')
       vscode.workspace.onDidChangeConfiguration 监听变化
```

脚手架演示了完整闭环：`kairai.greeting` 的默认值、状态栏展示、以及修改配置后状态栏**实时刷新**（[statusBar.ts](../src/statusBar.ts) 中 `affectsConfiguration` 判断只响应自己关心的键）。

---

## 9. 构建原理

### 9.1 三个构建目标：一个 esbuild，三个产物

[esbuild.js](../esbuild.js) 中的 `builds` 数组维护三个构建目标：

| 构建目标 | 入口 | 产物 | 格式 / 平台 | 原因 |
| --- | --- | --- | --- | --- |
| 扩展宿主 | `src/extension.ts` | `dist/extension.js` | `cjs` / `node` | 运行在 Node.js 里；`vscode` 由运行时注入，必须 `external` |
| 面板 Webview | `src/webview/media/main.ts` | `dist/media/main.js` | `iife` / `browser` | 运行在浏览器沙箱里，无模块系统，用 IIFE 直接执行 |
| 侧栏 Webview | `src/webview/media/sidebar/index.ts` | `dist/media/sidebar.js` | `iife` / `browser` | 同上；独立入口，两块界面互不牵连体积 |

三份产物共用 `minify` / `sourcemap` / `sourcesContent` 等公共配置：生产构建压缩并去掉 sourcemap（见 [BUILD_PUBLISH.md](BUILD_PUBLISH.md)），开发构建保留 sourcemap 供断点调试。新增界面时只需在 `builds` 数组里照抄一段 Webview 目标。

### 9.2 双 tsconfig：DOM lib 的隔离

扩展宿主和 Webview 是两个世界，类型检查也分成两份配置：

| 配置 | 覆盖范围 | lib | 目的 |
| --- | --- | --- | --- |
| [tsconfig.json](../tsconfig.json) | `src/`（排除 `src/webview/media`） | ES2022 | 扩展侧是 Node 环境，**不引入 DOM**——防止扩展代码误用 `document` 这类浏览器全局 |
| [tsconfig.webview.json](../tsconfig.webview.json) | `src/webview/media` + `src/shared` | ES2022 + DOM | Webview 侧需要 `document` / `window` |

两份配置都 `noEmit`（纯类型检查），运行时产物全部由 esbuild 产出——这就是「tsc 只管类型，esbuild 负责产出」的分工。`npm run check-types` 依次检查两侧。

### 9.3 esbuild 的关键参数

- `external: ["vscode"]`（仅扩展宿主目标）：`vscode` 模块由 VS Code 运行时注入（Extension Host 里 `require('vscode')` 一定可用），**绝不能打进包里**——这是所有扩展打包器的铁律；
- `format: "cjs"` / `"iife"`：Extension Host 是 Node.js 要 CommonJS；Webview 没有模块系统要 IIFE；
- `bundle: true`：把多文件源码合并成单文件，加载更快、依赖树更简单；
- `sourcesContent: false`：sourcemap 中不内嵌源码，避免体积膨胀。

### 9.4 为什么相对导入带 `.js` 后缀

两份 tsconfig 都使用 `"module": "Node16"`（与 Node.js 原生 ESM 语义一致），该模式下 TS 要求相对导入写完整后缀，因此代码里是 `from './commands/helloWorld.js'` 而非 `'./commands/helloWorld'`。这是官方脚手架的标准写法，与 esbuild 无关（esbuild 会自动解析）。

### 9.5 watch 与调试闭环

按 F5 时，`preLaunchTask` 先启动 `npm run watch`，三个 watcher 并行：

- `esbuild --watch`：实时重建扩展与两个 Webview 产物（配合 `$esbuild-watch` 问题匹配器在「问题」面板报错）；
- `tsc --noEmit --watch`：扩展侧实时类型检查；
- `tsc --noEmit --watch -p tsconfig.webview.json`：Webview 侧实时类型检查。

后两者报错格式匹配 `$tsc-watch`（需要安装推荐的 amodio.tsl-problem-matcher 扩展）。改代码后按 `Cmd/Ctrl+R` 重载扩展宿主即可生效——这就是 F5 调试的完整链路。

> 调试侧栏界面时：重载扩展宿主（`Cmd/Ctrl+R`）后侧栏会自动重建；只改了 Webview 侧代码（`src/webview/media/sidebar/`）时，等待 watcher 重建产物后切换一下侧栏功能、或切走活动栏再切回来，即可让 Webview 文档重新加载。

---

## 10. 在脚手架上开发新功能的清单

1. **改标识**：`package.json` 的 `name`、`publisher`、`repository`；全局替换 `kairai.` 前缀（命令、配置、测试里的 `EXTENSION_ID`）。
2. **加命令**：`src/commands/` 下新建文件 → `activate()` 中注册 → `contributes.commands` 登记（可选 `menus` 挂菜单）。
3. **做界面**：
   - 一次性的大页面 → 用 Webview **Panel**：复制 `src/webview/panel.ts` + `media/panel.html` 的模式；
   - 常驻型界面 / 多个子页面切换 → 用侧栏**功能框架**：按 [第 7.6 节](#76-新增一个侧栏功能) 的四步走。
4. **加配置**：`contributes.configuration` 声明 → `getConfiguration` 读取 → `onDidChangeConfiguration` 监听。
5. **加激活事件**：按需添加（语言类扩展用 `onLanguage:xxx`，文件类用 `workspaceContains` 等），能自动激活就不要手写。
6. **写测试**：在 `src/test/` 下补充用例（`sidebar.test.ts` 里有现成的 WebviewView 测试替身可直接复用）；复杂 UI 测试可引入 [vscode-extension-tester](https://github.com/redhat-developer/vscode-extension-tester)。
7. **版本与发布**：更新 `CHANGELOG.md` → 走 [编译与发布流程](BUILD_PUBLISH.md)。
