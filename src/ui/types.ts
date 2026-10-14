import type { IconName } from './overlay';

export type LogTone = 'info' | 'ok' | 'bad' | 'milestone';

/** The bottom panel's tabs. Output and History belong to the window; the rest come from the open view. */
export type PanelTabId = 'output' | 'hints' | 'solution' | 'rule' | 'history';

/** What a view can ask of the main window. */
export interface Shell {
  log(text: string, tone?: LogTone): void;
  /** Redraw the tree, tabs, toolbar state, properties and status bar. */
  refresh(): void;
  showPanel(tab: PanelTabId): void;
}

export interface ViewTab {
  label(): string;
  content: HTMLElement;
}

export interface PracticeActions {
  check(): void;
  hint(): void;
  solution(): void;
  newProblem(): void;
  next(): void;
  setLevel(index: number): void;
  levels(): { label: string; locked: boolean; current: boolean }[];
  canHint(): boolean;
  canSolution(): boolean;
}

export interface LabActions {
  steps: readonly { id: string; title: string }[];
  current(): string;
  select(id: string): void;
}

/** A document in the main window: one tab, its toolbar, its panel tabs and its properties. */
export interface View {
  key: string;
  icon: IconName;
  title(): string;
  /** The path shown above the document, like a breadcrumb. */
  path(): string[];
  /** Short text on the right of the path bar. */
  info(): string;
  route(): string;
  toolbar: HTMLElement;
  body: HTMLElement;
  tabs: Partial<Record<'hints' | 'solution' | 'rule', ViewTab>>;
  properties(): [string, string | Node][];
  status(): string[];
  practice?: PracticeActions;
  lab?: LabActions;
  /** Called when the view is opened again from an address with a parameter, such as a lab step. */
  open?(param: string | undefined): void;
  /** Called when the view's tab becomes the active one. */
  activate?(): void;
  dispose(): void;
}
