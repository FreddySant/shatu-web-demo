import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/martian-mono/wdth.css';
import './styles/main.css';

import { cloud } from './cloud';
import type { Cloud } from './cloud/service';
import { isExerciseId } from './engine/exercises';
import { recommend } from './engine/policy';
import { mountDesktop } from './ui/desktop';
import { replace } from './ui/dom';
import { loadingScreen, problemScreen, startScreen } from './ui/start';
import { connectCloud, dropSession, getAccount, getProgress, openSession } from './ui/store';

try {
  const saved = localStorage.getItem('shatu.theme');
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.dataset.theme = saved;
  }
} catch {
  // No storage: follow the system theme.
}

const root = document.getElementById('root') as HTMLElement;
let desktop: ReturnType<typeof mountDesktop> | null = null;

function leaveDesktop(): void {
  desktop?.destroy();
  desktop = null;
  document.body.classList.remove('in-app');
}

function route(db: Cloud): void {
  const hash = location.hash.replace(/^#\/?/, '');
  const [section, a, b] = hash.split('/').filter(Boolean);

  if (section !== 'app') {
    // Signed in, for example after pressing Back: return to the open document without closing the window.
    if (getAccount()) {
      location.replace(desktop ? desktop.currentRoute() : '#/app');
      return;
    }
    leaveDesktop();
    const mode = section === 'register' ? 'register' : section === 'forgot' ? 'forgot' : 'signin';
    document.title = mode === 'register' ? 'Create account | ShaTu' : mode === 'forgot' ? 'Forgot password | ShaTu' : 'ShaTu: SHA-256 Tutor';
    replace(root, startScreen(db, mode, section === 'signin' && a ? decodeURIComponent(a) : ''));
    return;
  }

  // Everything under #/app needs an account.
  if (!getAccount()) {
    location.replace(`#/signin/${encodeURIComponent(location.hash)}`);
    return;
  }
  if (!desktop) {
    document.body.classList.add('in-app');
    desktop = mountDesktop(root, db);
  }

  if (a === 'practice' && b && isExerciseId(b)) desktop.open('practice', b);
  else if (a === 'lab') desktop.open('lab', b);
  else if (a === 'progress') desktop.open('progress');
  else if (a === 'verify') desktop.open('verify');
  else if (a === 'class' && getAccount()?.instructor) desktop.open('class');
  else desktop.open('practice', recommend(getProgress()).exercise);
}

async function start(db: Cloud): Promise<void> {
  replace(root, loadingScreen('Starting ShaTu'));
  try {
    const account = await db.current();
    if (account) {
      replace(root, loadingScreen('Loading your progress'));
      await openSession(account);
    }
  } catch {
    replace(root, problemScreen('Could not reach the server', 'ShaTu could not connect to its database. Check your internet connection and try again.', () => void start(db)));
    return;
  }
  // Signed out somewhere else, such as another tab: go back to the start screen.
  db.onSignedOut(() => {
    if (!getAccount()) return;
    leaveDesktop();
    dropSession();
    location.hash = '#/';
  });
  window.addEventListener('hashchange', () => route(db));
  route(db);
}

if (cloud) {
  connectCloud(cloud);
  void start(cloud);
} else {
  replace(root, problemScreen('Not connected to a database', 'This copy of ShaTu was built without a Firebase project, so it cannot sign anyone in. The README explains how to connect one.'));
}
