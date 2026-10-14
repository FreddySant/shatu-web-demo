import { rotr, shr, xor } from './bits';

/** FIPS 180-4 rotation amounts for SHA-256's Σ0 and Σ1. */
export const SIGMA0_AMOUNTS = [2, 13, 22] as const;
export const SIGMA1_AMOUNTS = [6, 11, 25] as const;

/**
 * Rotation amounts for an n-bit problem. Each amount wraps around the width,
 * so a 4-bit Σ1 rotates by 2, 3 and 1. At 32 bits these are the FIPS amounts.
 */
export function reducedAmounts(amounts: readonly number[], n: number): number[] {
  return amounts.map((a) => a % n);
}

function threeRotations(x: number, amounts: readonly number[], n: number): number {
  const [r1, r2, r3] = amounts;
  return xor(xor(rotr(x, r1, n), rotr(x, r2, n)), rotr(x, r3, n));
}

/** Σ0(x) = ROTR²(x) ⊕ ROTR¹³(x) ⊕ ROTR²²(x), defined for any width up to 32. */
export function bigSigma0(x: number, n = 32): number {
  return threeRotations(x, SIGMA0_AMOUNTS, n);
}

/** Σ1(x) = ROTR⁶(x) ⊕ ROTR¹¹(x) ⊕ ROTR²⁵(x), defined for any width up to 32. */
export function bigSigma1(x: number, n = 32): number {
  return threeRotations(x, SIGMA1_AMOUNTS, n);
}

/** σ0(x) = ROTR⁷(x) ⊕ ROTR¹⁸(x) ⊕ SHR³(x), used by the 32-bit message schedule. */
export function smallSigma0(x: number): number {
  return xor(xor(rotr(x, 7, 32), rotr(x, 18, 32)), shr(x, 3, 32));
}

/** σ1(x) = ROTR¹⁷(x) ⊕ ROTR¹⁹(x) ⊕ SHR¹⁰(x), used by the 32-bit message schedule. */
export function smallSigma1(x: number): number {
  return xor(xor(rotr(x, 17, 32), rotr(x, 19, 32)), shr(x, 10, 32));
}
