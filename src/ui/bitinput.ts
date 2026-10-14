import { h } from './dom';

type Cell = '' | '0' | '1';

let inputCount = 0;

export interface BitInput {
  element: HTMLElement;
  /** The answer as a binary string, or null while any tile is empty. */
  value(): string | null;
  filled(): number;
  /** Outline these positions (0 = leftmost) in red until the next edit. */
  markWrong(positions: number[]): void;
  setDisabled(disabled: boolean): void;
  focus(): void;
}

/**
 * Answer entry as a row of bit tiles. Click a tile to flip it, or focus the
 * row and type 0 and 1. Arrow keys move, Backspace clears, Enter submits and
 * pasting a binary string fills the row.
 */
export function bitInput(width: number, onChange: () => void, onEnter: () => void): BitInput {
  const cells: Cell[] = Array.from({ length: width }, () => '');
  const uid = `bits-${++inputCount}`;
  let cursor = 0;
  let disabled = false;
  let wrong = new Set<number>();

  const group = h('div', {
    class: 'bitinput',
    role: 'group',
    tabindex: '0',
    'aria-label': `Your answer, ${width} bits. Type 0 and 1, or click a tile to flip it.`,
  });
  const tiles: HTMLButtonElement[] = [];
  // Screen readers hear the bit under the cursor after each key, since focus stays on the group.
  const announcer = h('span', { class: 'visually-hidden', 'aria-live': 'polite' });

  const label = (i: number) => {
    const state = cells[i] === '' ? 'empty' : cells[i];
    return `Bit ${i + 1} of ${width}: ${state}${wrong.has(i) ? ', wrong' : ''}`;
  };

  const paint = () => {
    tiles.forEach((tile, i) => {
      tile.className = ['tile', cells[i] === '' ? 'empty' : cells[i] === '1' ? 'one' : 'zero', i === cursor ? 'cursor' : '', wrong.has(i) ? 'wrong' : '']
        .filter(Boolean)
        .join(' ');
      tile.textContent = cells[i];
      tile.setAttribute('aria-label', label(i));
    });
    group.setAttribute('aria-activedescendant', `${uid}-${cursor}`);
  };

  const announce = (i: number) => {
    announcer.textContent = label(i);
  };

  const changed = () => {
    wrong = new Set();
    paint();
    onChange();
  };

  const set = (i: number, cell: Cell) => {
    cells[i] = cell;
    changed();
  };

  const firstGroup = width % 4 || 4;
  let nibble = h('span', { class: 'nibble' });
  for (let i = 0; i < width; i++) {
    if (i > 0 && (i - firstGroup) % 4 === 0) {
      group.appendChild(nibble);
      nibble = h('span', { class: 'nibble' });
    }
    const tile = h('button', { type: 'button', tabindex: '-1', class: 'tile empty', id: `${uid}-${i}` });
    tile.addEventListener('click', () => {
      if (disabled) return;
      cursor = i;
      set(i, cells[i] === '1' ? '0' : '1');
      group.focus();
    });
    tiles.push(tile);
    nibble.appendChild(tile);
  }
  group.appendChild(nibble);
  group.appendChild(announcer);

  group.addEventListener('keydown', (event) => {
    if (disabled) return;
    const key = event.key;
    // Typing a bit confirms that bit; moving announces where the cursor lands.
    let spoken = cursor;
    if (key === '0' || key === '1') {
      set(cursor, key);
      spoken = cursor;
      cursor = Math.min(width - 1, cursor + 1);
      paint();
    } else if (key === 'Backspace') {
      if (cells[cursor] === '' && cursor > 0) {
        cursor -= 1;
      }
      set(cursor, '');
    } else if (key === 'Delete') {
      set(cursor, '');
    } else if (key === 'ArrowLeft') {
      cursor = Math.max(0, cursor - 1);
      paint();
    } else if (key === 'ArrowRight') {
      cursor = Math.min(width - 1, cursor + 1);
      paint();
    } else if (key === 'Home') {
      cursor = 0;
      paint();
    } else if (key === 'End') {
      cursor = width - 1;
      paint();
    } else if (key === ' ') {
      set(cursor, cells[cursor] === '1' ? '0' : '1');
    } else if (key === 'Enter') {
      onEnter();
      event.preventDefault();
      return;
    } else {
      return;
    }
    event.preventDefault();
    announce(key === '0' || key === '1' ? spoken : cursor);
  });

  group.addEventListener('paste', (event) => {
    if (disabled) return;
    const digits = (event.clipboardData?.getData('text') ?? '').replace(/[^01]/g, '').slice(0, width);
    if (digits.length === 0) return;
    event.preventDefault();
    [...digits].forEach((d, i) => (cells[i] = d as Cell));
    cursor = Math.min(width - 1, digits.length);
    changed();
  });

  paint();

  return {
    element: group,
    value: () => (cells.every((c) => c !== '') ? cells.join('') : null),
    filled: () => cells.filter((c) => c !== '').length,
    markWrong(positions) {
      wrong = new Set(positions);
      paint();
    },
    setDisabled(value) {
      disabled = value;
      group.classList.toggle('disabled', value);
      group.setAttribute('aria-disabled', String(value));
      group.tabIndex = value ? -1 : 0;
    },
    focus: () => group.focus(),
  };
}
