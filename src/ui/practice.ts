import { differingBits, toBinary } from '../engine/bits';
import { describeCharacter, exerciseById, STAGES, type ExerciseId, type Problem } from '../engine/exercises';
import { recommend } from '../engine/policy';
import { applyOutcome, mastery, record, STREAK_TO_LEVEL_UP, type ProblemOutcome } from '../engine/progress';
import { bitInput, type BitInput } from './bitinput';
import { bitRow } from './bitsview';
import { h, replace } from './dom';
import { shortDate, streakMeter } from './meters';
import { icon, toast } from './overlay';
import { getProgress, pushActivity, setProgress, subscribe } from './store';
import type { Shell, View } from './types';

interface Attempt {
  problem: Problem;
  checks: number;
  firstTry: boolean;
  hintsShown: number;
  sawAnswer: boolean;
  solved: boolean;
  recorded: boolean;
}

function toolButton(iconName: Parameters<typeof icon>[0], label: string, title: string, primary = false): HTMLButtonElement {
  return h('button', { type: 'button', class: primary ? 'tool primary' : 'tool', title }, icon(iconName, 16), h('span', { class: 'tool-label' }, label));
}

export function practiceView(shell: Shell, id: ExerciseId): View {
  const exercise = exerciseById(id);
  const stageTitle = STAGES.find((s) => s.id === exercise.stage)!.title;

  let attempt: Attempt;
  let input: BitInput | null = null;
  let numberInput: HTMLInputElement | null = null;

  /* ---------- Toolbar ---------- */

  const checkTool = toolButton('check', 'Check', 'Check answer (Enter)', true);
  const hintTool = toolButton('bulb', 'Hint', 'Show the next hint (H)');
  const solutionTool = toolButton('eye', 'Solution', 'Show worked solution (S)');
  const newTool = toolButton('refresh', 'New problem', 'New problem at this level (N)');
  const nextTool = toolButton('arrowRight', 'Next', 'Next recommended problem');
  const levelSelect = h('select', { class: 'tool-select', 'aria-label': 'Level' });
  const toolbar = h(
    'div',
    { class: 'toolbar-group' },
    checkTool,
    hintTool,
    solutionTool,
    newTool,
    h('span', { class: 'tool-sep', role: 'separator' }),
    h('label', { class: 'tool-field' }, h('span', { class: 'tool-label' }, 'Level'), levelSelect),
    h('span', { class: 'tool-sep', role: 'separator' }),
    nextTool,
  );

  /* ---------- Document ---------- */

  const promptEl = h('p', { class: 'prompt' });
  const operandsEl = h('div', { class: 'operands' });
  const answerRow = h('div', { class: 'answer-row' });
  const answerMeta = h('p', { class: 'answer-meta', id: `answer-meta-${id}` });
  const checkButton = h('button', { class: 'btn', type: 'button' }, icon('check', 15), 'Check answer');
  const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
  const problemEl = h('div', { class: 'problem' }, promptEl, operandsEl, answerRow, answerMeta, h('div', { class: 'problem-actions' }, checkButton), feedback);
  const body = h('div', { class: 'doc-body practice-doc' }, problemEl);

  /* ---------- Panel tabs ---------- */

  const hintList = h('ol', { class: 'hint-list' });
  const hintButton = h('button', { class: 'btn quiet small-btn', type: 'button' });
  const hintsTab = h('div', { class: 'panel-pane hints-pane' }, hintList, hintButton);
  const solutionTab = h('div', { class: 'panel-pane solution-pane' });
  const ruleTab = h('div', { class: 'panel-pane rule-pane' }, h('p', { class: 'rule-text' }, exercise.rule), exercise.legend ? h('p', { class: 'muted small' }, exercise.legend) : null);

  /* ---------- Recording ---------- */

  /** A problem off the current level, or on a mastered skill, does not change the streak. */
  const isReview = () => {
    const r = record(getProgress(), id);
    return r.mastered || attempt.problem.levelIndex !== r.level;
  };

  const countsTowardStreak = () => attempt.firstTry && !attempt.sawAnswer && !isReview();

  const finish = (solved: boolean) => {
    // An unsolved problem is recorded once it was checked or its answer was seen, so skipping after the answer still costs the streak.
    if (attempt.recorded || (!solved && attempt.checks === 0 && !attempt.sawAnswer)) {
      return { leveledUp: false, masteredNow: false };
    }
    attempt.recorded = true;
    const review = isReview();
    const outcome: ProblemOutcome = {
      solved,
      firstTry: attempt.firstTry,
      sawAnswer: attempt.sawAnswer,
      hintsUsed: attempt.hintsShown,
      checks: attempt.checks,
      review,
    };
    const result = applyOutcome(getProgress(), id, outcome);
    setProgress(result.progress);
    pushActivity({
      exercise: id,
      levelIndex: attempt.problem.levelIndex,
      solved,
      counted: solved && attempt.firstTry && !attempt.sawAnswer && !review,
      hints: attempt.hintsShown,
      leveledUp: result.leveledUp || result.masteredNow,
      at: Date.now(),
      sawAnswer: attempt.sawAnswer,
      review,
    });
    return result;
  };

  /* ---------- Rendering ---------- */

  const unlocked = () => {
    const r = record(getProgress(), id);
    return r.mastered ? exercise.levels.length - 1 : r.level;
  };

  const renderLevels = () => {
    replace(
      levelSelect,
      exercise.levels.map((level, i) =>
        h('option', { value: String(i), selected: i === attempt.problem.levelIndex, disabled: i > unlocked() }, `Level ${i + 1}: ${level.label}${i > unlocked() ? ' (locked)' : ''}`),
      ),
    );
  };

  const updateMeta = () => {
    answerMeta.textContent = attempt.problem.answerKind === 'bits' && input ? `${input.filled()} of ${attempt.problem.answerWidth} bits set` : 'Type a whole number';
  };

  const renderProblem = () => {
    const p = attempt.problem;
    problemEl.dataset.width = String(p.answerWidth);
    solutionTab.dataset.width = String(p.answerWidth);
    promptEl.textContent = exercise.prompt(p);
    replace(
      operandsEl,
      p.operands.map((o) =>
        h(
          'div',
          { class: 'operand' },
          h('span', { class: 'operand-name' }, o.name),
          o.kind === 'word'
            ? bitRow(toBinary(o.value, p.level))
            : o.kind === 'text'
              ? h('span', { class: 'operand-char-wrap' }, h('span', { class: 'operand-char' }, o.text === ' ' ? '␣' : (o.text ?? '')), h('span', { class: 'operand-caption' }, describeCharacter(o.text ?? '')))
              : h('span', { class: 'operand-number' }, String(o.value), h('small', null, o.kind === 'amount' ? (o.value === 1 ? ' place' : ' places') : ' characters')),
        ),
      ),
    );
    if (p.answerKind === 'bits') {
      input = bitInput(p.answerWidth, () => {
        updateMeta();
        clearFeedback();
        shell.refresh();
      }, check);
      numberInput = null;
      replace(answerRow, h('span', { class: 'operand-name answer-label' }, 'answer'), input.element);
    } else {
      input = null;
      numberInput = h('input', { type: 'text', inputmode: 'numeric', class: 'number-answer', id: `number-answer-${id}`, autocomplete: 'off', 'aria-label': 'Your answer', 'aria-describedby': answerMeta.id });
      numberInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          check();
        }
      });
      numberInput.addEventListener('input', clearFeedback);
      replace(answerRow, h('label', { class: 'operand-name answer-label', for: numberInput.id }, 'answer'), numberInput);
    }
    updateMeta();
  };

  const hintsTotal = () => exercise.hints(attempt.problem).length;

  const renderHints = () => {
    const hints = exercise.hints(attempt.problem);
    replace(hintList, hints.slice(0, attempt.hintsShown).map((text, i) => h('li', null, h('span', { class: 'hint-num' }, `Hint ${i + 1}`), h('p', null, text))));
    const done = attempt.hintsShown >= hints.length;
    hintButton.disabled = done;
    hintTool.disabled = done;
    hintButton.textContent = done ? 'No more hints' : attempt.hintsShown === hints.length - 1 ? 'Show the last hint (gives the answer)' : `Show hint ${attempt.hintsShown + 1} of ${hints.length}`;
  };

  const renderSolution = (shown: boolean) => {
    if (!shown) {
      replace(solutionTab, h('p', { class: 'muted small' }, 'Shown after you solve the problem, or choose Solution (S).'));
      return;
    }
    replace(
      solutionTab,
      h(
        'div',
        { class: 'worked-grid' },
        exercise.worked(attempt.problem).flatMap((row) => {
          const cls = row.result ? ' result' : '';
          return [
            h('span', { class: `w-label${cls}` }, row.label),
            h('span', { class: `w-value${cls}` }, row.bits !== undefined ? bitRow(row.bits, { marks: row.marks }) : h('span', { class: 'w-text' }, row.text ?? '')),
            h('span', { class: `w-note${cls}` }, row.note ?? ''),
          ];
        }),
      ),
    );
  };

  const clearFeedback = () => {
    if (!attempt.solved) {
      feedback.className = 'feedback';
      replace(feedback);
    }
  };

  const setAnswerDisabled = (disabled: boolean) => {
    input?.setDisabled(disabled);
    if (numberInput) numberInput.disabled = disabled;
    checkButton.disabled = disabled;
    checkTool.disabled = disabled;
  };

  /* ---------- Actions ---------- */

  function newProblem(levelIndex: number) {
    if (attempt && !attempt.solved) finish(false);
    attempt = { problem: exercise.generate(levelIndex), checks: 0, firstTry: true, hintsShown: 0, sawAnswer: false, solved: false, recorded: false };
    feedback.className = 'feedback';
    replace(feedback);
    solutionTool.disabled = false;
    setAnswerDisabled(false);
    renderLevels();
    renderProblem();
    renderHints();
    renderSolution(false);
    shell.log(`${exercise.symbol}, level ${levelIndex + 1}: ${exercise.prompt(attempt.problem)}`);
    shell.refresh();
  }

  function focusAnswer() {
    (input ?? numberInput)?.focus();
  }

  function goNext() {
    const rec = recommend(getProgress(), id);
    if (rec.exercise !== id) {
      shell.log(`Tutor: ${rec.reason}`);
      location.hash = `#/app/practice/${rec.exercise}`;
      return;
    }
    newProblem(rec.levelIndex);
    focusAnswer();
  }

  function showHint() {
    if (attempt.hintsShown >= hintsTotal()) return;
    attempt.hintsShown += 1;
    if (attempt.hintsShown === hintsTotal() && !attempt.solved) attempt.sawAnswer = true;
    renderHints();
    shell.log(`Hint ${attempt.hintsShown} of ${hintsTotal()} shown.`);
    shell.showPanel('hints');
    shell.refresh();
  }

  function showSolution() {
    if (solutionTool.disabled) return;
    if (!attempt.solved) {
      attempt.sawAnswer = true;
      shell.log('Worked solution shown, so this problem will not count toward your streak.');
    }
    renderSolution(true);
    solutionTool.disabled = true;
    shell.showPanel('solution');
    shell.refresh();
  }

  function check() {
    if (attempt.solved) {
      goNext();
      return;
    }
    const p = attempt.problem;
    let given: number;
    if (p.answerKind === 'bits') {
      const bits = input?.value() ?? null;
      if (bits === null) {
        feedback.className = 'feedback notice';
        replace(feedback, h('span', null, `Set all ${p.answerWidth} bits first. ${p.answerWidth - (input?.filled() ?? 0)} still empty.`));
        input?.focus();
        return;
      }
      given = parseInt(bits, 2);
    } else {
      const text = (numberInput?.value ?? '').trim();
      if (!/^\d+$/.test(text)) {
        feedback.className = 'feedback notice';
        replace(feedback, h('span', null, 'Enter a whole number, such as 423.'));
        numberInput?.focus();
        return;
      }
      given = Number(text);
    }

    attempt.checks += 1;
    if (given !== p.answer) {
      attempt.firstTry = false;
      feedback.className = 'feedback incorrect';
      let message: string;
      if (p.answerKind === 'bits') {
        const wrong = differingBits(given, p.answer, p.answerWidth);
        input?.markWrong(wrong);
        message = `Not yet: ${wrong.length} of ${p.answerWidth} ${wrong.length === 1 ? 'bit is' : 'bits are'} wrong.`;
        replace(feedback, h('strong', null, message), h('span', null, 'The wrong tiles are outlined in red.'));
      } else {
        message = given > p.answer ? 'Not yet: that is too many.' : 'Not yet: that is too few.';
        replace(feedback, h('strong', null, message), h('span', null, 'Check L and the formula, or take a hint.'));
      }
      shell.log(message, 'bad');
      shell.refresh();
      return;
    }

    attempt.solved = true;
    setAnswerDisabled(true);
    solutionTool.disabled = true;
    const masteredBefore = record(getProgress(), id).mastered;
    const review = isReview();
    const result = finish(true);
    renderLevels();
    renderSolution(true);

    const r = record(getProgress(), id);
    const rec = recommend(getProgress(), id);
    const counted = attempt.firstTry && !attempt.sawAnswer;
    const message = result.masteredNow
      ? `Skill mastered: ${exercise.title}.`
      : result.leveledUp
        ? `Level up: ${exercise.title}, ${exercise.levels[r.level].label}.`
        : masteredBefore
          ? 'Correct. This skill is already mastered, so there is no streak to build.'
          : review
            ? `Correct. Practice at another level does not change your streak (${r.streak} of ${STREAK_TO_LEVEL_UP}).`
            : counted
              ? `Correct. ${r.streak} of ${STREAK_TO_LEVEL_UP} in a row.`
              : attempt.sawAnswer
                ? 'Correct, with the answer shown, so it does not count toward your streak.'
                : 'Correct on a later try, so your streak starts again.';

    if (result.leveledUp) toast('Level up', `${exercise.title}: ${exercise.levels[r.level].label}`, 'milestone');
    if (result.masteredNow) toast('Skill mastered', exercise.title, 'milestone');

    feedback.className = result.leveledUp || result.masteredNow ? 'feedback correct milestone' : 'feedback correct';
    const nextButton = h('button', { class: 'btn', type: 'button', onclick: goNext }, rec.exercise === id ? 'Next problem' : `Next skill: ${exerciseById(rec.exercise).title}`);
    replace(feedback, h('strong', null, message), nextButton);
    shell.log(message, result.leveledUp || result.masteredNow ? 'milestone' : 'ok');
    shell.showPanel('solution');
    shell.refresh();
    nextButton.focus();
  }

  checkTool.addEventListener('click', check);
  checkButton.addEventListener('click', check);
  hintTool.addEventListener('click', showHint);
  hintButton.addEventListener('click', showHint);
  solutionTool.addEventListener('click', showSolution);
  newTool.addEventListener('click', () => {
    newProblem(attempt.problem.levelIndex);
    focusAnswer();
  });
  nextTool.addEventListener('click', goNext);
  levelSelect.addEventListener('change', () => {
    newProblem(Number(levelSelect.value));
    focusAnswer();
  });

  const r0 = record(getProgress(), id);
  newProblem(r0.mastered ? exercise.levels.length - 1 : r0.level);
  const stop = subscribe(() => {
    if (!attempt.solved && attempt.problem.levelIndex > unlocked()) {
      attempt.recorded = true;
      newProblem(unlocked());
    } else {
      renderLevels();
    }
  });

  return {
    key: `practice/${id}`,
    icon: 'practice',
    title: () => exercise.title,
    path: () => ['Practice', stageTitle, exercise.title],
    info: () => `Level ${attempt.problem.levelIndex + 1} of ${exercise.levels.length}: ${exercise.levels[attempt.problem.levelIndex].label}`,
    route: () => `#/app/practice/${id}`,
    toolbar,
    body,
    tabs: {
      hints: { label: () => `Hints ${attempt.hintsShown}/${hintsTotal()}`, content: hintsTab },
      solution: { label: () => 'Solution', content: solutionTab },
      rule: { label: () => 'Rule', content: ruleTab },
    },
    properties: () => {
      const progress = getProgress();
      const r = record(progress, id);
      const live = !attempt.recorded;
      return [
        ['Skill', exercise.title],
        ['Symbol', exercise.symbol],
        ['Stage', stageTitle],
        ['Level', r.mastered ? 'Mastered' : `${r.level + 1} of ${exercise.levels.length}`],
        ['Streak', h('span', { class: 'prop-meter' }, streakMeter(progress, id), `${r.streak} of ${STREAK_TO_LEVEL_UP}`)],
        ['Mastery', `${Math.round(mastery(progress, id) * 100)}%`],
        ['Solved', String(r.correct)],
        ['Checks', String(r.attempts + (live ? attempt.checks : 0))],
        ['Hints used', String(r.hints + (live ? attempt.hintsShown : 0))],
        ['Last practiced', shortDate(r.lastPracticed)],
        ['This problem', exercise.levels[attempt.problem.levelIndex].label],
        ['Answer', attempt.problem.answerKind === 'bits' && input ? `${input.filled()} of ${attempt.problem.answerWidth} bits set` : 'Whole number'],
        ['Counts toward streak', countsTowardStreak() ? 'Yes' : r.mastered ? 'No, skill mastered' : isReview() ? 'No, not your current level' : 'No'],
      ];
    },
    status: () => {
      const r = record(getProgress(), id);
      return [`${exercise.symbol} level ${attempt.problem.levelIndex + 1} of ${exercise.levels.length}`, `Streak ${r.streak} of ${STREAK_TO_LEVEL_UP}`];
    },
    practice: {
      check,
      hint: showHint,
      solution: showSolution,
      newProblem: () => {
        newProblem(attempt.problem.levelIndex);
        focusAnswer();
      },
      next: goNext,
      setLevel: (index) => {
        if (index <= unlocked()) {
          newProblem(index);
          focusAnswer();
        }
      },
      levels: () => exercise.levels.map((level, i) => ({ label: `Level ${i + 1}: ${level.label}`, locked: i > unlocked(), current: i === attempt.problem.levelIndex })),
      canHint: () => attempt.hintsShown < hintsTotal(),
      canSolution: () => !solutionTool.disabled,
    },
    activate: () => {
      if (!attempt.solved) requestAnimationFrame(focusAnswer);
    },
    dispose: () => {
      if (!attempt.solved) finish(false);
      stop();
    },
  };
}
