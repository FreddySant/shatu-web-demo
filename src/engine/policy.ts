import { EXERCISES, exerciseById, type ExerciseId } from './exercises';
import { record, STREAK_TO_LEVEL_UP, type ProgressMap } from './progress';

/**
 * The outer loop of the tutor (VanLehn, 2006): choose the next task from what
 * the student model says. The rules are deliberately simple so they can be
 * explained to a student:
 *
 * 1. Stay on the skill being practiced until it is mastered, so a streak is
 *    not interrupted.
 * 2. Otherwise go to the first skill in course order that is not mastered.
 * 3. When everything is mastered, review the skill practiced longest ago.
 */
export interface Recommendation {
  exercise: ExerciseId;
  levelIndex: number;
  reason: string;
}

function remaining(progress: ProgressMap, id: ExerciseId): number {
  return STREAK_TO_LEVEL_UP - record(progress, id).streak;
}

function nextStepReason(progress: ProgressMap, id: ExerciseId): string {
  const e = exerciseById(id);
  const r = record(progress, id);
  const left = remaining(progress, id);
  const answers = left === 1 ? '1 more correct answer' : `${left} more correct answers`;
  if (r.level < e.levels.length - 1) {
    return `${answers} in a row to move up to ${e.levels[r.level + 1].label.toLowerCase()}.`;
  }
  return `${answers} in a row to master this skill.`;
}

export function recommend(progress: ProgressMap, current?: ExerciseId): Recommendation {
  if (current && !record(progress, current).mastered) {
    return { exercise: current, levelIndex: record(progress, current).level, reason: nextStepReason(progress, current) };
  }

  const next = EXERCISES.find((e) => !record(progress, e.id).mastered);
  if (next) {
    const r = record(progress, next.id);
    const reason =
      r.attempts === 0
        ? current
          ? `You mastered ${exerciseById(current).title.toLowerCase()}. This is the next skill in the course.`
          : 'This is the first skill in the course you haven’t mastered yet.'
        : nextStepReason(progress, next.id);
    return { exercise: next.id, levelIndex: r.level, reason };
  }

  const oldest = [...EXERCISES].sort((a, b) => record(progress, a.id).lastPracticed - record(progress, b.id).lastPracticed)[0];
  return {
    exercise: oldest.id,
    levelIndex: oldest.levels.length - 1,
    reason: 'Every skill is mastered. This is the one you practiced longest ago.',
  };
}
