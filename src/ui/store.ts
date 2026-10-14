import { browserStore, currentAccount, signOut as endSession, type Account } from '../engine/auth';
import {
  addActivity,
  loadActivity,
  loadProgress,
  resetProgress,
  saveProgress,
  type ActivityEvent,
  type ProgressMap,
} from '../engine/progress';

type Listener = () => void;

let account: Account | null = currentAccount(browserStore);
let progress: ProgressMap = account ? loadProgress(account.username) : {};
let activity: ActivityEvent[] = account ? loadActivity(account.username) : [];
const listeners = new Set<Listener>();

const notify = () => listeners.forEach((listener) => listener());

export function getAccount(): Account | null {
  return account;
}

/** Called after sign-in, sign-out or a profile change. */
export function setAccount(next: Account | null): void {
  account = next;
  progress = next ? loadProgress(next.username) : {};
  activity = next ? loadActivity(next.username) : [];
  notify();
}

export function signOut(): void {
  endSession(browserStore);
  setAccount(null);
}

export function getProgress(): ProgressMap {
  return progress;
}

export function setProgress(next: ProgressMap): void {
  progress = next;
  if (account) saveProgress(account.username, next);
  notify();
}

export function getActivity(): ActivityEvent[] {
  return activity;
}

export function pushActivity(event: ActivityEvent): void {
  if (account) activity = addActivity(account.username, event);
  notify();
}

export function clearProgress(): void {
  if (account) {
    progress = resetProgress(account.username);
    activity = [];
  }
  notify();
}

// Another tab of this browser saved progress: reload it, so this tab never writes over it with an older copy.
window.addEventListener('storage', (event) => {
  if (!account || !event.key || !(event.key.startsWith('shatu.progress.') || event.key.startsWith('shatu.activity.'))) return;
  progress = loadProgress(account.username);
  activity = loadActivity(account.username);
  notify();
});

/** Returns a function that stops listening. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
