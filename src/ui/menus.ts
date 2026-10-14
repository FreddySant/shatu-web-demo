import { h, replace } from './dom';
import { icon, type IconName } from './overlay';

export type MenuEntry =
  | { kind?: 'item'; label: string; shortcut?: string; icon?: IconName; action: () => void; disabled?: boolean; danger?: boolean }
  | { kind: 'check' | 'radio'; label: string; shortcut?: string; checked: boolean; action: () => void; disabled?: boolean }
  | { kind: 'separator' }
  | { kind: 'header'; content: Node };

export interface MenuDef {
  label: () => string | Node;
  ariaLabel?: () => string;
  className?: string;
  items: () => MenuEntry[];
}

/**
 * A desktop-style menu bar. Click a title to open its menu; while one is open,
 * pointing at another title opens that one. Arrow keys move through and between
 * menus, Enter chooses and Escape closes.
 */
export function menuBar(defs: MenuDef[]): { element: HTMLElement; relabel(): void; destroy(): void } {
  const bar = h('div', { class: 'menubar-menus', role: 'menubar', 'aria-label': 'Menu' });
  const tops: HTMLButtonElement[] = [];
  const popups: HTMLElement[] = [];
  let openIndex = -1;

  const enabledItems = (popup: HTMLElement) => [...popup.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')];

  const close = (focusTop = false) => {
    if (openIndex < 0) return;
    const index = openIndex;
    popups[index].hidden = true;
    tops[index].setAttribute('aria-expanded', 'false');
    tops[index].classList.remove('open');
    openIndex = -1;
    if (focusTop) tops[index].focus();
  };

  const renderItems = (index: number) => {
    const popup = popups[index];
    replace(
      popup,
      defs[index].items().map((entry) => {
        if (entry.kind === 'separator') return h('div', { class: 'menu-sep', role: 'separator' });
        // The header repeats what the menu button already says, so it is hidden from screen readers.
        if (entry.kind === 'header') return h('div', { class: 'menu-header', 'aria-hidden': 'true' }, entry.content);
        const isToggle = entry.kind === 'check' || entry.kind === 'radio';
        const mark = isToggle
          ? h('span', { class: 'menu-mark' }, entry.checked ? (entry.kind === 'check' ? icon('check', 14) : h('i', { class: 'radio-dot' })) : null)
          : h('span', { class: 'menu-mark' }, 'icon' in entry && entry.icon ? icon(entry.icon, 15) : null);
        return h(
          'button',
          {
            type: 'button',
            class: 'danger' in entry && entry.danger ? 'menu-item danger' : 'menu-item',
            role: entry.kind === 'check' ? 'menuitemcheckbox' : entry.kind === 'radio' ? 'menuitemradio' : 'menuitem',
            'aria-checked': isToggle ? String(entry.checked) : undefined,
            tabindex: '-1',
            disabled: entry.disabled === true,
            onclick: () => {
              // Focus goes back to the menu title first, so a dialog the command opens can return it there.
              close(true);
              entry.action();
            },
          },
          mark,
          h('span', { class: 'menu-label' }, entry.label),
          entry.shortcut ? h('kbd', { class: 'menu-key' }, entry.shortcut) : null,
        );
      }),
    );
  };

  const open = (index: number, focus: 'first' | 'last' | 'none') => {
    if (openIndex === index) {
      if (focus !== 'none') enabledItems(popups[index]).at(focus === 'first' ? 0 : -1)?.focus();
      return;
    }
    close(false);
    renderItems(index);
    popups[index].hidden = false;
    tops[index].setAttribute('aria-expanded', 'true');
    tops[index].classList.add('open');
    openIndex = index;
    if (focus !== 'none') enabledItems(popups[index]).at(focus === 'first' ? 0 : -1)?.focus();
  };

  const moveTop = (from: number, delta: number) => {
    const next = (from + delta + defs.length) % defs.length;
    tops.forEach((t, i) => t.setAttribute('tabindex', i === next ? '0' : '-1'));
    tops[next].focus();
    return next;
  };

  defs.forEach((def, index) => {
    const top = h('button', { type: 'button', class: 'menu-top', role: 'menuitem', 'aria-haspopup': 'menu', 'aria-expanded': 'false', tabindex: index === 0 ? '0' : '-1' });
    const popup = h('div', { class: 'menu-popup', role: 'menu', hidden: true });
    top.addEventListener('click', () => (openIndex === index ? close(false) : open(index, 'none')));
    top.addEventListener('pointerenter', () => {
      if (openIndex >= 0 && openIndex !== index) open(index, 'none');
    });
    top.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open(index, 'first');
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        open(index, 'last');
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const wasOpen = openIndex >= 0;
        const next = moveTop(index, event.key === 'ArrowRight' ? 1 : -1);
        if (wasOpen) open(next, 'first');
      } else if (event.key === 'Escape') {
        close(true);
      }
    });
    popup.addEventListener('keydown', (event) => {
      const items = enabledItems(popup);
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        items[(at + step + items.length) % items.length]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        items.at(event.key === 'Home' ? 0 : -1)?.focus();
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const next = moveTop(index, event.key === 'ArrowRight' ? 1 : -1);
        open(next, 'first');
      } else if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault();
        close(event.key === 'Escape');
      }
    });
    tops.push(top);
    popups.push(popup);
    bar.append(h('div', { class: def.className ? `menu-root ${def.className}` : 'menu-root' }, top, popup));
  });

  const onOutside = (event: PointerEvent) => {
    if (openIndex >= 0 && !bar.contains(event.target as Node)) close(false);
  };
  document.addEventListener('pointerdown', onOutside);

  const relabel = () => {
    defs.forEach((def, index) => {
      replace(tops[index], def.label());
      const label = def.ariaLabel?.();
      if (label) tops[index].setAttribute('aria-label', label);
    });
  };
  relabel();

  return {
    element: bar,
    relabel,
    destroy: () => {
      close(false);
      document.removeEventListener('pointerdown', onOutside);
    },
  };
}
