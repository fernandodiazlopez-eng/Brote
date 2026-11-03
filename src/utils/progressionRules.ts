/**
 * Reglas de progresión RPG de Upgrade: cálculo de XP, niveles (0-100),
 * memoria muscular y penalización por inactividad prolongada.
 */

import {
  AppLanguage,
  CompletedWorkout,
  DailyActivityRecord,
  RoutineCategory,
  XpFormulas,
} from '../types';
import { evaluateXpFormula } from './xpFormulaParser';

export const MAX_LEVEL = 100;
export const MAX_TOTAL_XP = 100_000;
export const MAX_LEVEL_DROP = 15;
export const SIGNIFICANT_DAILY_STEPS = 3_000;
export const KM_PER_STEP = 0.00076;

export const DEFAULT_XP_FORMULAS: XpFormulas = {
  stepsFormula: 'Math.floor(Math.sqrt(pasos))',
  strengthFormula: 'Math.floor(30 * Math.sqrt(minutos))',
  cardioFormula: 'Math.floor(25 * Math.sqrt(minutos))',
  hybridFormula: 'Math.floor(28 * Math.sqrt(minutos))',
};

export const DEFAULT_XP_FORMULAS_EN: XpFormulas = {
  stepsFormula: 'Math.floor(Math.sqrt(steps))',
  strengthFormula: 'Math.floor(30 * Math.sqrt(minutes))',
  cardioFormula: 'Math.floor(25 * Math.sqrt(minutes))',
  hybridFormula: 'Math.floor(28 * Math.sqrt(minutes))',
};

export function getDefaultXpFormulas(language: AppLanguage = 'es'): XpFormulas {
  return language === 'en' ? { ...DEFAULT_XP_FORMULAS_EN } : { ...DEFAULT_XP_FORMULAS };
}

export function isDefaultStepsFormula(formula: string): boolean {
  const trimmed = formula.trim();
  return (
    trimmed === DEFAULT_XP_FORMULAS.stepsFormula ||
    trimmed === DEFAULT_XP_FORMULAS_EN.stepsFormula
  );
}

export function isDefaultStrengthFormula(formula: string): boolean {
  const trimmed = formula.trim();
  return (
    trimmed === DEFAULT_XP_FORMULAS.strengthFormula ||
    trimmed === DEFAULT_XP_FORMULAS_EN.strengthFormula
  );
}

export function isDefaultCardioFormula(formula: string): boolean {
  const trimmed = formula.trim();
  return (
    trimmed === DEFAULT_XP_FORMULAS.cardioFormula ||
    trimmed === DEFAULT_XP_FORMULAS_EN.cardioFormula
  );
}

export function isDefaultHybridFormula(formula: string): boolean {
  const trimmed = formula.trim();
  return (
    trimmed === DEFAULT_XP_FORMULAS.hybridFormula ||
    trimmed === DEFAULT_XP_FORMULAS_EN.hybridFormula
  );
}

export function localizeXpFormulasIfDefault(
  formulas: XpFormulas,
  language: AppLanguage
): XpFormulas {
  const defaults = getDefaultXpFormulas(language);
  return {
    stepsFormula: isDefaultStepsFormula(formulas.stepsFormula)
      ? defaults.stepsFormula
      : formulas.stepsFormula,
    strengthFormula: isDefaultStrengthFormula(formulas.strengthFormula)
      ? defaults.strengthFormula
      : formulas.strengthFormula,
    cardioFormula: isDefaultCardioFormula(formulas.cardioFormula)
      ? defaults.cardioFormula
      : formulas.cardioFormula,
    hybridFormula: isDefaultHybridFormula(formulas.hybridFormula)
      ? defaults.hybridFormula
      : formulas.hybridFormula,
  };
}

export function areDefaultXpFormulas(formulas: XpFormulas): boolean {
  return (
    isDefaultStepsFormula(formulas.stepsFormula) &&
    isDefaultStrengthFormula(formulas.strengthFormula) &&
    isDefaultCardioFormula(formulas.cardioFormula) &&
    isDefaultHybridFormula(formulas.hybridFormula)
  );
}

// --- 1. Ganancia de XP por actividad ---

export function calculateStepsXp(
  steps: number,
  formulas: XpFormulas = DEFAULT_XP_FORMULAS
): number {
  return evaluateXpFormula(
    formulas.stepsFormula,
    'pasos',
    steps,
    DEFAULT_XP_FORMULAS.stepsFormula
  );
}

export function calculateStrengthXp(
  minutes: number,
  formulas: XpFormulas = DEFAULT_XP_FORMULAS
): number {
  return evaluateXpFormula(
    formulas.strengthFormula,
    'minutos',
    minutes,
    DEFAULT_XP_FORMULAS.strengthFormula
  );
}

export function calculateCardioXp(
  minutes: number,
  formulas: XpFormulas = DEFAULT_XP_FORMULAS
): number {
  return evaluateXpFormula(
    formulas.cardioFormula,
    'minutos',
    minutes,
    DEFAULT_XP_FORMULAS.cardioFormula
  );
}

export function calculateHybridXp(
  minutes: number,
  formulas: XpFormulas = DEFAULT_XP_FORMULAS
): number {
  return evaluateXpFormula(
    formulas.hybridFormula,
    'minutos',
    minutes,
    DEFAULT_XP_FORMULAS.hybridFormula
  );
}

export function calculateRoutineBaseXp(
  category: RoutineCategory,
  durationMin: number,
  formulas: XpFormulas = DEFAULT_XP_FORMULAS
): number {
  if (category === 'Fuerza') {
    return calculateStrengthXp(durationMin, formulas);
  }
  if (category === 'Híbrida') {
    return calculateHybridXp(durationMin, formulas);
  }
  return calculateCardioXp(durationMin, formulas);
}

function getSafeWorkoutCompletionRatio(workout: CompletedWorkout): number {
  if (
    typeof workout.completionRatio === 'number' &&
    Number.isFinite(workout.completionRatio)
  ) {
    return Math.max(0, Math.min(1, workout.completionRatio));
  }
  return 1;
}

/**
 * Recalcula el XP marginal de cada sesión del día respetando:
 * 1) El reparto a partes iguales entre los ejercicios completados de la rutina (`completionRatio = hechos / total`).
 * 2) Los rendimientos decrecientes por modalidad (acumulando los minutos efectivos realizados en orden cronológico).
 */
export function recalculateDailyWorkoutsMarginalXp(
  workoutsNewestFirst: CompletedWorkout[],
  formulas: XpFormulas = DEFAULT_XP_FORMULAS
): CompletedWorkout[] {
  const chronological = [...workoutsNewestFirst].reverse();
  let accumulatedStrengthMin = 0;
  let accumulatedCardioMin = 0;
  let accumulatedHybridMin = 0;

  const updatedChronological = chronological.map((workout) => {
    const ratio = getSafeWorkoutCompletionRatio(workout);
    if (ratio <= 0) {
      return { ...workout, xpEarned: 0 };
    }

    if (workout.category === 'Fuerza') {
      const fullSlotXp = Math.max(
        0,
        calculateStrengthXp(accumulatedStrengthMin + workout.durationMin, formulas) -
          calculateStrengthXp(accumulatedStrengthMin, formulas)
      );
      const earnedXp = Math.round(fullSlotXp * ratio);
      accumulatedStrengthMin += workout.durationMin * ratio;
      return { ...workout, xpEarned: earnedXp };
    }

    if (workout.category === 'Híbrida') {
      const fullSlotXp = Math.max(
        0,
        calculateHybridXp(accumulatedHybridMin + workout.durationMin, formulas) -
          calculateHybridXp(accumulatedHybridMin, formulas)
      );
      const earnedXp = Math.round(fullSlotXp * ratio);
      accumulatedHybridMin += workout.durationMin * ratio;
      return { ...workout, xpEarned: earnedXp };
    }

    const fullSlotXp = Math.max(
      0,
      calculateCardioXp(accumulatedCardioMin + workout.durationMin, formulas) -
        calculateCardioXp(accumulatedCardioMin, formulas)
    );
    const earnedXp = Math.round(fullSlotXp * ratio);
    accumulatedCardioMin += workout.durationMin * ratio;
    return { ...workout, xpEarned: earnedXp };
  });

  return updatedChronological.reverse();
}

/**
 * Calcula el XP marginal completo (100% de ejercicios) que otorgaría la siguiente sesión hoy,
 * para mostrar en vivo el reparto exacto por ejercicio durante el entrenamiento.
 */
export function previewNextWorkoutMarginalXp(
  existingWorkoutsNewestFirst: CompletedWorkout[],
  category: RoutineCategory,
  durationMin: number,
  formulas: XpFormulas = DEFAULT_XP_FORMULAS
): number {
  let accumulatedCategoryMin = 0;
  for (let i = existingWorkoutsNewestFirst.length - 1; i >= 0; i -= 1) {
    const w = existingWorkoutsNewestFirst[i];
    if (w.category === category) {
      accumulatedCategoryMin += w.durationMin * getSafeWorkoutCompletionRatio(w);
    }
  }

  if (category === 'Fuerza') {
    return Math.max(
      0,
      calculateStrengthXp(accumulatedCategoryMin + durationMin, formulas) -
        calculateStrengthXp(accumulatedCategoryMin, formulas)
    );
  }
  if (category === 'Híbrida') {
    return Math.max(
      0,
      calculateHybridXp(accumulatedCategoryMin + durationMin, formulas) -
        calculateHybridXp(accumulatedCategoryMin, formulas)
    );
  }
  return Math.max(
    0,
    calculateCardioXp(accumulatedCategoryMin + durationMin, formulas) -
      calculateCardioXp(accumulatedCategoryMin, formulas)
  );
}

export function calculateDailyTotalXp(
  dayRecord: DailyActivityRecord | undefined,
  formulas: XpFormulas = DEFAULT_XP_FORMULAS
): number {
  if (!dayRecord) return 0;

  const workoutsWithXp =
    dayRecord.completedWorkouts.length > 0
      ? recalculateDailyWorkoutsMarginalXp(dayRecord.completedWorkouts, formulas)
      : [];
  const totalWorkoutsXp = workoutsWithXp.reduce((sum, w) => sum + w.xpEarned, 0);

  return calculateStepsXp(dayRecord.steps, formulas) + totalWorkoutsXp;
}

// --- 2. Descanso, Inactividad y Memoria Muscular ---

export function hasMinimumDailyActivity(workoutsCount: number, steps: number): boolean {
  return workoutsCount > 0 || steps > SIGNIFICANT_DAILY_STEPS;
}

/**
 * Días 1-4 sin actividad: 0 XP de pérdida (descanso saludable).
 * Días 5-14: -100 XP por día.
 * Día 15 en adelante: -250 XP por día.
 */
export function getDailyInactivityXpPenalty(consecutiveInactiveDays: number): number {
  if (consecutiveInactiveDays <= 4) return 0;
  if (consecutiveInactiveDays <= 14) return 100;
  return 250;
}

// --- 3. Niveles y Piso de Memoria Muscular (máx. -15 niveles) ---

export function calculateLevelFromXp(totalXp: number): number {
  const safeXp = Math.max(0, totalXp);
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(safeXp / 10)));
}

export function getMinXpForLevel(level: number): number {
  const clampedLevel = Math.max(0, Math.min(MAX_LEVEL, level));
  return 10 * clampedLevel * clampedLevel;
}

export function calculateContinuousLevelFromXp(totalXp: number): number {
  const safeXp = Math.max(0, Math.min(MAX_TOTAL_XP, totalXp));
  const integerLevel = calculateLevelFromXp(safeXp);
  if (integerLevel >= MAX_LEVEL) return MAX_LEVEL;

  const currentBracketMinXp = getMinXpForLevel(integerLevel);
  const nextBracketMinXp = getMinXpForLevel(integerLevel + 1);
  const progressInLevel = Math.min(
    1,
    Math.max(0, safeXp - currentBracketMinXp) /
      Math.max(1, nextBracketMinXp - currentBracketMinXp)
  );

  return Math.min(MAX_LEVEL, integerLevel + progressInLevel);
}

export function getMuscleMemoryFloorLevel(peakLevel: number): number {
  return Math.max(0, Math.min(MAX_LEVEL, peakLevel) - MAX_LEVEL_DROP);
}

export function getMuscleMemoryFloorXp(peakLevel: number): number {
  return getMinXpForLevel(getMuscleMemoryFloorLevel(peakLevel));
}
