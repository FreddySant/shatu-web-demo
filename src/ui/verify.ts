import { runChecks, type CheckResult } from '../engine/checks';
import { fmt, h, replace } from './dom';
import { icon } from './overlay';
import type { Shell, View } from './types';

export function verifyView(shell: Shell): View {
  const runTool = h('button', { type: 'button', class: 'tool primary', title: 'Run every check again' }, icon('play', 15), h('span', { class: 'tool-label' }, 'Run checks'));
  const toolbar = h('div', { class: 'toolbar-group' }, runTool);
  const summary = h('div', { class: 'verify-summary', role: 'status' });
  const tbody = h('tbody');
  const body = h(
    'div',
    { class: 'doc-body grid-doc' },
    summary,
    h(
      'div',
      { class: 'table-wrap' },
      h('table', { class: 'grid verify-table', 'aria-label': 'Verification results' }, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Check'), h('th', { scope: 'col' }, 'What it tests'), h('th', { scope: 'col', class: 'num' }, 'Cases'), h('th', { scope: 'col' }, 'Result'), h('th', { scope: 'col', class: 'num' }, 'Time'))), tbody),
    ),
  );

  let results: CheckResult[] = [];
  let seconds = 0;
  let running = false;
  let alive = true;

  const passedCount = () => results.filter((r) => r.passed === r.cases).length;
  const caseCount = () => results.reduce((sum, r) => sum + r.cases, 0);

  const render = () => {
    if (running) {
      summary.className = 'verify-summary';
      replace(summary, h('strong', null, 'Running the checks'));
      return;
    }
    const failed = results.length - passedCount();
    summary.className = failed === 0 ? 'verify-summary ok' : 'verify-summary bad';
    replace(
      summary,
      h('span', { class: 'summary-icon' }, icon(failed === 0 ? 'check' : 'close', 16)),
      h('strong', null, failed === 0 ? `All ${results.length} checks passed` : `${failed} of ${results.length} checks failed`),
      h('span', { class: 'muted' }, `${fmt(caseCount())} cases in ${seconds.toFixed(2)} s`),
    );
    replace(
      tbody,
      results.map((r) =>
        h(
          'tr',
          null,
          h('th', { scope: 'row' }, r.title),
          h('td', null, r.description, r.failures.length ? h('ul', { class: 'failures' }, r.failures.map((f) => h('li', null, f))) : null),
          h('td', { class: 'num' }, fmt(r.cases)),
          h('td', { class: r.passed === r.cases ? 'result-cell ok' : 'result-cell bad' }, r.passed === r.cases ? 'Passed' : `${fmt(r.cases - r.passed)} failed`),
          h('td', { class: 'num nowrap' }, `${r.ms.toFixed(0)} ms`),
        ),
      ),
    );
  };

  const run = async () => {
    running = true;
    runTool.disabled = true;
    render();
    const started = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const next = await runChecks();
    if (!alive) return;
    results = next;
    seconds = (performance.now() - started) / 1000;
    running = false;
    runTool.disabled = false;
    render();
    const failed = results.length - passedCount();
    shell.log(failed === 0 ? `Verification: all ${results.length} checks passed (${fmt(caseCount())} cases).` : `Verification: ${failed} of ${results.length} checks failed.`, failed === 0 ? 'ok' : 'bad');
    shell.refresh();
  };
  runTool.addEventListener('click', () => void run());
  void run();

  return {
    key: 'verify',
    icon: 'shield',
    title: () => 'Verification',
    path: () => ['Reports', 'Verification'],
    info: () => (running ? 'Running' : `${passedCount()} of ${results.length} checks passed`),
    route: () => '#/app/verify',
    toolbar,
    body,
    tabs: {},
    properties: () => [
      ['Checks', String(results.length)],
      ['Passed', String(passedCount())],
      ['Cases', fmt(caseCount())],
      ['Time', `${seconds.toFixed(2)} s`],
      ['SHA-256 reference', 'FIPS 180-4 and Web Crypto'],
    ],
    status: () => ['Verification'],
    dispose: () => {
      alive = false;
    },
  };
}
