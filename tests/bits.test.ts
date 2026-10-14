import { describe, expect, it } from 'vitest';
import { addMod, ch, maj, parseBinary, rotr, shr, toBinary } from '../src/engine/bits';

describe('rotr', () => {
  it('wraps the low bits to the front', () => {
    expect(toBinary(rotr(0b1011, 1, 4), 4)).toBe('1101');
    expect(toBinary(rotr(0b10110011, 3, 8), 8)).toBe('01110110');
  });

  it('keeps 32-bit results unsigned', () => {
    expect(rotr(0x00000001, 1, 32)).toBe(0x80000000);
    expect(rotr(0xffffffff, 7, 32)).toBe(0xffffffff);
  });

  it('treats a full rotation and a negative rotation correctly', () => {
    expect(rotr(0b1011, 4, 4)).toBe(0b1011);
    expect(rotr(0b1011, -1, 4)).toBe(rotr(0b1011, 3, 4));
  });

  it('rejects widths outside 1 to 32', () => {
    expect(() => rotr(1, 1, 0)).toThrow(RangeError);
    expect(() => rotr(1, 1, 33)).toThrow(RangeError);
  });
});

describe('shr and addMod', () => {
  it('shifts in zeros and drops everything when shifting by the width', () => {
    expect(shr(0b1011, 2, 4)).toBe(0b0010);
    expect(shr(0b1011, 4, 4)).toBe(0);
  });

  it('drops the carry out of the top bit', () => {
    expect(toBinary(addMod(0b1110, 0b0011, 4), 4)).toBe('0001');
    expect(addMod(0xffffffff, 1, 32)).toBe(0);
    expect(addMod(0xff, 0x01, 8)).toBe(0);
  });
});

describe('ch and maj', () => {
  it('match the textbook truth tables', () => {
    expect(toBinary(ch(0b1100, 0b1010, 0b0110, 4), 4)).toBe('1010');
    expect(toBinary(maj(0b1100, 0b1010, 0b0110, 4), 4)).toBe('1110');
  });
});

describe('parseBinary', () => {
  it('accepts spaces and checks the length', () => {
    expect(parseBinary('1011 0011', 8)).toEqual({ ok: true, value: 0b10110011, digits: '10110011' });
    expect(parseBinary('101', 4)).toMatchObject({ ok: false });
    expect(parseBinary('10a1', 4)).toMatchObject({ ok: false, reason: 'Use only the digits 0 and 1.' });
    expect(parseBinary('', 4)).toMatchObject({ ok: false });
  });
});
