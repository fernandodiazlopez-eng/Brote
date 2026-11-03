/**
 * Catálogo completo de los 31 trofeos de Upgrade (Bronce, Plata, Oro, Platino y Platino Diamante)
 * y evaluador en tiempo real de nuevos logros desbloqueados.
 */

import { AppLanguage, DailyActivityRecord, Trophy, TrophyTier, XpFormulas } from '../types';
import {
  addDaysToIso,
  countDaysBetweenIso,
  getMondayDateIso,
} from '../utils/calendarDates';
import { calculateDailyTotalXp, KM_PER_STEP } from '../utils/progressionRules';

export interface TrophyTierVisualStyle {
  qualityRank: number;
  label: string;
  labelEn: string;
  iconTextClass: string;
  ledActiveClass: string;
  emblemFrameClass: string;
  emblemSheenAnimClass: string | null;
  emblemSheenBeamClass: string;
  cardBorderClass: string;
  topAccentLineClass: string | null;
  sheenTrackAnimClass: string | null;
  sheenBarClass: string | null;
  sheenWidthClass: string;
}

export const TROPHY_TIER_STYLES: Record<TrophyTier, TrophyTierVisualStyle> = {
  bronce: {
    qualityRank: 1,
    label: 'Bronce',
    labelEn: 'Bronze',
    iconTextClass: 'text-[#8c4622] dark:text-[#d4875e]',
    ledActiveClass: 'bg-[#b35c32] dark:bg-[#d4875e]',
    emblemFrameClass: 'border border-[#b35c32]/45 dark:border-[#c8754b]/45',
    emblemSheenAnimClass: null,
    emblemSheenBeamClass: '',
    cardBorderClass: 'border-[#b35c32]/40 dark:border-[#c8754b]/40',
    topAccentLineClass: null,
    sheenTrackAnimClass: null,
    sheenBarClass: null,
    sheenWidthClass: '',
  },
  plata: {
    qualityRank: 2,
    label: 'Plata',
    labelEn: 'Silver',
    iconTextClass: 'text-[#475569] dark:text-[#cbd5e1]',
    ledActiveClass: 'bg-[#64748b] dark:bg-[#e2e8f0]',
    emblemFrameClass: 'border border-[#64748b]/50 dark:border-[#cbd5e1]/50 trophy-glow-plata',
    emblemSheenAnimClass: 'animate-emblem-sheen-plata',
    emblemSheenBeamClass: 'w-4 bg-gradient-to-r from-transparent via-white/20 to-transparent',
    cardBorderClass: 'border-[#64748b]/45 dark:border-[#cbd5e1]/45',
    topAccentLineClass:
      'bg-gradient-to-r from-transparent via-[#64748b]/40 dark:via-[#cbd5e1]/45 to-transparent',
    sheenTrackAnimClass: 'animate-trophy-sheen-plata',
    sheenBarClass:
      'bg-gradient-to-r from-transparent via-[#94a3b8]/12 dark:via-[#e2e8f0]/14 to-transparent',
    sheenWidthClass: 'w-20',
  },
  oro: {
    qualityRank: 3,
    label: 'Oro',
    labelEn: 'Gold',
    iconTextClass: 'text-[#a16800] dark:text-[#f5c438]',
    ledActiveClass: 'bg-[#d99000] dark:bg-[#f5c438]',
    emblemFrameClass: 'border border-[#d99000]/60 dark:border-[#eab308]/70 trophy-glow-oro',
    emblemSheenAnimClass: 'animate-emblem-sheen-oro',
    emblemSheenBeamClass: 'w-5 bg-gradient-to-r from-transparent via-[#fef08a]/28 to-transparent',
    cardBorderClass: 'border-[#d99000]/55 dark:border-[#eab308]/60',
    topAccentLineClass:
      'bg-gradient-to-r from-transparent via-[#d99000]/65 dark:via-[#f5c438]/75 to-transparent',
    sheenTrackAnimClass: 'animate-trophy-sheen-oro',
    sheenBarClass:
      'bg-gradient-to-r from-transparent via-[#f5b427]/16 dark:via-[#fde047]/18 to-transparent',
    sheenWidthClass: 'w-28',
  },
  platino: {
    qualityRank: 4,
    label: 'Platino',
    labelEn: 'Platinum',
    iconTextClass: 'text-[#0369a1] dark:text-[#7dd3fc]',
    ledActiveClass: 'bg-[#0284c7] dark:bg-[#7dd3fc]',
    emblemFrameClass: 'border border-[#0284c7]/60 dark:border-[#7dd3fc]/75 trophy-glow-platino',
    emblemSheenAnimClass: 'animate-emblem-sheen-platino',
    emblemSheenBeamClass: 'w-6 bg-gradient-to-r from-transparent via-[#e0f2fe]/38 to-transparent',
    cardBorderClass: 'border-[#0284c7]/55 dark:border-[#7dd3fc]/65',
    topAccentLineClass:
      'bg-gradient-to-r from-transparent via-[#0284c7]/75 dark:via-[#7dd3fc]/85 to-transparent',
    sheenTrackAnimClass: 'animate-trophy-sheen-platino',
    sheenBarClass:
      'bg-gradient-to-r from-transparent via-[#38bdf8]/16 dark:via-[#7dd3fc]/22 to-transparent',
    sheenWidthClass: 'w-36',
  },
  diamante: {
    qualityRank: 5,
    label: 'Platino Diamante',
    labelEn: 'Diamond Platinum',
    iconTextClass: 'text-[#4338ca] dark:text-[#a5b4fc]',
    ledActiveClass: 'bg-[#4f46e5] dark:bg-[#818cf8]',
    emblemFrameClass: 'border border-[#4f46e5]/65 dark:border-[#818cf8]/85 trophy-glow-diamante',
    emblemSheenAnimClass: 'animate-emblem-sheen-diamante',
    emblemSheenBeamClass: 'w-7 bg-gradient-to-r from-transparent via-white/45 to-transparent',
    cardBorderClass: 'border-[#4f46e5]/60 dark:border-[#818cf8]/75',
    topAccentLineClass:
      'bg-gradient-to-r from-[#38bdf8]/80 via-[#818cf8] to-[#38bdf8]/80',
    sheenTrackAnimClass: 'animate-trophy-sheen-diamante',
    sheenBarClass:
      'bg-gradient-to-r from-transparent via-[#6366f1]/16 dark:via-[#a5b4fc]/26 to-transparent',
    sheenWidthClass: 'w-44',
  },
};

export const TROPHY_CATALOG: Trophy[] = [
  // --- BRONCE (10) ---
  {
    id: 'nivel_10',
    tier: 'bronce',
    title: 'Nivel 10',
    description: 'Alcanzar el Nivel 10.',
  },
  {
    id: 'nivel_20',
    tier: 'bronce',
    title: 'Nivel 20',
    description: 'Alcanzar el Nivel 20.',
  },
  {
    id: 'primer_paso',
    tier: 'bronce',
    title: 'Dar el primer paso',
    description: 'Registrar 10.000 pasos en un solo día.',
  },
  {
    id: 'cuarto_maraton',
    tier: 'bronce',
    title: 'Cuarto de maratón',
    description: 'Registrar 13.000 pasos en un solo día.',
  },
  {
    id: 'racha_bronce',
    tier: 'bronce',
    title: 'Racha de bronce',
    description: 'Ganar experiencia durante 10 días seguidos.',
  },
  {
    id: 'madrugador',
    tier: 'bronce',
    title: 'Madrugador',
    description: 'Completar un entrenamiento antes de las 09:00 de la mañana.',
  },
  {
    id: 'buho_nocturno',
    tier: 'bronce',
    title: 'Búho nocturno',
    description: 'Registrar una sesión de ejercicio pasadas las 22:00 de la noche.',
  },
  {
    id: 'el_indeciso',
    tier: 'bronce',
    title: 'El indeciso',
    description: 'Cambiar, editar o cancelar tu rutina programada más de 3 veces en un solo día.',
  },
  {
    id: 'merecido_descanso',
    tier: 'bronce',
    title: 'Un merecido descanso',
    description:
      'Registrar actividad de fuerza o cardio exactamente en el quinto día de inactividad, antes de perder puntos.',
  },
  {
    id: 'mas_de_8000',
    tier: 'bronce',
    title: '¡Es más de 8.000!',
    description: 'Acumular más de 8.000 puntos de experiencia totales en tu perfil.',
  },

  // --- PLATA (9) ---
  {
    id: 'nivel_30',
    tier: 'plata',
    title: 'Nivel 30',
    description: 'Alcanzar el Nivel 30.',
  },
  {
    id: 'nivel_40',
    tier: 'plata',
    title: 'Nivel 40',
    description: 'Alcanzar el Nivel 40.',
  },
  {
    id: 'nivel_50',
    tier: 'plata',
    title: 'Nivel 50',
    description: 'Alcanzar el Nivel 50.',
  },
  {
    id: 'medio_maraton',
    tier: 'plata',
    title: 'Medio maratón',
    description: 'Registrar 26.000 pasos en un solo día.',
  },
  {
    id: 'racha_plata',
    tier: 'plata',
    title: 'Racha de plata',
    description: 'Ganar experiencia durante 20 días seguidos.',
  },
  {
    id: 'atleta_hibrido',
    tier: 'plata',
    title: 'Atleta Híbrido',
    description: 'Registrar pasos, una sesión de fuerza y una sesión de cardio en la misma jornada.',
  },
  {
    id: 'fin_semana_guerrero',
    tier: 'plata',
    title: 'Fin de semana guerrero',
    description: 'Registrar entrenamientos tanto el sábado como el domingo de una misma semana.',
  },
  {
    id: 'todo_el_dia',
    tier: 'plata',
    title: 'Haría esto todo el día',
    description:
      'Registrar una sesión por la mañana y otra distinta pasadas las 20:00 horas del mismo día.',
  },
  {
    id: 'proposito_ano_nuevo',
    tier: 'plata',
    title: 'Propósito de año nuevo',
    description: 'Registrar una sesión de ejercicio exactamente el día 1 de enero.',
  },

  // --- ORO (6) ---
  {
    id: 'nivel_60',
    tier: 'oro',
    title: 'Nivel 60',
    description: 'Alcanzar el Nivel 60.',
  },
  {
    id: 'nivel_70',
    tier: 'oro',
    title: 'Nivel 70',
    description: 'Alcanzar el Nivel 70.',
  },
  {
    id: 'nivel_80',
    tier: 'oro',
    title: 'Nivel 80',
    description: 'Alcanzar el Nivel 80.',
  },
  {
    id: 'nivel_90',
    tier: 'oro',
    title: 'Nivel 90',
    description: 'Alcanzar el Nivel 90.',
  },
  {
    id: 'maraton_completo',
    tier: 'oro',
    title: 'Maratón completo',
    description: 'Registrar el equivalente a 42 kilómetros en pasos en un solo día.',
  },
  {
    id: 'racha_oro',
    tier: 'oro',
    title: 'Racha de oro',
    description: 'Ganar experiencia durante 30 días seguidos.',
  },

  // --- PLATINO (5) ---
  {
    id: 'nivel_100',
    tier: 'platino',
    title: 'Nivel 100',
    description: 'Alcanzar el nivel máximo acumulando 100.000 XP.',
  },
  {
    id: 'esta_hecho',
    tier: 'platino',
    title: '"Está hecho..."',
    description: 'Alcanzar la cifra histórica de 3.500.000 de pasos acumulados en total.',
  },
  {
    id: 'iron_man',
    tier: 'platino',
    title: 'IRON MAN',
    description: 'Registrar 4 sesiones de cardio diferentes en un mismo día.',
  },
  {
    id: 'heroe_por_diversion',
    tier: 'platino',
    title: 'Héroe por diversión',
    description:
      'Registrar al menos 10.000 pasos y una sesión de fuerza todos los días durante una semana completa.',
  },
  {
    id: 'a_un_pixel',
    tier: 'platino',
    title: '¡A un pixel!',
    description:
      'Quedarte exactamente a 1 punto de experiencia de alcanzar el Nivel 100 (99.999 XP).',
  },

  // --- PLATINO DIAMANTE (1) ---
  {
    id: 'completista_definitivo',
    tier: 'diamante',
    title: 'Completista Definitivo',
    description:
      'Desbloquear los 30 logros anteriores. Este trofeo oculto es la recompensa final que demuestra el dominio absoluto del sistema y de tu propia condición física.',
  },
];

const TROPHY_TRANSLATIONS_EN: Record<string, { title: string; description: string }> = {
  nivel_10: {
    title: 'Level 10',
    description: 'Reach Level 10.',
  },
  nivel_20: {
    title: 'Level 20',
    description: 'Reach Level 20.',
  },
  primer_paso: {
    title: 'Take the First Step',
    description: 'Log 10,000 steps in a single day.',
  },
  cuarto_maraton: {
    title: 'Quarter Marathon',
    description: 'Log 13,000 steps in a single day.',
  },
  racha_bronce: {
    title: 'Bronze Streak',
    description: 'Earn experience for 10 consecutive days.',
  },
  madrugador: {
    title: 'Early Bird',
    description: 'Complete a workout before 09:00 AM.',
  },
  buho_nocturno: {
    title: 'Night Owl',
    description: 'Log a workout session after 10:00 PM.',
  },
  el_indeciso: {
    title: 'The Indecisive',
    description: 'Change, edit, or cancel your scheduled routine more than 3 times in a single day.',
  },
  merecido_descanso: {
    title: 'A Well-Deserved Rest',
    description:
      'Log a strength or cardio workout on the exact fifth day of inactivity, right before losing points.',
  },
  mas_de_8000: {
    title: "It's Over 8,000!",
    description: 'Accumulate more than 8,000 total experience points on your profile.',
  },
  nivel_30: {
    title: 'Level 30',
    description: 'Reach Level 30.',
  },
  nivel_40: {
    title: 'Level 40',
    description: 'Reach Level 40.',
  },
  nivel_50: {
    title: 'Level 50',
    description: 'Reach Level 50.',
  },
  medio_maraton: {
    title: 'Half Marathon',
    description: 'Log 26,000 steps in a single day.',
  },
  racha_plata: {
    title: 'Silver Streak',
    description: 'Earn experience for 20 consecutive days.',
  },
  atleta_hibrido: {
    title: 'Hybrid Athlete',
    description: 'Log steps, a strength session, and a cardio session on the same day.',
  },
  fin_semana_guerrero: {
    title: 'Weekend Warrior',
    description: 'Log workouts on both Saturday and Sunday of the same week.',
  },
  todo_el_dia: {
    title: 'I Could Do This All Day',
    description:
      'Log one morning session and a different session after 8:00 PM on the same day.',
  },
  proposito_ano_nuevo: {
    title: "New Year's Resolution",
    description: 'Log a workout session on January 1st.',
  },
  nivel_60: {
    title: 'Level 60',
    description: 'Reach Level 60.',
  },
  nivel_70: {
    title: 'Level 70',
    description: 'Reach Level 70.',
  },
  nivel_80: {
    title: 'Level 80',
    description: 'Reach Level 80.',
  },
  nivel_90: {
    title: 'Level 90',
    description: 'Reach Level 90.',
  },
  maraton_completo: {
    title: 'Full Marathon',
    description: 'Log the equivalent of 42 kilometers in steps in a single day.',
  },
  racha_oro: {
    title: 'Gold Streak',
    description: 'Earn experience for 30 consecutive days.',
  },
  nivel_100: {
    title: 'Level 100',
    description: 'Reach the maximum level by accumulating 100,000 XP.',
  },
  esta_hecho: {
    title: '"It Is Done..."',
    description: 'Reach the historic milestone of 3,500,000 total lifetime steps.',
  },
  iron_man: {
    title: 'IRON MAN',
    description: 'Log 4 different cardio sessions in a single day.',
  },
  heroe_por_diversion: {
    title: 'Hero for Fun',
    description:
      'Log at least 10,000 steps and a strength session every day for a full week.',
  },
  a_un_pixel: {
    title: 'One Pixel Away!',
    description:
      'Stop at exactly 1 experience point away from reaching Level 100 (99,999 XP).',
  },
  completista_definitivo: {
    title: 'Ultimate Completionist',
    description:
      'Unlock all 30 previous achievements. This hidden trophy is the ultimate reward proving total mastery of the system and your own physical fitness.',
  },
};

export function getTrophyTierLabel(tier: TrophyTier, language: AppLanguage): string {
  const style = TROPHY_TIER_STYLES[tier];
  return language === 'en' ? style.labelEn : style.label;
}

export function getTrophyUnlockedBannerText(language: AppLanguage): string {
  return language === 'en' ? 'Achievement unlocked' : 'Logro desbloqueado';
}

export function getLocalizedTrophy(trophy: Trophy, language: AppLanguage): Trophy {
  if (language !== 'en') return trophy;
  const enCopy = TROPHY_TRANSLATIONS_EN[trophy.id];
  if (!enCopy) return trophy;
  return {
    ...trophy,
    title: enCopy.title,
    description: enCopy.description,
  };
}

function parseTimeLabelToMinutes(timeLabel: string): number | null {
  const parts = timeLabel.split(':');
  if (parts.length !== 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function getLongestConsecutiveDaysStreak(sortedDateIsos: string[]): number {
  if (sortedDateIsos.length === 0) return 0;
  let longestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < sortedDateIsos.length; i += 1) {
    const dayGap = countDaysBetweenIso(sortedDateIsos[i - 1], sortedDateIsos[i]);
    if (dayGap === 1) {
      currentStreak += 1;
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
    } else if (dayGap > 1) {
      currentStreak = 1;
    }
  }
  return longestStreak;
}

export interface TrophyEvaluationContext {
  todayIso: string;
  totalXp: number;
  currentLevel: number;
  peakLevel: number;
  settledInactiveDays: number;
  daysByIso: Record<string, DailyActivityRecord>;
  scheduleChangesByDateIso: Record<string, number>;
  xpFormulas: XpFormulas;
  alreadyUnlocked: Record<string, string>;
}

export function findNewlyUnlockedTrophies(context: TrophyEvaluationContext): Trophy[] {
  const {
    todayIso,
    totalXp,
    currentLevel,
    peakLevel,
    settledInactiveDays,
    daysByIso,
    scheduleChangesByDateIso,
    xpFormulas,
    alreadyUnlocked,
  } = context;

  const unlockedIdSet = new Set(Object.keys(alreadyUnlocked));
  if (unlockedIdSet.size >= TROPHY_CATALOG.length) {
    return [];
  }

  const needsXpStreakCheck =
    !unlockedIdSet.has('racha_bronce') ||
    !unlockedIdSet.has('racha_plata') ||
    !unlockedIdSet.has('racha_oro');
  const needsHeroStreakCheck = !unlockedIdSet.has('heroe_por_diversion');

  const highestLevel = Math.max(currentLevel, peakLevel);
  const pastAndTodayEntries = Object.entries(daysByIso).filter(([iso]) => iso <= todayIso);

  let maxSingleDaySteps = 0;
  let totalLifetimeSteps = 0;
  let hasEarlyMorningWorkout = false;
  let hasLateNightWorkout = false;
  let hasHybridDay = false;
  let hasMorningAndEveningDay = false;
  let hasNewYearWorkout = false;
  let hasMarathonStepsDay = false;
  let hasFourDistinctCardioDay = false;

  const xpActiveDates: string[] = [];
  const heroDates: string[] = [];
  const workoutWeeksMondays = new Set<string>();

  for (const [iso, dayRec] of pastAndTodayEntries) {
    if (dayRec.steps > maxSingleDaySteps) {
      maxSingleDaySteps = dayRec.steps;
    }
    totalLifetimeSteps += dayRec.steps;

    if (dayRec.steps * KM_PER_STEP >= 42) {
      hasMarathonStepsDay = true;
    }

    if (needsXpStreakCheck && calculateDailyTotalXp(dayRec, xpFormulas) > 0) {
      xpActiveDates.push(iso);
    }

    const hasStrength = dayRec.completedWorkouts.some((w) => w.category === 'Fuerza');
    const hasCardio = dayRec.completedWorkouts.some((w) => w.category === 'Cardio');

    if (dayRec.steps > 0 && hasStrength && hasCardio) {
      hasHybridDay = true;
    }

    if (needsHeroStreakCheck && dayRec.steps >= 10_000 && hasStrength) {
      heroDates.push(iso);
    }

    if (dayRec.completedWorkouts.length > 0) {
      workoutWeeksMondays.add(getMondayDateIso(iso));

      if (iso.endsWith('-01-01')) {
        hasNewYearWorkout = true;
      }

      const morningWorkoutIds: string[] = [];
      const eveningWorkoutIds: string[] = [];

      for (const workout of dayRec.completedWorkouts) {
        const minutesOfDay = parseTimeLabelToMinutes(workout.timeLabel);
        if (minutesOfDay === null) continue;

        if (minutesOfDay < 9 * 60) {
          hasEarlyMorningWorkout = true;
        }
        if (minutesOfDay >= 22 * 60) {
          hasLateNightWorkout = true;
        }
        if (minutesOfDay < 12 * 60) {
          morningWorkoutIds.push(workout.id);
        }
        if (minutesOfDay >= 20 * 60) {
          eveningWorkoutIds.push(workout.id);
        }
      }

      if (
        morningWorkoutIds.length > 0 &&
        eveningWorkoutIds.length > 0 &&
        morningWorkoutIds.some((mId) => eveningWorkoutIds.some((eId) => eId !== mId))
      ) {
        hasMorningAndEveningDay = true;
      }

      const cardioSessions = dayRec.completedWorkouts.filter((w) => w.category === 'Cardio');
      if (cardioSessions.length >= 4) {
        const distinctCardioKeys = new Set(
          cardioSessions.map((w) => w.routineId || w.title.trim().toLowerCase())
        );
        if (distinctCardioKeys.size >= 4) {
          hasFourDistinctCardioDay = true;
        }
      }
    }
  }

  xpActiveDates.sort();
  heroDates.sort();

  const maxXpStreak = getLongestConsecutiveDaysStreak(xpActiveDates);
  const maxHeroStreak = getLongestConsecutiveDaysStreak(heroDates);

  let hasWeekendWarrior = false;
  for (const mondayIso of workoutWeeksMondays) {
    const saturdayWorkouts = daysByIso[addDaysToIso(mondayIso, 5)]?.completedWorkouts ?? [];
    const sundayWorkouts = daysByIso[addDaysToIso(mondayIso, 6)]?.completedWorkouts ?? [];
    if (saturdayWorkouts.length > 0 && sundayWorkouts.length > 0) {
      hasWeekendWarrior = true;
      break;
    }
  }

  const hasIndecisiveDay = Object.values(scheduleChangesByDateIso).some((count) => count > 3);
  const todayWorkoutsCount = daysByIso[todayIso]?.completedWorkouts.length ?? 0;
  const hasFifthDayComeback = settledInactiveDays === 4 && todayWorkoutsCount > 0;

  const isConditionMet: Record<string, boolean> = {
    nivel_10: highestLevel >= 10,
    nivel_20: highestLevel >= 20,
    primer_paso: maxSingleDaySteps >= 10_000,
    cuarto_maraton: maxSingleDaySteps >= 13_000,
    racha_bronce: maxXpStreak >= 10,
    madrugador: hasEarlyMorningWorkout,
    buho_nocturno: hasLateNightWorkout,
    el_indeciso: hasIndecisiveDay,
    merecido_descanso: hasFifthDayComeback,
    mas_de_8000: totalXp > 8_000,

    nivel_30: highestLevel >= 30,
    nivel_40: highestLevel >= 40,
    nivel_50: highestLevel >= 50,
    medio_maraton: maxSingleDaySteps >= 26_000,
    racha_plata: maxXpStreak >= 20,
    atleta_hibrido: hasHybridDay,
    fin_semana_guerrero: hasWeekendWarrior,
    todo_el_dia: hasMorningAndEveningDay,
    proposito_ano_nuevo: hasNewYearWorkout,

    nivel_60: highestLevel >= 60,
    nivel_70: highestLevel >= 70,
    nivel_80: highestLevel >= 80,
    nivel_90: highestLevel >= 90,
    maraton_completo: hasMarathonStepsDay,
    racha_oro: maxXpStreak >= 30,

    nivel_100: totalXp >= 100_000 && highestLevel >= 100,
    esta_hecho: totalLifetimeSteps >= 3_500_000,
    iron_man: hasFourDistinctCardioDay,
    heroe_por_diversion: maxHeroStreak >= 7,
    a_un_pixel: totalXp === 99_999,
  };

  const newlyUnlocked: Trophy[] = [];

  for (const trophy of TROPHY_CATALOG) {
    if (trophy.id === 'completista_definitivo') continue;
    if (!unlockedIdSet.has(trophy.id) && isConditionMet[trophy.id]) {
      newlyUnlocked.push(trophy);
      unlockedIdSet.add(trophy.id);
    }
  }

  // Trofeo 31: Completista Definitivo (al reunir los 30 logros anteriores)
  if (!unlockedIdSet.has('completista_definitivo') && unlockedIdSet.size >= 30) {
    const diamondTrophy = TROPHY_CATALOG.find((t) => t.id === 'completista_definitivo');
    if (diamondTrophy) {
      newlyUnlocked.push(diamondTrophy);
    }
  }

  return newlyUnlocked;
}
