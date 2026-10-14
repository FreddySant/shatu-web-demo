import { describe, expect, it } from 'vitest';
import { emailProblem, nameProblem, normalizeEmail, passwordProblem, passwordStrength } from '../src/engine/account';

describe('account rules', () => {
  it('checks names', () => {
    expect(nameProblem('   ')).toBe('Enter your name.');
    expect(nameProblem('x'.repeat(81))).toBe('Use at most 80 characters.');
    expect(nameProblem('Ada Lovelace')).toBeNull();
  });

  it('checks emails and compares them in lower case', () => {
    expect(emailProblem('')).toBe('Enter your email.');
    expect(emailProblem('ada')).toBe('Enter a valid email address.');
    expect(emailProblem('ada@regis')).toBe('Enter a valid email address.');
    expect(emailProblem('ada lovelace@regis.edu')).toBe('Enter a valid email address.');
    expect(emailProblem(' Ada@Regis.edu ')).toBeNull();
    expect(normalizeEmail(' Ada@Regis.edu ')).toBe('ada@regis.edu');
  });

  it('checks passwords', () => {
    expect(passwordProblem('short1')).toBe('Use at least 8 characters.');
    expect(passwordProblem('allletters')).toBe('Include at least one letter and one number.');
    expect(passwordProblem('12345678')).toBe('Include at least one letter and one number.');
    expect(passwordProblem('engine1843')).toBeNull();
  });

  it('scores password strength', () => {
    expect(passwordStrength('').label).toBe('');
    expect(passwordStrength('engine1843').score).toBe(1);
    expect(passwordStrength('Engine1843!longer').score).toBe(4);
  });
});
