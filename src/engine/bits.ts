/**
 * n-bit helpers for the tutor exercises.
 *
 * JavaScript's bitwise operators work on 32-bit signed integers, so every
 * result here is masked to the problem width and converted back to an
 * unsigned value with `>>> 0`. Widths from 1 to 32 bits are supported.
 */

export type Width = 4 | 8 | 16 | 32;

/** Problem sizes the tutor offers, smallest first. */
export const WIDTHS: readonly Width[] = [4, 8, 16, 32];

function checkWidth(n: number): void {
  if (!Number.isInteger(n) || n < 1 || n > 32) {
    throw new RangeError(`Width must be a whole number from 1 to 32, got ${n}`);
  }
}

/** Largest value that fits in n bits, e.g. 0b1111 for n = 4. */
export function mask(n: number): number {
  checkWidth(n);
  return n === 32 ? 0xffffffff : 2 ** n - 1;
}

/** Keep only the low n bits of x, as an unsigned number. */
export function trim(x: number, n: number): number {
  return (x & mask(n)) >>> 0;
}

/** Rotate x right by k places within an n-bit word. k may be any integer. */
export function rotr(x: number, k: number, n: number): number {
  const value = trim(x, n);
  const places = ((k % n) + n) % n;
  if (places === 0) {
    return value;
  }
  return (((value >>> places) | (value << (n - places))) & mask(n)) >>> 0;
}

/** Shift x right by k places within an n-bit word. Shifting by n or more gives 0. */
export function shr(x: number, k: number, n: number): number {
  if (k >= n) {
    return 0;
  }
  return trim(x, n) >>> k;
}

/** (a + b) mod 2^n. The sum is below 2^33, so plain number arithmetic is exact. */
export function addMod(a: number, b: number, n: number): number {
  checkWidth(n);
  return (trim(a, n) + trim(b, n)) % 2 ** n;
}

export function xor(a: number, b: number): number {
  return (a ^ b) >>> 0;
}

/** Choice: where x has a 1 take the bit from y, otherwise from z. */
export function ch(x: number, y: number, z: number, n: number): number {
  return trim((x & y) ^ (~x & z), n);
}

/** Majority: each result bit is whichever value appears in at least two of x, y, z. */
export function maj(x: number, y: number, z: number, n: number): number {
  return trim((x & y) ^ (x & z) ^ (y & z), n);
}

/** x as exactly n binary digits. */
export function toBinary(x: number, n: number): string {
  return trim(x, n).toString(2).padStart(n, '0');
}

/** Binary digits split into groups of four, e.g. "1011 0011". */
export function groupNibbles(bits: string): string {
  return bits.replace(/(.{4})(?=.)/g, '$1 ');
}

export type ParsedBinary =
  | { ok: true; value: number; digits: string }
  | { ok: false; reason: string };

/**
 * Read a student's binary answer. Spaces are ignored. The answer must be
 * exactly n digits of 0 and 1.
 */
export function parseBinary(input: string, n: number): ParsedBinary {
  const digits = input.replace(/\s+/g, '');
  if (digits.length === 0) {
    return { ok: false, reason: 'Enter an answer in binary.' };
  }
  if (!/^[01]+$/.test(digits)) {
    return { ok: false, reason: 'Use only the digits 0 and 1.' };
  }
  if (digits.length !== n) {
    return { ok: false, reason: `The answer needs ${n} digits. You entered ${digits.length}.` };
  }
  return { ok: true, value: parseInt(digits, 2), digits };
}

/** Indexes (0 = leftmost digit) where two n-bit values differ. */
export function differingBits(a: number, b: number, n: number): number[] {
  const left = toBinary(a, n);
  const right = toBinary(b, n);
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    if (left[i] !== right[i]) {
      result.push(i);
    }
  }
  return result;
}
