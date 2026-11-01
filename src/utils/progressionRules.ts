/**
 * Reglas de progresión RPG: cálculo de XP, niveles (0-100), memoria muscular,
 * penalización por inactividad prolongada y marchitamiento del árbol.
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
};

export const DEFAULT_XP_FORMULAS_EN: XpFormulas = {
  stepsFormula: 'Math.floor(Math.sqrt(steps))',
  strengthFormula: 'Math.floor(30 * Math.sqrt(minutes))',
  cardioFormula: 'Math.floor(25 * Math.sqrt(minutes))',
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
  };
}

export function areDefaultXpFormulas(formulas: XpFormulas): boolean {
  return (
    isDefaultStepsFormula(formulas.stepsFormula) &&
    isDefaultStrengthFormula(formulas.strengthFormula) &&
    isDefaultCardioFormula(formulas.cardioFormula)
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

export function calculateRoutineBaseXp(
  category: RoutineCategory,
  durationMin: number,
  formulas: XpFormulas = DEFAULT_XP_FORMULAS
): number {
  return category === 'Fuerza'
    ? calculateStrengthXp(durationMin, formulas)
    : calculateCardioXp(durationMin, formulas);
}

/**
 * Recalcula el XP marginal de cada sesión del día respetando los rendimientos
 * decrecientes (acumulando minutos de Fuerza y Cardio por separado en orden cronológico).
 */
export function recalculateDailyWorkoutsMarginalXp(
  workoutsNewestFirst: CompletedWorkout[],
  formulas: XpFormulas = DEFAULT_XP_FORMULAS
): CompletedWorkout[] {
  const chronological = [...workoutsNewestFirst].reverse();
  let accumulatedStrengthMin = 0;
  let accumulatedCardioMin = 0;

  const updatedChronological = chronological.map((workout) => {
    if (workout.category === 'Fuerza') {
      const nextMinutes = accumulatedStrengthMin + workout.durationMin;
      const marginalXp = Math.max(
        0,
        calculateStrengthXp(nextMinutes, formulas) -
          calculateStrengthXp(accumulatedStrengthMin, formulas)
      );
      accumulatedStrengthMin = nextMinutes;
      return { ...workout, xpEarned: marginalXp };
    }

    const nextMinutes = accumulatedCardioMin + workout.durationMin;
    const marginalXp = Math.max(
      0,
      calculateCardioXp(nextMinutes, formulas) -
        calculateCardioXp(accumulatedCardioMin, formulas)
    );
    accumulatedCardioMin = nextMinutes;
    return { ...workout, xpEarned: marginalXp };
  });

  return updatedChronological.reverse();
}

export function calculateDailyTotalXp(
  dayRecord: DailyActivityRecord | undefined,
  formulas: XpFormulas = DEFAULT_XP_FORMULAS
): number {
  if (!dayRecord) return 0;

  let totalStrengthMinutes = 0;
  let totalCardioMinutes = 0;

  for (const workout of dayRecord.completedWorkouts) {
    if (workout.category === 'Fuerza') {
      totalStrengthMinutes += workout.durationMin;
    } else {
      totalCardioMinutes += workout.durationMin;
    }
  }

  return (
    calculateStepsXp(dayRecord.steps, formulas) +
    calculateStrengthXp(totalStrengthMinutes, formulas) +
    calculateCardioXp(totalCardioMinutes, formulas)
  );
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

// --- 3. Niveles, Piso de Memoria Muscular (máx. -15 niveles) y Marchitamiento del Árbol ---

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

/**
 * Calcula qué tan marchito está el árbol [0..1] según los niveles perdidos respecto
 * al máximo histórico alcanzado (al perder el tope de 15 niveles llega a 1.0 = 100% marchito).
 */
export function calculateTreeWitherProgress(
  currentContinuousLevel: number,
  peakContinuousLevel: number
): number {
  const safePeak = Math.max(0, Math.min(MAX_LEVEL, peakContinuousLevel));
  if (safePeak <= 0.25) return 0;

  const safeCurrent = Math.max(0, Math.min(safePeak, currentContinuousLevel));
  const levelsLost = Math.max(0, safePeak - safeCurrent);
  if (levelsLost <= 0) return 0;

  const maxPossibleDrop = Math.min(MAX_LEVEL_DROP, safePeak);
  return Math.min(1, levelsLost / Math.max(0.5, maxPossibleDrop));
}
