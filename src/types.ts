/**
 * Tipos e interfaces principales del dominio de Upgrade.
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

export type RoutineCategory = 'Fuerza' | 'Cardio' | 'Híbrida';

export type MuscleGroupId =
  | 'pecho'
  | 'hombro'
  | 'biceps'
  | 'triceps'
  | 'antebrazo'
  | 'abdomen'
  | 'espalda'
  | 'gluteo'
  | 'muslo'
  | 'gemelos';

export type MuscleFatigueState = 'fresh' | 'recovering' | 'loaded';

export type TrophyTier = 'bronce' | 'plata' | 'oro' | 'platino' | 'diamante';

export type ThemeMode = 'dark' | 'light';

export type AppLanguage = 'es' | 'en';

export type CustomTextsByLanguage = Partial<Record<AppLanguage, Record<string, string>>>;

export type AccentPaletteId =
  | 'ambar'
  | 'coral'
  | 'monocromo'
  | 'frambuesa'
  | 'oceano'
  | 'lima'
  | 'amatista'
  | 'esmeralda'
  | 'custom';

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
  hybridFormula: string;
}

export interface RoutineExercise {
  id: string;
  name: string;
  setsReps: string;
  weightKg?: number;
  distanceKm?: number;
  durationMin?: number;
  muscleGroups?: MuscleGroupId[];
}

export interface Routine {
  id: string;
  title: string;
  category: RoutineCategory;
  durationMin: number;
  distanceKm?: number;
  xpReward: number;
  exercises: RoutineExercise[];
  muscleGroups?: MuscleGroupId[];
  deletedAt?: string;
}

export interface CompletedWorkout {
  id: string;
  routineId?: string;
  title: string;
  category: RoutineCategory;
  durationMin: number;
  distanceKm?: number;
  xpEarned: number;
  timeLabel: string;
  muscleGroups?: MuscleGroupId[];
  completionRatio?: number;
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
  customAccentHex?: string;
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
  bugUnlockedAtIso?: string; // fecha ISO al alcanzar Nivel 10 y descubrir a Bug
  bugHockeyUnlockedAtIso?: string; // fecha ISO al alcanzar Nivel 50 y desbloquear modo Air Hockey
  hideBug?: boolean; // opción en Ajustes para ocultar o mostrar a Bug tras desbloquearlo
}

export type BugUnlockMilestone = 'level10' | 'level50';

export interface ActiveWorkoutSessionState {
  activeTab: AppTab;
  sessionRoutineId: string | null;
  isSessionViewOpen: boolean;
  sessionOriginTab: AppTab;
  checkedExercises: Record<string, boolean>;
  repCounter: number;
  clockMode: WorkoutClockMode;
  stopwatchAccumMs: number;
  stopwatchStartMs: number | null;
  countdownTargetSec: number;
  countdownRemMs: number;
  countdownEndMs: number | null;
}
