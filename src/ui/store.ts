import type { Account, Cloud } from '../cloud/service';
import { withActivity, type ActivityEvent, type ProgressMap } from '../engine/progress';

/**
 * The signed-in student and their progress. Progress is loaded from the
 * database when they sign in and saved back shortly after every change.
 */

export type SaveState = 'saved' | 'saving' | 'failed';

type Listener = () => void;

let cloud: Cloud | null = null;
let account: Account | null = null;
let progress: ProgressMap = {};
let activity: ActivityEvent[] = [];
let saveState: SaveState = 'saved';
let saveTimer = 0;
let retryTimer = 0;
let inFlight: Promise<void> | null = null;
let again = false;
const listeners = new Set<Listener>();

const notify = () => listeners.forEach((listener) => listener());

export function connectCloud(next: Cloud): void {
  cloud = next;
}

export function getAccount(): Account | null {
  return account;
}

export function getSaveState(): SaveState {
  return saveState;
}

/** Loads the student's saved progress. Called after signing in. */
export async function openSession(next: Account): Promise<void> {
  if (!cloud) throw new Error('No database connection.');
  const saved = await cloud.loadProgress(next.uid);
  account = next;
  progress = saved.progress;
  activity = saved.activity;
  saveState = 'saved';
  notify();
}

/** After a profile change or a refreshed verification status. */
export function updateAccount(next: Account): void {
  account = next;
  notify();
}

/** Signs out. Call flush() first so nothing is lost. */
export async function closeSession(): Promise<void> {
  dropSession();
  await cloud?.signOut();
}

/** Forgets the session without saving, for when the student was signed out in another tab. */
export function dropSession(): void {
  window.clearTimeout(saveTimer);
  window.clearTimeout(retryTimer);
  account = null;
  progress = {};
  activity = [];
  saveState = 'saved';
  notify();
}

export function getProgress(): ProgressMap {
  return progress;
}

export function setProgress(next: ProgressMap): void {
  progress = next;
  scheduleSave();
  notify();
}

export function getActivity(): ActivityEvent[] {
  return activity;
}

export function pushActivity(event: ActivityEvent): void {
  activity = withActivity(activity, event);
  scheduleSave();
  notify();
}

export function clearProgress(): void {
  progress = {};
  activity = [];
  scheduleSave(0);
  notify();
}

function scheduleSave(delay = 300): void {
  if (!account) return;
  saveState = 'saving';
  window.clearTimeout(saveTimer);
  window.clearTimeout(retryTimer);
  saveTimer = window.setTimeout(() => void save(), delay);
}

async function save(): Promise<void> {
  if (!account || !cloud) return;
  if (inFlight) {
    // A save is on its way; send the newer state when it finishes.
    again = true;
    return inFlight;
  }
  const who = account;
  const snapshot = { progress, activity };
  inFlight = cloud
    .saveProgress(who, snapshot)
    .then(() => {
      if (!again) saveState = 'saved';
    })
    .catch(() => {
      saveState = 'failed';
      // Try again in a few seconds, as long as the same student is signed in.
      retryTimer = window.setTimeout(() => {
        if (account === who) void save();
      }, 5000);
    })
    .finally(() => {
      inFlight = null;
      notify();
      if (again) {
        again = false;
        void save();
      }
    });
  return inFlight;
}

/** Sends any change that is still waiting. */
export async function flush(): Promise<void> {
  window.clearTimeout(saveTimer);
  if (account && saveState !== 'saved') await save();
  while (inFlight) await inFlight;
  if (saveState === 'failed') throw new Error('Progress could not be saved.');
}

// Closing the tab with a change still unsaved: let the browser ask first.
window.addEventListener('beforeunload', (event) => {
  if (account && saveState !== 'saved') event.preventDefault();
});

/** Returns a function that stops listening. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
