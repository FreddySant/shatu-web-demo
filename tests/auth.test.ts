import { describe, expect, it } from 'vitest';
import {
  changePassword,
  currentAccount,
  deleteAccount,
  memoryStore,
  passwordProblem,
  passwordStrength,
  register,
  signIn,
  signOut,
  usernameProblem,
} from '../src/engine/auth';

const input = { displayName: 'Ada Lovelace', username: 'ada', password: 'engine1843', confirm: 'engine1843' };

describe('account rules', () => {
  it('checks usernames', () => {
    expect(usernameProblem('ab')).not.toBeNull();
    expect(usernameProblem('has space')).not.toBeNull();
    expect(usernameProblem('ada.l-1_')).toBeNull();
  });

  it('checks passwords', () => {
    expect(passwordProblem('short1')).not.toBeNull();
    expect(passwordProblem('lettersonly')).not.toBeNull();
    expect(passwordProblem('letters123')).toBeNull();
    expect(passwordStrength('').label).toBe('');
    expect(passwordStrength('Letters123!xyz').score).toBe(4);
  });
});

describe('accounts', () => {
  it('registers, stores only a hash and signs in', async () => {
    const store = memoryStore();
    const created = await register(store, input);
    expect(created.ok).toBe(true);
    const raw = store.get('shatu.accounts.v1') ?? '';
    expect(raw).not.toContain('engine1843');
    expect(raw).toContain('"hash"');

    expect(currentAccount(store)).toBeNull();
    const result = await signIn(store, 'ADA', 'engine1843');
    expect(result.ok).toBe(true);
    expect(currentAccount(store)?.displayName).toBe('Ada Lovelace');
    signOut(store);
    expect(currentAccount(store)).toBeNull();
  });

  it('gives the same message for a wrong password and an unknown username', async () => {
    const store = memoryStore();
    await register(store, input);
    const wrong = await signIn(store, 'ada', 'wrongpass1');
    const unknown = await signIn(store, 'nobody', 'engine1843');
    expect(wrong.ok).toBe(false);
    expect(unknown.ok).toBe(false);
    if (!wrong.ok && !unknown.ok) expect(wrong.message).toBe(unknown.message);
  });

  it('rejects a taken username and mismatched passwords', async () => {
    const store = memoryStore();
    await register(store, input);
    expect(await register(store, { ...input, username: 'Ada' })).toMatchObject({ ok: false, field: 'username' });
    expect(await register(store, { ...input, username: 'grace', confirm: 'different1' })).toMatchObject({ ok: false, field: 'confirm' });
  });

  it('changes a password only with the current one', async () => {
    const store = memoryStore();
    await register(store, input);
    expect(await changePassword(store, 'ada', 'nope12345', 'newpass123', 'newpass123')).toMatchObject({ ok: false, field: 'current' });
    expect((await changePassword(store, 'ada', 'engine1843', 'newpass123', 'newpass123')).ok).toBe(true);
    expect((await signIn(store, 'ada', 'engine1843')).ok).toBe(false);
    expect((await signIn(store, 'ada', 'newpass123')).ok).toBe(true);
  });

  it('deletes an account from this browser and ends its session', async () => {
    const store = memoryStore();
    await register(store, input);
    await signIn(store, 'ada', 'engine1843');
    expect(deleteAccount(store, 'nobody')).toMatchObject({ ok: false, field: 'username' });
    expect(deleteAccount(store, 'ADA').ok).toBe(true);
    expect(currentAccount(store)).toBeNull();
    expect((await signIn(store, 'ada', 'engine1843')).ok).toBe(false);
    expect((await register(store, input)).ok).toBe(true);
  });

  it('treats usernames like constructor and toString as ordinary names', async () => {
    const store = memoryStore();
    expect((await signIn(store, 'toString', 'engine1843')).ok).toBe(false);
    expect(deleteAccount(store, 'valueOf').ok).toBe(false);
    const made = await register(store, { ...input, username: 'constructor' });
    expect(made.ok).toBe(true);
    expect((await signIn(store, 'constructor', 'engine1843')).ok).toBe(true);
    expect(currentAccount(store)?.username).toBe('constructor');
  });
});
