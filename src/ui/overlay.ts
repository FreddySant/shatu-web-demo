import { h, replace, trusted } from './dom';

const PATHS = {
  practice: '<rect x="3" y="5" width="4" height="4" rx="1"/><rect x="10" y="5" width="4" height="4" rx="1"/><rect x="17" y="5" width="4" height="4" rx="1"/><rect x="3" y="15" width="4" height="4" rx="1"/><rect x="10" y="15" width="4" height="4" rx="1"/><path d="M17 17h4"/>',
  lab: '<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 15h9"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  check: '<path d="M4 12.5 9.5 18 20 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.1 6.1C3.6 7.8 2 12 2 12s3.5 7 10 7c1.6 0 3-.4 4.3-1"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  panelBottom: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18"/>',
  panelRight: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size = 18): DocumentFragment {
  return trusted(
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`,
  );
}

/* ---------------- Dialog ---------------- */

export interface DialogOptions {
  title: string;
  body: Node | string;
  confirm?: { label: string; danger?: boolean; action: () => void | Promise<void> };
  cancelLabel?: string;
  wide?: boolean;
}

/** A modal dialog built on <dialog>, so focus and Escape are handled by the browser. */
export function openDialog(options: DialogOptions): HTMLDialogElement {
  const dialog = h('dialog', { class: options.wide ? 'dialog wide' : 'dialog', 'aria-labelledby': 'dialog-title' });
  const close = () => dialog.close();
  const actions = h('div', { class: 'dialog-actions' });
  actions.append(h('button', { class: 'btn quiet', type: 'button', onclick: close }, options.cancelLabel ?? (options.confirm ? 'Cancel' : 'Close')));
  if (options.confirm) {
    const confirm = options.confirm;
    actions.append(
      h(
        'button',
        {
          class: confirm.danger ? 'btn danger' : 'btn',
          type: 'button',
          onclick: async () => {
            await confirm.action();
            close();
          },
        },
        confirm.label,
      ),
    );
  }
  replace(
    dialog,
    h(
      'div',
      { class: 'dialog-inner' },
      h('div', { class: 'dialog-head' }, h('h2', { id: 'dialog-title' }, options.title), h('button', { class: 'icon-button', type: 'button', 'aria-label': 'Close', onclick: close }, icon('close'))),
      h('div', { class: 'dialog-body' }, options.body),
      actions,
    ),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

/* ---------------- Toast ---------------- */

let toastRegion: HTMLElement | null = null;

export function toast(title: string, message = '', tone: 'success' | 'milestone' | 'info' = 'info'): void {
  if (!toastRegion || !toastRegion.isConnected) {
    toastRegion = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRegion);
  }
  const item = h('div', { class: `toast ${tone}` }, h('strong', null, title), message ? h('span', null, message) : null);
  toastRegion.append(item);
  window.setTimeout(() => {
    item.classList.add('leaving');
    window.setTimeout(() => item.remove(), 300);
  }, 4200);
}
