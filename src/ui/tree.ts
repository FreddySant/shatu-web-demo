import { h, replace } from './dom';
import { icon, type IconName } from './overlay';

export interface TreeNode {
  id: string;
  label: string;
  icon?: IconName;
  /** A short symbol shown instead of an icon, such as ROTR. */
  sym?: string;
  meta?: Node | null;
  muted?: boolean;
  title?: string;
  children?: TreeNode[];
  open?: () => void;
}

const EXPANDED_KEY = 'shatu.tree.collapsed.v1';

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveCollapsed(collapsed: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // The tree just opens fully expanded next time.
  }
}

/**
 * A tree like a file explorer, with the keyboard behaviour of a desktop tree:
 * Up and Down move, Right opens or goes to the first child, Left closes or goes
 * to the parent, Enter opens the item.
 */
export function treeView(label: string, nodes: () => TreeNode[], selected: () => string): { element: HTMLElement; refresh(): void } {
  const collapsed = loadCollapsed();
  const root = h('ul', { class: 'tree', role: 'tree', 'aria-label': label });
  const byId = new Map<string, TreeNode>();
  let focusId: string | null = null;

  const visible = () => [...root.querySelectorAll<HTMLElement>('[role="treeitem"]')].filter((el) => !el.parentElement?.closest('[aria-expanded="false"]'));

  const focusItem = (el: HTMLElement | undefined) => {
    if (!el) return;
    root.querySelectorAll('[role="treeitem"]').forEach((item) => item.setAttribute('tabindex', '-1'));
    el.setAttribute('tabindex', '0');
    el.focus();
    focusId = el.dataset.id ?? null;
  };

  const toggle = (id: string) => {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    saveCollapsed(collapsed);
    render();
  };

  const item = (node: TreeNode, level: number): HTMLElement => {
    byId.set(node.id, node);
    const folder = !!node.children;
    const isOpen = folder && !collapsed.has(node.id);
    const li = h('li', {
      role: 'treeitem',
      'data-id': node.id,
      'aria-level': String(level),
      'aria-expanded': folder ? String(isOpen) : undefined,
      'aria-selected': folder ? undefined : String(node.id === selected()),
      tabindex: '-1',
      title: node.title ?? node.label,
    });
    const row = h(
      'div',
      { class: `tree-row${folder ? ' folder' : ''}${node.muted ? ' muted' : ''}`, style: `--level:${level - 1}` },
      h('span', { class: 'tree-twisty' }, folder ? icon('chevronRight', 14) : null),
      node.sym ? h('span', { class: 'tree-sym' }, node.sym) : h('span', { class: 'tree-icon' }, icon(node.icon ?? (folder ? 'folder' : 'book'), 15)),
      h('span', { class: 'tree-label' }, node.label),
      node.meta ? h('span', { class: 'tree-meta' }, node.meta) : null,
    );
    row.addEventListener('click', () => {
      focusItem(li);
      if (folder) toggle(node.id);
      else node.open?.();
    });
    li.append(row);
    if (folder) {
      li.append(h('ul', { role: 'group' }, node.children!.map((child) => item(child, level + 1))));
    }
    return li;
  };

  function render() {
    const hadFocus = root.contains(document.activeElement);
    byId.clear();
    replace(root, nodes().map((node) => item(node, 1)));
    const items = visible();
    const target = items.find((el) => el.dataset.id === focusId) ?? items.find((el) => el.getAttribute('aria-selected') === 'true') ?? items[0];
    items.forEach((el) => el.setAttribute('tabindex', el === target ? '0' : '-1'));
    if (hadFocus) target?.focus();
  }

  root.addEventListener('keydown', (event) => {
    const current = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (!current) return;
    const items = visible();
    const index = items.indexOf(current);
    const node = byId.get(current.dataset.id ?? '');
    const expanded = current.getAttribute('aria-expanded');
    switch (event.key) {
      case 'ArrowDown':
        focusItem(items[index + 1]);
        break;
      case 'ArrowUp':
        focusItem(items[index - 1]);
        break;
      case 'Home':
        focusItem(items[0]);
        break;
      case 'End':
        focusItem(items[items.length - 1]);
        break;
      case 'ArrowRight':
        if (expanded === 'false') toggle(current.dataset.id!);
        else if (expanded === 'true') focusItem(items[index + 1]);
        break;
      case 'ArrowLeft':
        if (expanded === 'true') toggle(current.dataset.id!);
        else focusItem(current.parentElement?.closest<HTMLElement>('[role="treeitem"]') ?? undefined);
        break;
      case 'Enter':
      case ' ':
        if (node?.children) toggle(node.id);
        else node?.open?.();
        break;
      default:
        return;
    }
    event.preventDefault();
  });

  render();
  return { element: root, refresh: render };
}
