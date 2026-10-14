import { describe, expect, it } from 'vitest';
import { NIST_EXAMPLES } from '../src/engine/checks';
import { INITIAL_HASH, pad, sha256Hex, sha256Trace, utf8, zeroPadBits } from '../src/engine/sha256';
import { bigSigma1 } from '../src/engine/sigma';

describe('SHA-256', () => {
  it.each(NIST_EXAMPLES)('matches the NIST example for $label', ({ message, digest }) => {
    expect(sha256Hex(utf8(message))).toBe(digest);
  });

  it('matches Node Web Crypto for every length from 0 to 200 bytes', async () => {
    for (let length = 0; length <= 200; length++) {
      const message = new Uint8Array(length).map((_, i) => (i * 131 + length) & 0xff);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', message));
      const expected = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
      expect(sha256Hex(message), `${length} bytes`).toBe(expected);
    }
  });

  it('pads "abc" the way FIPS 180-4 section 5.1.1 shows', () => {
    expect(zeroPadBits(24)).toBe(423);
    const padded = pad(utf8('abc'));
    expect(padded.length).toBe(64);
    expect(padded[3]).toBe(0x80);
    expect(padded[63]).toBe(24);
  });

  it('records 64 rounds per block and starts from H(0)', () => {
    const trace = sha256Trace(utf8('abc'));
    expect(trace.blocks).toHaveLength(1);
    expect(trace.blocks[0].rounds).toHaveLength(64);
    expect(trace.blocks[0].start).toEqual(INITIAL_HASH);
  });

  it('uses the FIPS Sigma 1 at 32 bits', () => {
    const x = 0x510e527f;
    const fips = ((x >>> 6) | (x << 26)) ^ ((x >>> 11) | (x << 21)) ^ ((x >>> 25) | (x << 7));
    expect(bigSigma1(x)).toBe(fips >>> 0);
  });
});
