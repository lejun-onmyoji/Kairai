/**
 * 极简 DOM 构造工具。
 *
 * 全程使用 `textContent`（而不是 `innerHTML`）写入文本，天然免疫 HTML 注入——
 * 即使将来把工具输出、模型回复这类不可信内容渲染到界面上也不会被当成标签执行。
 */

export interface ElementOptions {
  /** 类名。 */
  className?: string;
  /** 文本内容（按纯文本处理）。 */
  text?: string;
  /** HTML 属性，如 `{ type: 'button', disabled: 'true' }`。 */
  attrs?: Record<string, string>;
  /** 事件监听器，如 `{ click: () => ... }`。 */
  on?: Record<string, (event: Event) => void>;
}

/** 创建元素：`el('button', { text: '发送', on: { click: send } })`。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  if (options.className !== undefined) {
    node.className = options.className;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  for (const [name, handler] of Object.entries(options.on ?? {})) {
    node.addEventListener(name, handler);
  }

  node.append(...children);
  return node;
}
