import type { Cloud, StudentRecord } from '../cloud/service';
import { EXERCISES } from '../engine/exercises';
import { overall, record } from '../engine/progress';
import { h, replace } from './dom';
import { shortDate } from './meters';
import { icon } from './overlay';
import type { Shell, View } from './types';

type Column = 'name' | 'email' | 'percent' | 'mastered' | 'solved' | 'checks' | 'hints' | 'updated';

interface Row {
  uid: string;
  name: string;
  email: string;
  percent: number;
  mastered: number;
  solved: number;
  checks: number;
  hints: number;
  updated: number;
  student: StudentRecord;
}

const COLUMNS: { id: Column; label: string; numeric?: boolean }[] = [
  { id: 'name', label: 'Student' },
  { id: 'email', label: 'Email' },
  { id: 'percent', label: 'Course', numeric: true },
  { id: 'mastered', label: 'Mastered', numeric: true },
  { id: 'solved', label: 'Solved', numeric: true },
  { id: 'checks', label: 'Checks', numeric: true },
  { id: 'hints', label: 'Hints', numeric: true },
  { id: 'updated', label: 'Last active' },
];

/** What a student has reached in one skill, in words. */
function skillState(student: StudentRecord, index: number): string {
  const e = EXERCISES[index];
  const r = record(student.progress, e.id);
  if (r.mastered) return 'Mastered';
  if (r.attempts === 0) return 'Not started';
  return `Level ${r.level + 1}: ${e.levels[r.level].label}`;
}

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

/** Reports > Class progress: every student's progress, for instructors. */
export function classView(shell: Shell, cloud: Cloud): View {
  let students: StudentRecord[] = [];
  let loading = false;
  let failure = '';
  let loadedAt = 0;
  let sortBy: Column = 'name';
  let ascending = true;
  let selected = '';

  const refreshTool = h('button', { type: 'button', class: 'tool primary', title: 'Load the latest progress from the database' }, icon('refresh', 16), h('span', { class: 'tool-label' }, 'Refresh'));
  const exportTool = h('button', { type: 'button', class: 'tool', title: 'Save the class progress as a CSV file' }, icon('table', 16), h('span', { class: 'tool-label' }, 'Export CSV'));
  const toolbar = h('div', { class: 'toolbar-group' }, refreshTool, exportTool);
  const summary = h('div', { class: 'verify-summary', role: 'status' });
  const table = h('table', { class: 'grid data-grid', 'aria-label': 'Class progress' });
  const body = h('div', { class: 'doc-body grid-doc' }, summary, h('div', { class: 'table-wrap' }, table));

  const rows = (): Row[] =>
    students.map((s) => {
      const t = overall(s.progress);
      return { uid: s.uid, name: s.displayName, email: s.email, percent: t.percent, mastered: t.mastered, solved: t.solved, checks: t.checks, hints: t.hints, updated: s.updated, student: s };
    });

  const sorted = (): Row[] =>
    rows().sort((a, b) => {
      const x = a[sortBy];
      const y = b[sortBy];
      const cmp = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x as number) - (y as number);
      return (ascending ? cmp : -cmp) || a.name.localeCompare(b.name);
    });

  const select = (uid: string) => {
    selected = uid;
    table.querySelectorAll<HTMLElement>('tbody tr').forEach((tr) => {
      const on = tr.dataset.uid === uid;
      tr.setAttribute('aria-selected', String(on));
      tr.setAttribute('tabindex', on ? '0' : '-1');
      if (on) tr.focus();
    });
    shell.refresh();
  };

  const render = () => {
    const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
    replace(
      summary,
      loading
        ? h('strong', null, 'Loading the class')
        : failure
          ? h('strong', { class: 'error-text' }, failure)
          : [
              h('strong', null, `${students.length} ${students.length === 1 ? 'student' : 'students'}`),
              h('span', { class: 'muted' }, `${students.filter((s) => s.updated >= week).length} active in the last 7 days. Loaded ${shortDate(loadedAt)}.`),
            ],
    );
    if (!selected && students.length) selected = sorted()[0].uid;
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
                      ascending = !c.numeric && c.id !== 'updated';
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
        sorted().map((row) =>
          h(
            'tr',
            {
              'data-uid': row.uid,
              tabindex: row.uid === selected ? '0' : '-1',
              'aria-selected': String(row.uid === selected),
              onclick: () => select(row.uid),
              onkeydown: (event: KeyboardEvent) => {
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                event.preventDefault();
                const all = [...table.querySelectorAll<HTMLElement>('tbody tr')];
                const next = all[all.indexOf(event.currentTarget as HTMLElement) + (event.key === 'ArrowDown' ? 1 : -1)];
                if (next) select(next.dataset.uid ?? '');
              },
            },
            h('td', null, row.name),
            h('td', null, row.email),
            h('td', { class: 'num' }, h('span', { class: 'bar' }, h('span', { style: `width:${row.percent}%` })), h('span', { class: 'bar-value' }, `${row.percent}%`)),
            h('td', { class: 'num' }, `${row.mastered} / ${EXERCISES.length}`),
            h('td', { class: 'num' }, String(row.solved)),
            h('td', { class: 'num' }, String(row.checks)),
            h('td', { class: 'num' }, String(row.hints)),
            h('td', { class: 'nowrap' }, row.updated ? shortDate(row.updated) : '—'),
          ),
        ),
      ),
    );
    exportTool.disabled = loading || students.length === 0;
  };

  const load = async () => {
    loading = true;
    failure = '';
    refreshTool.disabled = true;
    render();
    try {
      students = await cloud.listStudents();
      loadedAt = Date.now();
      shell.log(`Class progress: ${students.length} ${students.length === 1 ? 'student' : 'students'} loaded.`, 'ok');
    } catch (error) {
      const code = (error as { code?: string }).code;
      failure = code === 'permission-denied' ? 'Only instructors with a verified email can see the class.' : 'The class could not be loaded. Check your connection and refresh.';
      shell.log(`Class progress: ${failure}`, 'bad');
    } finally {
      loading = false;
      refreshTool.disabled = false;
      render();
      shell.refresh();
    }
  };

  const exportCsv = () => {
    const header = ['Student', 'Email', 'Course %', 'Skills mastered', 'Problems solved', 'Checks', 'Hints used', 'Last active', ...EXERCISES.map((e) => e.title)];
    const lines = sorted().map((r) => [r.name, r.email, r.percent, r.mastered, r.solved, r.checks, r.hints, r.updated ? new Date(r.updated).toISOString() : '', ...EXERCISES.map((_, i) => skillState(r.student, i))]);
    const csv = [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n');
    const link = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `shatu-class-progress-${new Date().toISOString().slice(0, 10)}.csv` });
    link.click();
    URL.revokeObjectURL(link.href);
    shell.log(`Class progress exported: ${lines.length} ${lines.length === 1 ? 'student' : 'students'}.`, 'ok');
  };

  refreshTool.addEventListener('click', () => void load());
  exportTool.addEventListener('click', exportCsv);
  void load();

  return {
    key: 'class',
    icon: 'table',
    title: () => 'Class progress',
    path: () => ['Reports', 'Class progress'],
    info: () => (loading ? 'Loading' : `${students.length} students`),
    route: () => '#/app/class',
    toolbar,
    body,
    tabs: {},
    properties: () => {
      const student = students.find((s) => s.uid === selected);
      if (!student) return [['Student', 'None selected']];
      const t = overall(student.progress);
      return [
        ['Student', student.displayName],
        ['Email', student.email],
        ['Course', `${t.percent}%`],
        ['Last active', student.updated ? shortDate(student.updated) : '—'],
        ...EXERCISES.map((e, i): [string, string] => [e.title, skillState(student, i)]),
      ];
    },
    status: () => ['Class progress'],
    dispose: () => {
      // Nothing to stop: the report keeps no timers or listeners.
    },
  };
}
