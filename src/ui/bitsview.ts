import { h } from './dom';

export interface BitRowOptions {
  /** Positions (0 = leftmost) drawn in amber. */
  marks?: number[];
  /** Positions drawn in red. */
  wrong?: number[];
  /** Small tiles without digits, for 32-bit registers. */
  compact?: boolean;
  /** Narrower tiles with digits, so a 32-bit word fits on one line. */
  dense?: boolean;
}

/**
 * Draw a binary string as tiles: filled for 1, hollow for 0. Groups of four
 * are counted from the right, so rows of different lengths line up by bit.
 */
export function bitRow(bits: string, options: BitRowOptions = {}): HTMLElement {
  const marks = new Set(options.marks ?? []);
  const wrong = new Set(options.wrong ?? []);
  const row = h('span', {
    class: options.compact ? 'bits compact' : options.dense ? 'bits dense' : 'bits',
    role: 'img',
    'aria-label': `binary ${bits.replace(/(?=(?:.{4})+$)/g, ' ').trim()}`,
  });

  const firstGroup = bits.length % 4 || 4;
  let group = h('span', { class: 'nibble', 'aria-hidden': 'true' });
  [...bits].forEach((bit, i) => {
    if (i > 0 && (i - firstGroup) % 4 === 0) {
      row.appendChild(group);
      group = h('span', { class: 'nibble', 'aria-hidden': 'true' });
    }
    const classes = ['bit'];
    if (bit === '1') classes.push('one');
    if (marks.has(i)) classes.push('mark');
    if (wrong.has(i)) classes.push('wrong');
    group.appendChild(h('span', { class: classes.join(' ') }, options.compact ? '' : bit));
  });
  row.appendChild(group);
  return row;
}

/** The small header logo: "S" (0x53) as eight bit tiles. */
export function logoMark(): HTMLElement {
  const bits = '01010011';
  return h(
    'span',
    { class: 'mark', 'aria-hidden': 'true' },
    [...bits].map((bit) => h('span', { class: bit === '1' ? 'on' : '' })),
  );
}
