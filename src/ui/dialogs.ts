import type { Cloud } from '../cloud/service';
import { passwordStrength } from '../engine/account';
import { h, replace } from './dom';
import { initials } from './meters';
import { openDialog, toast } from './overlay';
import { clearProgress, getAccount, updateAccount } from './store';

function field(id: string, label: string, type: 'text' | 'password', value = '', autocomplete = 'off'): { wrap: HTMLElement; el: HTMLInputElement; error: HTMLElement } {
  const el = h('input', { id, type, value, autocomplete, spellcheck: 'false' });
  const error = h('p', { class: 'field-error', 'aria-live': 'polite' });
  el.addEventListener('input', () => (error.textContent = ''));
  return { wrap: h('div', { class: 'field' }, h('label', { for: id }, label), el, error), el, error };
}

/** File > Account settings: a dialog with a Profile tab and a Password tab. */
export function accountDialog(cloud: Cloud): void {
  const account = getAccount();
  if (!account) return;

  const avatar = h('span', { class: 'avatar big' }, initials(account.displayName));
  const shownName = h('strong', null, account.displayName);
  const emailStatus = h('div', { class: 'email-status' });

  const renderEmailStatus = () => {
    const current = getAccount();
    if (!current) return;
    const resend = h('button', { class: 'btn quiet small-btn', type: 'button' }, 'Send the link again');
    const check = h('button', { class: 'btn quiet small-btn', type: 'button' }, 'I clicked the link');
    resend.addEventListener('click', async () => {
      resend.disabled = true;
      const result = await cloud.resendVerification();
      resend.disabled = false;
      toast(result.ok ? 'Verification email sent' : 'Email not sent', result.ok ? `Check ${current.email}` : result.message, result.ok ? 'success' : 'info');
    });
    check.addEventListener('click', async () => {
      check.disabled = true;
      try {
        const refreshed = await cloud.refresh();
        if (refreshed) updateAccount(refreshed);
      } catch {
        toast('Could not check', 'No connection to the server.', 'info');
      }
      check.disabled = false;
      renderEmailStatus();
    });
    replace(
      emailStatus,
      h('span', { class: current.emailVerified ? 'badge ok' : 'badge' }, current.emailVerified ? 'Verified' : 'Not verified'),
      current.instructor ? h('span', { class: 'badge ok' }, 'Instructor') : null,
      current.emailVerified ? null : h('div', { class: 'form-actions' }, resend, check),
    );
  };
  renderEmailStatus();

  const name = field('settings-name', 'Full name', 'text', account.displayName, 'name');
  const saveProfile = h('button', { class: 'btn', type: 'submit' }, 'Save profile');
  const profile = h(
    'form',
    {
      class: 'settings-form',
      novalidate: true,
      onsubmit: async (event: Event) => {
        event.preventDefault();
        saveProfile.disabled = true;
        const result = await cloud.updateName(name.el.value);
        saveProfile.disabled = false;
        if (!result.ok) {
          name.error.textContent = result.message;
          return;
        }
        const current = getAccount();
        if (current) updateAccount({ ...current, displayName: result.value });
        avatar.textContent = initials(result.value);
        shownName.textContent = result.value;
        name.el.value = result.value;
        toast('Profile saved', '', 'success');
      },
    },
    h('div', { class: 'profile-row' }, avatar, h('div', null, shownName, h('span', { class: 'muted small' }, `Member since ${new Date(account.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`))),
    name.wrap,
    h('div', { class: 'field' }, h('label', null, 'Email'), h('p', { class: 'readonly' }, account.email), emailStatus),
    h('div', { class: 'form-actions' }, saveProfile),
  );

  const current = field('settings-current', 'Current password', 'password', '', 'current-password');
  const next = field('settings-next', 'New password', 'password', '', 'new-password');
  const confirm = field('settings-confirm', 'Confirm new password', 'password', '', 'new-password');
  const strength = h('p', { class: 'field-hint' });
  next.el.addEventListener('input', () => {
    const label = passwordStrength(next.el.value).label;
    strength.textContent = label ? `Strength: ${label}` : '';
  });
  next.wrap.insertBefore(strength, next.error);
  const fields: Record<string, { error: HTMLElement; el: HTMLInputElement }> = { current, next, confirm };
  const submit = h('button', { class: 'btn', type: 'submit' }, 'Change password');
  const formError = h('p', { class: 'form-error', role: 'alert' });
  const password = h(
    'form',
    {
      class: 'settings-form',
      novalidate: true,
      hidden: true,
      onsubmit: async (event: Event) => {
        event.preventDefault();
        formError.textContent = '';
        submit.disabled = true;
        const result = await cloud.changePassword(current.el.value, next.el.value, confirm.el.value);
        submit.disabled = false;
        if (!result.ok) {
          const target = result.field ? fields[result.field] : undefined;
          if (target) {
            target.error.textContent = result.message;
            target.el.focus();
          } else {
            formError.textContent = result.message;
          }
          return;
        }
        current.el.value = next.el.value = confirm.el.value = '';
        strength.textContent = '';
        toast('Password changed', '', 'success');
      },
    },
    current.wrap,
    next.wrap,
    confirm.wrap,
    formError,
    h('div', { class: 'form-actions' }, submit),
  );

  const tabs = [
    { id: 'profile', label: 'Profile', pane: profile },
    { id: 'password', label: 'Password', pane: password },
  ];
  const tabButtons = tabs.map((t, i) =>
    h('button', { type: 'button', role: 'tab', class: 'dialog-tab', 'aria-selected': String(i === 0), tabindex: i === 0 ? '0' : '-1' }, t.label),
  );
  const select = (index: number) => {
    tabButtons.forEach((b, i) => {
      b.setAttribute('aria-selected', String(i === index));
      b.setAttribute('tabindex', i === index ? '0' : '-1');
    });
    tabs.forEach((t, i) => (t.pane.hidden = i !== index));
    tabButtons[index].focus();
  };
  tabButtons.forEach((b, i) => {
    b.addEventListener('click', () => select(i));
    b.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        select((i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length);
      }
    });
  });

  openDialog({
    title: 'Account settings',
    wide: true,
    body: h('div', { class: 'settings' }, h('div', { class: 'dialog-tabs', role: 'tablist', 'aria-label': 'Settings' }, tabButtons), profile, password),
  });
}

export function aboutDialog(): void {
  openDialog({
    title: 'About ShaTu',
    body: h(
      'div',
      { class: 'about' },
      h('p', null, h('strong', null, 'ShaTu: SHA-256 Tutor'), h('br'), 'Web proof of concept'),
      h(
        'dl',
        { class: 'kv-list' },
        h('div', null, h('dt', null, 'Tutoring model'), h('dd', null, 'VanLehn (2006): feedback and hints inside a problem, the next problem chosen from your progress')),
        h('div', null, h('dt', null, 'Hash standard'), h('dd', null, 'FIPS 180-4')),
        h('div', null, h('dt', null, 'Runs on'), h('dd', null, 'The browser, with accounts and progress stored in Firebase so they work from any computer.')),
        h('div', null, h('dt', null, 'Source'), h('dd', null, h('a', { href: 'https://github.com/FreddySant/shatu-web-demo', target: '_blank', rel: 'noopener' }, 'github.com/FreddySant/shatu-web-demo'))),
      ),
      h('p', { class: 'muted small' }, 'Proof of concept by Sigfredo Santiago for the CS493 Senior Capstone ShaTu project. Not an official Regis University site.'),
    ),
  });
}

export function shortcutsDialog(): void {
  const row = (keys: string, action: string) => h('tr', null, h('td', null, h('kbd', null, keys)), h('td', null, action));
  openDialog({
    title: 'Keyboard shortcuts',
    body: h(
      'table',
      { class: 'shortcuts' },
      h(
        'tbody',
        null,
        row('0  1', 'Set the selected answer bit'),
        row('← →', 'Move between answer bits'),
        row('Space', 'Flip the selected bit'),
        row('Backspace', 'Clear a bit'),
        row('Enter', 'Check the answer, then go to the next problem'),
        row('H', 'Show the next hint'),
        row('S', 'Show the worked solution'),
        row('N', 'New problem'),
        row('[  ]', 'Previous and next Hash Lab step'),
        row('?', 'Show this list'),
      ),
    ),
  });
}

export function confirmReset(onDone?: () => void): void {
  openDialog({
    title: 'Reset progress',
    body: h('p', null, 'Every skill goes back to level 1 and your history is cleared. Your account stays.'),
    confirm: {
      label: 'Reset progress',
      danger: true,
      action: () => {
        clearProgress();
        onDone?.();
      },
    },
  });
}
