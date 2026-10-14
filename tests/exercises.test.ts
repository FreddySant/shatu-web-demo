import { describe, expect, it } from 'vitest';
import { parseBinary, toBinary } from '../src/engine/bits';
import { describeCharacter, EXERCISES, formatAnswer, seeded } from '../src/engine/exercises';
import { reducedAmounts, SIGMA0_AMOUNTS, SIGMA1_AMOUNTS } from '../src/engine/sigma';
import { zeroPadBits } from '../src/engine/sha256';
import { runChecks } from '../src/engine/checks';

describe('exercises', () => {
  it.each(EXERCISES.map((e) => [e.title, e] as const))('%s produces sound problems at every level', (_, exercise) => {
    const random = seeded(255);
    exercise.levels.forEach((_level, levelIndex) => {
      for (let i = 0; i < 40; i++) {
        const problem = exercise.generate(levelIndex, random);
        const answer = formatAnswer(problem);
        expect(exercise.hints(problem)).toHaveLength(3);
        expect(exercise.prompt(problem).length).toBeGreaterThan(5);
        const result = exercise.worked(problem).find((row) => row.result);
        expect(result).toBeDefined();
        if (problem.answerKind === 'bits') {
          expect(result?.bits).toBe(answer);
          expect(parseBinary(answer, problem.answerWidth)).toMatchObject({ ok: true, value: problem.answer });
        } else {
          expect(result?.text?.startsWith(answer)).toBe(true);
        }
      }
    });
  });

  it('encodes characters as their ASCII codes', () => {
    const encode = EXERCISES.find((e) => e.id === 'encode')!;
    for (let i = 0; i < 50; i++) {
      const p = encode.generate(3);
      const char = p.operands[0].text!;
      expect(formatAnswer(p)).toBe(toBinary(char.charCodeAt(0), 8));
    }
  });

  it('names characters that are easy to confuse', () => {
    expect(describeCharacter('l')).toBe('lowercase L');
    expect(describeCharacter('1')).toBe('digit 1');
    expect(describeCharacter('O')).toBe('capital O');
    expect(describeCharacter('\\')).toBe('backslash');
    expect(describeCharacter(' ')).toBe('space');
  });

  it('counts padding zeros with the FIPS 180-4 formula', () => {
    expect(zeroPadBits(24)).toBe(423);
    expect(zeroPadBits(55 * 8)).toBe(7);
    expect(zeroPadBits(56 * 8)).toBe(511);
    const padding = EXERCISES.find((e) => e.id === 'padding')!;
    const p = padding.generate(2, seeded(1));
    expect(p.answer).toBe(zeroPadBits(p.operands[0].value * 8));
  });

  it('reduces the Sigma rotation amounts by the word size', () => {
    expect(reducedAmounts(SIGMA1_AMOUNTS, 4)).toEqual([2, 3, 1]);
    expect(reducedAmounts(SIGMA1_AMOUNTS, 8)).toEqual([6, 3, 1]);
    expect(reducedAmounts(SIGMA0_AMOUNTS, 8)).toEqual([2, 5, 6]);
    expect(reducedAmounts(SIGMA1_AMOUNTS, 32)).toEqual([6, 11, 25]);
  });
});

describe('verification page', () => {
  it('passes every check it shows', async () => {
    const results = await runChecks();
    expect(results.map((r) => r.id)).toEqual(['nist', 'webcrypto', 'rotr', 'add', 'sigma', 'chmaj', 'exercises']);
    for (const r of results) {
      expect(r.failures, r.title).toEqual([]);
      expect(r.passed).toBe(r.cases);
    }
  });
});

/* An independent reference written with strings of 0s and 1s, so it shares no code with src/engine/bits.ts. */
const asBits = (v: number, n: number) => v.toString(2).padStart(n, '0');
const rotrS = (s: string, k: number) => {
  const r = k % s.length;
  return r === 0 ? s : s.slice(-r) + s.slice(0, -r);
};
const shrS = (s: string, k: number) => (k >= s.length ? '0'.repeat(s.length) : '0'.repeat(k) + s.slice(0, s.length - k));
const xorS = (...words: string[]) => [...words[0]].map((_, i) => String(words.reduce((acc, w) => acc ^ Number(w[i]), 0))).join('');
const chS = (x: string, y: string, z: string) => [...x].map((b, i) => (b === '1' ? y[i] : z[i])).join('');
const majS = (x: string, y: string, z: string) => [...x].map((b, i) => (Number(b) + Number(y[i]) + Number(z[i]) >= 2 ? '1' : '0')).join('');
const addS = (a: string, b: string) => ((BigInt('0b' + a) + BigInt('0b' + b)) % (1n << BigInt(a.length))).toString(2).padStart(a.length, '0');
const sigmaS = (x: string, amounts: readonly number[]) => xorS(...amounts.map((a) => rotrS(x, a)));

describe('exercise answers against an independent reference', () => {
  const reference: Record<string, (w: Record<string, string>, k: number) => string> = {
    rotr: (w, k) => rotrS(w.x, k),
    shr: (w, k) => shrS(w.x, k),
    xor: (w) => xorS(w.x, w.y),
    add: (w) => addS(w.a, w.b),
    ch: (w) => chS(w.x, w.y, w.z),
    maj: (w) => majS(w.x, w.y, w.z),
    sigma0: (w) => sigmaS(w.x, SIGMA0_AMOUNTS),
    sigma1: (w) => sigmaS(w.x, SIGMA1_AMOUNTS),
  };

  it.each(Object.keys(reference))('%s gives the right answer at every level', (id) => {
    const exercise = EXERCISES.find((e) => e.id === id)!;
    const random = seeded(2026);
    exercise.levels.forEach((_level, levelIndex) => {
      for (let i = 0; i < 50; i++) {
        const p = exercise.generate(levelIndex, random);
        const words: Record<string, string> = {};
        let k = 0;
        for (const o of p.operands) {
          if (o.kind === 'word') words[o.name] = asBits(o.value, p.level);
          else k = o.value;
        }
        const expected = reference[id](words, k);
        expect(asBits(p.answer, p.answerWidth), `${id} level ${levelIndex + 1}`).toBe(expected);
        // The practice screen accepts an answer with parseInt(bits, 2) === answer.
        expect(parseInt(expected, 2)).toBe(p.answer);
      }
    });
  });

  it('encode and padding give the right answer at every level', () => {
    const random = seeded(7);
    const encode = EXERCISES.find((e) => e.id === 'encode')!;
    const padding = EXERCISES.find((e) => e.id === 'padding')!;
    for (let levelIndex = 0; levelIndex < 4; levelIndex++) {
      for (let i = 0; i < 50; i++) {
        const e = encode.generate(levelIndex, random);
        expect(e.answer).toBe(e.operands[0].text!.charCodeAt(0));
        const p = padding.generate(levelIndex, random);
        const bitsLength = p.operands[0].value * 8;
        expect(p.answer).toBe((((448 - (bitsLength + 1)) % 512) + 512) % 512);
      }
    }
  });
});
