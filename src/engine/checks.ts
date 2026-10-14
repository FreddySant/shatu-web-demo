import { addMod, ch, maj, parseBinary, rotr, toBinary, WIDTHS } from './bits';
import { EXERCISES, formatAnswer } from './exercises';
import { bigSigma0, bigSigma1, reducedAmounts, SIGMA0_AMOUNTS, SIGMA1_AMOUNTS } from './sigma';
import { sha256Hex, utf8 } from './sha256';

/**
 * Example digests published by NIST for SHA-256
 * (csrc.nist.gov, Cryptographic Standards and Guidelines, examples).
 */
export const NIST_EXAMPLES: readonly { label: string; message: string; digest: string }[] = [
  { label: '"abc"', message: 'abc', digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
  { label: 'empty message', message: '', digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  {
    label: '448-bit message',
    message: 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    digest: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  },
  {
    label: '896-bit message',
    message:
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
    digest: 'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
  },
];

export interface CheckResult {
  id: string;
  title: string;
  description: string;
  cases: number;
  passed: number;
  failures: string[];
  ms: number;
}

/** Reference implementations with BigInt, written independently of bits.ts. */
const big = {
  rotr(x: number, k: number, n: number): bigint {
    const w = BigInt(n);
    const m = (1n << w) - 1n;
    const v = BigInt(x) & m;
    const r = BigInt(((k % n) + n) % n);
    return ((v >> r) | (v << (w - r))) & m;
  },
  add(a: number, b: number, n: number): bigint {
    return (BigInt(a) + BigInt(b)) % (1n << BigInt(n));
  },
  sigma(x: number, amounts: readonly number[], n: number): bigint {
    const [r1, r2, r3] = reducedAmounts(amounts, n);
    return big.rotr(x, r1, n) ^ big.rotr(x, r2, n) ^ big.rotr(x, r3, n);
  },
};

function randomWord(n: number): number {
  return Math.floor(Math.random() * 2 ** n);
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function timed(
  id: string,
  title: string,
  description: string,
  body: (fail: (message: string) => void) => Promise<number> | number,
): Promise<CheckResult> {
  const failures: string[] = [];
  const started = performance.now();
  const cases = await body((message) => failures.push(message));
  return {
    id,
    title,
    description,
    cases,
    passed: cases - failures.length,
    failures: failures.slice(0, 5),
    ms: performance.now() - started,
  };
}

/**
 * Every check the demo can run. `subtle` is the browser's Web Crypto API,
 * which has its own SHA-256 to compare against.
 */
export async function runChecks(subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  results.push(
    await timed('nist', 'NIST example digests', 'The four SHA-256 examples published by NIST.', (fail) => {
      for (const ex of NIST_EXAMPLES) {
        const got = sha256Hex(utf8(ex.message));
        if (got !== ex.digest) {
          fail(`${ex.label}: expected ${ex.digest}, got ${got}`);
        }
      }
      return NIST_EXAMPLES.length;
    }),
  );

  if (subtle) {
    results.push(
      await timed(
        'webcrypto',
        'Random messages against Web Crypto',
        "Random messages from 0 to 200 bytes, including each length where padding needs another block, compared with the browser's own SHA-256.",
        async (fail) => {
          const lengths = [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 183, 184, 191, 192];
          while (lengths.length < 300) {
            lengths.push(Math.floor(Math.random() * 201));
          }
          for (const length of lengths) {
            const message = new Uint8Array(length);
            globalThis.crypto.getRandomValues(message);
            const expected = hex(await subtle.digest('SHA-256', message));
            const got = sha256Hex(message);
            if (got !== expected) {
              fail(`${length}-byte message: Web Crypto ${expected}, demo ${got}`);
            }
          }
          return lengths.length;
        },
      ),
    );
  }

  results.push(
    await timed('rotr', 'Rotate right at every width', 'Every width from 1 to 32 bits, 100 random cases each, against a BigInt reference.', (fail) => {
      let cases = 0;
      for (let n = 1; n <= 32; n++) {
        for (let i = 0; i < 100; i++, cases++) {
          const x = randomWord(n);
          const k = Math.floor(Math.random() * 70) - 35;
          if (BigInt(rotr(x, k, n)) !== big.rotr(x, k, n)) {
            fail(`${n}-bit ROTR${k}(${x})`);
          }
        }
      }
      return cases;
    }),
  );

  results.push(
    await timed('add', 'Addition modulo 2ⁿ at every width', 'Every width from 1 to 32 bits, 100 random cases each, against a BigInt reference.', (fail) => {
      let cases = 0;
      for (let n = 1; n <= 32; n++) {
        for (let i = 0; i < 100; i++, cases++) {
          const a = randomWord(n);
          const b = randomWord(n);
          if (BigInt(addMod(a, b, n)) !== big.add(a, b, n)) {
            fail(`${n}-bit ${a} + ${b}`);
          }
        }
      }
      return cases;
    }),
  );

  results.push(
    await timed('sigma', 'Σ₀ and Σ₁ at every width', 'Every width from 1 to 32 bits, 50 random words each, checked for both Σ₀ and Σ₁. At 32 bits this is exactly FIPS 180-4.', (fail) => {
      let cases = 0;
      for (let n = 1; n <= 32; n++) {
        for (let i = 0; i < 50; i++, cases += 2) {
          const x = randomWord(n);
          if (BigInt(bigSigma0(x, n)) !== big.sigma(x, SIGMA0_AMOUNTS, n)) {
            fail(`${n}-bit Σ0(${x})`);
          }
          if (BigInt(bigSigma1(x, n)) !== big.sigma(x, SIGMA1_AMOUNTS, n)) {
            fail(`${n}-bit Σ1(${x})`);
          }
        }
      }
      return cases;
    }),
  );

  results.push(
    await timed('chmaj', 'Choice and Majority bit by bit', 'At 4, 8, 16 and 32 bits, 100 random cases each for Ch and for Maj, with every result bit compared with the definition.', (fail) => {
      let cases = 0;
      for (const n of WIDTHS) {
        for (let i = 0; i < 100; i++, cases += 2) {
          const [x, y, z] = [randomWord(n), randomWord(n), randomWord(n)].map((v) => toBinary(v, n));
          const chExpected = [...x].map((bit, j) => (bit === '1' ? y[j] : z[j])).join('');
          const majExpected = [...x].map((bit, j) => (Number(bit) + Number(y[j]) + Number(z[j]) >= 2 ? '1' : '0')).join('');
          const [xv, yv, zv] = [x, y, z].map((s) => parseInt(s, 2));
          if (toBinary(ch(xv, yv, zv, n), n) !== chExpected) {
            fail(`${n}-bit Ch(${x}, ${y}, ${z})`);
          }
          if (toBinary(maj(xv, yv, zv, n), n) !== majExpected) {
            fail(`${n}-bit Maj(${x}, ${y}, ${z})`);
          }
        }
      }
      return cases;
    }),
  );

  results.push(
    await timed(
      'exercises',
      'Tutor exercises',
      'Every exercise at every level, 25 problems each: the correct answer is accepted, the last hint gives it, and the worked solution ends with it.',
      (fail) => {
        let cases = 0;
        for (const exercise of EXERCISES) {
          exercise.levels.forEach((level, levelIndex) => {
            for (let i = 0; i < 25; i++, cases++) {
              const problem = exercise.generate(levelIndex);
              const answer = formatAnswer(problem);
              const hints = exercise.hints(problem);
              const last = hints[hints.length - 1];
              const result = exercise.worked(problem).find((row) => row.result);
              let accepted = Number(answer) === problem.answer;
              if (problem.answerKind === 'bits') {
                const parsed = parseBinary(answer, problem.answerWidth);
                accepted = parsed.ok && parsed.value === problem.answer;
              }
              const hintGives =
                problem.answerKind === 'bits'
                  ? last.replace(/[^01]/g, '').endsWith(answer)
                  : new RegExp(`(^|[^0-9])${answer}([^0-9]|$)`).test(last);
              const workedGives = result !== undefined && (result.bits === answer || (result.text ?? '').startsWith(answer));
              if (!accepted) {
                fail(`${exercise.title}, ${level.label}: correct answer was not accepted`);
              } else if (hints.length !== 3 || !hintGives) {
                fail(`${exercise.title}, ${level.label}: the last hint does not give the answer`);
              } else if (!workedGives) {
                fail(`${exercise.title}, ${level.label}: the worked solution does not end with the answer`);
              }
            }
          });
        }
        return cases;
      },
    ),
  );

  return results;
}
