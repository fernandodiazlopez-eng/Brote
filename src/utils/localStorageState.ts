/**
 * Gestión de persistencia en localStorage, aplicación del tema visual Nothing/Cyberpunk
 * y reconciliación diaria al cambiar de fecha en el calendario real.
 */

import { isValidUiTextKey } from '../i18n/translations';
import {
  AccentPaletteId,
  ActiveWorkoutSessionState,
  AppLanguage,
  AppPersistentState,
  AppTab,
  CompletedWorkout,
  CustomTextsByLanguage,
  DailyActivityRecord,
  Routine,
  RoutineCategory,
  RoutineExercise,
  ThemeMode,
  WorkoutClockMode,
  XpFormulas,
} from '../types';
import { addDaysToIso, getTodayDateIso } from './calendarDates';
import {
  calculateContinuousLevelFromXp,
  calculateDailyTotalXp,
  calculateLevelFromXp,
  calculateRoutineBaseXp,
  DEFAULT_XP_FORMULAS,
  getDailyInactivityXpPenalty,
  getMuscleMemoryFloorXp,
  hasMinimumDailyActivity,
  MAX_LEVEL,
  MAX_TOTAL_XP,
} from './progressionRules';
import {
  categorySupportsMuscles,
  isValidMuscleGroupId,
  sanitizeMuscleGroups,
} from './muscleRecovery';

export const APP_STATE_STORAGE_KEY = 'upgrade_app_state_v5';
export const WORKOUT_SESSION_STORAGE_KEY = 'upgrade_workout_session_v5';

const OBSOLETE_STORAGE_KEYS = [
  'upgrade_app_state_v4',
  'upgrade_workout_session_v4',
  'upgrade_app_state_v3',
  'upgrade_workout_session_v3',
  'brote_app_state_v2',
  'brote_workout_session_v2',
  'kinetix_app_state_v2',
  'kinetix_workout_session_v2',
  'fitness_rpg_real_calendar_v1',
  'fitness_rpg_active_session_v1',
] as const;

export const MAX_STOPWATCH_MS = 12 * 3600 * 1000;
const RECENT_ALARM_WINDOW_MS = 5 * 60 * 1000;

const VALID_ACCENT_PALETTES: readonly AccentPaletteId[] = [
  'lima',
  'ambar',
  'coral',
  'monocromo',
  'frambuesa',
  'oceano',
  'amatista',
  'esmeralda',
  'custom',
];

const CUSTOM_THEME_CSS_VARS = [
  '--app-accent',
  '--app-accent-fill',
  '--app-accent-fg',
  '--app-accent-soft',
  '--app-accent-glow',
  '--muscle-loaded-stroke',
  '--muscle-recovering-stroke',
  '--muscle-recovering-text',
  '--bug-led-text',
] as const;

export function normalizeHexColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const [r, g, b] = cleaned.toLowerCase().split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return `#${cleaned.toLowerCase()}`;
  }
  return null;
}

function parseHexToRgb(hex: string): [number, number, number] {
  const clean = hex.slice(1);
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clampByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clampByte(r), clampByte(g), clampByte(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixRgbTowards(
  base: [number, number, number],
  target: [number, number, number],
  weight: number
): string {
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex(
    base[0] + (target[0] - base[0]) * w,
    base[1] + (target[1] - base[1]) * w,
    base[2] + (target[2] - base[2]) * w
  );
}

export function getHexRelativeLuminance(hex?: string): number {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return 0.5;
  const [r, g, b] = parseHexToRgb(normalized).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function setCustomDraftSwatchProperty(rawHex: string | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const valid = normalizeHexColor(rawHex);
  if (valid) {
    root.style.setProperty('--custom-draft-swatch-color', valid);
  } else {
    root.style.removeProperty('--custom-draft-swatch-color');
  }
}

function isValidAccentPalette(value: unknown): value is AccentPaletteId {
  return (
    typeof value === 'string' &&
    (VALID_ACCENT_PALETTES as readonly string[]).includes(value)
  );
}

function isValidAppTab(value: unknown): value is AppTab {
  return (
    value === AppTab.TRAINING ||
    value === AppTab.PROFILE ||
    value === AppTab.STATS
  );
}

export function applyThemeToDocument(
  mode: ThemeMode,
  palette: AccentPaletteId,
  language: AppLanguage = 'es',
  customAccentHex?: string
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isLight = mode === 'light';
  const validCustomHex = normalizeHexColor(customAccentHex);
  const effectivePalette: AccentPaletteId =
    palette === 'custom' && !validCustomHex ? 'lima' : palette;

  root.dataset.themeMode = mode;
  root.dataset.palette = effectivePalette;
  root.lang = language;
  root.classList.toggle('dark', !isLight);

  if (validCustomHex) {
    root.style.setProperty('--custom-swatch-color', validCustomHex);
  } else {
    root.style.removeProperty('--custom-swatch-color');
  }

  if (effectivePalette === 'custom' && validCustomHex) {
    const rgb = parseHexToRgb(validCustomHex);
    const lum = getHexRelativeLuminance(validCustomHex);

    const accentText = isLight
      ? lum > 0.72
        ? mixRgbTowards(rgb, [12, 13, 16], 0.5)
        : lum > 0.48
        ? mixRgbTowards(rgb, [12, 13, 16], 0.25)
        : validCustomHex
      : lum < 0.08
      ? mixRgbTowards(rgb, [255, 255, 255], 0.46)
      : lum < 0.16
      ? mixRgbTowards(rgb, [255, 255, 255], 0.24)
      : validCustomHex;

    const accentFg = lum > 0.36 ? '#08080a' : '#ffffff';
    const accentSoft =
      !isLight && lum < 0.05
        ? 'rgba(255, 255, 255, 0.1)'
        : isLight && lum > 0.94
        ? 'rgba(12, 13, 16, 0.09)'
        : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${isLight ? 0.14 : 0.15})`;
    const accentGlow =
      !isLight && lum < 0.05
        ? 'rgba(255, 255, 255, 0.28)'
        : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${isLight ? 0.28 : 0.38})`;

    const muscleLoaded = isLight
      ? lum > 0.78
        ? mixRgbTowards(rgb, [12, 13, 16], 0.32)
        : lum > 0.62
        ? mixRgbTowards(rgb, [12, 13, 16], 0.16)
        : validCustomHex
      : lum < 0.08
      ? mixRgbTowards(rgb, [255, 255, 255], 0.36)
      : validCustomHex;

    const loadedRgb = parseHexToRgb(muscleLoaded);
    const muscleRecovering = isLight
      ? lum < 0.12
        ? mixRgbTowards(loadedRgb, [255, 255, 255], 0.32)
        : mixRgbTowards(loadedRgb, [255, 255, 255], 0.44)
      : lum > 0.85
      ? mixRgbTowards(loadedRgb, [110, 118, 140], 0.38)
      : mixRgbTowards(loadedRgb, [255, 255, 255], 0.48);

    const muscleRecoveringText = isLight ? accentText : muscleRecovering;
    const bugLedText =
      lum < 0.14 ? mixRgbTowards(rgb, [255, 255, 255], 0.58) : validCustomHex;

    root.style.setProperty('--app-accent', accentText);
    root.style.setProperty('--app-accent-fill', validCustomHex);
    root.style.setProperty('--app-accent-fg', accentFg);
    root.style.setProperty('--app-accent-soft', accentSoft);
    root.style.setProperty('--app-accent-glow', accentGlow);
    root.style.setProperty('--muscle-loaded-stroke', muscleLoaded);
    root.style.setProperty('--muscle-recovering-stroke', muscleRecovering);
    root.style.setProperty('--muscle-recovering-text', muscleRecoveringText);
    root.style.setProperty('--bug-led-text', bugLedText);
  } else {
    for (const cssVar of CUSTOM_THEME_CSS_VARS) {
      root.style.removeProperty(cssVar);
    }
  }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', isLight ? '#eeeeec' : '#08080a');
  }

  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) {
    manifestLink.setAttribute(
      'href',
      isLight ? '/manifest-light.webmanifest' : '/manifest-dark.webmanifest'
    );
  }
}

function sanitizeCustomTexts(raw: unknown): CustomTextsByLanguage {
  if (!raw || typeof raw !== 'object') return {};
  const record = raw as Record<string, unknown>;
  const result: CustomTextsByLanguage = {};

  for (const lang of ['es', 'en'] as const) {
    const langMap = record[lang];
    if (!langMap || typeof langMap !== 'object') continue;
    const cleanMap: Record<string, string> = {};
    let hasEntries = false;
    for (const [k, v] of Object.entries(langMap as Record<string, unknown>)) {
      if (isValidUiTextKey(k) && typeof v === 'string' && v.trim() !== '') {
        // Actualizar textos antiguos si quedaron con etiquetas previas
        if (k === 'nav_training' && (v.trim() === 'Entrenamiento' || v.trim() === 'Training')) {
          continue;
        }
        if (k === 'palette_coral' && (v.trim() === 'Rojo Nothing' || v.trim() === 'Nothing Red')) {
          continue;
        }
        cleanMap[k] = v;
        hasEntries = true;
      }
    }
    if (hasEntries) {
      result[lang] = cleanMap;
    }
  }
  return result;
}

export function createInitialAppState(todayIso: string): AppPersistentState {
  return {
    firstOpenDateIso: todayIso,
    lastProcessedDateIso: todayIso,
    settledTotalXp: 0,
    settledPeakLevel: 0,
    settledPeakContinuousLevel: 0,
    settledInactiveDays: 0,
    stepGoal: 10_000,
    themeMode: 'dark',
    accentPalette: 'lima',
    language: 'es',
    hasSelectedInitialLanguage: false,
    hasCompletedTutorial: false,
    hasPromptedDevicePermissions: false,
    timerNotificationsEnabled: false,
    motionStepsEnabled: false,
    customTexts: {},
    xpFormulas: { ...DEFAULT_XP_FORMULAS },
    routines: [],
    trashedRoutines: [],
    daysByIso: {},
    dismissedRepeatWeeks: [],
    unlockedTrophies: {},
    scheduleChangesByDateIso: {},
  };
}

/**
 * Avanza día por día desde `lastProcessedDateIso` hasta ayer (`todayIso`),
 * consolidando el XP ganado cada día, actualizando el nivel pico histórico
 * y aplicando penalizaciones si se superan 4 días seguidos sin actividad.
 */
export function reconcileDaysUntilToday(
  state: AppPersistentState,
  todayIso: string
): AppPersistentState {
  if (!state.lastProcessedDateIso || todayIso <= state.lastProcessedDateIso) {
    return state;
  }

  let cursorIso = state.lastProcessedDateIso;
  let totalXp = state.settledTotalXp;
  let peakLevel = state.settledPeakLevel;
  let peakContinuousLevel = Math.max(
    state.settledPeakContinuousLevel,
    peakLevel,
    calculateContinuousLevelFromXp(totalXp)
  );
  let inactiveDays = state.settledInactiveDays;
  let safetyCounter = 0;

  while (cursorIso < todayIso && safetyCounter < 3650) {
    safetyCounter += 1;
    const dayRec = state.daysByIso[cursorIso];
    const earnedXp = calculateDailyTotalXp(dayRec, state.xpFormulas);
    const endOfDayXp = Math.min(MAX_TOTAL_XP, totalXp + earnedXp);
    const endOfDayLevel = calculateLevelFromXp(endOfDayXp);
    const endOfDayContinuousLevel = calculateContinuousLevelFromXp(endOfDayXp);

    peakLevel = Math.max(peakLevel, endOfDayLevel);
    peakContinuousLevel = Math.max(peakContinuousLevel, endOfDayContinuousLevel);

    const workoutsCount = dayRec ? dayRec.completedWorkouts.length : 0;
    const steps = dayRec ? dayRec.steps : 0;

    if (hasMinimumDailyActivity(workoutsCount, steps)) {
      inactiveDays = 0;
      totalXp = endOfDayXp;
    } else {
      inactiveDays += 1;
      const penaltyXp = getDailyInactivityXpPenalty(inactiveDays);
      if (penaltyXp > 0) {
        const floorXp = getMuscleMemoryFloorXp(peakLevel);
        totalXp = Math.max(floorXp, Math.max(0, endOfDayXp - penaltyXp));
      } else {
        totalXp = endOfDayXp;
      }
    }

    cursorIso = addDaysToIso(cursorIso, 1);
  }

  return {
    ...state,
    lastProcessedDateIso: todayIso,
    settledTotalXp: totalXp,
    settledPeakLevel: peakLevel,
    settledPeakContinuousLevel: peakContinuousLevel,
    settledInactiveDays: inactiveDays,
  };
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeCategory(value: unknown): RoutineCategory {
  if (value === 'Cardio') return 'Cardio';
  if (value === 'Híbrida') return 'Híbrida';
  return 'Fuerza';
}

function sanitizePositiveMetric(
  value: unknown,
  minVal: number,
  maxVal: number
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const clamped = Math.max(minVal, Math.min(maxVal, value));
  return Math.round(clamped * 100) / 100;
}

function sanitizeRoutinesList(
  rawList: unknown,
  formulas: XpFormulas
): Routine[] {
  if (!Array.isArray(rawList)) return [];
  const result: Routine[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Partial<Routine>;
    if (typeof rec.id !== 'string' || rec.id.trim() === '') continue;
    const category = sanitizeCategory(rec.category);
    const durationMin =
      typeof rec.durationMin === 'number' && Number.isFinite(rec.durationMin)
        ? Math.max(1, Math.min(240, Math.round(rec.durationMin)))
        : 45;
    const routineDistanceKm = sanitizePositiveMetric(rec.distanceKm, 0.01, 999);
    const title =
      typeof rec.title === 'string' && rec.title.trim() !== ''
        ? rec.title.trim().slice(0, 120)
        : 'Rutina';
    const exercises: RoutineExercise[] = [];
    if (Array.isArray(rec.exercises)) {
      for (const ex of rec.exercises) {
        if (!ex || typeof ex !== 'object') continue;
        const exRec = ex as Partial<RoutineExercise>;
        if (typeof exRec.name !== 'string' || exRec.name.trim() === '') continue;
        const legacySingleMuscle = (exRec as { muscleGroup?: unknown }).muscleGroup;
        const rawExerciseMuscles = Array.isArray(exRec.muscleGroups)
          ? exRec.muscleGroups
          : isValidMuscleGroupId(legacySingleMuscle)
          ? [legacySingleMuscle]
          : [];
        const exerciseMuscles = categorySupportsMuscles(category)
          ? sanitizeMuscleGroups(rawExerciseMuscles)
          : undefined;
        const weightKg = categorySupportsMuscles(category)
          ? sanitizePositiveMetric(exRec.weightKg, 0.1, 2000)
          : undefined;
        const distanceKm = sanitizePositiveMetric(exRec.distanceKm, 0.01, 999);
        const exDurationMin = sanitizePositiveMetric(exRec.durationMin, 0.5, 600);
        exercises.push({
          id:
            typeof exRec.id === 'string' && exRec.id.trim() !== ''
              ? exRec.id
              : `ex-${exercises.length}-${Date.now()}`,
          name: exRec.name.trim().slice(0, 120),
          setsReps:
            typeof exRec.setsReps === 'string'
              ? exRec.setsReps.trim().slice(0, 60)
              : '',
          ...(weightKg !== undefined ? { weightKg } : {}),
          ...(distanceKm !== undefined ? { distanceKm } : {}),
          ...(exDurationMin !== undefined ? { durationMin: exDurationMin } : {}),
          ...(exerciseMuscles ? { muscleGroups: exerciseMuscles } : {}),
        });
      }
    }
    const musclesFromExercises = exercises.flatMap((ex) => ex.muscleGroups ?? []);
    const sanitizedMuscles = categorySupportsMuscles(category)
      ? sanitizeMuscleGroups([
          ...musclesFromExercises,
          ...(Array.isArray(rec.muscleGroups) ? rec.muscleGroups : []),
        ])
      : undefined;
    const sanitizedRoutine: Routine = {
      id: rec.id,
      title,
      category,
      durationMin,
      ...(routineDistanceKm !== undefined ? { distanceKm: routineDistanceKm } : {}),
      xpReward: calculateRoutineBaseXp(category, durationMin, formulas),
      exercises,
      ...(sanitizedMuscles ? { muscleGroups: sanitizedMuscles } : {}),
    };
    if (typeof rec.deletedAt === 'string' && rec.deletedAt.trim() !== '') {
      sanitizedRoutine.deletedAt = rec.deletedAt;
    }
    result.push(sanitizedRoutine);
  }
  return result;
}

function sanitizeDaysByIso(rawDays: unknown): Record<string, DailyActivityRecord> {
  if (!rawDays || typeof rawDays !== 'object') return {};
  const result: Record<string, DailyActivityRecord> = {};
  for (const [iso, rawVal] of Object.entries(rawDays as Record<string, unknown>)) {
    if (!isIsoDateString(iso) || !rawVal || typeof rawVal !== 'object') continue;
    const rec = rawVal as Partial<DailyActivityRecord>;
    const plannedRoutineIds = Array.isArray(rec.plannedRoutineIds)
      ? rec.plannedRoutineIds.filter((id): id is string => typeof id === 'string' && id !== '')
      : [];
    const completedWorkouts: CompletedWorkout[] = [];
    if (Array.isArray(rec.completedWorkouts)) {
      for (const cw of rec.completedWorkouts) {
        if (!cw || typeof cw !== 'object') continue;
        const w = cw as Partial<CompletedWorkout>;
        if (typeof w.id !== 'string' || w.id === '') continue;
        const workoutCategory = sanitizeCategory(w.category);
        const workoutMuscles =
          categorySupportsMuscles(workoutCategory) && Array.isArray(w.muscleGroups)
            ? sanitizeMuscleGroups(w.muscleGroups) ?? []
            : undefined;
        const workoutDistanceKm = sanitizePositiveMetric(w.distanceKm, 0.01, 999);
        const completionRatio =
          typeof w.completionRatio === 'number' && Number.isFinite(w.completionRatio)
            ? Math.max(0, Math.min(1, w.completionRatio))
            : undefined;
        completedWorkouts.push({
          id: w.id,
          routineId: typeof w.routineId === 'string' ? w.routineId : undefined,
          title:
            typeof w.title === 'string' && w.title.trim() !== ''
              ? w.title.trim().slice(0, 120)
              : 'Rutina',
          category: workoutCategory,
          durationMin:
            typeof w.durationMin === 'number' && Number.isFinite(w.durationMin)
              ? Math.max(1, Math.min(720, Math.round(w.durationMin)))
              : 30,
          ...(workoutDistanceKm !== undefined ? { distanceKm: workoutDistanceKm } : {}),
          xpEarned:
            typeof w.xpEarned === 'number' && Number.isFinite(w.xpEarned)
              ? Math.max(0, Math.min(MAX_TOTAL_XP, Math.floor(w.xpEarned)))
              : 0,
          timeLabel:
            typeof w.timeLabel === 'string' && /^\d{1,2}:\d{2}$/.test(w.timeLabel)
              ? w.timeLabel
              : '12:00',
          ...(workoutMuscles !== undefined ? { muscleGroups: workoutMuscles } : {}),
          ...(completionRatio !== undefined ? { completionRatio } : {}),
        });
      }
    }
    const steps =
      typeof rec.steps === 'number' && Number.isFinite(rec.steps) && rec.steps >= 0
        ? Math.min(200_000, Math.round(rec.steps))
        : 0;

    if (plannedRoutineIds.length > 0 || completedWorkouts.length > 0 || steps > 0) {
      result[iso] = {
        plannedRoutineIds,
        completedWorkouts,
        steps,
      };
    }
  }
  return result;
}

function sanitizeUnlockedTrophies(
  rawUnlocked: unknown,
  fallbackIso: string
): Record<string, string> {
  if (!rawUnlocked || typeof rawUnlocked !== 'object') return {};
  const result: Record<string, string> = {};
  for (const [id, dateVal] of Object.entries(rawUnlocked as Record<string, unknown>)) {
    if (typeof id !== 'string' || id === '') continue;
    result[id] = isIsoDateString(dateVal) ? dateVal : fallbackIso;
  }
  return result;
}

function sanitizeScheduleChanges(
  rawChanges: unknown,
  todayIso: string
): Record<string, number> {
  if (!rawChanges || typeof rawChanges !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [iso, count] of Object.entries(rawChanges as Record<string, unknown>)) {
    if (!isIsoDateString(iso) || typeof count !== 'number' || !Number.isFinite(count)) continue;
    const rounded = Math.max(0, Math.floor(count));
    if (iso === todayIso || rounded > 3) {
      result[iso] = rounded;
    }
  }
  return result;
}

function sanitizeDismissedWeeks(rawWeeks: unknown, todayIso: string): string[] {
  if (!Array.isArray(rawWeeks)) return [];
  const cutoffIso = addDaysToIso(todayIso, -90);
  return rawWeeks.filter((iso): iso is string => isIsoDateString(iso) && iso >= cutoffIso);
}

function sanitizeFormulas(rawFormulas?: Partial<XpFormulas>): XpFormulas {
  return {
    stepsFormula:
      typeof rawFormulas?.stepsFormula === 'string' && rawFormulas.stepsFormula.trim() !== ''
        ? rawFormulas.stepsFormula
        : DEFAULT_XP_FORMULAS.stepsFormula,
    strengthFormula:
      typeof rawFormulas?.strengthFormula === 'string' &&
      rawFormulas.strengthFormula.trim() !== ''
        ? rawFormulas.strengthFormula
        : DEFAULT_XP_FORMULAS.strengthFormula,
    cardioFormula:
      typeof rawFormulas?.cardioFormula === 'string' && rawFormulas.cardioFormula.trim() !== ''
        ? rawFormulas.cardioFormula
        : DEFAULT_XP_FORMULAS.cardioFormula,
    hybridFormula:
      typeof rawFormulas?.hybridFormula === 'string' && rawFormulas.hybridFormula.trim() !== ''
        ? rawFormulas.hybridFormula
        : DEFAULT_XP_FORMULAS.hybridFormula,
  };
}

export function hydrateSanitizedAppState(
  parsed: Partial<AppPersistentState>,
  todayIso: string
): AppPersistentState {
  const formulas = sanitizeFormulas(parsed.xpFormulas);

  const safeSettledXp =
    typeof parsed.settledTotalXp === 'number' &&
    Number.isFinite(parsed.settledTotalXp) &&
    parsed.settledTotalXp >= 0
      ? Math.min(MAX_TOTAL_XP, Math.floor(parsed.settledTotalXp))
      : 0;

  const hydratedPeakLevel =
    typeof parsed.settledPeakLevel === 'number' &&
    Number.isFinite(parsed.settledPeakLevel) &&
    parsed.settledPeakLevel >= 0
      ? Math.min(MAX_LEVEL, Math.floor(parsed.settledPeakLevel))
      : calculateLevelFromXp(safeSettledXp);

  const settledContinuous = calculateContinuousLevelFromXp(safeSettledXp);
  const hydratedPeakContinuous =
    typeof parsed.settledPeakContinuousLevel === 'number' &&
    Number.isFinite(parsed.settledPeakContinuousLevel) &&
    parsed.settledPeakContinuousLevel >= 0
      ? Math.min(
          MAX_LEVEL,
          Math.max(hydratedPeakLevel, settledContinuous, parsed.settledPeakContinuousLevel)
        )
      : Math.min(MAX_LEVEL, Math.max(hydratedPeakLevel, settledContinuous));

  const sanitizedRoutines = sanitizeRoutinesList(parsed.routines, formulas);
  const sanitizedTrashedRoutines = sanitizeRoutinesList(parsed.trashedRoutines, formulas);
  const sanitizedDaysByIso = sanitizeDaysByIso(parsed.daysByIso);
  const hasExistingActivity =
    safeSettledXp > 0 ||
    sanitizedRoutines.length > 0 ||
    Object.keys(sanitizedDaysByIso).length > 0;

  const resolvedBugUnlockedAtIso = isIsoDateString(parsed.bugUnlockedAtIso)
    ? parsed.bugUnlockedAtIso
    : undefined;
  const resolvedBugPetUnlockedAtIso = isIsoDateString(parsed.bugPetUnlockedAtIso)
    ? parsed.bugPetUnlockedAtIso
    : resolvedBugUnlockedAtIso && hydratedPeakLevel >= 4
    ? resolvedBugUnlockedAtIso
    : undefined;
  const resolvedBugHockeyUnlockedAtIso = isIsoDateString(parsed.bugHockeyUnlockedAtIso)
    ? parsed.bugHockeyUnlockedAtIso
    : resolvedBugUnlockedAtIso && hydratedPeakLevel >= 5
    ? resolvedBugUnlockedAtIso
    : undefined;

  const hydrated: AppPersistentState = {
    ...createInitialAppState(todayIso),
    firstOpenDateIso: isIsoDateString(parsed.firstOpenDateIso)
      ? parsed.firstOpenDateIso
      : todayIso,
    lastProcessedDateIso: isIsoDateString(parsed.lastProcessedDateIso)
      ? parsed.lastProcessedDateIso
      : todayIso,
    settledTotalXp: safeSettledXp,
    settledPeakLevel: hydratedPeakLevel,
    settledPeakContinuousLevel: hydratedPeakContinuous,
    settledInactiveDays:
      typeof parsed.settledInactiveDays === 'number' &&
      Number.isFinite(parsed.settledInactiveDays) &&
      parsed.settledInactiveDays >= 0
        ? Math.floor(parsed.settledInactiveDays)
        : 0,
    stepGoal:
      typeof parsed.stepGoal === 'number' &&
      Number.isFinite(parsed.stepGoal) &&
      parsed.stepGoal >= 500
        ? Math.min(200_000, Math.round(parsed.stepGoal))
        : 10_000,
    themeMode: parsed.themeMode === 'light' ? 'light' : 'dark',
    accentPalette: (() => {
      const customHex = normalizeHexColor(parsed.customAccentHex);
      if (!isValidAccentPalette(parsed.accentPalette)) return 'lima';
      if (parsed.accentPalette === 'custom' && !customHex) return 'lima';
      return parsed.accentPalette;
    })(),
    ...(normalizeHexColor(parsed.customAccentHex)
      ? { customAccentHex: normalizeHexColor(parsed.customAccentHex)! }
      : {}),
    language: parsed.language === 'en' ? 'en' : 'es',
    hasSelectedInitialLanguage: parsed.hasSelectedInitialLanguage === true,
    hasCompletedTutorial:
      typeof parsed.hasCompletedTutorial === 'boolean'
        ? parsed.hasCompletedTutorial
        : hasExistingActivity,
    hasPromptedDevicePermissions:
      typeof parsed.hasPromptedDevicePermissions === 'boolean'
        ? parsed.hasPromptedDevicePermissions
        : false,
    timerNotificationsEnabled: parsed.timerNotificationsEnabled === true,
    motionStepsEnabled: parsed.motionStepsEnabled === true,
    customTexts: sanitizeCustomTexts(parsed.customTexts),
    xpFormulas: formulas,
    routines: sanitizedRoutines,
    trashedRoutines: sanitizedTrashedRoutines,
    daysByIso: sanitizedDaysByIso,
    dismissedRepeatWeeks: sanitizeDismissedWeeks(parsed.dismissedRepeatWeeks, todayIso),
    unlockedTrophies: sanitizeUnlockedTrophies(parsed.unlockedTrophies, todayIso),
    scheduleChangesByDateIso: sanitizeScheduleChanges(parsed.scheduleChangesByDateIso, todayIso),
    ...(resolvedBugUnlockedAtIso ? { bugUnlockedAtIso: resolvedBugUnlockedAtIso } : {}),
    ...(resolvedBugPetUnlockedAtIso ? { bugPetUnlockedAtIso: resolvedBugPetUnlockedAtIso } : {}),
    ...(resolvedBugHockeyUnlockedAtIso
      ? { bugHockeyUnlockedAtIso: resolvedBugHockeyUnlockedAtIso }
      : {}),
    ...(typeof parsed.hideBug === 'boolean' ? { hideBug: parsed.hideBug } : {}),
  };

  return reconcileDaysUntilToday(hydrated, todayIso);
}

export function serializeAppStateBackup(state: AppPersistentState): string {
  return JSON.stringify(
    {
      app: 'Upgrade',
      version: '2.0.0',
      exportedAt: new Date().toISOString(),
      state,
    },
    null,
    2
  );
}

export function parseAppStateBackup(
  rawJsonText: string,
  todayIso: string
): AppPersistentState | null {
  try {
    const parsedOuter = JSON.parse(rawJsonText) as unknown;
    if (!parsedOuter || typeof parsedOuter !== 'object') return null;
    const outerObj = parsedOuter as Record<string, unknown>;

    const candidateState =
      outerObj.state && typeof outerObj.state === 'object'
        ? (outerObj.state as Partial<AppPersistentState>)
        : (outerObj as Partial<AppPersistentState>);

    const hasRecognizableShape =
      'daysByIso' in candidateState ||
      'routines' in candidateState ||
      'settledTotalXp' in candidateState ||
      'xpFormulas' in candidateState;

    if (!hasRecognizableShape) return null;

    const hydrated = hydrateSanitizedAppState(
      {
        ...candidateState,
        hasSelectedInitialLanguage: true,
        hasCompletedTutorial: candidateState.hasCompletedTutorial ?? true,
        hasPromptedDevicePermissions: candidateState.hasPromptedDevicePermissions ?? true,
      },
      todayIso
    );
    return hydrated;
  } catch {
    return null;
  }
}

export function loadAppStateFromStorage(): AppPersistentState {
  const todayIso = getTodayDateIso();
  if (typeof window === 'undefined') {
    const initial = createInitialAppState(todayIso);
    applyThemeToDocument(
      initial.themeMode,
      initial.accentPalette,
      initial.language,
      initial.customAccentHex
    );
    return initial;
  }

  try {
    for (const oldKey of OBSOLETE_STORAGE_KEYS) {
      window.localStorage.removeItem(oldKey);
    }

    const raw = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
    if (!raw) {
      const freshState = createInitialAppState(todayIso);
      window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(freshState));
      applyThemeToDocument(
        freshState.themeMode,
        freshState.accentPalette,
        freshState.language,
        freshState.customAccentHex
      );
      return freshState;
    }

    const parsed = JSON.parse(raw) as Partial<AppPersistentState>;
    const reconciled = hydrateSanitizedAppState(parsed, todayIso);

    applyThemeToDocument(
      reconciled.themeMode,
      reconciled.accentPalette,
      reconciled.language,
      reconciled.customAccentHex
    );
    return reconciled;
  } catch {
    const fallback = createInitialAppState(todayIso);
    applyThemeToDocument(
      fallback.themeMode,
      fallback.accentPalette,
      fallback.language,
      fallback.customAccentHex
    );
    return fallback;
  }
}

export interface HydratedWorkoutSession extends ActiveWorkoutSessionState {
  shouldRingAlarmOnMount: boolean;
}

export function createDefaultWorkoutSession(): HydratedWorkoutSession {
  return {
    activeTab: AppTab.PROFILE,
    sessionRoutineId: null,
    isSessionViewOpen: false,
    sessionOriginTab: AppTab.TRAINING,
    checkedExercises: {},
    repCounter: 0,
    clockMode: WorkoutClockMode.STOPWATCH,
    stopwatchAccumMs: 0,
    stopwatchStartMs: null,
    countdownTargetSec: 180,
    countdownRemMs: 180 * 1000,
    countdownEndMs: null,
    shouldRingAlarmOnMount: false,
  };
}

export function loadWorkoutSessionFromStorage(routines: Routine[]): HydratedWorkoutSession {
  const fallback = createDefaultWorkoutSession();
  if (typeof window === 'undefined') return fallback;

  try {
    const raw = window.localStorage.getItem(WORKOUT_SESSION_STORAGE_KEY);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as Partial<ActiveWorkoutSessionState>;
    const now = Date.now();

    const validRoutineId =
      typeof parsed.sessionRoutineId === 'string' &&
      routines.some((r) => r.id === parsed.sessionRoutineId)
        ? parsed.sessionRoutineId
        : null;

    const checkedExercises: Record<string, boolean> = {};
    if (validRoutineId && parsed.checkedExercises && typeof parsed.checkedExercises === 'object') {
      for (const [exerciseId, isChecked] of Object.entries(parsed.checkedExercises)) {
        if (typeof isChecked === 'boolean' && isChecked) {
          checkedExercises[exerciseId] = true;
        }
      }
    }

    let stopwatchAccumMs =
      typeof parsed.stopwatchAccumMs === 'number' &&
      Number.isFinite(parsed.stopwatchAccumMs) &&
      parsed.stopwatchAccumMs >= 0
        ? Math.min(MAX_STOPWATCH_MS, parsed.stopwatchAccumMs)
        : 0;

    let stopwatchStartMs =
      typeof parsed.stopwatchStartMs === 'number' && Number.isFinite(parsed.stopwatchStartMs)
        ? parsed.stopwatchStartMs
        : null;

    if (stopwatchStartMs !== null) {
      if (stopwatchStartMs > now) {
        stopwatchStartMs = now;
      } else if (stopwatchAccumMs + (now - stopwatchStartMs) >= MAX_STOPWATCH_MS) {
        stopwatchAccumMs = MAX_STOPWATCH_MS;
        stopwatchStartMs = null;
      }
    }

    const countdownTargetSec =
      typeof parsed.countdownTargetSec === 'number' &&
      Number.isFinite(parsed.countdownTargetSec) &&
      parsed.countdownTargetSec >= 1
        ? Math.min(10_800, Math.round(parsed.countdownTargetSec))
        : 180;

    let countdownRemMs =
      typeof parsed.countdownRemMs === 'number' &&
      Number.isFinite(parsed.countdownRemMs) &&
      parsed.countdownRemMs >= 0
        ? Math.min(10_800 * 1000, parsed.countdownRemMs)
        : countdownTargetSec * 1000;

    let countdownEndMs =
      typeof parsed.countdownEndMs === 'number' && Number.isFinite(parsed.countdownEndMs)
        ? parsed.countdownEndMs
        : null;

    let shouldRingAlarmOnMount = false;

    if (countdownEndMs !== null) {
      if (now < countdownEndMs) {
        countdownRemMs = countdownEndMs - now;
      } else if (now - countdownEndMs <= RECENT_ALARM_WINDOW_MS) {
        countdownEndMs = null;
        countdownRemMs = 0;
        shouldRingAlarmOnMount = true;
      } else {
        countdownEndMs = null;
        countdownRemMs = countdownTargetSec * 1000;
      }
    }

    const isSessionViewOpen = Boolean(validRoutineId && parsed.isSessionViewOpen);
    const activeTab = isValidAppTab(parsed.activeTab)
      ? parsed.activeTab === AppTab.TRAINING && !validRoutineId && parsed.isSessionViewOpen
        ? AppTab.PROFILE
        : parsed.activeTab
      : AppTab.PROFILE;

    const repCounter =
      validRoutineId &&
      typeof parsed.repCounter === 'number' &&
      Number.isFinite(parsed.repCounter) &&
      parsed.repCounter >= 0
        ? Math.min(99, Math.floor(parsed.repCounter))
        : 0;

    return {
      activeTab,
      sessionRoutineId: validRoutineId,
      isSessionViewOpen,
      sessionOriginTab: isValidAppTab(parsed.sessionOriginTab)
        ? parsed.sessionOriginTab
        : AppTab.TRAINING,
      checkedExercises,
      repCounter,
      clockMode:
        parsed.clockMode === WorkoutClockMode.COUNTDOWN
          ? WorkoutClockMode.COUNTDOWN
          : WorkoutClockMode.STOPWATCH,
      stopwatchAccumMs,
      stopwatchStartMs,
      countdownTargetSec,
      countdownRemMs,
      countdownEndMs,
      shouldRingAlarmOnMount,
    };
  } catch {
    return fallback;
  }
}
