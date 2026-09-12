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
├── media/                    # Webview 静态模板（HTML/CSS），运行时读取
│   ├── panel.html            # HTML 模板（含 {{...}} 占位符，由扩展注入）
│   └── style.css             # 使用 VS Code 主题变量，自动适配深浅色
├── src/
│   ├── extension.ts          # 入口：activate / deactivate
│   ├── commands/             # 示例命令
│   │   ├── helloWorld.ts     #   命令注册 + 配置读取 + executeCommand 联动
│   │   └── openPanel.ts      #   打开 Webview 面板（薄封装）
│   ├── shared/messages.ts    # 扩展 ↔ Webview 共享消息契约（类型单一来源）
│   ├── webview/
│   │   ├── panel.ts          # Webview 面板类：CSP 注入、消息通信、生命周期
│   │   └── media/main.ts     # Webview 侧脚本 → esbuild 打包为 dist/media/main.js
│   ├── statusBar.ts          # 状态栏 + 配置监听
│   └── test/extension.test.ts# 集成测试（运行在真实 VS Code 实例中）
├── esbuild.js                # 打包脚本：扩展宿主 + Webview 双产物，三模式
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

`menus` 把命令挂到具体 UI 位置（本例挂在 `editor/title` 编辑器标题栏），配合 `icon`、`group`、`when` 子句控制显示条件。

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

模板中的 `{{styleUri}}` / `{{scriptUri}}` 占位符就是这两个地址，由 `renderHtml()` 注入。注意脚本地址指向 `dist/media/main.js`：它是 `src/webview/media/main.ts` 经 esbuild 打包的产物（见 [第 8 节](#8-构建原理)）。

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
- 更「原生」的替代方案是 `WebviewView`（挂在侧边栏），API 几乎相同，适合常驻型界面。

---

## 7. 配置系统

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

## 8. 构建原理

### 8.1 双构建目标：一个 esbuild，两个产物

[esbuild.js](../esbuild.js) 中的 `builds` 数组维护两个构建目标：

| 构建目标 | 入口 | 产物 | 格式 / 平台 | 原因 |
| --- | --- | --- | --- | --- |
| 扩展宿主 | `src/extension.ts` | `dist/extension.js` | `cjs` / `node` | 运行在 Node.js 里；`vscode` 由运行时注入，必须 `external` |
| Webview | `src/webview/media/main.ts` | `dist/media/main.js` | `iife` / `browser` | 运行在浏览器沙箱里，无模块系统，用 IIFE 直接执行 |

两份产物共用 `minify` / `sourcemap` / `sourcesContent` 等公共配置：生产构建压缩并去掉 sourcemap（见 [BUILD_PUBLISH.md](BUILD_PUBLISH.md)），开发构建保留 sourcemap 供断点调试。

### 8.2 双 tsconfig：DOM lib 的隔离

扩展宿主和 Webview 是两个世界，类型检查也分成两份配置：

| 配置 | 覆盖范围 | lib | 目的 |
| --- | --- | --- | --- |
| [tsconfig.json](../tsconfig.json) | `src/`（排除 `src/webview/media`） | ES2022 | 扩展侧是 Node 环境，**不引入 DOM**——防止扩展代码误用 `document` 这类浏览器全局 |
| [tsconfig.webview.json](../tsconfig.webview.json) | `src/webview/media` + `src/shared` | ES2022 + DOM | Webview 侧需要 `document` / `window` |

两份配置都 `noEmit`（纯类型检查），运行时产物全部由 esbuild 产出——这就是「tsc 只管类型，esbuild 负责产出」的分工。`npm run check-types` 依次检查两侧。

### 8.3 esbuild 的关键参数

- `external: ["vscode"]`（仅扩展宿主目标）：`vscode` 模块由 VS Code 运行时注入（Extension Host 里 `require('vscode')` 一定可用），**绝不能打进包里**——这是所有扩展打包器的铁律；
- `format: "cjs"` / `"iife"`：Extension Host 是 Node.js 要 CommonJS；Webview 没有模块系统要 IIFE；
- `bundle: true`：把多文件源码合并成单文件，加载更快、依赖树更简单；
- `sourcesContent: false`：sourcemap 中不内嵌源码，避免体积膨胀。

### 8.4 为什么相对导入带 `.js` 后缀

两份 tsconfig 都使用 `"module": "Node16"`（与 Node.js 原生 ESM 语义一致），该模式下 TS 要求相对导入写完整后缀，因此代码里是 `from './commands/helloWorld.js'` 而非 `'./commands/helloWorld'`。这是官方脚手架的标准写法，与 esbuild 无关（esbuild 会自动解析）。

### 8.5 watch 与调试闭环

按 F5 时，`preLaunchTask` 先启动 `npm run watch`，三个 watcher 并行：

- `esbuild --watch`：实时重建扩展与 Webview 两份产物（配合 `$esbuild-watch` 问题匹配器在「问题」面板报错）；
- `tsc --noEmit --watch`：扩展侧实时类型检查；
- `tsc --noEmit --watch -p tsconfig.webview.json`：Webview 侧实时类型检查。

后两者报错格式匹配 `$tsc-watch`（需要安装推荐的 amodio.tsl-problem-matcher 扩展）。改代码后按 `Cmd/Ctrl+R` 重载扩展宿主即可生效——这就是 F5 调试的完整链路。

---

## 9. 在脚手架上开发新功能的清单

1. **改标识**：`package.json` 的 `name`、`publisher`、`repository`；全局替换 `kairai.` 前缀（命令、配置、测试里的 `EXTENSION_ID`）。
2. **加命令**：`src/commands/` 下新建文件 → `activate()` 中注册 → `contributes.commands` 登记（可选 `menus` 挂菜单）。
3. **做界面**：复制 `src/webview/` 的模式（`panel.ts` + `media/` 模板 + `shared/messages.ts` 契约）；常驻型界面考虑 `WebviewView`。
4. **加配置**：`contributes.configuration` 声明 → `getConfiguration` 读取 → `onDidChangeConfiguration` 监听。
5. **加激活事件**：按需添加（语言类扩展用 `onLanguage:xxx`，文件类用 `workspaceContains` 等），能自动激活就不要手写。
6. **写测试**：在 `src/test/` 下补充用例；复杂 UI 测试可引入 [vscode-extension-tester](https://github.com/redhat-developer/vscode-extension-tester)。
7. **版本与发布**：更新 `CHANGELOG.md` → 走 [编译与发布流程](BUILD_PUBLISH.md)。
