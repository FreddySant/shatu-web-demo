import { EXERCISES, type ExerciseId } from '../engine/exercises';
import { mastery, overall, record } from '../engine/progress';
import { h, replace } from './dom';
import { levelMeter, shortDate } from './meters';
import { icon } from './overlay';
import { getProgress, subscribe } from './store';
import type { View } from './types';

type Column = 'order' | 'skill' | 'level' | 'mastery' | 'solved' | 'checks' | 'hints' | 'last';

interface Row {
  id: ExerciseId;
  order: number;
  skill: string;
  symbol: string;
  level: number;
  levelText: string;
  mastery: number;
  solved: number;
  checks: number;
  hints: number;
  last: number;
}

const COLUMNS: { id: Column; label: string; numeric?: boolean }[] = [
  { id: 'skill', label: 'Skill' },
  { id: 'level', label: 'Level' },
  { id: 'mastery', label: 'Mastery', numeric: true },
  { id: 'solved', label: 'Solved', numeric: true },
  { id: 'checks', label: 'Checks', numeric: true },
  { id: 'hints', label: 'Hints', numeric: true },
  { id: 'last', label: 'Last practiced' },
];

export function progressView(onReset: () => void): View {
  let sortBy: Column = 'order';
  let ascending = true;
  let selected: ExerciseId = EXERCISES[0].id;

  const openTool = h('button', { type: 'button', class: 'tool primary', title: 'Practice the selected skill (Enter)' }, icon('practice', 16), h('span', { class: 'tool-label' }, 'Practice skill'));
  const resetTool = h('button', { type: 'button', class: 'tool', title: 'Start every skill again from level 1' }, icon('reset', 16), h('span', { class: 'tool-label' }, 'Reset progress'));
  const toolbar = h('div', { class: 'toolbar-group' }, openTool, h('span', { class: 'tool-sep', role: 'separator' }), resetTool);
  const table = h('table', { class: 'grid data-grid', 'aria-label': 'Progress by skill' });
  const body = h('div', { class: 'doc-body grid-doc' }, h('div', { class: 'table-wrap' }, table));

  const rows = (): Row[] => {
    const progress = getProgress();
    return EXERCISES.map((e, order) => {
      const r = record(progress, e.id);
      return {
        id: e.id,
        order,
        skill: e.title,
        symbol: e.symbol,
        level: r.mastered ? e.levels.length : r.level,
        levelText: r.mastered ? 'Mastered' : r.attempts === 0 ? 'Not started' : e.levels[r.level].label,
        mastery: Math.round(mastery(progress, e.id) * 100),
        solved: r.correct,
        checks: r.attempts,
        hints: r.hints,
        last: r.lastPracticed,
      };
    });
  };

  const sorted = (): Row[] => {
    const key = (row: Row): number | string => (sortBy === 'skill' ? row.skill : row[sortBy]);
    return rows().sort((a, b) => {
      const x = key(a);
      const y = key(b);
      const cmp = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x as number) - (y as number);
      return (ascending ? cmp : -cmp) || a.order - b.order;
    });
  };

  const openSkill = (id: ExerciseId) => {
    location.hash = `#/app/practice/${id}`;
  };

  /** Moves the selection without rebuilding the table, so a double-click lands on the same row. */
  const select = (id: ExerciseId, focus: boolean) => {
    selected = id;
    table.querySelectorAll<HTMLElement>('tbody tr').forEach((tr) => {
      const on = tr.dataset.id === id;
      tr.setAttribute('aria-selected', String(on));
      tr.setAttribute('tabindex', on ? '0' : '-1');
      if (on && focus) tr.focus();
    });
  };

  const render = () => {
    const progress = getProgress();
    const list = sorted();
    replace(
      table,
      h(
        'thead',
        null,
        h(
          'tr',
          null,
          COLUMNS.map((c) =>
            h(
              'th',
              { scope: 'col', class: c.numeric ? 'num' : '', 'aria-sort': sortBy === c.id ? (ascending ? 'ascending' : 'descending') : undefined },
              h(
                'button',
                {
                  type: 'button',
                  class: 'sort',
                  onclick: () => {
                    if (sortBy === c.id) ascending = !ascending;
                    else {
                      sortBy = c.id;
                      ascending = !c.numeric;
                    }
                    render();
                  },
                },
                c.label,
                sortBy === c.id ? h('span', { class: ascending ? 'sort-mark up' : 'sort-mark' }, icon('chevron', 12)) : null,
              ),
            ),
          ),
        ),
      ),
      h(
        'tbody',
        null,
        list.map((row) => {
          const tr = h(
            'tr',
            {
              'data-id': row.id,
              tabindex: row.id === selected ? '0' : '-1',
              'aria-selected': String(row.id === selected),
              onclick: () => select(row.id, true),
              ondblclick: () => openSkill(row.id),
              onkeydown: (event: KeyboardEvent) => {
                const all = [...table.querySelectorAll<HTMLElement>('tbody tr')];
                const at = all.indexOf(event.currentTarget as HTMLElement);
                if (event.key === 'Enter') openSkill(row.id);
                else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  const next = all[at + (event.key === 'ArrowDown' ? 1 : -1)];
                  if (next) select(next.dataset.id as ExerciseId, true);
                }
              },
            },
            h('td', null, h('span', { class: 'sym' }, row.symbol), row.skill),
            h('td', null, h('span', { class: 'level-cell' }, levelMeter(progress, row.id), row.levelText)),
            h('td', { class: 'num' }, h('span', { class: 'bar' }, h('span', { style: `width:${row.mastery}%` })), h('span', { class: 'bar-value' }, `${row.mastery}%`)),
            h('td', { class: 'num' }, String(row.solved)),
            h('td', { class: 'num' }, String(row.checks)),
            h('td', { class: 'num' }, String(row.hints)),
            h('td', { class: 'nowrap' }, shortDate(row.last)),
          );
          return tr;
        }),
      ),
    );
  };

  openTool.addEventListener('click', () => openSkill(selected));
  resetTool.addEventListener('click', onReset);
  render();
  const stop = subscribe(render);

  return {
    key: 'progress',
    icon: 'table',
    title: () => 'Progress',
    path: () => ['Reports', 'Progress'],
    info: () => {
      const t = overall(getProgress());
      return `${t.percent}% of the course, ${t.mastered} of ${EXERCISES.length} skills mastered`;
    },
    route: () => '#/app/progress',
    toolbar,
    body,
    tabs: {},
    properties: () => {
      const t = overall(getProgress());
      return [
        ['Course', `${t.percent}%`],
        ['Skills mastered', `${t.mastered} of ${EXERCISES.length}`],
        ['Skills started', `${t.started} of ${EXERCISES.length}`],
        ['Problems solved', String(t.solved)],
        ['Checks', String(t.checks)],
        ['Checks right', t.checks === 0 ? '—' : `${Math.round((t.solved / t.checks) * 100)}%`],
        ['Hints used', String(t.hints)],
      ];
    },
    status: () => ['Progress report'],
    activate: () => requestAnimationFrame(() => (table.querySelector('tr[aria-selected="true"]') as HTMLElement | null)?.focus()),
    dispose: stop,
  };
}
