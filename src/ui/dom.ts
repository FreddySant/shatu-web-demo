type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/**
 * Create an element. Text children become text nodes, so user input is
 * never parsed as HTML. Props starting with "on" become event listeners.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) {
      continue;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      element.className = String(value);
    } else if (key === 'text') {
      element.textContent = String(value);
    } else if (value === true) {
      element.setAttribute(key, '');
    } else {
      element.setAttribute(key, String(value));
    }
  }
  append(element, children);
  return element;
}

export function append(parent: Node, children: (Child | Child[])[]): void {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function replace(parent: Element, ...children: (Child | Child[])[]): void {
  parent.replaceChildren();
  append(parent, children);
}

/** Static markup written in this repository (never user input). */
export function trusted(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content;
}

export const fmt = (n: number): string => n.toLocaleString('en-US');

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
