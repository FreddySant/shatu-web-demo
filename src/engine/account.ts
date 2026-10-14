/**
 * Rules for the account forms. Firebase Authentication does the signing in;
 * these checks give clear messages before anything is sent.
 */

/** Emails are compared in lower case, so Alice@Regis.edu and alice@regis.edu are one account. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export function nameProblem(name: string): string | null {
  const n = name.trim();
  if (n.length === 0) return 'Enter your name.';
  if (n.length > 80) return 'Use at most 80 characters.';
  return null;
}

export function emailProblem(email: string): string | null {
  const e = email.trim();
  if (e.length === 0) return 'Enter your email.';
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return 'Enter a valid email address.';
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
