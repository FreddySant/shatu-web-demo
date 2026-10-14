import { EXERCISES, exerciseById, type ExerciseId } from './exercises';

/**
 * The student model: what the tutor remembers about each skill. It is saved
 * to the student's account, so it follows them to any computer.
 */
export interface SkillRecord {
  attempts: number;
  correct: number;
  hints: number;
  /** Index into the exercise's levels. */
  level: number;
  /** Problems in a row solved at this level on the first try without the last hint. */
  streak: number;
  mastered: boolean;
  lastPracticed: number;
}

export type ProgressMap = Partial<Record<ExerciseId, SkillRecord>>;

/** Correct answers in a row needed to move up a level. */
export const STREAK_TO_LEVEL_UP = 3;

export const emptyRecord = (): SkillRecord => ({
  attempts: 0,
  correct: 0,
  hints: 0,
  level: 0,
  streak: 0,
  mastered: false,
  lastPracticed: 0,
});

/** One finished problem, for the recent activity list. */
export interface ActivityEvent {
  exercise: ExerciseId;
  levelIndex: number;
  solved: boolean;
  counted: boolean;
  hints: number;
  leveledUp: boolean;
  at: number;
  /** The worked solution or the last hint was shown. Older events do not have it. */
  sawAnswer?: boolean;
  /** Practice off the current level, or on a mastered skill. Older events do not have it. */
  review?: boolean;
}

/** How many finished problems the history keeps. */
export const ACTIVITY_LIMIT = 30;

/** Adds a finished problem to the front of the history and keeps the most recent ones. */
export function withActivity(list: ActivityEvent[], event: ActivityEvent): ActivityEvent[] {
  return [event, ...list].slice(0, ACTIVITY_LIMIT);
}

export function record(progress: ProgressMap, id: ExerciseId): SkillRecord {
  return progress[id] ?? emptyRecord();
}

export interface ProblemOutcome {
  /** The problem was eventually answered correctly. */
  solved: boolean;
  /** Solved on the first check. */
  firstTry: boolean;
  /** The last hint, which gives the answer away, was shown. */
  sawAnswer: boolean;
  hintsUsed: number;
  checks: number;
  /** Practice off the current level: counted, but it does not change the streak. */
  review?: boolean;
}

export interface UpdateResult {
  progress: ProgressMap;
  leveledUp: boolean;
  masteredNow: boolean;
}

/**
 * Update the model after a finished problem. Only a first-try answer without
 * the last hint counts towards moving up; anything else resets the streak.
 */
export function applyOutcome(progress: ProgressMap, id: ExerciseId, outcome: ProblemOutcome, now = Date.now()): UpdateResult {
  const levels = exerciseById(id).levels.length;
  const current = record(progress, id);
  const next: SkillRecord = {
    ...current,
    attempts: current.attempts + outcome.checks,
    correct: current.correct + (outcome.solved ? 1 : 0),
    hints: current.hints + outcome.hintsUsed,
    lastPracticed: now,
  };

  let leveledUp = false;
  let masteredNow = false;
  // Review and practice on a mastered skill are recorded, but they do not move the streak.
  if (outcome.review || current.mastered) {
    return { progress: { ...progress, [id]: next }, leveledUp, masteredNow };
  }
  if (outcome.solved && outcome.firstTry && !outcome.sawAnswer) {
    next.streak = current.streak + 1;
    if (next.streak >= STREAK_TO_LEVEL_UP) {
      if (current.level < levels - 1) {
        next.level = current.level + 1;
        next.streak = 0;
        leveledUp = true;
      } else if (!current.mastered) {
        next.mastered = true;
        next.streak = 0;
        masteredNow = true;
      }
    }
  } else {
    next.streak = 0;
  }

  return { progress: { ...progress, [id]: next }, leveledUp, masteredNow };
}

/** How far along a skill is, from 0 to 1. Each level counts as STREAK_TO_LEVEL_UP steps. */
export function mastery(progress: ProgressMap, id: ExerciseId): number {
  const r = record(progress, id);
  if (r.mastered) {
    return 1;
  }
  const levels = exerciseById(id).levels.length;
  return Math.min(1, (r.level * STREAK_TO_LEVEL_UP + r.streak) / (levels * STREAK_TO_LEVEL_UP));
}

export function overall(progress: ProgressMap): { mastered: number; started: number; solved: number; checks: number; hints: number; percent: number } {
  let mastered = 0;
  let started = 0;
  let solved = 0;
  let checks = 0;
  let hints = 0;
  let sum = 0;
  for (const e of EXERCISES) {
    const r = record(progress, e.id);
    if (r.mastered) mastered++;
    if (r.attempts > 0) started++;
    solved += r.correct;
    checks += r.attempts;
    hints += r.hints;
    sum += mastery(progress, e.id);
  }
  return { mastered, started, solved, checks, hints, percent: Math.round((sum / EXERCISES.length) * 100) };
}
