import { EXERCISES, exerciseById, FULL_VERSION_ONLY, STAGES, type ExerciseId } from '../engine/exercises';
import { recommend } from '../engine/policy';
import { overall, record } from '../engine/progress';
import { logoMark } from './bitsview';
import { accountDialog, aboutDialog, confirmReset, shortcutsDialog } from './dialogs';
import { h, replace } from './dom';
import { LAB_STEPS, labView } from './lab';
import { menuBar, type MenuEntry } from './menus';
import { clock, initials, levelMeter } from './meters';
import { icon, type IconName } from './overlay';
import { practiceView } from './practice';
import { progressView } from './progressview';
import { getAccount, getActivity, getProgress, signOut, subscribe } from './store';
import { treeView, type TreeNode } from './tree';
import type { LogTone, PanelTabId, Shell, View } from './types';
import { verifyView } from './verify';

export type Section = 'practice' | 'lab' | 'progress' | 'verify';

interface Layout {
  tree: number;
  props: number;
  panel: number;
  showTree: boolean;
  showProps: boolean;
  showPanel: boolean;
}

const LAYOUT_KEY = 'shatu.layout.v1';
const DEFAULT_LAYOUT: Layout = { tree: 264, props: 264, panel: 220, showTree: true, showProps: true, showPanel: true };
const LIMITS = { tree: [190, 480], props: [210, 440], panel: [110, 560] } as const;
const MAX_TABS = 8;

function loadLayout(): Layout {
  try {
    return { ...DEFAULT_LAYOUT, ...(JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as Partial<Layout>) };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

function saveLayout(layout: Layout): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // The layout just won't be remembered.
  }
}

function isDark(): boolean {
  const chosen = document.documentElement.dataset.theme;
  return chosen ? chosen === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function setTheme(dark: boolean): void {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  try {
    localStorage.setItem('shatu.theme', dark ? 'dark' : 'light');
  } catch {
    // The choice just won't be remembered.
  }
}

/** Opens an address, even when it is already the current one. */
function go(hash: string): void {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

const TONE_ICON: Record<LogTone, IconName> = { info: 'info', ok: 'check', bad: 'close', milestone: 'layers' };

export function mountDesktop(root: HTMLElement): { open(section: Section, param?: string): void; currentRoute(): string; destroy(): void } {
  const phone = window.matchMedia('(max-width: 760px)');
  const narrow = window.matchMedia('(max-width: 1100px)');
  const layout = loadLayout();
  const views = new Map<string, View>();
  const order: string[] = [];
  let active: View | null = null;
  const lastUsed = new Map<string, number>();
  let useCounter = 0;
  /** Set while the user moves along the document tabs with the keyboard, so the document does not take focus. */
  let keepTabFocus = false;
  let panelTab: PanelTabId = 'output';
  let drawerOpen = false;
  let statusMessage = 'Ready';
  let statusTone: LogTone = 'info';
  let entryCount = 0;

  /* ---------- Shell given to the views ---------- */

  const outputList = h('ol', { class: 'output', 'aria-label': 'Output' });
  const historyPane = h('div', { class: 'panel-pane history-pane' });

  const shell: Shell = {
    log(text, tone = 'info') {
      entryCount += 1;
      outputList.append(h('li', { class: `out ${tone}` }, h('time', null, clock(Date.now())), h('span', { class: 'out-icon' }, icon(TONE_ICON[tone], 13)), h('span', { class: 'out-text' }, text)));
      if (entryCount > 300) outputList.firstElementChild?.remove();
      if (panelTab === 'output') panelBody.scrollTop = panelBody.scrollHeight;
      statusMessage = text;
      statusTone = tone;
      renderStatus();
    },
    refresh() {
      renderAll();
    },
    showPanel(tab) {
      // Shown for this session only, so a panel the user hid stays hidden next time.
      if (!layout.showPanel) {
        layout.showPanel = true;
        applyLayout();
      }
      panelTab = tab;
      renderPanel();
    },
  };

  /* ---------- Menus ---------- */

  const account = () => getAccount()!;

  const doSignOut = () => {
    for (const view of views.values()) view.dispose();
    views.clear();
    order.length = 0;
    active = null;
    signOut();
    location.hash = '#/';
  };

  const openRecommended = () => go(`#/app/practice/${recommend(getProgress()).exercise}`);
  const resetProgress = () => confirmReset(() => shell.log('Progress reset. Every skill is back at level 1.'));

  const closeAll = () => {
    for (const key of [...order]) removeTab(key);
    active = null;
    openRecommended();
  };

  const fileItems = (): MenuEntry[] => [
    { label: 'Close tab', icon: 'close', disabled: !active, action: () => active && closeTab(active.key) },
    { label: 'Close all tabs', disabled: order.length === 0, action: closeAll },
    { kind: 'separator' },
    { label: 'Account settings…', icon: 'settings', action: accountDialog },
    { label: 'Reset progress…', icon: 'reset', action: resetProgress },
    { kind: 'separator' },
    { label: 'Sign out', icon: 'logout', action: doSignOut },
  ];

  const practiceItems = (): MenuEntry[] => {
    const p = active?.practice;
    const items: MenuEntry[] = [
      { label: 'Check answer', shortcut: 'Enter', icon: 'check', disabled: !p, action: () => p?.check() },
      { label: 'Show hint', shortcut: 'H', icon: 'bulb', disabled: !p || !p.canHint(), action: () => p?.hint() },
      { label: 'Show worked solution', shortcut: 'S', icon: 'eye', disabled: !p || !p.canSolution(), action: () => p?.solution() },
      { label: 'New problem', shortcut: 'N', icon: 'refresh', disabled: !p, action: () => p?.newProblem() },
      { kind: 'separator' },
      { label: 'Next recommended problem', icon: 'arrowRight', action: () => (p ? p.next() : openRecommended()) },
    ];
    if (p) {
      items.push({ kind: 'separator' }, ...p.levels().map((level, i): MenuEntry => ({ kind: 'radio', label: level.label, checked: level.current, disabled: level.locked, action: () => p.setLevel(i) })));
    }
    return items;
  };

  const labItems = (): MenuEntry[] => {
    const lab = active?.lab;
    const at = lab ? LAB_STEPS.findIndex((s) => s.id === lab.current()) : -1;
    return [
      { label: 'Open Hash Lab', icon: 'lab', action: () => go('#/app/lab') },
      { kind: 'separator' },
      ...LAB_STEPS.map((s, i): MenuEntry => ({ kind: 'radio', label: `${i + 1}. ${s.title}`, checked: at === i, action: () => go(`#/app/lab/${s.id}`) })),
      { kind: 'separator' },
      { label: 'Previous step', shortcut: '[', disabled: !lab || at <= 0, action: () => lab?.select(LAB_STEPS[at - 1].id) },
      { label: 'Next step', shortcut: ']', disabled: !lab || at >= LAB_STEPS.length - 1, action: () => lab?.select(LAB_STEPS[at + 1].id) },
    ];
  };

  const viewItems = (): MenuEntry[] => [
    { kind: 'check', label: 'Steps panel', checked: treeShown(), action: toggleTree },
    { kind: 'check', label: 'Bottom panel', checked: layout.showPanel, action: togglePanel },
    { kind: 'check', label: 'Properties panel', checked: layout.showProps && !narrow.matches, disabled: narrow.matches, action: toggleProps },
    { kind: 'separator' },
    { label: 'Output', icon: 'terminal', action: () => shell.showPanel('output') },
    { label: 'History', icon: 'clock', action: () => shell.showPanel('history') },
    { label: 'Progress report', icon: 'table', action: () => go('#/app/progress') },
    { kind: 'separator' },
    { kind: 'check', label: 'Dark theme', checked: isDark(), action: () => setTheme(!isDark()) },
    { label: 'Reset window layout', icon: 'sidebar', action: resetLayout },
  ];

  const helpItems = (): MenuEntry[] => [
    { label: 'Keyboard shortcuts', shortcut: '?', icon: 'book', action: shortcutsDialog },
    { label: 'Verification', icon: 'shield', action: () => go('#/app/verify') },
    { kind: 'separator' },
    { label: 'About ShaTu', icon: 'info', action: aboutDialog },
  ];

  const userItems = (): MenuEntry[] => [
    { kind: 'header', content: h('div', null, h('strong', null, account().displayName), h('span', null, `@${account().username}`)) },
    { label: 'Account settings…', icon: 'settings', action: accountDialog },
    { label: 'Sign out', icon: 'logout', action: doSignOut },
  ];

  const menus = menuBar([
    { label: () => 'File', items: fileItems },
    { label: () => 'Practice', items: practiceItems },
    { label: () => 'Lab', items: labItems },
    { label: () => 'View', items: viewItems },
    { label: () => 'Help', items: helpItems },
    {
      label: () => h('span', { class: 'user-top' }, h('span', { class: 'avatar' }, initials(account().displayName)), h('span', { class: 'user-name' }, account().displayName)),
      ariaLabel: () => `Account: ${account().displayName}`,
      className: 'menu-user',
      items: userItems,
    },
  ]);

  /* ---------- Tree ---------- */

  const treeNodes = (): TreeNode[] => {
    const progress = getProgress();
    return [
      {
        id: 'folder:practice',
        label: 'Practice',
        icon: 'practice',
        children: STAGES.map((stage) => ({
          id: `folder:${stage.id}`,
          label: stage.title,
          children: [
            ...EXERCISES.filter((e) => e.stage === stage.id).map(
              (e): TreeNode => ({
                id: `practice/${e.id}`,
                label: e.title,
                sym: e.symbol,
                meta: record(progress, e.id).mastered ? h('span', { class: 'done-mark', 'aria-label': 'Mastered' }, icon('check', 13)) : levelMeter(progress, e.id),
                open: () => go(`#/app/practice/${e.id}`),
              }),
            ),
            ...FULL_VERSION_ONLY.filter((f) => f.stage === stage.id).map(
              (f): TreeNode => ({
                id: `lab-only/${f.title}`,
                label: f.title,
                icon: 'lab',
                muted: true,
                title: 'Not a practice skill in this demo. Opens this step in the Hash Lab.',
                open: () => go(`#/app/lab/${f.labStep}`),
              }),
            ),
          ],
        })),
      },
      {
        id: 'folder:lab',
        label: 'Hash Lab',
        icon: 'lab',
        children: LAB_STEPS.map((s, i): TreeNode => ({ id: `lab/${s.id}`, label: s.title, sym: String(i + 1), open: () => go(`#/app/lab/${s.id}`) })),
      },
      {
        id: 'folder:reports',
        label: 'Reports',
        icon: 'chart',
        children: [
          { id: 'progress', label: 'Progress', icon: 'table', open: () => go('#/app/progress') },
          { id: 'verify', label: 'Verification', icon: 'shield', open: () => go('#/app/verify') },
        ],
      },
    ];
  };

  const selectedTreeId = () => (!active ? '' : active.lab ? `lab/${active.lab.current()}` : active.key);
  const tree = treeView('Steps', treeNodes, selectedTreeId);

  /* ---------- Layout ---------- */

  const treeToggle = h('button', { type: 'button', class: 'tool icon-only', title: 'Steps panel', 'aria-label': 'Steps panel' }, icon('sidebar', 16));
  const panelToggle = h('button', { type: 'button', class: 'tool icon-only', title: 'Bottom panel', 'aria-label': 'Bottom panel' }, icon('panelBottom', 16));
  const propsToggle = h('button', { type: 'button', class: 'tool icon-only props-toggle', title: 'Properties panel', 'aria-label': 'Properties panel' }, icon('panelRight', 16));
  const toolbarSlot = h('div', { class: 'toolbar-slot' });
  const toolbar = h('div', { class: 'toolbar', role: 'group', 'aria-label': 'Tools' }, treeToggle, h('span', { class: 'tool-sep', role: 'separator' }), toolbarSlot, h('span', { class: 'tool-spacer' }), panelToggle, propsToggle);

  const docTabs = h('div', { class: 'doc-tabs', role: 'tablist', 'aria-label': 'Open documents' });
  const pathBar = h('div', { class: 'pathbar' });
  const docHost = h('div', { class: 'doc-host' });
  const panelTabs = h('div', { class: 'panel-tabs', role: 'tablist', 'aria-label': 'Panel' });
  const panelActions = h('div', { class: 'panel-actions' });
  const panelBody = h('div', { class: 'panel-body', role: 'tabpanel' });
  const propsBody = h('div', { class: 'pane-scroll' });
  const statusLeft = h('span', { class: 'status-msg' });
  const statusRight = h('div', { class: 'status-fields' });

  const treePane = h('aside', { class: 'tree-pane', 'aria-label': 'Steps' }, h('div', { class: 'pane-title' }, 'Steps'), h('div', { class: 'pane-scroll' }, tree.element));
  const propsPane = h('aside', { class: 'props-pane', 'aria-label': 'Properties' }, h('div', { class: 'pane-title' }, 'Properties'), propsBody);
  const dock = h('section', { class: 'dock', 'aria-label': 'Bottom panel' }, h('div', { class: 'panel-head' }, panelTabs, panelActions), panelBody);
  const doc = h('section', { class: 'doc', 'aria-label': 'Document' }, pathBar, docHost);
  const center = h('div', { class: 'center' }, docTabs, doc);
  const main = h('div', { class: 'desk-main' });
  const desk = h('div', { class: 'desk' });

  const setSize = (which: keyof typeof LIMITS, value: number) => {
    const [min, max] = LIMITS[which];
    const ceiling = which === 'panel' ? Math.max(min, Math.min(max, center.clientHeight - 150)) : max;
    layout[which] = Math.round(Math.min(ceiling, Math.max(min, value)));
    applyLayout();
  };

  const splitter = (which: keyof typeof LIMITS, label: string): HTMLElement => {
    const vertical = which !== 'panel';
    const el = h('div', { class: `splitter ${vertical ? 'split-v' : 'split-h'} split-${which}`, role: 'separator', tabindex: '0', 'aria-label': label, 'aria-orientation': vertical ? 'vertical' : 'horizontal', 'aria-valuemin': String(LIMITS[which][0]), 'aria-valuemax': String(LIMITS[which][1]) });
    el.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      desk.classList.add('resizing');
      const move = (e: PointerEvent) => {
        const box = main.getBoundingClientRect();
        if (which === 'tree') setSize('tree', e.clientX - box.left);
        else if (which === 'props') setSize('props', box.right - e.clientX);
        else setSize('panel', center.getBoundingClientRect().bottom - e.clientY);
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        desk.classList.remove('resizing');
        saveLayout(layout);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    el.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 48 : 16;
      const grow = which === 'props' ? 'ArrowLeft' : which === 'panel' ? 'ArrowUp' : 'ArrowRight';
      const shrink = which === 'props' ? 'ArrowRight' : which === 'panel' ? 'ArrowDown' : 'ArrowLeft';
      if (event.key === grow) setSize(which, layout[which] + step);
      else if (event.key === shrink) setSize(which, layout[which] - step);
      else return;
      event.preventDefault();
      saveLayout(layout);
    });
    el.addEventListener('dblclick', () => {
      setSize(which, DEFAULT_LAYOUT[which]);
      saveLayout(layout);
    });
    return el;
  };

  const treeSplit = splitter('tree', 'Resize the steps panel');
  const propsSplit = splitter('props', 'Resize the properties panel');
  const panelSplit = splitter('panel', 'Resize the bottom panel');
  center.append(panelSplit, dock);
  const scrim = h('div', { class: 'drawer-scrim', onclick: () => setDrawer(false) });
  main.append(treePane, treeSplit, center, propsSplit, propsPane, scrim);

  replace(
    desk,
    h('header', { class: 'menubar' }, h('span', { class: 'menubar-brand' }, logoMark(), h('span', null, 'ShaTu')), menus.element),
    toolbar,
    main,
    h('footer', { class: 'statusbar' }, statusLeft, statusRight),
  );

  const treeShown = () => (phone.matches ? drawerOpen : layout.showTree);

  function applyLayout() {
    main.style.setProperty('--tree-w', `${layout.tree}px`);
    main.style.setProperty('--props-w', `${layout.props}px`);
    center.style.setProperty('--panel-h', `${layout.panel}px`);
    desk.classList.toggle('hide-tree', !layout.showTree);
    desk.classList.toggle('hide-props', !layout.showProps);
    desk.classList.toggle('hide-panel', !layout.showPanel);
    desk.classList.toggle('drawer-open', phone.matches && drawerOpen);
    // On a phone the closed drawer is off screen; keep it out of the tab order too.
    treePane.inert = phone.matches && !drawerOpen;
    treeSplit.setAttribute('aria-valuenow', String(layout.tree));
    propsSplit.setAttribute('aria-valuenow', String(layout.props));
    panelSplit.setAttribute('aria-valuenow', String(layout.panel));
    treeToggle.setAttribute('aria-pressed', String(treeShown()));
    panelToggle.setAttribute('aria-pressed', String(layout.showPanel));
    propsToggle.setAttribute('aria-pressed', String(layout.showProps));
  }

  function setDrawer(open: boolean) {
    drawerOpen = open;
    applyLayout();
    if (open) requestAnimationFrame(() => (tree.element.querySelector('[tabindex="0"]') as HTMLElement | null)?.focus());
  }

  function toggleTree() {
    if (phone.matches) setDrawer(!drawerOpen);
    else {
      layout.showTree = !layout.showTree;
      saveLayout(layout);
      applyLayout();
    }
  }

  function togglePanel() {
    layout.showPanel = !layout.showPanel;
    saveLayout(layout);
    applyLayout();
  }

  function toggleProps() {
    layout.showProps = !layout.showProps;
    saveLayout(layout);
    applyLayout();
  }

  function resetLayout() {
    Object.assign(layout, DEFAULT_LAYOUT);
    saveLayout(layout);
    applyLayout();
  }

  treeToggle.addEventListener('click', toggleTree);
  panelToggle.addEventListener('click', togglePanel);
  propsToggle.addEventListener('click', toggleProps);

  /* ---------- Rendering ---------- */

  function renderTabs() {
    const hadFocus = docTabs.contains(document.activeElement);
    replace(
      docTabs,
      order.map((key) => {
        const view = views.get(key)!;
        const isActive = view === active;
        return h(
          'div',
          { class: isActive ? 'doc-tab active' : 'doc-tab', role: 'presentation' },
          h(
            'button',
            {
              type: 'button',
              role: 'tab',
              class: 'doc-tab-main',
              'aria-selected': String(isActive),
              tabindex: isActive ? '0' : '-1',
              title: view.path().join(' / '),
              'data-key': key,
              onclick: () => go(view.route()),
              onauxclick: (event: MouseEvent) => {
                if (event.button === 1) closeTab(key);
              },
            },
            icon(view.icon, 14),
            h('span', null, view.title()),
          ),
          h('button', { type: 'button', class: 'doc-tab-close', tabindex: '-1', title: 'Close', 'aria-label': `Close ${view.title()}`, onclick: () => closeTab(key) }, icon('close', 12)),
        );
      }),
    );
    if (hadFocus) (docTabs.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus();
  }

  docTabs.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Delete') return;
    const key = (event.target as HTMLElement).dataset.key;
    if (!key) return;
    event.preventDefault();
    if (event.key === 'Delete') {
      closeTab(key);
      return;
    }
    const at = order.indexOf(key);
    const next = order[(at + (event.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length];
    keepTabFocus = true;
    go(views.get(next)!.route());
  });

  function renderPath() {
    if (!active) {
      replace(pathBar);
      return;
    }
    const parts = active.path();
    replace(
      pathBar,
      h(
        'nav',
        { class: 'path', 'aria-label': 'Location' },
        parts.flatMap((part, i) => [i > 0 ? h('span', { class: 'path-sep' }, icon('chevronRight', 12)) : null, h('span', { class: i === parts.length - 1 ? 'path-part current' : 'path-part' }, part)]),
      ),
      h('span', { class: 'path-info' }, active.info()),
    );
  }

  const availableTabs = (): PanelTabId[] => ['output', ...(['hints', 'solution', 'rule'] as const).filter((id) => active?.tabs[id]), 'history'];
  const tabLabel = (id: PanelTabId) => (id === 'output' ? 'Output' : id === 'history' ? 'History' : (active?.tabs[id]?.label() ?? ''));
  const tabIcon: Record<PanelTabId, IconName> = { output: 'terminal', hints: 'bulb', solution: 'eye', rule: 'book', history: 'clock' };

  const clearButton = h('button', { type: 'button', class: 'tool icon-only small', title: 'Clear output', 'aria-label': 'Clear output' }, icon('trash', 14));
  const closePanelButton = h('button', { type: 'button', class: 'tool icon-only small', title: 'Hide panel', 'aria-label': 'Hide panel' }, icon('close', 14));
  clearButton.addEventListener('click', () => {
    replace(outputList);
    entryCount = 0;
  });
  closePanelButton.addEventListener('click', togglePanel);

  function renderPanel() {
    const tabs = availableTabs();
    if (!tabs.includes(panelTab)) panelTab = 'output';
    const hadFocus = panelTabs.contains(document.activeElement);
    replace(
      panelTabs,
      tabs.map((id) =>
        h(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: 'panel-tab',
            'aria-selected': String(id === panelTab),
            tabindex: id === panelTab ? '0' : '-1',
            'data-tab': id,
            onclick: () => {
              panelTab = id;
              renderPanel();
            },
          },
          icon(tabIcon[id], 13),
          tabLabel(id),
        ),
      ),
    );
    const content = panelTab === 'output' ? outputList : panelTab === 'history' ? historyPane : active!.tabs[panelTab]!.content;
    if (panelBody.firstChild !== content) {
      replace(panelBody, content);
      if (panelTab === 'output') panelBody.scrollTop = panelBody.scrollHeight;
    }
    replace(panelActions, panelTab === 'output' ? clearButton : null, closePanelButton);
    if (hadFocus) (panelTabs.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus();
  }

  panelTabs.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const tabs = availableTabs();
    const at = tabs.indexOf(panelTab);
    panelTab = tabs[(at + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    renderPanel();
  });

  function renderHistory() {
    const events = getActivity();
    replace(
      historyPane,
      events.length === 0
        ? h('p', { class: 'muted small' }, 'No problems recorded yet.')
        : h(
            'table',
            { class: 'grid compact-grid' },
            h('thead', null, h('tr', null, ['Time', 'Skill', 'Level', 'Result', 'Hints'].map((t) => h('th', { scope: 'col' }, t)))),
            h(
              'tbody',
              null,
              events.map((ev) => {
                const e = exerciseById(ev.exercise);
                const result = ev.leveledUp
                  ? 'Level up'
                  : !ev.solved
                    ? 'Skipped'
                    : ev.review
                      ? 'Solved (review)'
                      : ev.counted
                        ? 'Solved'
                        : ev.sawAnswer
                          ? 'Solved, answer shown'
                          : ev.hints > 0
                            ? 'Solved with hints'
                            : 'Solved on a later try';
                return h(
                  'tr',
                  null,
                  h('td', { class: 'nowrap' }, new Date(ev.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })),
                  h('td', null, h('span', { class: 'sym' }, e.symbol), e.title),
                  h('td', null, e.levels[ev.levelIndex].label),
                  h('td', { class: `result-cell ${ev.leveledUp ? 'up' : ev.solved ? 'ok' : 'skip'}` }, result),
                  h('td', { class: 'num' }, String(ev.hints)),
                );
              }),
            ),
          ),
    );
  }

  function renderProps() {
    replace(
      propsBody,
      active
        ? h(
            'table',
            { class: 'prop-grid' },
            h(
              'tbody',
              null,
              active.properties().map(([name, value]) => h('tr', null, h('th', { scope: 'row' }, name), h('td', null, value))),
            ),
          )
        : null,
    );
  }

  function renderStatus() {
    const totals = overall(getProgress());
    replace(statusLeft, h('span', { class: `status-icon ${statusTone}` }, icon(TONE_ICON[statusTone], 12)), h('span', { class: 'status-text' }, statusMessage));
    replace(
      statusRight,
      h('span', { class: 'status-field' }, icon('user', 12), account().username),
      (active?.status() ?? []).map((text) => h('span', { class: 'status-field' }, text)),
      h('span', { class: 'status-field' }, `Course ${totals.percent}%`),
      h('span', { class: 'status-field saved' }, 'Saved in this browser'),
    );
  }

  function renderAll() {
    renderTabs();
    renderPath();
    tree.refresh();
    renderPanel();
    renderProps();
    renderStatus();
    applyLayout();
  }

  /* ---------- Opening views ---------- */

  function create(section: Section, param?: string): View {
    switch (section) {
      case 'practice':
        return practiceView(shell, param as ExerciseId);
      case 'lab':
        return labView(shell, param);
      case 'progress':
        return progressView(resetProgress);
      case 'verify':
        return verifyView(shell);
    }
  }

  function activate(view: View) {
    const changed = active !== view;
    active = view;
    lastUsed.set(view.key, ++useCounter);
    for (const v of views.values()) v.body.hidden = v !== view;
    if (toolbarSlot.firstChild !== view.toolbar) replace(toolbarSlot, view.toolbar);
    document.title = `${view.title()} | ShaTu`;
    renderAll();
    if (keepTabFocus) {
      keepTabFocus = false;
      (docTabs.querySelector('[aria-selected="true"]') as HTMLElement | null)?.focus();
    } else if (changed) {
      view.activate?.();
    }
  }

  /** Takes a tab out of the window without moving to another one. */
  function removeTab(key: string) {
    const view = views.get(key);
    if (!view) return;
    view.dispose();
    view.body.remove();
    views.delete(key);
    lastUsed.delete(key);
    order.splice(order.indexOf(key), 1);
  }

  function closeTab(key: string) {
    const view = views.get(key);
    if (!view) return;
    const at = order.indexOf(key);
    removeTab(key);
    if (active === view) {
      active = null;
      const neighbor = order[at] ?? order[at - 1];
      if (neighbor) go(views.get(neighbor)!.route());
      else openRecommended();
    } else {
      renderAll();
    }
  }

  function open(section: Section, param?: string) {
    const key = section === 'practice' ? `practice/${param}` : section;
    let view = views.get(key);
    if (!view) {
      view = create(section, param);
      views.set(key, view);
      order.push(key);
      docHost.append(view.body);
      // Too many tabs: close the one used longest ago. The new view is about to be shown, so nothing else moves.
      while (order.length > MAX_TABS) {
        const stale = order.filter((k) => k !== key).sort((a, b) => (lastUsed.get(a) ?? 0) - (lastUsed.get(b) ?? 0))[0];
        removeTab(stale);
      }
    } else {
      view.open?.(param);
    }
    if (phone.matches && drawerOpen) setDrawer(false);
    activate(view);
    if (location.hash !== view.route()) history.replaceState(null, '', view.route());
  }

  /* ---------- Keyboard and events ---------- */

  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape' && phone.matches && drawerOpen) {
      setDrawer(false);
      treeToggle.focus();
      event.preventDefault();
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, dialog, [role="menu"], [contenteditable="true"]')) return;
    const p = active?.practice;
    const lab = active?.lab;
    const key = event.key.toLowerCase();
    if (event.key === '?') shortcutsDialog();
    else if (p && key === 'h') p.hint();
    else if (p && key === 's') p.solution();
    else if (p && key === 'n') p.newProblem();
    else if (lab && (event.key === '[' || event.key === ']')) {
      const at = lab.steps.findIndex((s) => s.id === lab.current());
      const next = lab.steps[at + (event.key === ']' ? 1 : -1)];
      if (next) lab.select(next.id);
    } else return;
    event.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  const onMedia = () => {
    drawerOpen = false;
    renderAll();
  };
  phone.addEventListener('change', onMedia);
  narrow.addEventListener('change', onMedia);

  const stop = subscribe(() => {
    // Signing out clears the account before this window is taken down.
    if (!getAccount()) return;
    menus.relabel();
    tree.refresh();
    renderHistory();
    renderTabs();
    renderPath();
    renderProps();
    renderStatus();
  });

  replace(root, desk);
  applyLayout();
  renderHistory();
  shell.log(`Signed in as ${account().username}.`);

  return {
    open,
    currentRoute: () => active?.route() ?? '#/app',
    destroy() {
      for (const view of views.values()) view.dispose();
      views.clear();
      order.length = 0;
      active = null;
      stop();
      document.removeEventListener('keydown', onKey);
      phone.removeEventListener('change', onMedia);
      narrow.removeEventListener('change', onMedia);
      menus.destroy();
    },
  };
}
