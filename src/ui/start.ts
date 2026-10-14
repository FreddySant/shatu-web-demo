import { accountExists, browserStore, deleteAccount, passwordStrength, register, signIn, startSession, usernameProblem } from '../engine/auth';
import { resetProgress } from '../engine/progress';
import { h } from './dom';
import { icon, openDialog } from './overlay';
import { setAccount } from './store';

export type StartMode = 'signin' | 'register' | 'forgot';

interface Field {
  wrap: HTMLElement;
  input: HTMLInputElement;
  error: HTMLElement;
}

function field(id: string, label: string, type: 'text' | 'password', options: { autocomplete: string; hint?: string } = { autocomplete: 'off' }): Field {
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

function signInForm(next: string): HTMLElement {
  const username = field('username', 'Username', 'text', { autocomplete: 'username' });
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
        if (!username.input.value.trim()) return showError(username, 'Enter your username.');
        if (!password.input.value) return showError(password, 'Enter your password.');
        submit.disabled = true;
        submit.textContent = 'Signing in';
        let result: Awaited<ReturnType<typeof signIn>>;
        try {
          result = await signIn(browserStore, username.input.value, password.input.value);
        } catch {
          result = { ok: false, message: 'Sign-in failed in this browser. Try again.' };
        } finally {
          submit.disabled = false;
          submit.textContent = 'Sign in';
        }
        if (!result.ok) {
          formError.textContent = result.message;
          password.input.value = '';
          password.input.focus();
          return;
        }
        setAccount(result.value);
        location.replace(next || '#/app');
      },
    },
    h('h2', { class: 'start-title' }, 'Sign in'),
    username.wrap,
    password.wrap,
    formError,
    submit,
    h('div', { class: 'start-links' }, h('a', { href: '#/register' }, 'Create account'), h('a', { href: '#/forgot' }, 'Forgot password')),
  );
  queueMicrotask(() => username.input.focus());
  return form;
}

function registerForm(): HTMLElement {
  const name = field('displayName', 'Full name', 'text', { autocomplete: 'name' });
  const username = field('username', 'Username', 'text', { autocomplete: 'username', hint: '3 to 24 letters, numbers, dots, dashes or underscores' });
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
  username.input.addEventListener('blur', () => {
    const problem = username.input.value ? usernameProblem(username.input.value) : null;
    if (problem) {
      username.error.textContent = problem;
      username.wrap.classList.add('invalid');
    }
  });
  const formError = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn block', type: 'submit' }, 'Create account');
  const fields: Record<string, Field> = { displayName: name, username, password, confirm };
  const form = h(
    'form',
    {
      class: 'start-form',
      novalidate: true,
      onsubmit: async (event: Event) => {
        event.preventDefault();
        formError.textContent = '';
        submit.disabled = true;
        submit.textContent = 'Creating account';
        let result: Awaited<ReturnType<typeof register>>;
        try {
          result = await register(browserStore, { displayName: name.input.value, username: username.input.value, password: password.input.value, confirm: confirm.input.value });
        } catch {
          result = { ok: false, message: 'The account could not be created in this browser. Try again.' };
        } finally {
          submit.disabled = false;
          submit.textContent = 'Create account';
        }
        if (!result.ok) {
          const target = result.field ? fields[result.field] : undefined;
          if (target) showError(target, result.message);
          else formError.textContent = result.message;
          return;
        }
        startSession(browserStore, result.value);
        setAccount(result.value);
        location.replace('#/app');
      },
    },
    h('h2', { class: 'start-title' }, 'Create account'),
    name.wrap,
    username.wrap,
    password.wrap,
    confirm.wrap,
    formError,
    submit,
    h('div', { class: 'start-links' }, h('a', { href: '#/' }, 'Back to sign in')),
  );
  queueMicrotask(() => name.input.focus());
  return form;
}

function forgotForm(): HTMLElement {
  const username = field('username', 'Username', 'text', { autocomplete: 'username' });
  const done = h('p', { class: 'form-note', role: 'status' });
  const submit = h('button', { class: 'btn danger block', type: 'submit' }, 'Remove account');
  const form = h(
    'form',
    {
      class: 'start-form',
      novalidate: true,
      onsubmit: (event: Event) => {
        event.preventDefault();
        done.textContent = '';
        const name = username.input.value.trim();
        if (!name) return showError(username, 'Enter the username.');
        if (!accountExists(browserStore, name)) return showError(username, 'There is no account with that username in this browser.');
        openDialog({
          title: 'Remove account',
          body: h('p', null, `Remove the account "${name}" and all of its progress from this browser? This cannot be undone.`),
          confirm: {
            label: 'Remove account',
            danger: true,
            action: () => {
              const result = deleteAccount(browserStore, name);
              if (!result.ok) {
                showError(username, result.message);
                return;
              }
              resetProgress(result.value);
              username.input.value = '';
              done.textContent = 'Account removed from this browser. You can create it again.';
            },
          },
        });
      },
    },
    h('h2', { class: 'start-title' }, 'Forgot password'),
    h('p', { class: 'start-note' }, 'Passwords are kept only as a hash in this browser, so they cannot be recovered. Remove the account and its progress, then create it again.'),
    username.wrap,
    submit,
    done,
    h('div', { class: 'start-links' }, h('a', { href: '#/register' }, 'Create account'), h('a', { href: '#/' }, 'Back to sign in')),
  );
  queueMicrotask(() => username.input.focus());
  return form;
}

/** The program's start screen: name, logo and the sign-in box, like the desktop ShaTu splash. */
export function startScreen(mode: StartMode, next = ''): HTMLElement {
  const form = mode === 'register' ? registerForm() : mode === 'forgot' ? forgotForm() : signInForm(next);
  const logo = h('span', { class: 'start-logo', 'aria-hidden': 'true' }, [...'01010011'].map((bit) => h('i', { class: bit === '1' ? 'on' : '' })));
  return h(
    'div',
    { class: 'start' },
    h(
      'main',
      { class: 'start-window' },
      h('div', { class: 'start-head' }, logo, h('div', null, h('h1', null, 'ShaTu'), h('p', null, 'SHA-256 Tutor'))),
      h('p', { class: 'start-tag' }, 'An intelligent tutoring system for the SHA-256 hash algorithm.'),
      form,
    ),
    h('footer', { class: 'start-foot' }, h('span', null, 'CS493 Senior Capstone proof of concept'), h('span', null, 'Accounts are stored in this browser only'), h('span', null, 'Not an official Regis University site')),
  );
}
