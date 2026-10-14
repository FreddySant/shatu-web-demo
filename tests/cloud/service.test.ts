import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCloud, type Cloud } from '../../src/cloud/service';

const PROJECT = 'demo-shatu';
const AUTH = 'http://127.0.0.1:9292';
const config = {
  apiKey: 'demo-key',
  authDomain: 'localhost',
  projectId: PROJECT,
  appId: 'demo-app',
  emulator: { authUrl: AUTH, firestoreHost: '127.0.0.1', firestorePort: 8282 },
};

let env: RulesTestEnvironment;
let devices: Cloud[] = [];
let count = 0;

/** A fresh copy of the app, like opening ShaTu on another computer. */
const device = () => {
  const cloud = createCloud(config, `device-${++count}`);
  devices.push(cloud);
  return cloud;
};

const oobCodes = async (): Promise<{ email: string; requestType: string; oobLink: string }[]> =>
  ((await (await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`)).json()) as { oobCodes: { email: string; requestType: string; oobLink: string }[] }).oobCodes;

const newStudent = { displayName: 'Ada Lovelace', email: 'Ada@Regis.edu', password: 'engine1843', confirm: 'engine1843' };

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8282 } });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
});

afterEach(async () => {
  await Promise.all(devices.map((d) => d.dispose()));
  devices = [];
});

describe('accounts', () => {
  it('registers with a lower-case email, saves the name and sends a verification email', async () => {
    const result = await device().register(newStudent);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.account.email).toBe('ada@regis.edu');
    expect(result.value.account.displayName).toBe('Ada Lovelace');
    expect(result.value.account.instructor).toBe(false);
    expect(result.value.verificationSent).toBe(true);
    expect((await oobCodes()).some((c) => c.email === 'ada@regis.edu' && c.requestType === 'VERIFY_EMAIL')).toBe(true);
  });

  it('checks the form before contacting the server, and refuses a second account with the same email', async () => {
    const cloud = device();
    expect(await cloud.register({ ...newStudent, confirm: 'different1' })).toMatchObject({ ok: false, field: 'confirm' });
    expect(await cloud.register({ ...newStudent, email: 'ada' })).toMatchObject({ ok: false, field: 'email' });
    expect((await cloud.register(newStudent)).ok).toBe(true);
    expect(await device().register(newStudent)).toMatchObject({ ok: false, field: 'email', message: 'An account with this email already exists. Sign in instead.' });
  });

  it('gives the same message for a wrong password and an unknown email', async () => {
    await device().register(newStudent);
    const other = device();
    const wrong = await other.signIn('ada@regis.edu', 'wrongpass1');
    const unknown = await other.signIn('nobody@regis.edu', 'engine1843');
    expect(wrong).toMatchObject({ ok: false, message: 'The email or password is incorrect.' });
    expect(unknown).toMatchObject({ ok: false, message: 'The email or password is incorrect.' });
    expect((await other.signIn('ADA@regis.edu', 'engine1843')).ok).toBe(true);
  });

  it('sends a password reset email and gives the same answer for an unknown email', async () => {
    await device().register(newStudent);
    const cloud = device();
    expect((await cloud.sendReset('ada@regis.edu')).ok).toBe(true);
    expect((await cloud.sendReset('nobody@regis.edu')).ok).toBe(true);
    expect((await oobCodes()).some((c) => c.email === 'ada@regis.edu' && c.requestType === 'PASSWORD_RESET')).toBe(true);
  });

  it('changes the password only with the current one', async () => {
    const cloud = device();
    await cloud.register(newStudent);
    expect(await cloud.changePassword('wrongpass1', 'newpass123', 'newpass123')).toMatchObject({ ok: false, field: 'current' });
    expect((await cloud.changePassword('engine1843', 'newpass123', 'newpass123')).ok).toBe(true);
    const other = device();
    expect((await other.signIn('ada@regis.edu', 'engine1843')).ok).toBe(false);
    expect((await other.signIn('ada@regis.edu', 'newpass123')).ok).toBe(true);
  });
});

describe('progress', () => {
  it('saves progress on one computer and loads it on another', async () => {
    const laptop = device();
    const made = await laptop.register(newStudent);
    if (!made.ok) throw new Error(made.message);
    const progress = { rotr: { attempts: 3, correct: 3, hints: 0, level: 1, streak: 0, mastered: false, lastPracticed: 1 } };
    const activity = [{ exercise: 'rotr' as const, levelIndex: 0, solved: true, counted: true, hints: 0, leveledUp: true, at: 1 }];
    await laptop.saveProgress(made.value.account, { progress, activity });

    const labComputer = device();
    const signedIn = await labComputer.signIn('ada@regis.edu', 'engine1843');
    if (!signedIn.ok) throw new Error(signedIn.message);
    expect(await labComputer.loadProgress(signedIn.value.uid)).toEqual({ progress, activity });
  });

  it('replaces the progress on reset instead of merging old skills back in', async () => {
    const cloud = device();
    const made = await cloud.register(newStudent);
    if (!made.ok) throw new Error(made.message);
    await cloud.saveProgress(made.value.account, { progress: { rotr: { attempts: 1, correct: 1, hints: 0, level: 0, streak: 1, mastered: false, lastPracticed: 1 } }, activity: [] });
    await cloud.saveProgress(made.value.account, { progress: {}, activity: [] });
    expect(await cloud.loadProgress(made.value.account.uid)).toEqual({ progress: {}, activity: [] });
  });

  it('lets a verified instructor list the class, and not a student', async () => {
    const studentDevice = device();
    await studentDevice.register(newStudent);
    await expect(studentDevice.listStudents()).rejects.toMatchObject({ code: 'permission-denied' });

    const profDevice = device();
    const prof = await profDevice.register({ displayName: 'Prof', email: 'prof@regis.edu', password: 'teach2026x', confirm: 'teach2026x' });
    if (!prof.ok) throw new Error(prof.message);
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), 'instructors/prof@regis.edu'), {}));
    // Listed but not verified yet: still not an instructor.
    expect((await profDevice.refresh())?.instructor).toBe(false);
    // Open the verification link from the email, as the instructor would.
    const link = (await oobCodes()).find((c) => c.email === 'prof@regis.edu' && c.requestType === 'VERIFY_EMAIL')?.oobLink;
    expect(link).toBeTruthy();
    const opened = await fetch(link!);
    expect(opened.ok).toBe(true);
    expect((await profDevice.refresh())?.instructor).toBe(true);
    const roster = await profDevice.listStudents();
    expect(roster.map((s) => s.email).sort()).toEqual(['ada@regis.edu', 'prof@regis.edu']);
    expect(roster.find((s) => s.email === 'ada@regis.edu')?.displayName).toBe('Ada Lovelace');
  });
});
