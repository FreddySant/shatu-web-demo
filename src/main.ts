import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/martian-mono/wdth.css';
import './styles/main.css';

import { isExerciseId } from './engine/exercises';
import { recommend } from './engine/policy';
import { mountDesktop } from './ui/desktop';
import { replace } from './ui/dom';
import { startScreen } from './ui/start';
import { getAccount, getProgress } from './ui/store';

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

function route(): void {
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
    replace(root, startScreen(mode, section === 'signin' && a ? decodeURIComponent(a) : ''));
    return;
  }

  // Everything under #/app needs an account.
  if (!getAccount()) {
    location.replace(`#/signin/${encodeURIComponent(location.hash)}`);
    return;
  }
  if (!desktop) {
    document.body.classList.add('in-app');
    desktop = mountDesktop(root);
  }
  document.title = 'ShaTu: SHA-256 Tutor';

  if (a === 'practice' && b && isExerciseId(b)) desktop.open('practice', b);
  else if (a === 'lab') desktop.open('lab', b);
  else if (a === 'progress') desktop.open('progress');
  else if (a === 'verify') desktop.open('verify');
  else desktop.open('practice', recommend(getProgress()).exercise);
}

window.addEventListener('hashchange', route);
route();
