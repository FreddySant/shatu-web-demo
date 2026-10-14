import type { Cloud } from '../cloud/service';
import { passwordStrength } from '../engine/account';
import { h } from './dom';
import { icon } from './overlay';
import { openSession } from './store';

export type StartMode = 'signin' | 'register' | 'forgot';

interface Field {
  wrap: HTMLElement;
  input: HTMLInputElement;
  error: HTMLElement;
}

function field(id: string, label: string, type: 'text' | 'email' | 'password', options: { autocomplete: string; hint?: string } = { autocomplete: 'off' }): Field {
  const input = h('input', { id, name: id, type, autocomplete: options.autocomplete, spellcheck: 'false', 'aria-describedby': `${id}-error${options.hint ? ` ${id}-hint` : ''}` });
  const error = h('p', { class: 'field-error', id: `${id}-error`, 'aria-live': 'polite' });
  const control =
    type === 'password'
      ? h(
          'div',
          { class: 'password-control' },
          input,
          h(
            'button',
            {
              type: 'button',
              class: 'icon-button reveal',
              'aria-label': 'Show password',
              onclick: (event: Event) => {
                const button = event.currentTarget as HTMLButtonElement;
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
                button.replaceChildren(icon(show ? 'eyeOff' : 'eye', 16));
              },
            },
            icon('eye', 16),
          ),
        )
      : input;
  const wrap = h('div', { class: 'field' }, h('label', { for: id }, label), control, options.hint ? h('p', { class: 'field-hint', id: `${id}-hint` }, options.hint) : null, error);
  input.addEventListener('input', () => {
    error.textContent = '';
    wrap.classList.remove('invalid');
  });
  return { wrap, input, error };
}

function showError(f: Field, message: string): void {
  f.error.textContent = message;
  f.wrap.classList.add('invalid');
  f.input.focus();
}

/** Runs a submit with the button showing what is happening, and always re-enables it. */
async function busy<T>(button: HTMLButtonElement, working: string, task: () => Promise<T>): Promise<T> {
  const label = button.textContent ?? '';
  button.disabled = true;
  button.textContent = working;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function signInForm(cloud: Cloud, next: string): HTMLElement {
  const email = field('email', 'Email', 'email', { autocomplete: 'username' });
  const password = field('password', 'Password', 'password', { autocomplete: 'current-password' });
  const formError = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn block', type: 'submit' }, 'Sign in');
  const form = h(
    'form',
    {
      class: 'start-form',
      novalidate: true,
      onsubmit: async (event: Event) => {
        event.preventDefault();
        formError.textContent = '';
        const problem = await busy(submit, 'Signing in', async () => {
          const result = await cloud.signIn(email.input.value, password.input.value);
          if (!result.ok) return result;
          try {
            await openSession(result.value);
          } catch {
            await cloud.signOut();
            return { ok: false as const, field: undefined, message: 'Signed in, but your progress could not be loaded. Check your connection and try again.' };
          }
          return null;
        });
        if (!problem) {
          location.replace(next || '#/app');
          return;
        }
        if (problem.field === 'email') return showError(email, problem.message);
        if (problem.field === 'password') return showError(password, problem.message);
        formError.textContent = problem.message;
        password.input.value = '';
        password.input.focus();
      },
    },
    h('h2', { class: 'start-title' }, 'Sign in'),
    email.wrap,
    password.wrap,
    formError,
    submit,
    h('div', { class: 'start-links' }, h('a', { href: '#/register' }, 'Create account'), h('a', { href: '#/forgot' }, 'Forgot password')),
  );
  queueMicrotask(() => email.input.focus());
  return form;
}

function registerForm(cloud: Cloud): HTMLElement {
  const name = field('displayName', 'Full name', 'text', { autocomplete: 'name' });
  const email = field('email', 'Email', 'email', { autocomplete: 'email', hint: 'Your school email works best. A verification link is sent to it.' });
  const password = field('password', 'Password', 'password', { autocomplete: 'new-password', hint: 'At least 8 characters, with a letter and a number' });
  const confirm = field('confirm', 'Confirm password', 'password', { autocomplete: 'new-password' });
  const meterBar = h('span', { class: 'meter-bar' });
  const meterLabel = h('span', { class: 'meter-label' });
  const meter = h('div', { class: 'strength', 'aria-live': 'polite' }, h('span', { class: 'meter' }, meterBar), meterLabel);
  password.wrap.insertBefore(meter, password.wrap.querySelector('.field-hint'));
  password.input.addEventListener('input', () => {
    const s = passwordStrength(password.input.value);
    meterBar.style.width = `${(s.score / 4) * 100}%`;
    meter.dataset.score = String(s.score);
    meterLabel.textContent = s.label;
  });
  const formError = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn block', type: 'submit' }, 'Create account');
  const fields: Record<string, Field> = { displayName: name, email, password, confirm };
  const form = h(
    'form',
    {
      class: 'start-form',
      novalidate: true,
      onsubmit: async (event: Event) => {
        event.preventDefault();
        formError.textContent = '';
        const problem = await busy(submit, 'Creating account', async () => {
          const result = await cloud.register({ displayName: name.input.value, email: email.input.value, password: password.input.value, confirm: confirm.input.value });
          if (!result.ok) return result;
          try {
            await openSession(result.value.account);
          } catch {
            return { ok: false as const, field: undefined, message: 'Your account was created, but your progress could not be loaded. Sign in again.' };
          }
          try {
            sessionStorage.setItem('shatu.welcome', result.value.verificationSent ? 'sent' : 'failed');
          } catch {
            // Only used for the welcome message in the Output panel.
          }
          return null;
        });
        if (!problem) {
          location.replace('#/app');
          return;
        }
        const target = problem.field ? fields[problem.field] : undefined;
        if (target) showError(target, problem.message);
        else formError.textContent = problem.message;
      },
    },
    h('h2', { class: 'start-title' }, 'Create account'),
    name.wrap,
    email.wrap,
    password.wrap,
    confirm.wrap,
    formError,
    submit,
    h('div', { class: 'start-links' }, h('a', { href: '#/' }, 'Back to sign in')),
  );
  queueMicrotask(() => name.input.focus());
  return form;
}

function forgotForm(cloud: Cloud): HTMLElement {
  const email = field('email', 'Email', 'email', { autocomplete: 'username' });
  const done = h('p', { class: 'form-note', role: 'status' });
  const formError = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn block', type: 'submit' }, 'Send reset link');
  const form = h(
    'form',
    {
      class: 'start-form',
      novalidate: true,
      onsubmit: async (event: Event) => {
        event.preventDefault();
        done.textContent = '';
        formError.textContent = '';
        const result = await busy(submit, 'Sending', () => cloud.sendReset(email.input.value));
        if (!result.ok) {
          if (result.field === 'email') showError(email, result.message);
          else formError.textContent = result.message;
          return;
        }
        done.textContent = 'If an account uses that email, a link to choose a new password is on its way. Check your inbox and spam folder.';
      },
    },
    h('h2', { class: 'start-title' }, 'Forgot password'),
    h('p', { class: 'start-note' }, 'Enter the email you signed up with to get a link for choosing a new password.'),
    email.wrap,
    formError,
    submit,
    done,
    h('div', { class: 'start-links' }, h('a', { href: '#/' }, 'Back to sign in')),
  );
  queueMicrotask(() => email.input.focus());
  return form;
}

function startLogo(): HTMLElement {
  return h('span', { class: 'start-logo', 'aria-hidden': 'true' }, [...'01010011'].map((bit) => h('i', { class: bit === '1' ? 'on' : '' })));
}

function frame(...content: Node[]): HTMLElement {
  return h(
    'div',
    { class: 'start' },
    h(
      'main',
      { class: 'start-window' },
      h('div', { class: 'start-head' }, startLogo(), h('div', null, h('h1', null, 'ShaTu'), h('p', null, 'SHA-256 Tutor'))),
      h('p', { class: 'start-tag' }, 'An intelligent tutoring system for the SHA-256 hash algorithm.'),
      ...content,
    ),
    h('footer', { class: 'start-foot' }, h('span', null, 'CS493 Senior Capstone proof of concept'), h('span', null, 'Accounts and progress are stored with Firebase'), h('span', null, 'Not an official Regis University site')),
  );
}

/** The program's start screen: name, logo and the sign-in box, like the desktop ShaTu splash. */
export function startScreen(cloud: Cloud, mode: StartMode, next = ''): HTMLElement {
  return frame(mode === 'register' ? registerForm(cloud) : mode === 'forgot' ? forgotForm(cloud) : signInForm(cloud, next));
}

/** Shown while Firebase checks whether someone is already signed in. */
export function loadingScreen(text: string): HTMLElement {
  return frame(h('p', { class: 'start-loading', role: 'status' }, text));
}

/** Shown when this copy was built without a Firebase project, or the database could not be reached. */
export function problemScreen(title: string, text: string, retry?: () => void): HTMLElement {
  return frame(
    h('div', { class: 'start-form' }, h('h2', { class: 'start-title' }, title), h('p', { class: 'start-note' }, text), retry ? h('button', { class: 'btn block', type: 'button', onclick: retry }, 'Try again') : null),
  );
}
