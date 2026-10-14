import { ch, maj } from './bits';
import { bigSigma0, bigSigma1, smallSigma0, smallSigma1 } from './sigma';

/** The 64 round constants from FIPS 180-4, section 4.2.2. */
export const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** The initial hash value H(0) from FIPS 180-4, section 5.3.3. */
export const INITIAL_HASH: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

export const REGISTER_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

/** Working variables a to h after one round, plus the two temporaries. */
export interface RoundState {
  round: number;
  registers: number[];
  t1: number;
  t2: number;
}

export interface BlockTrace {
  index: number;
  /** W0 to W63. The first 16 come straight from the block. */
  schedule: number[];
  /** Hash value going into this block. */
  start: number[];
  rounds: RoundState[];
  /** Hash value after this block. */
  end: number[];
}

export interface Sha256Trace {
  message: Uint8Array;
  /** Message length in bits, the value stored in the last 64 bits. */
  bitLength: number;
  /** Number of 0 bits added after the single 1 bit. */
  zeroBits: number;
  padded: Uint8Array;
  blocks: BlockTrace[];
  hash: number[];
  hex: string;
}

const add = (...values: number[]): number => values.reduce((sum, v) => (sum + v) >>> 0, 0);

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function wordHex(word: number): string {
  return (word >>> 0).toString(16).padStart(8, '0');
}

/** (448 − (L + 1)) mod 512: the zeros that make the padded length 448 mod 512. */
export function zeroPadBits(bitLength: number): number {
  return (((448 - (bitLength + 1)) % 512) + 512) % 512;
}

/** Append the 1 bit, the zero bits and the 64-bit big-endian length (FIPS 180-4, 5.1.1). */
export function pad(message: Uint8Array): Uint8Array {
  const bitLength = message.length * 8;
  const totalBytes = (bitLength + 1 + zeroPadBits(bitLength) + 64) / 8;
  const padded = new Uint8Array(totalBytes);
  padded.set(message);
  padded[message.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(totalBytes - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(totalBytes - 4, bitLength >>> 0);
  return padded;
}

/** The message schedule W0 to W63 for one 512-bit block (FIPS 180-4, 6.2.2 step 1). */
export function messageSchedule(block: Uint8Array): number[] {
  const view = new DataView(block.buffer, block.byteOffset, 64);
  const w: number[] = [];
  for (let t = 0; t < 16; t++) {
    w.push(view.getUint32(t * 4));
  }
  for (let t = 16; t < 64; t++) {
    w.push(add(smallSigma1(w[t - 2]), w[t - 7], smallSigma0(w[t - 15]), w[t - 16]));
  }
  return w;
}

/** Run SHA-256 and keep every intermediate value for the walkthrough. */
export function sha256Trace(message: Uint8Array): Sha256Trace {
  const bitLength = message.length * 8;
  const padded = pad(message);
  const blocks: BlockTrace[] = [];
  let hash = [...INITIAL_HASH];

  for (let offset = 0, index = 0; offset < padded.length; offset += 64, index++) {
    const schedule = messageSchedule(padded.subarray(offset, offset + 64));
    let [a, b, c, d, e, f, g, h] = hash;
    const rounds: RoundState[] = [];

    for (let t = 0; t < 64; t++) {
      const t1 = add(h, bigSigma1(e), ch(e, f, g, 32), K[t], schedule[t]);
      const t2 = add(bigSigma0(a), maj(a, b, c, 32));
      h = g;
      g = f;
      f = e;
      e = add(d, t1);
      d = c;
      c = b;
      b = a;
      a = add(t1, t2);
      rounds.push({ round: t, registers: [a, b, c, d, e, f, g, h], t1, t2 });
    }

    const start = hash;
    hash = hash.map((value, i) => add(value, [a, b, c, d, e, f, g, h][i]));
    blocks.push({ index, schedule, start, rounds, end: hash });
  }

  return {
    message,
    bitLength,
    zeroBits: zeroPadBits(bitLength),
    padded,
    blocks,
    hash,
    hex: hash.map(wordHex).join(''),
  };
}

export function sha256Hex(message: Uint8Array): string {
  return sha256Trace(message).hex;
}
