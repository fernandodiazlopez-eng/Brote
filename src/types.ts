/**
 * Tipos e interfaces principales del dominio de Brote.
 */

export enum AppTab {
  TRAINING = 'training',
  PROFILE = 'profile',
  STATS = 'stats',
}

export enum WorkoutClockMode {
  STOPWATCH = 'stopwatch',
  COUNTDOWN = 'countdown',
}

export type WeekdayCode = 'lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab' | 'dom';

export type RoutineCategory = 'Fuerza' | 'Cardio';

export type TrophyTier = 'bronce' | 'plata' | 'oro' | 'platino' | 'diamante';

export type ThemeMode = 'dark' | 'light';

export type AppLanguage = 'es' | 'en';

export type CustomTextsByLanguage = Partial<Record<AppLanguage, Record<string, string>>>;

export type TreeSeasonId = 'otono' | 'invierno' | 'primavera' | 'verano';

export type AccentPaletteId =
  | 'lima'
  | 'esmeralda'
  | 'oceano'
  | 'ambar'
  | 'amatista'
  | 'coral';

export interface Trophy {
  id: string;
  tier: TrophyTier;
  title: string;
  description: string;
}

export interface XpFormulas {
  stepsFormula: string;
  strengthFormula: string;
  cardioFormula: string;
}

export interface RoutineExercise {
  id: string;
  name: string;
  setsReps: string;
}

export interface Routine {
  id: string;
  title: string;
  category: RoutineCategory;
  durationMin: number;
  xpReward: number;
  exercises: RoutineExercise[];
  deletedAt?: string;
}

export interface CompletedWorkout {
  id: string;
  routineId?: string;
  title: string;
  category: RoutineCategory;
  durationMin: number;
  xpEarned: number;
  timeLabel: string;
}

export interface DailyActivityRecord {
  plannedRoutineIds: string[];
  completedWorkouts: CompletedWorkout[];
  steps: number;
}

export interface WeekDayInfo {
  dateIso: string; // Formato local 'YYYY-MM-DD'
  dayCode: WeekdayCode;
  dayName: string;
  shortLabel: string;
  dayOfMonth: number;
  monthShort: string;
}

export interface AppPersistentState {
  firstOpenDateIso: string;
  lastProcessedDateIso: string;
  settledTotalXp: number;
  settledPeakLevel: number;
  settledPeakContinuousLevel: number;
  settledInactiveDays: number;
  stepGoal: number;
  themeMode: ThemeMode;
  accentPalette: AccentPaletteId;
  seasonsEnabled: boolean;
  language: AppLanguage;
  hasSelectedInitialLanguage: boolean;
  customTexts: CustomTextsByLanguage;
  xpFormulas: XpFormulas;
  routines: Routine[];
  trashedRoutines: Routine[];
  daysByIso: Record<string, DailyActivityRecord>;
  dismissedRepeatWeeks: string[];
  unlockedTrophies: Record<string, string>; // trophyId -> fecha ISO de obtención
  scheduleChangesByDateIso: Record<string, number>; // contador diario para el logro «El indeciso»
}

export interface ActiveWorkoutSessionState {
  activeTab: AppTab;
  sessionRoutineId: string | null;
  isSessionViewOpen: boolean;
  sessionOriginTab: AppTab;
  checkedExercises: Record<string, boolean>;
  clockMode: WorkoutClockMode;
  stopwatchAccumMs: number;
  stopwatchStartMs: number | null;
  countdownTargetSec: number;
  countdownRemMs: number;
  countdownEndMs: number | null;
}
