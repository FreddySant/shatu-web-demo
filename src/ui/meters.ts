import { exerciseById, type ExerciseId } from '../engine/exercises';
import { record, STREAK_TO_LEVEL_UP, type ProgressMap } from '../engine/progress';
import { h } from './dom';

/** Four small tiles for a skill's levels: filled when passed, outlined for the current one. */
export function levelMeter(progress: ProgressMap, id: ExerciseId): HTMLElement {
  const e = exerciseById(id);
  const r = record(progress, id);
  return h(
    'span',
    { class: 'levels', role: 'img', 'aria-label': r.mastered ? 'Mastered' : `Level ${r.level + 1} of ${e.levels.length}` },
    e.levels.map((_, i) => h('i', { class: r.mastered || i < r.level ? 'done' : i === r.level && r.attempts > 0 ? 'current' : '' })),
  );
}

/** Three dots for the streak towards the next level. */
export function streakMeter(progress: ProgressMap, id: ExerciseId): HTMLElement {
  const r = record(progress, id);
  return h(
    'span',
    { class: 'streak', role: 'img', 'aria-label': `${r.streak} of ${STREAK_TO_LEVEL_UP} in a row` },
    Array.from({ length: STREAK_TO_LEVEL_UP }, (_, i) => h('i', { class: i < r.streak ? 'on' : '' })),
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export function clock(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function shortDate(at: number): string {
  return at === 0 ? '—' : new Date(at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
