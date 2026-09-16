import * as vscode from 'vscode';

import { SidebarFeatureIds } from '../../shared/sidebar.js';
import type { SidebarFeature } from '../types.js';

/**
 * 概览功能（宿主侧）——脚手架里唯一**已实现**的功能，用来验证整条链路：
 *
 *   界面点击 → 宿主读取配置 → 回传 → 界面渲染日志
 *
 * 新增功能时照着这个文件抄：定 ID、写上 title/description、在 onMessage 里
 * 用 switch (message.type) 分发，需要主动推送时用 context.post()。
 */
export const welcomeFeature: SidebarFeature = {
  id: SidebarFeatureIds.welcome,
  title: '概览',
  description: '侧栏框架说明与连通性自检。',

  onActivate(context) {
    // 切到前台时主动推一条问候语，顺带验证「宿主 → Webview」方向也是通的
    context.post({ type: 'greeting', text: readGreeting(), at: timestamp() });
  },

  onMessage(message, context) {
    switch (message.type) {
      case 'greet':
        context.post({ type: 'greeting', text: readGreeting(), at: timestamp() });
        return;
      default:
        // 未识别的消息直接忽略：功能只对自己约定的 type 负责
        return;
    }
  },
};

/** 复用脚手架已有的配置项 `kairai.greeting`，演示功能如何读取用户设置。 */
function readGreeting(): string {
  return vscode.workspace.getConfiguration('kairai').get<string>('greeting', 'Hello, Kairai!');
}

function timestamp(): string {
  return new Date().toLocaleTimeString();
}
