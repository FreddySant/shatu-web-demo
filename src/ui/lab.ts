import { ch, maj, toBinary } from '../engine/bits';
import { K, REGISTER_NAMES, sha256Trace, utf8, wordHex, type Sha256Trace } from '../engine/sha256';
import { bigSigma0, bigSigma1, smallSigma0, smallSigma1 } from '../engine/sigma';
import { bitRow } from './bitsview';
import { fmt, h, replace } from './dom';
import { icon } from './overlay';
import type { Shell, View } from './types';

const MAX_LENGTH = 200;

export const LAB_STEPS = [
  { id: 'message', title: 'Message' },
  { id: 'padding', title: 'Padding' },
  { id: 'schedule', title: 'Schedule' },
  { id: 'rounds', title: 'Rounds' },
  { id: 'digest', title: 'Digest' },
] as const;

type StepId = (typeof LAB_STEPS)[number]['id'];

/** Why each register holds its value after a round (FIPS 180-4, 6.2.2 step 3). */
const REGISTER_SOURCE = ['T1 + T2', 'was a', 'was b', 'was c', 'd + T1', 'was e', 'was f', 'was g'];

/* The lab keeps its state while the app is open. */
let message = 'abc';
let block = 0;
let round = 0;
let selectedWord = 16;

function printable(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? (byte === 0x20 ? '(space)' : String.fromCharCode(byte)) : '(not plain ASCII)';
}

async function webCryptoHex(bytes: Uint8Array): Promise<string | null> {
  if (!globalThis.crypto?.subtle) {
    return null;
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function labStepFrom(param: string | undefined): StepId {
  if (param === 'length') return 'padding';
  return LAB_STEPS.some((s) => s.id === param) ? (param as StepId) : 'message';
}

function section(title: string, ...content: (Node | string | null)[]): HTMLElement {
  return h('section', { class: 'lab-section' }, h('h3', { class: 'section-title' }, title), ...content);
}

function kv(rows: [string, string | Node][]): HTMLElement {
  return h('dl', { class: 'kv-list' }, rows.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v))));
}

export function labView(shell: Shell, param?: string): View {
  let step: StepId = labStepFrom(param);
  let trace: Sha256Trace = sha256Trace(utf8(message));

  const input = h('input', { type: 'text', class: 'tool-input', value: message, maxlength: String(MAX_LENGTH), autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Message' });
  const info = h('span', { class: 'tool-info' });
  const prevTool = h('button', { type: 'button', class: 'tool', title: 'Previous step ([)' }, icon('arrowLeft', 16), h('span', { class: 'tool-label' }, 'Previous'));
  const nextTool = h('button', { type: 'button', class: 'tool', title: 'Next step (])' }, h('span', { class: 'tool-label' }, 'Next'), icon('arrowRight', 16));
  const toolbar = h(
    'div',
    { class: 'toolbar-group' },
    h('label', { class: 'tool-field grow' }, h('span', { class: 'tool-label' }, 'Message'), input),
    info,
    h('span', { class: 'tool-sep', role: 'separator' }),
    prevTool,
    nextTool,
  );
  const panel = h('div', { class: 'lab-panel' });
  const body = h('div', { class: 'doc-body lab-doc' }, panel);

  const messageStep = () => {
    const shown = Array.from(trace.message.slice(0, 16));
    return [
      section(
        'Bytes (UTF-8)',
        trace.message.length === 0
          ? h('p', { class: 'muted small' }, 'Empty message: no bytes. It is still padded to one block.')
          : h(
              'div',
              { class: 'table-wrap' },
              h(
                'table',
                { class: 'grid byte-table' },
                h('thead', null, h('tr', null, ['#', 'Character', 'Decimal', 'Hex', 'Binary'].map((t) => h('th', { scope: 'col' }, t)))),
                h(
                  'tbody',
                  null,
                  shown.map((byte, i) => h('tr', null, h('td', { class: 'num' }, String(i)), h('td', null, printable(byte)), h('td', { class: 'num mono' }, String(byte)), h('td', { class: 'mono' }, byte.toString(16).padStart(2, '0')), h('td', null, bitRow(toBinary(byte, 8), { dense: true })))),
                ),
              ),
            ),
        trace.message.length > 16 ? h('p', { class: 'muted small' }, `First 16 of ${trace.message.length} bytes.`) : null,
      ),
    ];
  };

  const paddingStep = () => {
    const bits = Array.from(trace.message, (b) => toBinary(b, 8)).join('');
    const tail = bits.length > 32 ? bits.slice(-32) : bits;
    const hi = Math.floor(trace.bitLength / 2 ** 32);
    const lo = trace.bitLength >>> 0;
    return [
      section('Message bits, then a 1 bit', bitRow(tail + '1', { marks: [tail.length] }), bits.length > 32 ? h('p', { class: 'muted small' }, 'Last 32 message bits, then the added 1.') : null),
      section('Zero bits', h('p', { class: 'formula' }, `k = (448 − (L + 1)) mod 512 = (448 − ${fmt(trace.bitLength + 1)}) mod 512 = ${trace.zeroBits}`)),
      section('Length L as 64 bits', bitRow(toBinary(hi, 32) + toBinary(lo, 32), { compact: true }), kv([['Hex', `${wordHex(hi)} ${wordHex(lo)}`]])),
      section('Result', kv([['L', `${fmt(trace.bitLength)} bits`], ['Padded', `${fmt(trace.padded.length * 8)} bits`], ['Blocks', `${trace.blocks.length} of 512 bits`]])),
    ];
  };

  const blockPicker = () =>
    trace.blocks.length > 1
      ? h(
          'div',
          { class: 'segmented', role: 'group', 'aria-label': 'Block' },
          trace.blocks.map((b) =>
            h(
              'button',
              {
                type: 'button',
                'aria-pressed': b.index === block ? 'true' : 'false',
                onclick: () => {
                  block = b.index;
                  renderPanel();
                  shell.refresh();
                  (panel.querySelector('.segmented [aria-pressed="true"]') as HTMLElement | null)?.focus();
                },
              },
              `Block ${b.index + 1}`,
            ),
          ),
        )
      : null;

  const scheduleStep = () => {
    const w = trace.blocks[block].schedule;
    const t = selectedWord;
    const detail =
      t < 16
        ? h('p', { class: 'formula' }, `W${t} = word ${t} of the block = ${wordHex(w[t])}`)
        : h(
            'p',
            { class: 'formula' },
            `W${t} = σ1(W${t - 2}) + W${t - 7} + σ0(W${t - 15}) + W${t - 16}`,
            h('br'),
            `    = ${wordHex(smallSigma1(w[t - 2]))} + ${wordHex(w[t - 7])} + ${wordHex(smallSigma0(w[t - 15]))} + ${wordHex(w[t - 16])}`,
            h('br'),
            `    = ${wordHex(w[t])}  (mod 2^32)`,
          );
    return [
      blockPicker(),
      section(
        'W0 to W63',
        h(
          'div',
          { class: 'schedule' },
          w.map((value, i) =>
            h(
              'button',
              {
                type: 'button',
                class: i < 16 ? 'input' : '',
                'aria-pressed': i === t ? 'true' : 'false',
                'aria-label': `W${i} = ${wordHex(value)}`,
                onclick: () => {
                  selectedWord = i;
                  renderPanel();
                  shell.refresh();
                  (panel.querySelector('.schedule [aria-pressed="true"]') as HTMLElement | null)?.focus();
                },
              },
              h('small', null, `W${i}`),
              wordHex(value),
            ),
          ),
        ),
      ),
      section(`W${t}`, detail),
    ];
  };

  const roundsStep = () => {
    const b = trace.blocks[block];
    const state = b.rounds[round];
    const before = round === 0 ? b.start : b.rounds[round - 1].registers;
    const [a, bb, c, , e, f, g, hh] = before;
    const slider = h('input', { type: 'range', min: '0', max: '63', value: String(round), 'aria-label': 'Round', id: 'round' });
    slider.addEventListener('input', () => {
      round = Number(slider.value);
      renderPanel('#round');
      shell.refresh();
    });
    const go = (delta: number) => () => {
      round = Math.min(63, Math.max(0, round + delta));
      renderPanel(round === 0 ? '#next-round' : round === 63 ? '#prev-round' : delta < 0 ? '#prev-round' : '#next-round');
      shell.refresh();
    };
    return [
      blockPicker(),
      h(
        'div',
        { class: 'round-controls' },
        h('button', { class: 'btn quiet small-btn', type: 'button', id: 'prev-round', onclick: go(-1), disabled: round === 0 }, 'Previous'),
        slider,
        h('output', { for: 'round' }, `Round ${round} of 63`),
        h('button', { class: 'btn quiet small-btn', type: 'button', id: 'next-round', onclick: go(1), disabled: round === 63 }, 'Next'),
      ),
      section(
        'Temporary words',
        h(
          'p',
          { class: 'formula' },
          `T1 = h + Σ1(e) + Ch(e, f, g) + K${round} + W${round}`,
          h('br'),
          `   = ${wordHex(hh)} + ${wordHex(bigSigma1(e))} + ${wordHex(ch(e, f, g, 32))} + ${wordHex(K[round])} + ${wordHex(b.schedule[round])} = ${wordHex(state.t1)}`,
          h('br'),
          `T2 = Σ0(a) + Maj(a, b, c) = ${wordHex(bigSigma0(a))} + ${wordHex(maj(a, bb, c, 32))} = ${wordHex(state.t2)}`,
        ),
      ),
      section(
        `Working variables after round ${round}`,
        h(
          'div',
          { class: 'registers' },
          state.registers.map((value, i) =>
            h(
              'div',
              { class: i === 0 || i === 4 ? 'register changed' : 'register' },
              h('span', { class: 'name' }, REGISTER_NAMES[i]),
              bitRow(toBinary(value, 32), { compact: true, marks: i === 0 || i === 4 ? Array.from({ length: 32 }, (_, j) => j) : [] }),
              h('span', { class: 'hexval' }, wordHex(value)),
              h('span', { class: 'why' }, REGISTER_SOURCE[i]),
            ),
          ),
        ),
      ),
    ];
  };

  const digestStep = () => {
    const status = h('p', { class: 'status', role: 'status' }, h('span', { class: 'dot' }), h('span', null, 'Checking against Web Crypto'));
    void webCryptoHex(trace.message).then((theirs) => {
      const label = status.lastElementChild as HTMLElement;
      if (theirs === null) {
        label.textContent = 'Web Crypto is not available here, so this result was not cross-checked.';
      } else if (theirs === trace.hex) {
        status.className = 'status ok';
        label.textContent = "Matches the browser's built-in SHA-256";
      } else {
        status.className = 'status bad';
        label.textContent = `Does not match the browser's SHA-256 (${theirs})`;
      }
    });
    const last = trace.blocks[trace.blocks.length - 1];
    return [
      section('H0 to H7 after the last block', h('div', { class: 'hash-words' }, last.end.map((value, i) => h('div', { class: 'word' }, h('span', { class: 'name' }, `H${i}`), h('span', { class: 'hex' }, wordHex(value)))))),
      section('Digest', h('p', { class: 'formula digest-line' }, trace.hex), status),
    ];
  };

  const index = () => LAB_STEPS.findIndex((s) => s.id === step);

  function renderPanel(focus?: string) {
    const content = { message: messageStep, padding: paddingStep, schedule: scheduleStep, rounds: roundsStep, digest: digestStep }[step]();
    replace(panel, content);
    prevTool.disabled = index() === 0;
    nextTool.disabled = index() === LAB_STEPS.length - 1;
    if (focus) (panel.querySelector(focus) as HTMLElement | null)?.focus();
  }

  function select(id: string) {
    const next = labStepFrom(id);
    if (next === step) return;
    step = next;
    history.replaceState(null, '', `#/app/lab/${step}`);
    renderPanel();
    shell.refresh();
  }

  const updateInfo = () => {
    const bytes = trace.message.length;
    info.textContent = `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}, ${trace.blocks.length} ${trace.blocks.length === 1 ? 'block' : 'blocks'}`;
  };

  let timer = 0;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      message = input.value;
      trace = sha256Trace(utf8(message));
      block = Math.min(block, trace.blocks.length - 1);
      updateInfo();
      renderPanel();
      shell.refresh();
    }, 150);
  });
  input.addEventListener('change', () => {
    if (input.value !== message) {
      window.clearTimeout(timer);
      message = input.value;
      trace = sha256Trace(utf8(message));
      block = Math.min(block, trace.blocks.length - 1);
      updateInfo();
      renderPanel();
      shell.refresh();
    }
    shell.log(`Hash Lab: "${message}" is ${trace.hex}`);
  });
  prevTool.addEventListener('click', () => select(LAB_STEPS[Math.max(0, index() - 1)].id));
  nextTool.addEventListener('click', () => select(LAB_STEPS[Math.min(LAB_STEPS.length - 1, index() + 1)].id));

  updateInfo();
  renderPanel();

  return {
    key: 'lab',
    icon: 'lab',
    title: () => 'Hash Lab',
    path: () => ['Hash Lab', `${index() + 1}. ${LAB_STEPS[index()].title}`],
    info: () => (step === 'rounds' ? `Block ${block + 1}, round ${round} of 63` : step === 'schedule' ? `Block ${block + 1}, W${selectedWord}` : `Step ${index() + 1} of ${LAB_STEPS.length}`),
    route: () => `#/app/lab/${step}`,
    toolbar,
    body,
    tabs: {},
    properties: () => [
      ['Message', message === '' ? '(empty)' : message],
      ['Bytes', String(trace.message.length)],
      ['Length L', `${fmt(trace.bitLength)} bits`],
      ['Zero bits k', String(trace.zeroBits)],
      ['Blocks', String(trace.blocks.length)],
      ['Step', `${index() + 1} of ${LAB_STEPS.length}: ${LAB_STEPS[index()].title}`],
      ['Block', `${block + 1} of ${trace.blocks.length}`],
      ['Round', String(round)],
      ['Digest', h('span', { class: 'mono wrap' }, trace.hex)],
    ],
    status: () => [`Hash Lab: ${LAB_STEPS[index()].title}`, `${trace.message.length} bytes`],
    lab: { steps: LAB_STEPS, current: () => step, select },
    open: (next) => select(next ?? step),
    dispose: () => window.clearTimeout(timer),
  };
}
