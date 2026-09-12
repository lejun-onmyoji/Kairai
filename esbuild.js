/**
 * esbuild 打包脚本：构建两个产物。
 *
 *   1. dist/extension.js   —— 扩展宿主（Node.js）代码，CJS 格式，vscode 模块 external；
 *   2. dist/media/main.js  —— Webview（浏览器）脚本，IIFE 格式，无 Node 依赖。
 *
 * 用法：
 *   node esbuild.js                 # 开发模式：一次构建（不压缩，带 sourcemap）
 *   node esbuild.js --production    # 生产模式：压缩、去掉 sourcemap（发布用）
 *   node esbuild.js --watch         # 监听模式：源码变化时自动重建
 *
 * 关键点：
 *   - external: ["vscode"]：vscode 模块由 VS Code 运行时提供，绝不打包进产物（仅扩展宿主目标）；
 *   - format: "cjs" / "iife"：扩展宿主是 Node.js 要 CommonJS，Webview 无模块系统要 IIFE。
 */
const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * 把 esbuild 的输出格式化成 VS Code 任务系统能识别的问题匹配格式
 * （配合 .vscode/tasks.json 中的 $esbuild-watch 匹配器使用）。
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",

  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log("[watch] build finished");
    });
  },
};

/** 两个构建目标的公共配置。 */
const common = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  logLevel: "silent",
  plugins: [esbuildProblemMatcherPlugin],
};

/** @type {import('esbuild').BuildOptions[]} */
const builds = [
  {
    // 扩展宿主：Node.js 环境，vscode 由运行时注入
    entryPoints: ["src/extension.ts"],
    format: "cjs",
    platform: "node",
    outfile: "dist/extension.js",
    external: ["vscode"],
  },
  {
    // Webview：浏览器沙箱，IIFE 直接内联执行
    entryPoints: ["src/webview/media/main.ts"],
    format: "iife",
    platform: "browser",
    outfile: "dist/media/main.js",
  },
];

async function main() {
  const contexts = await Promise.all(
    builds.map((config) => esbuild.context({ ...common, ...config })),
  );

  if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
