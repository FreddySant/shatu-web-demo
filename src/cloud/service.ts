import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore/lite';
import { emailProblem, nameProblem, normalizeEmail, passwordProblem } from '../engine/account';
import type { ActivityEvent, ProgressMap } from '../engine/progress';

/**
 * Accounts and progress in Firebase. Firebase Authentication checks the email
 * and password; each student's progress is one document in Cloud Firestore,
 * guarded by the rules in firestore.rules.
 */

export interface CloudConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  /** Local emulators, for development and tests. */
  emulator?: { authUrl: string; firestoreHost: string; firestorePort: number };
}

export type Result<T> = { ok: true; value: T } | { ok: false; field?: string; message: string };

export interface Account {
  uid: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  created: number;
  /** Listed in the instructors collection with a verified email. */
  instructor: boolean;
}

export interface SavedProgress {
  progress: ProgressMap;
  activity: ActivityEvent[];
}

export interface StudentRecord extends SavedProgress {
  uid: string;
  displayName: string;
  email: string;
  updated: number;
}

const INCORRECT = 'The email or password is incorrect.';

const MESSAGES: Record<string, { message: string; field?: string }> = {
  'auth/email-already-in-use': { field: 'email', message: 'An account with this email already exists. Sign in instead.' },
  'auth/invalid-email': { field: 'email', message: 'Enter a valid email address.' },
  'auth/weak-password': { field: 'password', message: 'Choose a stronger password.' },
  'auth/invalid-credential': { message: INCORRECT },
  'auth/invalid-login-credentials': { message: INCORRECT },
  'auth/wrong-password': { message: INCORRECT },
  'auth/user-not-found': { message: INCORRECT },
  'auth/user-disabled': { message: 'This account has been turned off. Ask your instructor.' },
  'auth/too-many-requests': { message: 'Too many attempts. Wait a few minutes and try again.' },
  'auth/network-request-failed': { message: 'No connection to the server. Check your internet connection and try again.' },
  'auth/requires-recent-login': { message: 'For security, sign out, sign in again and then try once more.' },
  unavailable: { message: 'No connection to the server. Check your internet connection and try again.' },
  'permission-denied': { message: 'The database refused this request.' },
};

/** Turns a Firebase error into a message for the form, keeping the code so a problem can be traced. */
export function explain(error: unknown): { ok: false; field?: string; message: string } {
  const code = (error as { code?: string } | null)?.code ?? '';
  const known = MESSAGES[code];
  if (known) return { ok: false, ...known };
  return { ok: false, message: `Something went wrong${code ? ` (${code})` : ''}. Try again.` };
}

const millis = (value: unknown): number => (value instanceof Timestamp ? value.toMillis() : 0);

export function createCloud(config: CloudConfig, name?: string) {
  const app = initializeApp({ apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId, appId: config.appId }, name);
  const auth = getAuth(app);
  const db = getFirestore(app);
  if (config.emulator) {
    connectAuthEmulator(auth, config.emulator.authUrl, { disableWarnings: true });
    connectFirestoreEmulator(db, config.emulator.firestoreHost, config.emulator.firestorePort);
  }

  const userDoc = (uid: string) => doc(db, 'users', uid);

  async function isInstructor(user: User): Promise<boolean> {
    if (!user.emailVerified || !user.email) return false;
    try {
      return (await getDoc(doc(db, 'instructors', normalizeEmail(user.email)))).exists();
    } catch (error) {
      // The rules only allow a user to read their own instructor entry, so a refusal means "not an instructor".
      if ((error as { code?: string }).code === 'permission-denied') return false;
      throw error;
    }
  }

  async function toAccount(user: User): Promise<Account> {
    return {
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      emailVerified: user.emailVerified,
      created: Date.parse(user.metadata.creationTime ?? '') || Date.now(),
      instructor: await isInstructor(user),
    };
  }

  function signedInUser(): User {
    const user = auth.currentUser;
    if (!user) throw Object.assign(new Error('Not signed in'), { code: 'auth/requires-recent-login' });
    return user;
  }

  return {
    /** Resolves once Firebase knows whether someone is already signed in on this browser. */
    async current(): Promise<Account | null> {
      await auth.authStateReady();
      return auth.currentUser ? toAccount(auth.currentUser) : null;
    },

    /** Called when someone signs in or out, including in another tab. */
    onSignedOut(listener: () => void): () => void {
      return onAuthStateChanged(auth, (user) => {
        if (!user) listener();
      });
    },

    async register(input: { displayName: string; email: string; password: string; confirm: string }): Promise<Result<{ account: Account; verificationSent: boolean }>> {
      const name = input.displayName.trim();
      const problem =
        (nameProblem(name) && { field: 'displayName', message: nameProblem(name)! }) ||
        (emailProblem(input.email) && { field: 'email', message: emailProblem(input.email)! }) ||
        (passwordProblem(input.password) && { field: 'password', message: passwordProblem(input.password)! }) ||
        (input.password !== input.confirm && { field: 'confirm', message: 'The passwords do not match.' });
      if (problem) return { ok: false, ...problem };
      try {
        const { user } = await createUserWithEmailAndPassword(auth, normalizeEmail(input.email), input.password);
        await updateProfile(user, { displayName: name });
        await setDoc(userDoc(user.uid), { displayName: name, email: user.email, progress: {}, activity: [], created: serverTimestamp(), updated: serverTimestamp() });
        let verificationSent = true;
        try {
          await sendEmailVerification(user);
        } catch {
          // The account is made either way; the student can send it again from Account settings.
          verificationSent = false;
        }
        return { ok: true, value: { account: await toAccount(user), verificationSent } };
      } catch (error) {
        return explain(error);
      }
    },

    async signIn(email: string, password: string): Promise<Result<Account>> {
      if (emailProblem(email)) return { ok: false, field: 'email', message: emailProblem(email)! };
      if (!password) return { ok: false, field: 'password', message: 'Enter your password.' };
      try {
        const { user } = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
        return { ok: true, value: await toAccount(user) };
      } catch (error) {
        return explain(error);
      }
    },

    async signOut(): Promise<void> {
      await signOut(auth);
    },

    /** Sends a reset link. The answer is the same whether or not the account exists. */
    async sendReset(email: string): Promise<Result<null>> {
      if (emailProblem(email)) return { ok: false, field: 'email', message: emailProblem(email)! };
      try {
        await sendPasswordResetEmail(auth, normalizeEmail(email));
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== 'auth/user-not-found') return explain(error);
      }
      return { ok: true, value: null };
    },

    async resendVerification(): Promise<Result<null>> {
      try {
        await sendEmailVerification(signedInUser());
        return { ok: true, value: null };
      } catch (error) {
        return explain(error);
      }
    },

    /** Re-reads the account, for example after the student clicked the verification link. */
    async refresh(): Promise<Account | null> {
      const user = auth.currentUser;
      if (!user) return null;
      await user.reload();
      await user.getIdToken(true);
      return toAccount(user);
    },

    async changePassword(current: string, next: string, confirm: string): Promise<Result<null>> {
      if (!current) return { ok: false, field: 'current', message: 'Enter your current password.' };
      const problem = passwordProblem(next);
      if (problem) return { ok: false, field: 'next', message: problem };
      if (next !== confirm) return { ok: false, field: 'confirm', message: 'The new passwords do not match.' };
      try {
        const user = signedInUser();
        try {
          await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? '', current));
        } catch (error) {
          const result = explain(error);
          return result.message === INCORRECT ? { ok: false, field: 'current', message: 'Your current password is incorrect.' } : result;
        }
        await updatePassword(user, next);
        return { ok: true, value: null };
      } catch (error) {
        return explain(error);
      }
    },

    async updateName(displayName: string): Promise<Result<string>> {
      const name = displayName.trim();
      const problem = nameProblem(name);
      if (problem) return { ok: false, field: 'displayName', message: problem };
      try {
        const user = signedInUser();
        await updateProfile(user, { displayName: name });
        await setDoc(userDoc(user.uid), { displayName: name, email: user.email, updated: serverTimestamp() }, { merge: true });
        return { ok: true, value: name };
      } catch (error) {
        return explain(error);
      }
    },

    async loadProgress(uid: string): Promise<SavedProgress> {
      const snap = await getDoc(userDoc(uid));
      const data = snap.data() ?? {};
      return { progress: (data.progress as ProgressMap) ?? {}, activity: (data.activity as ActivityEvent[]) ?? [] };
    },

    /** Replaces the saved progress and history; the account's creation date is kept. */
    async saveProgress(account: Account, saved: SavedProgress): Promise<void> {
      await setDoc(
        userDoc(account.uid),
        { displayName: account.displayName, email: account.email, progress: saved.progress, activity: saved.activity, updated: serverTimestamp() },
        { mergeFields: ['displayName', 'email', 'progress', 'activity', 'updated'] },
      );
    },

    /** Every student's record. The rules allow this only for instructors. */
    async listStudents(): Promise<StudentRecord[]> {
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          displayName: String(data.displayName ?? ''),
          email: String(data.email ?? ''),
          progress: (data.progress as ProgressMap) ?? {},
          activity: (data.activity as ActivityEvent[]) ?? [],
          updated: millis(data.updated),
        };
      });
    },

    async dispose(): Promise<void> {
      await deleteApp(app);
    },
  };
}

export type Cloud = ReturnType<typeof createCloud>;
