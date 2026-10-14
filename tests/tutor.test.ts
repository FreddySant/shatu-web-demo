import { describe, expect, it } from 'vitest';
import { recommend } from '../src/engine/policy';
import { EXERCISES } from '../src/engine/exercises';
import { applyOutcome, mastery, record, STREAK_TO_LEVEL_UP, type ProblemOutcome, type ProgressMap } from '../src/engine/progress';

const clean: ProblemOutcome = { solved: true, firstTry: true, sawAnswer: false, hintsUsed: 0, checks: 1 };

function solve(progress: ProgressMap, id: 'rotr' | 'encode', times: number, outcome = clean): ProgressMap {
  let p = progress;
  for (let i = 0; i < times; i++) {
    p = applyOutcome(p, id, outcome).progress;
  }
  return p;
}

describe('student model', () => {
  it('moves up a level after three clean answers in a row', () => {
    const p = solve({}, 'rotr', STREAK_TO_LEVEL_UP - 1);
    expect(p.rotr?.level).toBe(0);
    const result = applyOutcome(p, 'rotr', clean);
    expect(result.leveledUp).toBe(true);
    expect(result.progress.rotr?.level).toBe(1);
    expect(result.progress.rotr?.streak).toBe(0);
  });

  it('does not count an answer given away by the last hint', () => {
    const p = solve({}, 'rotr', 2);
    const after = applyOutcome(p, 'rotr', { ...clean, sawAnswer: true, hintsUsed: 3 });
    expect(after.progress.rotr?.streak).toBe(0);
    expect(after.leveledUp).toBe(false);
  });

  it('resets the streak after a wrong first try but still counts the solve', () => {
    const p = solve({}, 'rotr', 2);
    const after = applyOutcome(p, 'rotr', { ...clean, firstTry: false, checks: 2 });
    expect(after.progress.rotr?.streak).toBe(0);
    expect(after.progress.rotr?.correct).toBe(3);
    expect(after.progress.rotr?.attempts).toBe(4);
  });

  it('masters a skill after clearing the last level', () => {
    const p = solve({}, 'rotr', 4 * STREAK_TO_LEVEL_UP);
    expect(p.rotr?.mastered).toBe(true);
    expect(mastery(p, 'rotr')).toBe(1);
  });
});

describe('choosing the next task', () => {
  it('starts with the first skill in the course', () => {
    expect(recommend({})).toMatchObject({ exercise: 'encode', levelIndex: 0 });
  });

  it('stays on the current skill until it is mastered', () => {
    const p = solve({}, 'rotr', 1);
    const next = recommend(p, 'rotr');
    expect(next.exercise).toBe('rotr');
    expect(next.reason).toContain('2 more correct answers');
  });

  it('moves on to the next unmastered skill after mastery', () => {
    let p = solve({}, 'encode', 4 * STREAK_TO_LEVEL_UP);
    expect(recommend(p, 'encode').exercise).toBe('padding');
    p = solve(p, 'rotr', 1);
    expect(recommend(p).exercise).toBe('padding');
  });
});

describe('review and mastered skills', () => {
  it('records a review problem without changing the streak or level', () => {
    const p = solve(solve({}, 'rotr', STREAK_TO_LEVEL_UP), 'rotr', 2);
    expect(p.rotr?.level).toBe(1);
    expect(p.rotr?.streak).toBe(2);
    const after = applyOutcome(p, 'rotr', { ...clean, review: true });
    expect(after.progress.rotr?.streak).toBe(2);
    expect(after.progress.rotr?.level).toBe(1);
    expect(after.progress.rotr?.correct).toBe(p.rotr!.correct + 1);
  });

  it('does not grow the streak on a mastered skill', () => {
    const mastered = solve({}, 'rotr', STREAK_TO_LEVEL_UP * 4);
    expect(mastered.rotr?.mastered).toBe(true);
    const later = solve(mastered, 'rotr', 5);
    expect(later.rotr?.streak).toBe(0);
    expect(later.rotr?.mastered).toBe(true);
    expect(later.rotr?.correct).toBe(STREAK_TO_LEVEL_UP * 4 + 5);
  });

  it('reviews the skill practiced longest ago once everything is mastered', () => {
    let p: ProgressMap = {};
    EXERCISES.forEach((e, i) => {
      for (let n = 0; n < STREAK_TO_LEVEL_UP * e.levels.length; n++) p = applyOutcome(p, e.id, clean, 1000 + i).progress;
    });
    expect(EXERCISES.every((e) => record(p, e.id).mastered)).toBe(true);
    const rec = recommend(p);
    expect(rec.exercise).toBe(EXERCISES[0].id);
    expect(rec.levelIndex).toBe(EXERCISES[0].levels.length - 1);
  });
});
