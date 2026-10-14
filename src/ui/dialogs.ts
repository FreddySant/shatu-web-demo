import { browserStore, changePassword, passwordStrength, updateDisplayName } from '../engine/auth';
import { h } from './dom';
import { initials } from './meters';
import { openDialog, toast } from './overlay';
import { clearProgress, getAccount, setAccount } from './store';

function field(id: string, label: string, type: 'text' | 'password', value = '', autocomplete = 'off'): { wrap: HTMLElement; el: HTMLInputElement; error: HTMLElement } {
  const el = h('input', { id, type, value, autocomplete, spellcheck: 'false' });
  const error = h('p', { class: 'field-error', 'aria-live': 'polite' });
  el.addEventListener('input', () => (error.textContent = ''));
  return { wrap: h('div', { class: 'field' }, h('label', { for: id }, label), el, error), el, error };
}

/** File > Account settings: a dialog with a Profile tab and a Password tab. */
export function accountDialog(): void {
  const account = getAccount();
  if (!account) return;

  const avatar = h('span', { class: 'avatar big' }, initials(account.displayName));
  const shownName = h('strong', null, account.displayName);

  const name = field('settings-name', 'Full name', 'text', account.displayName, 'name');
  const profile = h(
    'form',
    {
      class: 'settings-form',
      novalidate: true,
      onsubmit: (event: Event) => {
        event.preventDefault();
        const result = updateDisplayName(browserStore, account.username, name.el.value);
        if (!result.ok) {
          name.error.textContent = result.message;
          return;
        }
        setAccount(result.value);
        avatar.textContent = initials(result.value.displayName);
        shownName.textContent = result.value.displayName;
        name.el.value = result.value.displayName;
        toast('Profile saved', '', 'success');
      },
    },
    h('div', { class: 'profile-row' }, avatar, h('div', null, shownName, h('span', { class: 'muted small' }, `@${account.username}, member since ${new Date(account.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`))),
    name.wrap,
    h('div', { class: 'form-actions' }, h('button', { class: 'btn', type: 'submit' }, 'Save profile')),
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
  const password = h(
    'form',
    {
      class: 'settings-form',
      novalidate: true,
      hidden: true,
      onsubmit: async (event: Event) => {
        event.preventDefault();
        submit.disabled = true;
        const result = await changePassword(browserStore, account.username, current.el.value, next.el.value, confirm.el.value);
        submit.disabled = false;
        if (!result.ok) {
          const target = fields[result.field ?? 'current'];
          target.error.textContent = result.message;
          target.el.focus();
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
        h('div', null, h('dt', null, 'Runs on'), h('dd', null, 'The browser only. Accounts and progress are saved in this browser.')),
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
