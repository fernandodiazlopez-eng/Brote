/**
 * Reglas fisiológicas de carga y recuperación muscular para el esquema anatómico:
 * - Músculos grandes (Pecho, Espalda, Muslo, Glúteo): 72 horas (3 días) en limpiarse.
 *   · 0–24h (Día 1): 'loaded' (oscuro e intenso, saturado / riesgo de sobrecarga).
 *   · 24–72h (Días 2 y 3): 'recovering' (tono más claro, listo para entrenar sin peligro).
 *   · >72h (Día 4+): 'fresh' (gris apagado, limpio).
 * - Músculos pequeños (Hombro, Bíceps, Tríceps, Antebrazo, Gemelos, Abdomen): 48 horas (2 días) en limpiarse.
 *   · 0–24h (Día 1): 'loaded' (oscuro e intenso, carga máxima).
 *   · 24–48h (Día 2): 'recovering' (tono más claro, recuperado sin riesgo).
 *   · >48h (Día 3+): 'fresh' (gris apagado, limpio).
 */

import { UiTextsMap } from '../i18n/translations';
import {
  DailyActivityRecord,
  MuscleFatigueState,
  MuscleGroupId,
  Routine,
  RoutineCategory,
  RoutineExercise,
} from '../types';
import { addDaysToIso, parseLocalDateIso } from './calendarDates';

export const ALL_MUSCLE_GROUPS: readonly MuscleGroupId[] = [
  'pecho',
  'hombro',
  'biceps',
  'triceps',
  'antebrazo',
  'abdomen',
  'espalda',
  'gluteo',
  'muslo',
  'gemelos',
];

const VALID_MUSCLE_SET = new Set<string>(ALL_MUSCLE_GROUPS);

const LARGE_MUSCLE_SET = new Set<MuscleGroupId>([
  'pecho',
  'espalda',
  'muslo',
  'gluteo',
]);

export function isValidMuscleGroupId(value: unknown): value is MuscleGroupId {
  return typeof value === 'string' && VALID_MUSCLE_SET.has(value);
}

export function sanitizeMuscleGroups(raw: unknown): MuscleGroupId[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const unique: MuscleGroupId[] = [];
  for (const item of raw) {
    if (isValidMuscleGroupId(item) && !unique.includes(item)) {
      unique.push(item);
    }
  }
  return unique.length > 0 ? ALL_MUSCLE_GROUPS.filter((id) => unique.includes(id)) : undefined;
}

export function extractMuscleGroupsFromExercises(
  exercises: RoutineExercise[]
): MuscleGroupId[] | undefined {
  const collected: MuscleGroupId[] = [];
  for (const ex of exercises) {
    if (Array.isArray(ex.muscleGroups)) {
      for (const m of ex.muscleGroups) {
        if (isValidMuscleGroupId(m)) {
          collected.push(m);
        }
      }
    }
  }
  return sanitizeMuscleGroups(collected);
}

export function categorySupportsMuscles(category: RoutineCategory): boolean {
  return category === 'Fuerza' || category === 'Híbrida';
}

export function isLargeMuscleGroup(muscle: MuscleGroupId): boolean {
  return LARGE_MUSCLE_SET.has(muscle);
}

export function getMuscleTotalClearHours(muscle: MuscleGroupId): 72 | 48 {
  return isLargeMuscleGroup(muscle) ? 72 : 48;
}

export function getLocalizedMuscleLabel(muscle: MuscleGroupId, t: UiTextsMap): string {
  switch (muscle) {
    case 'pecho':
      return t.muscle_pecho;
    case 'hombro':
      return t.muscle_hombro;
    case 'biceps':
      return t.muscle_biceps;
    case 'triceps':
      return t.muscle_triceps;
    case 'antebrazo':
      return t.muscle_antebrazo;
    case 'abdomen':
      return t.muscle_abdomen;
    case 'espalda':
      return t.muscle_espalda;
    case 'gluteo':
      return t.muscle_gluteo;
    case 'muslo':
      return t.muscle_muslo;
    case 'gemelos':
      return t.muscle_gemelos;
  }
}

export interface MuscleRecoveryStatus {
  id: MuscleGroupId;
  isLarge: boolean;
  totalClearHours: 72 | 48;
  state: MuscleFatigueState;
  elapsedHours: number | null;
  hoursUntilReady: number;
  hoursUntilFresh: number;
}

function parseWorkoutLocalTimestampMs(dateIso: string, timeLabel: string): number {
  const baseDate = parseLocalDateIso(dateIso);
  const parts = timeLabel.split(':');
  const hours = parts.length === 2 ? Number(parts[0]) : 12;
  const minutes = parts.length === 2 ? Number(parts[1]) : 0;

  baseDate.setHours(
    Number.isFinite(hours) ? Math.max(0, Math.min(23, hours)) : 12,
    Number.isFinite(minutes) ? Math.max(0, Math.min(59, minutes)) : 0,
    0,
    0
  );
  return baseDate.getTime();
}

export function computeAllMuscleStatuses(params: {
  todayIso: string;
  nowMs: number;
  daysByIso: Record<string, DailyActivityRecord>;
  routines: Routine[];
  trashedRoutines?: Routine[];
  activeSessionMuscles?: MuscleGroupId[];
}): Record<MuscleGroupId, MuscleRecoveryStatus> {
  const {
    todayIso,
    nowMs,
    daysByIso,
    routines,
    trashedRoutines = [],
    activeSessionMuscles = [],
  } = params;

  const routineById = new Map<string, Routine>();
  for (const r of trashedRoutines) {
    routineById.set(r.id, r);
  }
  for (const r of routines) {
    routineById.set(r.id, r);
  }

  const latestTrainedMsByMuscle = new Map<MuscleGroupId, number>();

  // Solo necesitamos revisar los últimos 4 días hasta hoy (máximo 72h + margen horario)
  for (let dayOffset = -4; dayOffset <= 0; dayOffset += 1) {
    const checkIso = addDaysToIso(todayIso, dayOffset);
    const dayRecord = daysByIso[checkIso];
    if (!dayRecord || dayRecord.completedWorkouts.length === 0) continue;

    for (const workout of dayRecord.completedWorkouts) {
      if (!categorySupportsMuscles(workout.category)) continue;

      const resolvedMuscles =
        workout.muscleGroups !== undefined
          ? workout.muscleGroups
          : workout.routineId
          ? routineById.get(workout.routineId)?.muscleGroups
          : undefined;

      if (!resolvedMuscles || resolvedMuscles.length === 0) continue;

      const workoutMs = parseWorkoutLocalTimestampMs(checkIso, workout.timeLabel);
      // Si se completó hoy con un reloj ligeramente adelantado, acotar a nowMs
      const effectiveMs = Math.min(nowMs, workoutMs);

      for (const muscle of resolvedMuscles) {
        const prevMs = latestTrainedMsByMuscle.get(muscle);
        if (prevMs === undefined || effectiveMs > prevMs) {
          latestTrainedMsByMuscle.set(muscle, effectiveMs);
        }
      }
    }
  }

  // Ejercicios marcados en vivo en la lista de la sesión actual -> ya se marcan en el monigote
  for (const liveMuscle of activeSessionMuscles) {
    if (isValidMuscleGroupId(liveMuscle)) {
      latestTrainedMsByMuscle.set(liveMuscle, nowMs);
    }
  }

  const statuses = {} as Record<MuscleGroupId, MuscleRecoveryStatus>;

  for (const muscle of ALL_MUSCLE_GROUPS) {
    const isLarge = isLargeMuscleGroup(muscle);
    const totalClearHours = getMuscleTotalClearHours(muscle);
    const lastMs = latestTrainedMsByMuscle.get(muscle);

    if (lastMs === undefined) {
      statuses[muscle] = {
        id: muscle,
        isLarge,
        totalClearHours,
        state: 'fresh',
        elapsedHours: null,
        hoursUntilReady: 0,
        hoursUntilFresh: 0,
      };
      continue;
    }

    const elapsedHours = Math.max(0, (nowMs - lastMs) / 3_600_000);

    if (elapsedHours < 24) {
      statuses[muscle] = {
        id: muscle,
        isLarge,
        totalClearHours,
        state: 'loaded',
        elapsedHours,
        hoursUntilReady: Math.max(1, Math.ceil(24 - elapsedHours)),
        hoursUntilFresh: Math.max(1, Math.ceil(totalClearHours - elapsedHours)),
      };
    } else if (elapsedHours < totalClearHours) {
      statuses[muscle] = {
        id: muscle,
        isLarge,
        totalClearHours,
        state: 'recovering',
        elapsedHours,
        hoursUntilReady: 0,
        hoursUntilFresh: Math.max(1, Math.ceil(totalClearHours - elapsedHours)),
      };
    } else {
      statuses[muscle] = {
        id: muscle,
        isLarge,
        totalClearHours,
        state: 'fresh',
        elapsedHours: null,
        hoursUntilReady: 0,
        hoursUntilFresh: 0,
      };
    }
  }

  return statuses;
}
