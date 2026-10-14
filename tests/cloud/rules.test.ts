import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const student = (name: string, email: string) => ({ displayName: name, email, progress: {}, activity: [] });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-shatu',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8282 },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/bob'), student('Bob', 'bob@regis.edu'));
    await setDoc(doc(ctx.firestore(), 'instructors/prof@regis.edu'), {});
  });
});

const alice = () => env.authenticatedContext('alice', { email: 'alice@regis.edu', email_verified: false }).firestore();
const prof = (verified = true) => env.authenticatedContext('prof', { email: 'prof@regis.edu', email_verified: verified }).firestore();

describe('student documents', () => {
  it('lets a student create, read and update their own document', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), student('Alice', 'alice@regis.edu')));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { ...student('Alice', 'alice@regis.edu'), progress: { rotr: { level: 1 } } }));
  });

  it('keeps students out of each other’s documents', async () => {
    await assertFails(getDoc(doc(alice(), 'users/bob')));
    await assertFails(setDoc(doc(alice(), 'users/bob'), student('Bob', 'bob@regis.edu')));
    await assertFails(getDocs(collection(alice(), 'users')));
  });

  it('rejects a document with someone else’s email, extra fields or too much history', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), student('Alice', 'bob@regis.edu')));
    await assertFails(setDoc(doc(alice(), 'users/alice'), { ...student('Alice', 'alice@regis.edu'), role: 'instructor' }));
    await assertFails(setDoc(doc(alice(), 'users/alice'), { ...student('Alice', 'alice@regis.edu'), activity: Array.from({ length: 31 }, () => ({})) }));
    await assertFails(setDoc(doc(alice(), 'users/alice'), student('', 'alice@regis.edu')));
  });

  it('does not let anyone delete a document or read it signed out', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), student('Alice', 'alice@regis.edu')));
    await assertFails(deleteDoc(doc(alice(), 'users/alice')));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/bob')));
  });
});

describe('instructors', () => {
  it('lets an instructor with a verified email read every student', async () => {
    await assertSucceeds(getDocs(collection(prof(), 'users')));
    await assertSucceeds(getDoc(doc(prof(), 'users/bob')));
  });

  it('refuses an instructor whose email is not verified', async () => {
    await assertFails(getDocs(collection(prof(false), 'users')));
  });

  it('lets a user check only their own instructor entry, and nobody add one', async () => {
    await assertSucceeds(getDoc(doc(prof(), 'instructors/prof@regis.edu')));
    await assertSucceeds(getDoc(doc(alice(), 'instructors/alice@regis.edu')));
    await assertFails(getDoc(doc(alice(), 'instructors/prof@regis.edu')));
    await assertFails(setDoc(doc(alice(), 'instructors/alice@regis.edu'), {}));
    await assertFails(getDocs(collection(prof(), 'instructors')));
  });
});
