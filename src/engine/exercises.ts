import { addMod, ch, groupNibbles, maj, mask, rotr, shr, toBinary, xor } from './bits';
import { bigSigma0, bigSigma1, reducedAmounts, SIGMA0_AMOUNTS, SIGMA1_AMOUNTS } from './sigma';
import { zeroPadBits } from './sha256';

export type ExerciseId = 'encode' | 'padding' | 'rotr' | 'shr' | 'xor' | 'add' | 'ch' | 'maj' | 'sigma0' | 'sigma1';

export type Stage = 'preprocessing' | 'operations' | 'functions';

/** A random source. Tests pass a seeded one so problems repeat. */
export type Random = () => number;

export interface Operand {
  name: string;
  /** word: drawn as bits. amount and number: shown as a number. text: shown as text. */
  kind: 'word' | 'amount' | 'number' | 'text';
  value: number;
  text?: string;
}

export interface Level {
  /** For bit operations this is the word size. */
  value: number;
  label: string;
}

export interface Problem {
  exercise: ExerciseId;
  level: number;
  /** Index into the exercise's levels. */
  levelIndex: number;
  operands: Operand[];
  answer: number;
  /** bits: the student sets answerWidth bit tiles. number: the student types a whole number. */
  answerKind: 'bits' | 'number';
  answerWidth: number;
}

/** One line of a worked solution: a row of bits or a line of text. */
export interface WorkedRow {
  label: string;
  bits?: string;
  text?: string;
  /** Positions (0 = leftmost) to highlight. */
  marks?: number[];
  note?: string;
  result?: boolean;
}

export interface Exercise {
  id: ExerciseId;
  title: string;
  symbol: string;
  stage: Stage;
  summary: string;
  /** The definition shown beside every problem. */
  rule: string;
  /** What the highlighted bits in a worked solution mean. */
  legend: string;
  levels: Level[];
  generate(levelIndex: number, random?: Random): Problem;
  prompt(problem: Problem): string;
  /** Three hints, from the general idea to the full answer. */
  hints(problem: Problem): string[];
  worked(problem: Problem): WorkedRow[];
}

export const STAGES: { id: Stage; title: string }[] = [
  { id: 'preprocessing', title: 'Message preprocessing' },
  { id: 'operations', title: 'Bit operations' },
  { id: 'functions', title: 'SHA-256 functions' },
];

/** Parts of ShaTu that this demo shows only in the Hash Lab. */
export const FULL_VERSION_ONLY: { title: string; stage: Stage; labStep: string }[] = [
  { title: 'Add one bit', stage: 'preprocessing', labStep: 'padding' },
  { title: 'Message length', stage: 'preprocessing', labStep: 'length' },
  { title: 'Message schedule', stage: 'functions', labStep: 'schedule' },
  { title: 'Working variables', stage: 'functions', labStep: 'rounds' },
  { title: 'Compression round', stage: 'functions', labStep: 'rounds' },
];

/** Mulberry32, a small seeded generator for repeatable problems. */
export function seeded(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORD_LEVELS: Level[] = [4, 8, 16, 32].map((n) => ({ value: n, label: `${n}-bit words` }));

function randomInt(min: number, max: number, random: Random): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** A word that is not all zeros or all ones, so every problem has something to do. */
function interestingWord(n: number, random: Random): number {
  let x = 0;
  do {
    x = Math.floor(random() * (mask(n) + 1));
  } while (x === 0 || x === mask(n));
  return x;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);
}

function operand(problem: Problem, name: string): Operand {
  const found = problem.operands.find((o) => o.name === name);
  if (!found) {
    throw new Error(`Problem has no operand named ${name}`);
  }
  return found;
}

const value = (problem: Problem, name: string) => operand(problem, name).value;
const bin = (x: number, n: number) => groupNibbles(toBinary(x, n));
const article = (n: number) => (n === 8 || n === 11 || n === 18 ? 'an' : 'a');

function wordProblem(exercise: ExerciseId, levelIndex: number, operands: Operand[], answer: number): Problem {
  const n = WORD_LEVELS[levelIndex].value;
  return { exercise, level: n, levelIndex, operands, answer, answerKind: 'bits', answerWidth: n };
}

/* ---------------- Message preprocessing ---------------- */

const PUNCTUATION_NAMES: Record<string, string> = {
  ' ': 'space', '!': 'exclamation mark', '"': 'quotation mark', '#': 'number sign', '$': 'dollar sign', '%': 'percent sign',
  '&': 'ampersand', "'": 'apostrophe', '(': 'left parenthesis', ')': 'right parenthesis', '*': 'asterisk', '+': 'plus sign',
  ',': 'comma', '-': 'hyphen', '.': 'period', '/': 'slash', ':': 'colon', ';': 'semicolon', '<': 'less-than sign',
  '=': 'equals sign', '>': 'greater-than sign', '?': 'question mark', '@': 'at sign', '[': 'left square bracket',
  '\\': 'backslash', ']': 'right square bracket', '^': 'caret', '_': 'underscore', '`': 'grave accent', '{': 'left brace',
  '|': 'vertical bar', '}': 'right brace', '~': 'tilde',
};

/** A plain name for a character, so l and 1 or O and 0 can't be confused. */
export function describeCharacter(c: string): string {
  if (/[a-z]/.test(c)) return `lowercase ${c.toUpperCase()}`;
  if (/[A-Z]/.test(c)) return `capital ${c}`;
  if (/[0-9]/.test(c)) return `digit ${c}`;
  return PUNCTUATION_NAMES[c] ?? 'character';
}

const CHARACTER_SETS = [
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  ' !"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join(''),
];

const encode: Exercise = {
  id: 'encode',
  title: 'Encode a character',
  symbol: 'ASCII',
  stage: 'preprocessing',
  summary: 'Write a character as the 8 bits of its ASCII code.',
  rule: 'Every character in the message becomes one byte: its ASCII code from 0 to 127, written as 8 bits.',
  legend: '',
  levels: [
    { value: 0, label: 'Lowercase letters' },
    { value: 1, label: 'Capitals and digits' },
    { value: 2, label: 'Spaces and punctuation' },
    { value: 3, label: 'Any character' },
  ],
  generate(levelIndex, random = Math.random) {
    const set = CHARACTER_SETS[levelIndex];
    const char = set[Math.floor(random() * set.length)];
    const code = char.charCodeAt(0);
    return {
      exercise: 'encode',
      level: levelIndex,
      levelIndex,
      operands: [{ name: 'character', kind: 'text', value: code, text: char }],
      answer: code,
      answerKind: 'bits',
      answerWidth: 8,
    };
  },
  prompt(p) {
    const c = operand(p, 'character').text ?? '';
    return c === ' ' ? 'Write the space character as 8 bits.' : `Write “${c}” as 8 bits.`;
  },
  hints(p) {
    const c = operand(p, 'character').text ?? '';
    const code = p.answer;
    const name = c === ' ' ? 'A space' : `“${c}”`;
    return [
      'Each character has an ASCII code from 0 to 127. Write that number in binary, padded to 8 bits.',
      `${name} is ASCII ${code}, which is ${code.toString(16)} in hex.`,
      `${code} in binary is ${bin(code, 8)}.`,
    ];
  },
  worked(p) {
    const code = p.answer;
    return [
      { label: 'ASCII code', text: String(code) },
      { label: 'Hex', text: code.toString(16).padStart(2, '0'), note: 'Each hex digit is four bits' },
      { label: 'Binary', bits: toBinary(code, 8), result: true },
    ];
  },
};

const PADDING_LENGTHS: [number, number][] = [
  [1, 12],
  [13, 55],
  [56, 64],
  [65, 119],
];

const padding: Exercise = {
  id: 'padding',
  title: 'Count the padding zeros',
  symbol: 'PAD',
  stage: 'preprocessing',
  summary: 'Work out how many 0 bits SHA-256 adds after the single 1 bit.',
  rule: 'After the message comes one 1 bit, then k zero bits, where k = (448 − (L + 1)) mod 512 and L is the message length in bits.',
  legend: '',
  levels: [
    { value: 0, label: 'Short messages' },
    { value: 1, label: 'Up to 55 characters' },
    { value: 2, label: 'Crossing into a second block' },
    { value: 3, label: 'Two-block messages' },
  ],
  generate(levelIndex, random = Math.random) {
    const [min, max] = PADDING_LENGTHS[levelIndex];
    const chars = randomInt(min, max, random);
    return {
      exercise: 'padding',
      level: levelIndex,
      levelIndex,
      operands: [{ name: 'message length', kind: 'number', value: chars, text: `${chars} ASCII characters` }],
      answer: zeroPadBits(chars * 8),
      answerKind: 'number',
      answerWidth: 0,
    };
  },
  prompt(p) {
    return `A message has ${value(p, 'message length')} ASCII characters. How many zero bits does SHA-256 add?`;
  },
  hints(p) {
    const chars = value(p, 'message length');
    const L = chars * 8;
    return [
      'SHA-256 adds one 1 bit, then zeros until the length is 448 more than a multiple of 512. The count is k = (448 − (L + 1)) mod 512.',
      `Each ASCII character is 8 bits, so L = ${chars} × 8 = ${L}.`,
      `k = (448 − ${L + 1}) mod 512 = ${p.answer}.`,
    ];
  },
  worked(p) {
    const chars = value(p, 'message length');
    const L = chars * 8;
    const raw = 448 - (L + 1);
    const rows: WorkedRow[] = [
      { label: 'L', text: `${chars} × 8 = ${L} bits` },
      { label: '448 − (L + 1)', text: String(raw) },
    ];
    if (raw < 0) {
      rows.push({ label: 'mod 512', text: `${raw} + 512 = ${raw + 512}`, note: 'A negative result wraps into the next block' });
    }
    rows.push({ label: 'k', text: `${p.answer} zero bits`, result: true });
    return rows;
  },
};

/* ---------------- Bit operations ---------------- */

const rotateRight: Exercise = {
  id: 'rotr',
  title: 'Rotate right',
  symbol: 'ROTR',
  stage: 'operations',
  summary: 'Move every bit to the right. Bits that fall off the end wrap around to the front.',
  rule: 'ROTRᵏ(x) moves every bit k places to the right. The k bits that fall off the right end come back on the left.',
  legend: 'Amber bits are the ones that wrapped around from the right end.',
  levels: WORD_LEVELS,
  generate(levelIndex, random = Math.random) {
    const n = WORD_LEVELS[levelIndex].value;
    let x = 0;
    let k = 0;
    do {
      x = interestingWord(n, random);
      k = randomInt(1, n - 1, random);
    } while (rotr(x, k, n) === x);
    return wordProblem('rotr', levelIndex, [{ name: 'x', kind: 'word', value: x }, { name: 'k', kind: 'amount', value: k }], rotr(x, k, n));
  },
  prompt(p) {
    return `Rotate x right by ${value(p, 'k')} ${value(p, 'k') === 1 ? 'place' : 'places'}.`;
  },
  hints(p) {
    const n = p.level;
    const x = toBinary(value(p, 'x'), n);
    const k = value(p, 'k');
    const tail = x.slice(n - k);
    const head = x.slice(0, n - k);
    return [
      `Rotating right by ${k} moves every bit ${k} places to the right. The bits that fall off the right end come back on the left.`,
      `The last ${k} ${k === 1 ? 'bit' : 'bits'} of x, ${tail}, move to the front.`,
      `Put ${tail} in front of ${head}. The answer is ${groupNibbles(tail + head)}.`,
    ];
  },
  worked(p) {
    const n = p.level;
    const k = value(p, 'k');
    return [
      { label: 'x', bits: toBinary(value(p, 'x'), n), marks: range(n - k, n), note: `The last ${k} bits wrap around` },
      { label: `ROTR${k}(x)`, bits: toBinary(p.answer, n), marks: range(0, k), note: 'They now lead the word', result: true },
    ];
  },
};

const shiftRight: Exercise = {
  id: 'shr',
  title: 'Shift right',
  symbol: 'SHR',
  stage: 'operations',
  summary: 'Move every bit to the right. Bits that fall off the end are lost and zeros come in on the left.',
  rule: 'SHRᵏ(x) moves every bit k places to the right. The k bits that fall off are dropped and k zeros fill in on the left.',
  legend: 'Amber bits are the ones dropped from x and the zeros that fill in.',
  levels: WORD_LEVELS,
  generate(levelIndex, random = Math.random) {
    const n = WORD_LEVELS[levelIndex].value;
    let x = 0;
    let k = 0;
    do {
      x = interestingWord(n, random);
      k = randomInt(1, n - 1, random);
    } while (shr(x, k, n) === 0);
    return wordProblem('shr', levelIndex, [{ name: 'x', kind: 'word', value: x }, { name: 'k', kind: 'amount', value: k }], shr(x, k, n));
  },
  prompt(p) {
    return `Shift x right by ${value(p, 'k')} ${value(p, 'k') === 1 ? 'place' : 'places'}.`;
  },
  hints(p) {
    const n = p.level;
    const x = toBinary(value(p, 'x'), n);
    const k = value(p, 'k');
    return [
      `Shifting right by ${k} moves every bit ${k} places to the right. Unlike a rotation, the bits that fall off are gone.`,
      `The last ${k} ${k === 1 ? 'bit' : 'bits'}, ${x.slice(n - k)}, are dropped, and ${k} ${k === 1 ? 'zero comes' : 'zeros come'} in on the left.`,
      `Put ${'0'.repeat(k)} in front of ${x.slice(0, n - k)}. The answer is ${bin(p.answer, n)}.`,
    ];
  },
  worked(p) {
    const n = p.level;
    const k = value(p, 'k');
    return [
      { label: 'x', bits: toBinary(value(p, 'x'), n), marks: range(n - k, n), note: `The last ${k} bits are dropped` },
      { label: `SHR${k}(x)`, bits: toBinary(p.answer, n), marks: range(0, k), note: 'Zeros fill in on the left', result: true },
    ];
  },
};

const exclusiveOr: Exercise = {
  id: 'xor',
  title: 'Exclusive or',
  symbol: 'XOR',
  stage: 'operations',
  summary: 'Compare two words bit by bit: 1 where they differ, 0 where they match.',
  rule: 'x ⊕ y has a 1 wherever x and y have different bits and a 0 wherever they have the same bit.',
  legend: 'Amber bits are the positions where x and y differ.',
  levels: WORD_LEVELS,
  generate(levelIndex, random = Math.random) {
    const n = WORD_LEVELS[levelIndex].value;
    const x = interestingWord(n, random);
    let y = 0;
    do {
      y = interestingWord(n, random);
    } while (y === x);
    return wordProblem('xor', levelIndex, [{ name: 'x', kind: 'word', value: x }, { name: 'y', kind: 'word', value: y }], xor(x, y));
  },
  prompt(p) {
    return `Find x ⊕ y for these ${p.level}-bit words.`;
  },
  hints(p) {
    const n = p.level;
    const diff = toBinary(p.answer, n).split('').filter((b) => b === '1').length;
    return [
      'Look at one column at a time. If the two bits are the same, write 0. If they are different, write 1.',
      `x and y differ in ${diff} of the ${n} columns.`,
      `Write a 1 in each column where they differ. The answer is ${bin(p.answer, n)}.`,
    ];
  },
  worked(p) {
    const n = p.level;
    const answer = toBinary(p.answer, n);
    const differ = range(0, n).filter((i) => answer[i] === '1');
    return [
      { label: 'x', bits: toBinary(value(p, 'x'), n), marks: differ },
      { label: 'y', bits: toBinary(value(p, 'y'), n), marks: differ },
      { label: 'x ⊕ y', bits: answer, result: true },
    ];
  },
};

const addModN: Exercise = {
  id: 'add',
  title: 'Add modulo 2ⁿ',
  symbol: '⊞',
  stage: 'operations',
  summary: 'Add two words as unsigned numbers and keep only the last n bits.',
  rule: 'a ⊞ b = (a + b) mod 2ⁿ. Add as unsigned numbers and drop any carry out of the leftmost bit.',
  legend: 'The amber bit is the carry that gets dropped.',
  levels: WORD_LEVELS,
  generate(levelIndex, random = Math.random) {
    const n = WORD_LEVELS[levelIndex].value;
    const a = interestingWord(n, random);
    const b = interestingWord(n, random);
    return wordProblem('add', levelIndex, [{ name: 'a', kind: 'word', value: a }, { name: 'b', kind: 'word', value: b }], addMod(a, b, n));
  },
  prompt(p) {
    return `Add a and b modulo 2^${p.level}.`;
  },
  hints(p) {
    const n = p.level;
    const sum = value(p, 'a') + value(p, 'b');
    return [
      `Add the two words the way you would add unsigned numbers. The result keeps only the last ${n} bits, so a carry out of the leftmost bit is dropped.`,
      sum > mask(n)
        ? `The full sum is ${sum.toString(2)}, which is ${n + 1} bits long. The leading 1 is the carry that gets dropped.`
        : `The full sum is ${sum.toString(2).padStart(n, '0')}. It already fits in ${n} bits, so nothing is dropped.`,
      `Keep the last ${n} bits. The answer is ${bin(p.answer, n)}.`,
    ];
  },
  worked(p) {
    const n = p.level;
    const sum = value(p, 'a') + value(p, 'b');
    const rows: WorkedRow[] = [
      { label: 'a', bits: toBinary(value(p, 'a'), n) },
      { label: 'b', bits: toBinary(value(p, 'b'), n) },
    ];
    if (sum > mask(n)) {
      rows.push({ label: 'a + b', bits: sum.toString(2), marks: [0], note: `The carry out of bit ${n} is dropped` });
    }
    rows.push({ label: `mod 2^${n}`, bits: toBinary(p.answer, n), result: true });
    return rows;
  },
};

/* ---------------- SHA-256 functions ---------------- */

const choice: Exercise = {
  id: 'ch',
  title: 'Choice',
  symbol: 'Ch',
  stage: 'functions',
  summary: 'Use x to choose, bit by bit, between y and z.',
  rule: 'Ch(x, y, z) takes each bit from y where x has a 1, and from z where x has a 0.',
  legend: 'Amber bits show where each result bit comes from: y where x is 1, z where x is 0.',
  levels: WORD_LEVELS,
  generate(levelIndex, random = Math.random) {
    const n = WORD_LEVELS[levelIndex].value;
    const [x, y, z] = [interestingWord(n, random), interestingWord(n, random), interestingWord(n, random)];
    return wordProblem(
      'ch',
      levelIndex,
      [{ name: 'x', kind: 'word', value: x }, { name: 'y', kind: 'word', value: y }, { name: 'z', kind: 'word', value: z }],
      ch(x, y, z, n),
    );
  },
  prompt(p) {
    return `Find Ch(x, y, z) for these ${p.level}-bit words.`;
  },
  hints(p) {
    const n = p.level;
    const x = toBinary(value(p, 'x'), n);
    return [
      'Ch chooses one bit at a time. Where x has a 1, take the bit from y. Where x has a 0, take the bit from z.',
      `Reading x from left to right, the bits come from ${groupNibbles(x.replace(/1/g, 'y').replace(/0/g, 'z'))}.`,
      `Copy each bit from the word it comes from. The answer is ${bin(p.answer, n)}.`,
    ];
  },
  worked(p) {
    const n = p.level;
    const x = toBinary(value(p, 'x'), n);
    const ones = range(0, n).filter((i) => x[i] === '1');
    const zeros = range(0, n).filter((i) => x[i] === '0');
    return [
      { label: 'x', bits: x, marks: ones, note: 'Highlighted bits choose y' },
      { label: 'y', bits: toBinary(value(p, 'y'), n), marks: ones },
      { label: 'z', bits: toBinary(value(p, 'z'), n), marks: zeros },
      { label: 'Ch(x, y, z)', bits: toBinary(p.answer, n), result: true },
    ];
  },
};

const majority: Exercise = {
  id: 'maj',
  title: 'Majority',
  symbol: 'Maj',
  stage: 'functions',
  summary: 'Each result bit is whichever value appears in at least two of the three words.',
  rule: 'Maj(x, y, z) has a 1 in each column where at least two of x, y and z have a 1.',
  legend: 'Amber columns are the ones with at least two 1s.',
  levels: WORD_LEVELS,
  generate(levelIndex, random = Math.random) {
    const n = WORD_LEVELS[levelIndex].value;
    const [x, y, z] = [interestingWord(n, random), interestingWord(n, random), interestingWord(n, random)];
    return wordProblem(
      'maj',
      levelIndex,
      [{ name: 'x', kind: 'word', value: x }, { name: 'y', kind: 'word', value: y }, { name: 'z', kind: 'word', value: z }],
      maj(x, y, z, n),
    );
  },
  prompt(p) {
    return `Find Maj(x, y, z) for these ${p.level}-bit words.`;
  },
  hints(p) {
    const n = p.level;
    const [x, y, z] = ['x', 'y', 'z'].map((k) => toBinary(value(p, k), n));
    const counts = range(0, n)
      .map((i) => String(Number(x[i]) + Number(y[i]) + Number(z[i])))
      .join('');
    return [
      'Look at one column at a time and count the 1s. Two or three 1s give a 1. Zero or one gives a 0.',
      `Counting the 1s in each column from left to right gives ${groupNibbles(counts)}.`,
      `Write a 1 wherever the count is 2 or 3. The answer is ${bin(p.answer, n)}.`,
    ];
  },
  worked(p) {
    const n = p.level;
    const answer = toBinary(p.answer, n);
    const majorityOnes = range(0, n).filter((i) => answer[i] === '1');
    return [
      { label: 'x', bits: toBinary(value(p, 'x'), n), marks: majorityOnes },
      { label: 'y', bits: toBinary(value(p, 'y'), n), marks: majorityOnes },
      { label: 'z', bits: toBinary(value(p, 'z'), n), marks: majorityOnes },
      { label: 'Maj(x, y, z)', bits: answer, result: true },
    ];
  },
};

function sigmaExercise(id: 'sigma0' | 'sigma1', amounts: readonly number[], fn: (x: number, n: number) => number): Exercise {
  const name = id === 'sigma0' ? 'Σ₀' : 'Σ₁';
  const [a1, a2, a3] = amounts;
  const sup = (k: number) => String(k).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
  const formula = `${name}(x) = ROTR${sup(a1)}(x) ⊕ ROTR${sup(a2)}(x) ⊕ ROTR${sup(a3)}(x)`;
  return {
    id,
    title: id === 'sigma0' ? 'Sigma 0' : 'Sigma 1',
    symbol: id === 'sigma0' ? 'Σ0' : 'Σ1',
    stage: 'functions',
    summary: `XOR three right rotations of the same word: by ${a1}, ${a2} and ${a3} places.`,
    rule: `${formula}. In a word smaller than 32 bits, each amount wraps around the word size.`,
    legend: 'Amber bits in each rotation are the ones that wrapped around from the right end.',
    levels: WORD_LEVELS,
    generate(levelIndex, random = Math.random) {
      const n = WORD_LEVELS[levelIndex].value;
      const x = interestingWord(n, random);
      return wordProblem(id, levelIndex, [{ name: 'x', kind: 'word', value: x }], fn(x, n));
    },
    prompt(p) {
      return `Find ${name}(x) for this ${p.level}-bit word.`;
    },
    hints(p) {
      const n = p.level;
      const x = value(p, 'x');
      const [r1, r2, r3] = reducedAmounts(amounts, n);
      const widthNote =
        n === 32
          ? 'At 32 bits these are the amounts from FIPS 180-4.'
          : `In ${article(n)} ${n}-bit word each amount wraps around the word size, so rotate by ${r1}, ${r2} and ${r3}.`;
      return [
        `${formula}. ${widthNote}`,
        `The three rotations are ${bin(rotr(x, r1, n), n)}, ${bin(rotr(x, r2, n), n)} and ${bin(rotr(x, r3, n), n)}.`,
        `XOR them bit by bit: a 1 where an odd number of them have a 1. The answer is ${bin(p.answer, n)}.`,
      ];
    },
    worked(p) {
      const n = p.level;
      const x = value(p, 'x');
      return [
        { label: 'x', bits: toBinary(x, n) },
        ...reducedAmounts(amounts, n).map((r, i) => ({
          label: `ROTR${r}(x)`,
          bits: toBinary(rotr(x, r, n), n),
          marks: range(0, r),
          note: n === 32 ? undefined : `${amounts[i]} mod ${n} = ${r}`,
        })),
        { label: `${name}(x)`, bits: toBinary(p.answer, n), note: 'XOR of the three rows', result: true },
      ];
    },
  };
}

export const EXERCISES: readonly Exercise[] = [
  encode,
  padding,
  rotateRight,
  shiftRight,
  exclusiveOr,
  addModN,
  choice,
  majority,
  sigmaExercise('sigma0', SIGMA0_AMOUNTS, bigSigma0),
  sigmaExercise('sigma1', SIGMA1_AMOUNTS, bigSigma1),
];

export function exerciseById(id: ExerciseId): Exercise {
  const found = EXERCISES.find((e) => e.id === id);
  if (!found) {
    throw new Error(`Unknown exercise ${id}`);
  }
  return found;
}

export function isExerciseId(id: string): id is ExerciseId {
  return EXERCISES.some((e) => e.id === id);
}

/** The answer written the way the student would enter it. */
export function formatAnswer(problem: Problem): string {
  return problem.answerKind === 'bits' ? toBinary(problem.answer, problem.answerWidth) : String(problem.answer);
}
