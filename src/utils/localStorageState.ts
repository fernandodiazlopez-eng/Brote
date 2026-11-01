/**
 * Gestión de persistencia en localStorage, aplicación del tema visual
 * y reconciliación diaria al cambiar de fecha en el calendario real.
 *
 * Incluye migración limpia que reinicia todas las estadísticas a 0 (XP, nivel,
 * pasos, historial, constancia y trofeos), conservando únicamente preferencias
 * visuales y plantillas de rutinas si existían en versiones previas.
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

export const APP_STATE_STORAGE_KEY = 'brote_app_state_v2';
export const WORKOUT_SESSION_STORAGE_KEY = 'brote_workout_session_v2';

// Claves anteriores para migración transparente sin perder progreso
const PREVIOUS_KINETIX_STATE_KEY = 'kinetix_app_state_v2';
const PREVIOUS_KINETIX_SESSION_KEY = 'kinetix_workout_session_v2';
const LEGACY_STATE_KEY = 'fitness_rpg_real_calendar_v1';
const LEGACY_SESSION_KEY = 'fitness_rpg_active_session_v1';

export const MAX_STOPWATCH_MS = 12 * 3600 * 1000;
const RECENT_ALARM_WINDOW_MS = 5 * 60 * 1000;

const VALID_ACCENT_PALETTES: readonly AccentPaletteId[] = [
  'lima',
  'esmeralda',
  'oceano',
  'ambar',
  'amatista',
  'coral',
];

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
  language: AppLanguage = 'es'
): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isLight = mode === 'light';

  root.dataset.themeMode = mode;
  root.dataset.palette = palette;
  root.lang = language;
  root.classList.toggle('dark', !isLight);

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', isLight ? '#f5f4ef' : '#0d0e0d');
  }

  // Cambiar dinámicamente el fondo del logo de la app (negro en modo oscuro, blanco en modo claro)
  const faviconSvg =
    document.getElementById('app-favicon-svg') ||
    document.querySelector('link[rel="icon"][type="image/svg+xml"]');
  if (faviconSvg) {
    faviconSvg.setAttribute('href', isLight ? '/icon-light.svg' : '/icon-dark.svg');
  }

  const faviconPng =
    document.getElementById('app-favicon-png') ||
    document.querySelector('link[rel="alternate icon"][type="image/png"]');
  if (faviconPng) {
    faviconPng.setAttribute(
      'href',
      isLight ? '/pwa-light-192x192.png' : '/pwa-dark-192x192.png'
    );
  }

  const appleTouchIcon =
    document.getElementById('app-apple-touch-icon') ||
    document.querySelector('link[rel="apple-touch-icon"]');
  if (appleTouchIcon) {
    appleTouchIcon.setAttribute(
      'href',
      isLight ? '/apple-touch-icon-light.png' : '/apple-touch-icon-dark.png'
    );
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
    seasonsEnabled: true,
    language: 'es',
    hasSelectedInitialLanguage: false,
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
  return value === 'Cardio' ? 'Cardio' : 'Fuerza';
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
        exercises.push({
          id:
            typeof exRec.id === 'string' && exRec.id.trim() !== ''
              ? exRec.id
              : `ex-${exercises.length}-${Date.now()}`,
          name: exRec.name.trim().slice(0, 120),
          setsReps:
            typeof exRec.setsReps === 'string' && exRec.setsReps.trim() !== ''
              ? exRec.setsReps.trim().slice(0, 60)
              : '3 × 10',
        });
      }
    }
    const sanitizedRoutine: Routine = {
      id: rec.id,
      title,
      category,
      durationMin,
      xpReward: calculateRoutineBaseXp(category, durationMin, formulas),
      exercises,
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
        completedWorkouts.push({
          id: w.id,
          routineId: typeof w.routineId === 'string' ? w.routineId : undefined,
          title:
            typeof w.title === 'string' && w.title.trim() !== ''
              ? w.title.trim().slice(0, 120)
              : 'Rutina',
          category: sanitizeCategory(w.category),
          durationMin:
            typeof w.durationMin === 'number' && Number.isFinite(w.durationMin)
              ? Math.max(1, Math.min(720, Math.round(w.durationMin)))
              : 30,
          xpEarned:
            typeof w.xpEarned === 'number' && Number.isFinite(w.xpEarned)
              ? Math.max(0, Math.min(MAX_TOTAL_XP, Math.floor(w.xpEarned)))
              : 0,
          timeLabel:
            typeof w.timeLabel === 'string' && /^\d{1,2}:\d{2}$/.test(w.timeLabel)
              ? w.timeLabel
              : '12:00',
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
    // Conservar el contador de hoy o cualquier día histórico que haya superado 3 cambios
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
    accentPalette: isValidAccentPalette(parsed.accentPalette)
      ? parsed.accentPalette
      : 'lima',
    seasonsEnabled:
      typeof parsed.seasonsEnabled === 'boolean' ? parsed.seasonsEnabled : true,
    language: parsed.language === 'en' ? 'en' : 'es',
    hasSelectedInitialLanguage: parsed.hasSelectedInitialLanguage === true,
    customTexts: sanitizeCustomTexts(parsed.customTexts),
    xpFormulas: formulas,
    routines: sanitizeRoutinesList(parsed.routines, formulas),
    trashedRoutines: sanitizeRoutinesList(parsed.trashedRoutines, formulas),
    daysByIso: sanitizeDaysByIso(parsed.daysByIso),
    dismissedRepeatWeeks: sanitizeDismissedWeeks(parsed.dismissedRepeatWeeks, todayIso),
    unlockedTrophies: sanitizeUnlockedTrophies(parsed.unlockedTrophies, todayIso),
    scheduleChangesByDateIso: sanitizeScheduleChanges(parsed.scheduleChangesByDateIso, todayIso),
  };

  return reconcileDaysUntilToday(hydrated, todayIso);
}

export function serializeAppStateBackup(state: AppPersistentState): string {
  return JSON.stringify(
    {
      app: 'Brote',
      version: '1.0.0',
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

    // Verificar que al menos contenga claves reconocibles de estado de Brote
    const hasRecognizableShape =
      'daysByIso' in candidateState ||
      'routines' in candidateState ||
      'settledTotalXp' in candidateState ||
      'xpFormulas' in candidateState;

    if (!hasRecognizableShape) return null;

    const hydrated = hydrateSanitizedAppState(
      { ...candidateState, hasSelectedInitialLanguage: true },
      todayIso
    );
    return hydrated;
  } catch {
    return null;
  }
}

function migrateLegacyPreferencesWithZeroStats(todayIso: string): AppPersistentState {
  const fresh = createInitialAppState(todayIso);
  if (typeof window === 'undefined') return fresh;

  try {
    const legacyRaw = window.localStorage.getItem(LEGACY_STATE_KEY);
    window.localStorage.removeItem(LEGACY_STATE_KEY);
    window.localStorage.removeItem(LEGACY_SESSION_KEY);

    if (!legacyRaw) {
      window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(fresh));
      return fresh;
    }

    const legacy = JSON.parse(legacyRaw) as {
      themeMode?: unknown;
      colorPalette?: unknown;
      seasonsEnabled?: unknown;
      stepGoal?: unknown;
      xpFormulas?: Partial<XpFormulas>;
      routineTemplates?: Routine[];
      trashedRoutines?: Routine[];
    };

    const formulas = sanitizeFormulas(legacy.xpFormulas);
    const routines = Array.isArray(legacy.routineTemplates)
      ? legacy.routineTemplates.map((r) => ({
          ...r,
          xpReward: calculateRoutineBaseXp(r.category, r.durationMin, formulas),
        }))
      : [];
    const trashedRoutines = Array.isArray(legacy.trashedRoutines)
      ? legacy.trashedRoutines.map((r) => ({
          ...r,
          xpReward: calculateRoutineBaseXp(r.category, r.durationMin, formulas),
        }))
      : [];

    const migratedZeroStats: AppPersistentState = {
      ...fresh,
      themeMode: legacy.themeMode === 'light' ? 'light' : 'dark',
      accentPalette: isValidAccentPalette(legacy.colorPalette) ? legacy.colorPalette : 'lima',
      seasonsEnabled:
        typeof legacy.seasonsEnabled === 'boolean' ? legacy.seasonsEnabled : true,
      stepGoal:
        typeof legacy.stepGoal === 'number' && legacy.stepGoal >= 500
          ? Math.min(200_000, legacy.stepGoal)
          : 10_000,
      xpFormulas: formulas,
      routines,
      trashedRoutines,
    };

    window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(migratedZeroStats));
    return migratedZeroStats;
  } catch {
    return fresh;
  }
}

export function loadAppStateFromStorage(): AppPersistentState {
  const todayIso = getTodayDateIso();
  if (typeof window === 'undefined') {
    const initial = createInitialAppState(todayIso);
    applyThemeToDocument(initial.themeMode, initial.accentPalette, initial.language);
    return initial;
  }

  try {
    let raw = window.localStorage.getItem(APP_STATE_STORAGE_KEY);
    if (!raw) {
      const prevKinetixRaw = window.localStorage.getItem(PREVIOUS_KINETIX_STATE_KEY);
      if (prevKinetixRaw) {
        raw = prevKinetixRaw;
        window.localStorage.setItem(APP_STATE_STORAGE_KEY, prevKinetixRaw);
        window.localStorage.removeItem(PREVIOUS_KINETIX_STATE_KEY);
      }
    } else {
      window.localStorage.removeItem(PREVIOUS_KINETIX_STATE_KEY);
    }

    if (!raw) {
      const resetState = migrateLegacyPreferencesWithZeroStats(todayIso);
      applyThemeToDocument(resetState.themeMode, resetState.accentPalette, resetState.language);
      return resetState;
    }

    // Limpiar posibles restos antiguos si existieran
    window.localStorage.removeItem(LEGACY_STATE_KEY);
    window.localStorage.removeItem(LEGACY_SESSION_KEY);

    const parsed = JSON.parse(raw) as Partial<AppPersistentState>;
    const reconciled = hydrateSanitizedAppState(parsed, todayIso);
    applyThemeToDocument(reconciled.themeMode, reconciled.accentPalette, reconciled.language);
    return reconciled;
  } catch {
    const fallback = createInitialAppState(todayIso);
    applyThemeToDocument(fallback.themeMode, fallback.accentPalette, fallback.language);
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
    let raw = window.localStorage.getItem(WORKOUT_SESSION_STORAGE_KEY);
    if (!raw) {
      const prevSessionRaw = window.localStorage.getItem(PREVIOUS_KINETIX_SESSION_KEY);
      if (prevSessionRaw) {
        raw = prevSessionRaw;
        window.localStorage.setItem(WORKOUT_SESSION_STORAGE_KEY, prevSessionRaw);
        window.localStorage.removeItem(PREVIOUS_KINETIX_SESSION_KEY);
      }
    } else {
      window.localStorage.removeItem(PREVIOUS_KINETIX_SESSION_KEY);
    }
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

    return {
      activeTab,
      sessionRoutineId: validRoutineId,
      isSessionViewOpen,
      sessionOriginTab: isValidAppTab(parsed.sessionOriginTab)
        ? parsed.sessionOriginTab
        : AppTab.TRAINING,
      checkedExercises,
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
