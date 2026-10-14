/**
 * Accounts for the demo. There is no server, so accounts are kept in the
 * browser's storage. Passwords are never stored: only a salted PBKDF2-SHA-256
 * hash made with the Web Crypto API.
 */

export interface Account {
  username: string;
  displayName: string;
  salt: string;
  hash: string;
  iterations: number;
  created: number;
}

/** Where accounts and the session are kept. Tests pass an in-memory version. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const browserStore: KeyValueStore = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage is blocked; the account will not be remembered.
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  },
};

export function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
  };
}

const ACCOUNTS_KEY = 'shatu.accounts.v1';
const SESSION_KEY = 'shatu.session.v1';
export const PBKDF2_ITERATIONS = 150_000;

type Accounts = Record<string, Account>;

/**
 * Accounts are kept in an object without a prototype, so usernames such as
 * "constructor" or "toString" are ordinary keys and never inherited members.
 */
function load(store: KeyValueStore): Accounts {
  const accounts = Object.create(null) as Accounts;
  try {
    Object.assign(accounts, JSON.parse(store.get(ACCOUNTS_KEY) ?? '{}'));
  } catch {
    // Unreadable data: start with no accounts.
  }
  return accounts;
}

function find(accounts: Accounts, username: string): Account | undefined {
  const id = key(username);
  return Object.hasOwn(accounts, id) ? accounts[id] : undefined;
}

function save(store: KeyValueStore, accounts: Accounts): void {
  store.set(ACCOUNTS_KEY, JSON.stringify(accounts));
}

const key = (username: string) => username.trim().toLowerCase();

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as Uint8Array<ArrayBuffer>, iterations }, material, 256);
  return toHex(new Uint8Array(bits));
}

/* ---------------- Rules ---------------- */

export function usernameProblem(username: string): string | null {
  const u = username.trim();
  if (u.length < 3) return 'Use at least 3 characters.';
  if (u.length > 24) return 'Use at most 24 characters.';
  if (!/^[A-Za-z0-9._-]+$/.test(u)) return 'Use only letters, numbers, dots, dashes and underscores.';
  return null;
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return 'Include at least one letter and one number.';
  return null;
}

/** 0 to 4, for the strength meter. */
export function passwordStrength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: password.length === 0 ? '' : labels[score] };
}

/* ---------------- Accounts and sessions ---------------- */

export type Result<T> = { ok: true; value: T } | { ok: false; field?: string; message: string };

export async function register(
  store: KeyValueStore,
  input: { displayName: string; username: string; password: string; confirm: string },
): Promise<Result<Account>> {
  const displayName = input.displayName.trim();
  if (displayName.length === 0) return { ok: false, field: 'displayName', message: 'Enter your name.' };
  const usernameError = usernameProblem(input.username);
  if (usernameError) return { ok: false, field: 'username', message: usernameError };
  const passwordError = passwordProblem(input.password);
  if (passwordError) return { ok: false, field: 'password', message: passwordError };
  if (input.password !== input.confirm) return { ok: false, field: 'confirm', message: 'The passwords do not match.' };

  const accounts = load(store);
  if (find(accounts, input.username)) {
    return { ok: false, field: 'username', message: 'That username is taken. Choose another one.' };
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const account: Account = {
    username: input.username.trim(),
    displayName,
    salt: toHex(salt),
    hash: await derive(input.password, salt, PBKDF2_ITERATIONS),
    iterations: PBKDF2_ITERATIONS,
    created: Date.now(),
  };
  accounts[key(account.username)] = account;
  save(store, accounts);
  return { ok: true, value: account };
}

export async function verify(store: KeyValueStore, username: string, password: string): Promise<Result<Account>> {
  const account = find(load(store), username);
  // The same message for an unknown username and a wrong password, so the form
  // does not reveal which usernames exist.
  const failure = { ok: false as const, message: 'The username or password is incorrect.' };
  if (!account) return failure;
  const hash = await derive(password, fromHex(account.salt), account.iterations);
  return hash === account.hash ? { ok: true, value: account } : failure;
}

export async function signIn(store: KeyValueStore, username: string, password: string): Promise<Result<Account>> {
  const result = await verify(store, username, password);
  if (result.ok) {
    store.set(SESSION_KEY, key(result.value.username));
  }
  return result;
}

export function signOut(store: KeyValueStore): void {
  store.remove(SESSION_KEY);
}

export function startSession(store: KeyValueStore, account: Account): void {
  store.set(SESSION_KEY, key(account.username));
}

export function currentAccount(store: KeyValueStore): Account | null {
  const session = store.get(SESSION_KEY);
  return session ? (find(load(store), session) ?? null) : null;
}

export async function changePassword(store: KeyValueStore, username: string, current: string, next: string, confirm: string): Promise<Result<Account>> {
  const check = await verify(store, username, current);
  if (!check.ok) return { ok: false, field: 'current', message: 'Your current password is incorrect.' };
  const problem = passwordProblem(next);
  if (problem) return { ok: false, field: 'next', message: problem };
  if (next !== confirm) return { ok: false, field: 'confirm', message: 'The new passwords do not match.' };
  const accounts = load(store);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const updated: Account = { ...check.value, salt: toHex(salt), hash: await derive(next, salt, PBKDF2_ITERATIONS), iterations: PBKDF2_ITERATIONS };
  accounts[key(username)] = updated;
  save(store, accounts);
  return { ok: true, value: updated };
}

export function accountExists(store: KeyValueStore, username: string): boolean {
  return find(load(store), username) !== undefined;
}

/**
 * Removes an account from this browser. A forgotten password cannot be
 * recovered, because only its hash is kept, so the account is removed and can
 * be created again.
 */
export function deleteAccount(store: KeyValueStore, username: string): Result<string> {
  const accounts = load(store);
  const id = key(username);
  if (!find(accounts, username)) return { ok: false, field: 'username', message: 'There is no account with that username in this browser.' };
  delete accounts[id];
  save(store, accounts);
  if (store.get(SESSION_KEY) === id) store.remove(SESSION_KEY);
  return { ok: true, value: id };
}

export function updateDisplayName(store: KeyValueStore, username: string, displayName: string): Result<Account> {
  const name = displayName.trim();
  if (name.length === 0) return { ok: false, field: 'displayName', message: 'Enter your name.' };
  const accounts = load(store);
  const account = find(accounts, username);
  if (!account) return { ok: false, message: 'Account not found.' };
  accounts[key(username)] = { ...account, displayName: name };
  save(store, accounts);
  return { ok: true, value: accounts[key(username)] };
}
