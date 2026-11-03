/**
 * Vista de Rutinas:
 * - Modo A (Biblioteca): Crear, editar, iniciar o enviar rutinas a la papelera (con restauración).
 *   Adapta la creación según modalidad:
 *   · Fuerza / Híbrida: Tiempo total aprox. de la rutina + ejercicios con series/tiempo, kg opcionales y músculos.
 *   · Cardio: Tiempo objetivo + distancia opcional (km) + tramos/actividades opcionales (tiempo/distancia).
 * - Modo B (Sesión activa): Cronómetro digital Nothing × Cyberpunk, Temporizador de descanso editable,
 *   lista interactiva de ejercicios o tramos y cierre de sesión con cálculo real de minutos/XP.
 */

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Edit3,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import {
  AppLanguage,
  MuscleGroupId,
  Routine,
  RoutineCategory,
  RoutineExercise,
  WorkoutClockMode,
  XpFormulas,
} from '../types';
import {
  categorySupportsMuscles,
  extractMuscleGroupsFromExercises,
  getLocalizedMuscleLabel,
} from '../utils/muscleRecovery';
import { calculateRoutineBaseXp } from '../utils/progressionRules';
import { AnalogRepCounter } from './AnalogRepCounter';
import { BugGlobalMood, BugPerch } from './BugCompanion';
import { MuscleGroupSelect } from './MuscleGroupSelect';

interface TrainingViewProps {
  xpFormulas: XpFormulas;
  routines: Routine[];
  trashedRoutines: Routine[];
  activeSessionRoutine: Routine | null;
  sessionFullXp?: number;
  checkedExercises: Record<string, boolean>;
  onToggleExerciseCheck: (exerciseId: string) => void;
  repCounter: number;
  onIncrementRepCounter: () => void;
  onResetRepCounter: () => void;
  onChangeRepCounter: (nextValue: number) => void;
  clockMode: WorkoutClockMode;
  onChangeClockMode: (mode: WorkoutClockMode) => void;
  isClockRunning: boolean;
  displayedSeconds: number;
  countdownTargetSec: number;
  onToggleClockPlayPause: () => void;
  onResetClock: () => void;
  onSetCountdownTargetSec: (seconds: number) => void;
  onStartRoutine: (routineId: string) => void;
  onExitSession: () => void;
  onCompleteWorkout: () => void;
  onSaveRoutine: (routine: Routine, isNew: boolean) => void;
  onMoveRoutineToTrash: (routineId: string) => void;
  onRestoreRoutine: (routineId: string) => void;
  onPermanentDeleteRoutine: (routineId: string) => void;
  showBug?: boolean;
  bugMood?: BugGlobalMood;
  canPetBug?: boolean;
  canLaunchBugHockey?: boolean;
}

interface DraftRoutineExercise {
  id: string;
  name: string;
  setsReps: string;
  weightInput: string;
  distanceInput: string;
  durationInput: string;
  muscleGroups?: MuscleGroupId[];
}

const COUNTDOWN_PRESET_MINUTES = [
  { minutes: 1, seconds: 60 },
  { minutes: 3, seconds: 180 },
  { minutes: 5, seconds: 300 },
  { minutes: 10, seconds: 600 },
];

const ROUTINE_CATEGORIES: RoutineCategory[] = ['Fuerza', 'Híbrida', 'Cardio'];

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function formatStopwatchDisplay(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${padTwoDigits(hours)}:${padTwoDigits(minutes)}:${padTwoDigits(seconds)}`
    : `${padTwoDigits(minutes)}:${padTwoDigits(seconds)}`;
}

function sanitizeDecimalDraft(raw: string, maxDecimals = 2): string {
  let result = '';
  let hasSeparator = false;
  let decimalsCount = 0;

  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      if (hasSeparator) {
        if (decimalsCount < maxDecimals) {
          result += ch;
          decimalsCount += 1;
        }
      } else if (result.length < 4) {
        result += ch;
      }
    } else if ((ch === '.' || ch === ',') && !hasSeparator) {
      hasSeparator = true;
      result += result === '' ? `0${ch}` : ch;
    }
  }
  return result;
}

function parseOptionalPositiveDecimal(
  raw: string,
  minVal: number,
  maxVal: number
): number | undefined {
  const cleaned = raw.trim().replace(',', '.');
  if (!cleaned) return undefined;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  const clamped = Math.max(minVal, Math.min(maxVal, parsed));
  return Math.round(clamped * 100) / 100;
}

function formatMetricNumber(value: number, language: AppLanguage): string {
  const rounded = Math.round(value * 100) / 100;
  const raw = String(rounded);
  return language === 'es' ? raw.replace('.', ',') : raw;
}

export const TrainingView: React.FC<TrainingViewProps> = React.memo(({
  xpFormulas,
  routines,
  trashedRoutines,
  activeSessionRoutine,
  sessionFullXp,
  checkedExercises,
  onToggleExerciseCheck,
  repCounter,
  onIncrementRepCounter,
  onResetRepCounter,
  onChangeRepCounter,
  clockMode,
  onChangeClockMode,
  isClockRunning,
  displayedSeconds,
  countdownTargetSec,
  onToggleClockPlayPause,
  onResetClock,
  onSetCountdownTargetSec,
  onStartRoutine,
  onExitSession,
  onCompleteWorkout,
  onSaveRoutine,
  onMoveRoutineToTrash,
  onRestoreRoutine,
  onPermanentDeleteRoutine,
  showBug = false,
  bugMood = 'none',
  canPetBug = false,
  canLaunchBugHockey = false,
}) => {
  const { language, t, formatCategory } = useI18n();

  // Edición directa al tocar minutos o segundos del temporizador
  const [editingClockField, setEditingClockField] = useState<'min' | 'sec' | null>(null);
  const [clockFieldDraft, setClockFieldDraft] = useState('');

  // Modales: Editor de rutina y Papelera
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftCategory, setDraftCategory] = useState<RoutineCategory>('Fuerza');
  const [draftDurationInput, setDraftDurationInput] = useState<string>('45');
  const [hasTouchedDuration, setHasTouchedDuration] = useState<boolean>(false);
  const [draftDistanceInput, setDraftDistanceInput] = useState<string>('');
  const [draftExercises, setDraftExercises] = useState<DraftRoutineExercise[]>([]);

  // Campos para añadir nuevo ejercicio (Fuerza/Híbrida) o nuevo tramo (Cardio)
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseSets, setNewExerciseSets] = useState('');
  const [newExerciseWeight, setNewExerciseWeight] = useState('');
  const [newStageDuration, setNewStageDuration] = useState('');
  const [newStageDistance, setNewStageDistance] = useState('');
  const [newExerciseMuscles, setNewExerciseMuscles] = useState<MuscleGroupId[]>([]);

  useEffect(() => {
    if (!isEditorOpen && !isTrashOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEditorOpen(false);
        setIsTrashOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditorOpen, isTrashOpen]);

  const countdownMinutes = Math.floor(displayedSeconds / 60);
  const countdownSeconds = displayedSeconds % 60;

  const openClockFieldEditor = (field: 'min' | 'sec') => {
    if (clockMode !== WorkoutClockMode.COUNTDOWN) return;
    if (isClockRunning) {
      onToggleClockPlayPause();
    }
    setEditingClockField(field);
    setClockFieldDraft(field === 'min' ? String(countdownMinutes) : padTwoDigits(countdownSeconds));
  };

  const handleClockFieldChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'min' | 'sec'
  ) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (digits === '') {
      setClockFieldDraft('');
      return;
    }
    const maxAllowed = field === 'min' ? 180 : 59;
    setClockFieldDraft(String(Math.min(maxAllowed, parseInt(digits, 10))));
  };

  const commitClockField = () => {
    if (!editingClockField) return;
    const parsed = clockFieldDraft === '' ? 0 : parseInt(clockFieldDraft, 10);
    const nextMinutes = editingClockField === 'min' ? parsed : countdownMinutes;
    const nextSeconds = editingClockField === 'sec' ? Math.min(59, parsed) : countdownSeconds;
    const totalSeconds = Math.max(1, nextMinutes * 60 + nextSeconds);
    onSetCountdownTargetSec(totalSeconds);
    setEditingClockField(null);
  };

  const resetNewExerciseInputs = () => {
    setNewExerciseName('');
    setNewExerciseSets('');
    setNewExerciseWeight('');
    setNewStageDuration('');
    setNewStageDistance('');
    setNewExerciseMuscles([]);
  };

  const openCreateRoutineModal = () => {
    setEditingRoutineId(null);
    setDraftTitle('');
    setDraftCategory('Fuerza');
    setDraftDurationInput('45');
    setHasTouchedDuration(false);
    setDraftDistanceInput('');
    setDraftExercises([]);
    resetNewExerciseInputs();
    setIsEditorOpen(true);
  };

  const openEditRoutineModal = (routine: Routine) => {
    setEditingRoutineId(routine.id);
    setDraftTitle(routine.title);
    setDraftCategory(routine.category);
    setDraftDurationInput(String(routine.durationMin));
    setHasTouchedDuration(true);
    setDraftDistanceInput(
      routine.distanceKm !== undefined ? formatMetricNumber(routine.distanceKm, language) : ''
    );
    setDraftExercises(
      routine.exercises.map((ex) => ({
        id: ex.id,
        name: ex.name,
        setsReps: ex.setsReps,
        weightInput:
          ex.weightKg !== undefined ? formatMetricNumber(ex.weightKg, language) : '',
        distanceInput:
          ex.distanceKm !== undefined ? formatMetricNumber(ex.distanceKm, language) : '',
        durationInput:
          ex.durationMin !== undefined ? formatMetricNumber(ex.durationMin, language) : '',
        ...(ex.muscleGroups ? { muscleGroups: [...ex.muscleGroups] } : {}),
      }))
    );
    resetNewExerciseInputs();
    setIsEditorOpen(true);
  };

  const handleSelectDraftCategory = (nextCategory: RoutineCategory) => {
    setDraftCategory(nextCategory);
    if (!editingRoutineId && !hasTouchedDuration) {
      setDraftDurationInput(nextCategory === 'Cardio' ? '30' : '45');
    }
  };

  const handleUpdateDraftExerciseField = (
    exerciseId: string,
    patch: Partial<DraftRoutineExercise>
  ) => {
    setDraftExercises((prev) =>
      prev.map((item) => (item.id === exerciseId ? { ...item, ...patch } : item))
    );
  };

  const handleUpdateDraftExerciseMuscles = (
    exerciseId: string,
    nextMuscles: MuscleGroupId[]
  ) => {
    setDraftExercises((prev) =>
      prev.map((item) => {
        if (item.id !== exerciseId) return item;
        if (nextMuscles.length === 0) {
          const { muscleGroups: _removed, ...rest } = item;
          return rest;
        }
        return { ...item, muscleGroups: nextMuscles };
      })
    );
  };

  const buildDraftItemFromNewInputs = (): DraftRoutineExercise | null => {
    const trimmedName = newExerciseName.trim();
    if (!trimmedName) return null;
    const includeMuscles =
      categorySupportsMuscles(draftCategory) && newExerciseMuscles.length > 0;
    return {
      id: `ex-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: trimmedName,
      setsReps: draftCategory === 'Cardio' ? '' : newExerciseSets.trim(),
      weightInput: draftCategory === 'Cardio' ? '' : newExerciseWeight.trim(),
      distanceInput: draftCategory === 'Cardio' ? newStageDistance.trim() : '',
      durationInput: draftCategory === 'Cardio' ? newStageDuration.trim() : '',
      ...(includeMuscles ? { muscleGroups: [...newExerciseMuscles] } : {}),
    };
  };

  const handleAddDraftExercise = () => {
    const built = buildDraftItemFromNewInputs();
    if (!built) return;
    setDraftExercises((prev) => [...prev, built]);
    resetNewExerciseInputs();
  };

  const convertDraftItemToExercise = (
    item: DraftRoutineExercise,
    category: RoutineCategory
  ): RoutineExercise => {
    const supportsMuscles = categorySupportsMuscles(category);

    if (category === 'Cardio') {
      const stageDuration = parseOptionalPositiveDecimal(item.durationInput, 0.5, 600);
      const stageDistance = parseOptionalPositiveDecimal(item.distanceInput, 0.01, 999);
      const fallbackText =
        stageDuration === undefined && stageDistance === undefined ? item.setsReps.trim() : '';
      return {
        id: item.id,
        name: item.name.trim(),
        setsReps: fallbackText,
        ...(stageDuration !== undefined ? { durationMin: stageDuration } : {}),
        ...(stageDistance !== undefined ? { distanceKm: stageDistance } : {}),
      };
    }

    const weightKg = parseOptionalPositiveDecimal(item.weightInput, 0.1, 2000);
    return {
      id: item.id,
      name: item.name.trim(),
      setsReps: item.setsReps.trim(),
      ...(weightKg !== undefined ? { weightKg } : {}),
      ...(supportsMuscles && item.muscleGroups && item.muscleGroups.length > 0
        ? { muscleGroups: [...item.muscleGroups] }
        : {}),
    };
  };

  const summedCardioStagesDistanceKm = draftExercises.reduce((acc, item) => {
    const parsed = parseOptionalPositiveDecimal(item.distanceInput, 0.01, 999);
    return acc + (parsed ?? 0);
  }, 0);

  const handleSaveRoutineForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = draftTitle.trim() || t.editor_default_routine_name;
    const defaultFallbackMin = draftCategory === 'Cardio' ? 30 : 45;
    const parsedDuration = parseInt(draftDurationInput, 10);
    const safeDuration =
      Number.isFinite(parsedDuration) && parsedDuration >= 1
        ? Math.min(240, parsedDuration)
        : defaultFallbackMin;

    const pendingItem = buildDraftItemFromNewInputs();
    const allDraftItems = pendingItem ? [...draftExercises, pendingItem] : draftExercises;
    const finalExercises = allDraftItems.map((item) =>
      convertDraftItemToExercise(item, draftCategory)
    );

    const explicitRoutineDistance =
      draftCategory === 'Cardio'
        ? parseOptionalPositiveDecimal(draftDistanceInput, 0.01, 999)
        : undefined;
    const stagesDistanceSum =
      draftCategory === 'Cardio'
        ? Math.round(
            finalExercises.reduce((sum, ex) => sum + (ex.distanceKm ?? 0), 0) * 100
          ) / 100
        : 0;
    const finalRoutineDistanceKm =
      draftCategory === 'Cardio'
        ? explicitRoutineDistance ?? (stagesDistanceSum > 0 ? stagesDistanceSum : undefined)
        : undefined;

    const supportsMuscles = categorySupportsMuscles(draftCategory);
    const xpReward = calculateRoutineBaseXp(draftCategory, safeDuration, xpFormulas);
    const cleanedMuscles = supportsMuscles
      ? extractMuscleGroupsFromExercises(finalExercises)
      : undefined;

    onSaveRoutine(
      {
        id: editingRoutineId || `rt-${Date.now()}`,
        title: cleanTitle,
        category: draftCategory,
        durationMin: safeDuration,
        ...(finalRoutineDistanceKm !== undefined ? { distanceKm: finalRoutineDistanceKm } : {}),
        xpReward,
        exercises: finalExercises,
        ...(cleanedMuscles ? { muscleGroups: cleanedMuscles } : {}),
      },
      !editingRoutineId
    );
    resetNewExerciseInputs();
    setIsEditorOpen(false);
  };

  // --- MODO B: SESIÓN DE ENTRENAMIENTO ACTIVA ---
  if (activeSessionRoutine) {
    const isCardioSession = activeSessionRoutine.category === 'Cardio';
    const totalExercises = activeSessionRoutine.exercises.length;
    const completedCount = activeSessionRoutine.exercises.filter((ex) =>
      Boolean(checkedExercises[ex.id])
    ).length;
    const effectiveSessionXp = sessionFullXp ?? activeSessionRoutine.xpReward;
    const perExerciseXp =
      totalExercises > 0 ? Math.round(effectiveSessionXp / totalExercises) : effectiveSessionXp;
    const earnedSessionXp =
      totalExercises > 0
        ? Math.round((effectiveSessionXp * completedCount) / totalExercises)
        : effectiveSessionXp;

    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-subtle">
          <button
            type="button"
            onClick={onExitSession}
            className="btn-secondary min-h-[40px] px-3 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>{t.common_back}</span>
          </button>

          <div className="flex items-center gap-2.5">
            {showBug && (
              <div className="self-end -mb-3 mr-0.5 flex items-end">
                <BugPerch
                  gazeMode="down"
                  globalMood={bugMood}
                  canPet={canPetBug}
                  canLaunchHockey={canLaunchBugHockey}
                />
              </div>
            )}

            <span className="font-mono text-xs font-bold text-accent tabular-nums">
              {totalExercises > 0
                ? `+${earnedSessionXp} / ${effectiveSessionXp} ${t.profile_xp_unit}`
                : `+${effectiveSessionXp} ${t.profile_xp_unit}`}
            </span>
          </div>
        </div>

        {/* Reloj: Cronómetro o Temporizador Digital Nothing × Cyberpunk */}
        <section className="sheet-panel ndot-surface p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-wide text-fg">
                {activeSessionRoutine.title}
              </h1>
              <div className="flex items-center gap-2 text-xs font-mono text-fg-muted tabular-nums mt-1 flex-wrap">
                <span>{formatCategory(activeSessionRoutine.category)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {activeSessionRoutine.durationMin} {t.training_min_short}
                </span>
                {activeSessionRoutine.distanceKm !== undefined && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-fg-secondary font-semibold">
                      {formatMetricNumber(activeSessionRoutine.distanceKm, language)}{' '}
                      {t.steps_km_unit}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div
              role="group"
              aria-label={t.session_stopwatch}
              className="seg-group inline-flex items-center gap-0.5"
            >
              <button
                type="button"
                onClick={() => {
                  setEditingClockField(null);
                  onChangeClockMode(WorkoutClockMode.STOPWATCH);
                }}
                className={`seg-btn min-h-[34px] px-3 py-1 text-xs uppercase whitespace-nowrap ${
                  clockMode === WorkoutClockMode.STOPWATCH ? 'seg-btn-active' : ''
                }`}
              >
                {t.session_stopwatch}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingClockField(null);
                  onChangeClockMode(WorkoutClockMode.COUNTDOWN);
                }}
                className={`seg-btn min-h-[34px] px-3 py-1 text-xs uppercase whitespace-nowrap ${
                  clockMode === WorkoutClockMode.COUNTDOWN ? 'seg-btn-active' : ''
                }`}
              >
                {t.session_timer}
              </button>
            </div>
          </div>

          {clockMode === WorkoutClockMode.COUNTDOWN && (
            <div className="grid grid-cols-4 gap-2">
              {COUNTDOWN_PRESET_MINUTES.map((preset) => {
                const isActivePreset = countdownTargetSec === preset.seconds;
                return (
                  <button
                    key={preset.seconds}
                    type="button"
                    onClick={() => {
                      setEditingClockField(null);
                      onSetCountdownTargetSec(preset.seconds);
                    }}
                    className={`min-h-[38px] text-xs font-mono tabular-nums whitespace-nowrap ${
                      isActivePreset ? 'btn-primary' : 'btn-secondary'
                    }`}
                  >
                    {preset.minutes} {t.training_min_short}
                  </button>
                );
              })}
            </div>
          )}

          <div className="py-7 px-4 rounded-[4px] bg-canvas/85 border border-subtle flex items-center justify-center">
            {clockMode === WorkoutClockMode.STOPWATCH ? (
              <span className="font-mono text-5xl sm:text-6xl font-bold tracking-tighter text-fg tabular-nums">
                {formatStopwatchDisplay(displayedSeconds)}
              </span>
            ) : (
              <div className="flex items-center justify-center gap-1.5 font-mono text-5xl sm:text-6xl font-bold tracking-tighter text-fg tabular-nums">
                {editingClockField === 'min' ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      commitClockField();
                    }}
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoFocus
                      value={clockFieldDraft}
                      onChange={(e) => handleClockFieldChange(e, 'min')}
                      onBlur={commitClockField}
                      aria-label={t.editor_minutes_label}
                      className="input-field w-24 sm:w-28 text-center text-accent py-1 px-2"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => openClockFieldEditor('min')}
                    aria-label={t.editor_minutes_label}
                    className="px-2 py-0.5 rounded-[4px] hover:bg-elevated transition cursor-pointer"
                  >
                    {padTwoDigits(countdownMinutes)}
                  </button>
                )}

                <span className="text-accent select-none">:</span>

                {editingClockField === 'sec' ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      commitClockField();
                    }}
                  >
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoFocus
                      value={clockFieldDraft}
                      onChange={(e) => handleClockFieldChange(e, 'sec')}
                      onBlur={commitClockField}
                      aria-label={t.session_sec_short}
                      className="input-field w-24 sm:w-28 text-center text-accent py-1 px-2"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => openClockFieldEditor('sec')}
                    aria-label={t.session_sec_short}
                    className="px-2 py-0.5 rounded-[4px] hover:bg-elevated transition cursor-pointer"
                  >
                    {padTwoDigits(countdownSeconds)}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-12 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setEditingClockField(null);
                onToggleClockPlayPause();
              }}
              className="btn-primary col-span-9 min-h-[46px] px-4 py-2 text-sm flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {isClockRunning ? (
                <>
                  <Pause className="w-4 h-4 fill-current shrink-0" />
                  <span>{t.session_pause_btn}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current shrink-0" />
                  <span>{t.common_start}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingClockField(null);
                onResetClock();
              }}
              aria-label={t.session_reset_label}
              className="btn-secondary col-span-3 min-h-[46px] flex items-center justify-center"
            >
              <RotateCcw className="w-4 h-4 shrink-0" />
            </button>
          </div>
        </section>

        {/* Contador de repeticiones de rodillos (00 a 99) — exclusivo para Fuerza e Híbrida */}
        {!isCardioSession && (
          <AnalogRepCounter
            value={repCounter}
            label={t.session_reps_label}
            resetLabel={t.session_reset_label}
            onIncrement={onIncrementRepCounter}
            onReset={onResetRepCounter}
            onChangeValue={onChangeRepCounter}
          />
        )}

        {/* En Cardio continuo sin tramos asignados, botón limpio de finalizar directamente bajo el reloj */}
        {isCardioSession && totalExercises === 0 ? (
          <button
            type="button"
            onClick={onCompleteWorkout}
            className="btn-primary w-full min-h-[48px] px-4 py-2.5 text-sm flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{t.session_finish_btn}</span>
            {earnedSessionXp > 0 && (
              <span className="font-mono text-xs opacity-90 tabular-nums">
                · +{earnedSessionXp} {t.profile_xp_unit}
              </span>
            )}
          </button>
        ) : (
          <section className="sheet-panel p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold uppercase tracking-wide text-fg">
                {isCardioSession ? t.editor_cardio_blocks_heading : t.editor_exercises_label}
              </h2>
              <span className="font-mono text-xs text-fg-muted tabular-nums">
                {completedCount}/{totalExercises}
              </span>
            </div>

            {totalExercises === 0 ? (
              <p className="text-xs text-fg-muted py-2">{t.session_no_exercises}</p>
            ) : (
              <div className="divide-y divide-subtle border-y border-subtle">
                {activeSessionRoutine.exercises.map((exercise) => {
                  const isDone = Boolean(checkedExercises[exercise.id]);
                  const muscleLabels =
                    categorySupportsMuscles(activeSessionRoutine.category) &&
                    exercise.muscleGroups &&
                    exercise.muscleGroups.length > 0
                      ? exercise.muscleGroups.map((m) => getLocalizedMuscleLabel(m, t)).join(' · ')
                      : '';

                  const primaryMetricParts: { text: string; emphasize?: boolean }[] = [];
                  if (isCardioSession) {
                    if (exercise.durationMin !== undefined) {
                      primaryMetricParts.push({
                        text: `${formatMetricNumber(exercise.durationMin, language)} ${t.training_min_short}`,
                      });
                    }
                    if (exercise.distanceKm !== undefined) {
                      primaryMetricParts.push({
                        text: `${formatMetricNumber(exercise.distanceKm, language)} ${t.steps_km_unit}`,
                        emphasize: true,
                      });
                    }
                    if (primaryMetricParts.length === 0 && exercise.setsReps.trim() !== '') {
                      primaryMetricParts.push({ text: exercise.setsReps.trim() });
                    }
                  } else {
                    if (exercise.setsReps.trim() !== '') {
                      primaryMetricParts.push({ text: exercise.setsReps.trim() });
                    }
                    if (exercise.weightKg !== undefined) {
                      primaryMetricParts.push({
                        text: `${formatMetricNumber(exercise.weightKg, language)} ${t.training_kg_unit}`,
                        emphasize: true,
                      });
                    }
                  }

                  const hasSecondaryLine =
                    primaryMetricParts.length > 0 || muscleLabels.length > 0;

                  return (
                    <button
                      key={exercise.id}
                      type="button"
                      onClick={() => onToggleExerciseCheck(exercise.id)}
                      className="w-full min-h-[54px] py-3 flex items-center gap-3 text-left cursor-pointer"
                    >
                      <span
                        className={`w-5 h-5 rounded-[3px] border flex items-center justify-center transition shrink-0 ${
                          isDone
                            ? 'bg-accent-fill border-accent-fill text-accent-fg'
                            : 'bg-canvas border-strong text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[2.75]" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-sm font-medium truncate ${
                              isDone ? 'line-through text-fg-muted' : 'text-fg'
                            }`}
                          >
                            {exercise.name}
                          </span>
                          <span
                            className={`text-xs font-mono tabular-nums shrink-0 ${
                              isDone ? 'text-accent font-semibold' : 'text-fg-muted'
                            }`}
                          >
                            +{perExerciseXp} {t.profile_xp_unit}
                          </span>
                        </div>

                        {hasSecondaryLine && (
                          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-fg-muted mt-0.5 flex-wrap">
                            {primaryMetricParts.map((part, idx) => (
                              <React.Fragment key={idx}>
                                {idx > 0 && <span aria-hidden="true">·</span>}
                                <span
                                  className={
                                    part.emphasize && !isDone
                                      ? 'text-fg-secondary font-semibold'
                                      : ''
                                  }
                                >
                                  {part.text}
                                </span>
                              </React.Fragment>
                            ))}
                            {muscleLabels && (
                              <>
                                {primaryMetricParts.length > 0 && (
                                  <span aria-hidden="true">·</span>
                                )}
                                <span className="font-sans text-[11px] text-fg-secondary truncate">
                                  {muscleLabels}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={onCompleteWorkout}
              disabled={totalExercises > 0 && completedCount === 0}
              className="btn-primary w-full min-h-[46px] px-4 py-2 text-sm flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-45 disabled:pointer-events-none"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{t.session_finish_btn}</span>
              {earnedSessionXp > 0 && (
                <span className="font-mono text-xs opacity-90 tabular-nums">
                  · +{earnedSessionXp} {t.profile_xp_unit}
                </span>
              )}
            </button>
          </section>
        )}
      </div>
    );
  }

  // --- MODO A: BIBLIOTECA DE RUTINAS ---
  const isDraftCardio = draftCategory === 'Cardio';
  const defaultDraftFallbackMin = isDraftCardio ? 30 : 45;
  const parsedDraftDuration = parseInt(draftDurationInput, 10);
  const safeDraftDuration =
    Number.isFinite(parsedDraftDuration) && parsedDraftDuration >= 1
      ? Math.min(240, parsedDraftDuration)
      : defaultDraftFallbackMin;
  const draftRoutineXp = calculateRoutineBaseXp(draftCategory, safeDraftDuration, xpFormulas);
  const perDraftExerciseXp =
    draftExercises.length > 0 ? Math.round(draftRoutineXp / draftExercises.length) : 0;

  const routineNamePlaceholder =
    draftCategory === 'Cardio'
      ? t.editor_name_placeholder_cardio
      : draftCategory === 'Híbrida'
      ? t.editor_name_placeholder_hybrid
      : t.editor_name_placeholder;

  const routineDistancePlaceholder =
    summedCardioStagesDistanceKm > 0
      ? formatMetricNumber(summedCardioStagesDistanceKm, language)
      : t.editor_distance_placeholder;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div data-tutorial="training-overview" className="space-y-5">
      <div className="relative flex items-center justify-between gap-3 pb-3 border-b border-subtle">
        <h1 className="text-2xl font-bold uppercase tracking-wide text-fg">{t.training_title}</h1>

        <div className="flex items-center gap-2">
          {showBug && (
            <div className="self-end -mb-3 mr-1 sm:mr-2 flex items-end">
              <BugPerch
                gazeMode="down"
                globalMood={bugMood}
                canPet={canPetBug}
                canLaunchHockey={canLaunchBugHockey}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsTrashOpen(true)}
            aria-label={t.trash_title}
            className="btn-secondary min-h-[40px] px-3 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5 text-fg-muted shrink-0" />
            <span className="font-mono tabular-nums">{trashedRoutines.length}</span>
          </button>

          <button
            type="button"
            onClick={openCreateRoutineModal}
            className="btn-primary min-h-[40px] px-3.5 py-1.5 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>{t.training_new_btn}</span>
          </button>
        </div>
      </div>

      {routines.length === 0 ? (
        <div className="sheet-panel ndot-surface py-12 px-4 text-center">
          <p className="text-sm text-fg-muted">{t.training_empty}</p>
        </div>
      ) : (
        <div className="sheet-panel divide-y divide-subtle px-4 sm:px-5">
          {routines.map((routine) => {
            const isCardio = routine.category === 'Cardio';
            const showExerciseCount = !isCardio || routine.exercises.length > 0;
            return (
              <div key={routine.id} className="py-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-fg truncate">{routine.title}</h2>
                  <div className="flex items-center gap-2 text-xs text-fg-muted font-mono tabular-nums mt-0.5 flex-wrap">
                    <span>{formatCategory(routine.category)}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {routine.durationMin} {t.training_min_short}
                    </span>
                    {routine.distanceKm !== undefined && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-fg-secondary font-semibold">
                          {formatMetricNumber(routine.distanceKm, language)} {t.steps_km_unit}
                        </span>
                      </>
                    )}
                    {showExerciseCount && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>
                          {routine.exercises.length}{' '}
                          {isCardio ? t.training_blocks_short : t.training_exercises_short}
                        </span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="text-accent font-semibold">
                      +{routine.xpReward} {t.profile_xp_unit}
                    </span>
                  </div>
                  {(() => {
                    const displayMuscles =
                      extractMuscleGroupsFromExercises(routine.exercises) ?? routine.muscleGroups;
                    if (!displayMuscles || displayMuscles.length === 0) return null;
                    return (
                      <p className="text-[11px] text-fg-secondary mt-1 truncate">
                        {displayMuscles
                          .map((muscle) => getLocalizedMuscleLabel(muscle, t))
                          .join(' · ')}
                      </p>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onStartRoutine(routine.id)}
                    className="btn-primary min-h-[40px] px-3.5 text-xs flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Play className="w-3 h-3 fill-current shrink-0" />
                    <span>{t.common_start}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditRoutineModal(routine)}
                    aria-label={`${t.common_edit} ${routine.title}`}
                    className="btn-quiet min-h-[40px] min-w-[40px] flex items-center justify-center"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onMoveRoutineToTrash(routine.id)}
                    aria-label={`${t.common_delete} ${routine.title}`}
                    className="btn-quiet min-h-[40px] min-w-[40px] flex items-center justify-center"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Modal: Crear / Editar Rutina */}
      {isEditorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="editor-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsEditorOpen(false);
            }
          }}
        >
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto modal-sheet sheet-panel rounded-t-xl sm:rounded-md p-5 sm:p-6 safe-bottom-modal">
            <div className="w-9 h-1 bg-elevated rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-subtle">
              <h3
                id="editor-title"
                className="text-base font-bold uppercase tracking-wide text-fg"
              >
                {editingRoutineId ? t.editor_edit_routine : t.editor_new_routine}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                aria-label={t.common_close}
                className="btn-quiet min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRoutineForm} className="mt-4 space-y-4">
              {/* 1. Selector directo de modalidad (Fuerza · Híbrida · Cardio) */}
              <div>
                <p className="block font-display text-xs font-semibold uppercase tracking-wider text-fg mb-1.5">
                  {t.editor_type_label}
                </p>
                <div
                  role="group"
                  aria-label={t.editor_type_label}
                  className="seg-group grid grid-cols-3 gap-1"
                >
                  {ROUTINE_CATEGORIES.map((category) => {
                    const isActive = draftCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => handleSelectDraftCategory(category)}
                        aria-pressed={isActive}
                        className={`seg-btn min-h-[40px] px-2.5 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                          isActive ? 'seg-btn-active' : ''
                        }`}
                      >
                        {formatCategory(category)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Nombre de la rutina */}
              <div>
                <label
                  htmlFor="rt-title"
                  className="block font-display text-xs font-semibold uppercase tracking-wider text-fg mb-1.5"
                >
                  {t.editor_name_label}
                </label>
                <input
                  id="rt-title"
                  type="text"
                  required
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder={routineNamePlaceholder}
                  className="input-field w-full min-h-[44px] px-3.5 py-2 text-sm placeholder:text-fg-muted"
                />
              </div>

              {/* 3. Tiempo total aprox. (Fuerza/Híbrida) o Tiempo + Distancia opcional (Cardio) */}
              {isDraftCardio ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label
                        htmlFor="rt-dur"
                        className="font-display text-xs font-semibold uppercase tracking-wider text-fg truncate"
                      >
                        {t.editor_cardio_duration_label}
                      </label>
                      <span className="font-mono text-[11px] font-bold text-accent tabular-nums shrink-0">
                        +{draftRoutineXp} {t.profile_xp_unit}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        id="rt-dur"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={draftDurationInput}
                        onChange={(e) => {
                          setHasTouchedDuration(true);
                          const digits = e.target.value.replace(/\D/g, '');
                          if (digits === '') {
                            setDraftDurationInput('');
                            return;
                          }
                          setDraftDurationInput(String(Math.min(240, parseInt(digits, 10))));
                        }}
                        onBlur={() => {
                          const parsed = parseInt(draftDurationInput, 10);
                          setDraftDurationInput(
                            String(
                              Number.isFinite(parsed) && parsed >= 1
                                ? Math.min(240, parsed)
                                : 30
                            )
                          );
                        }}
                        className="input-field w-full min-h-[44px] pl-3.5 pr-11 py-2 text-sm font-mono tabular-nums"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-fg-muted">
                        {t.training_min_short}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="rt-dist"
                      className="block font-display text-xs font-semibold uppercase tracking-wider text-fg mb-1.5 truncate"
                    >
                      {t.editor_distance_optional_label}
                    </label>
                    <div className="relative">
                      <input
                        id="rt-dist"
                        type="text"
                        inputMode="decimal"
                        value={draftDistanceInput}
                        onChange={(e) =>
                          setDraftDistanceInput(sanitizeDecimalDraft(e.target.value))
                        }
                        placeholder={routineDistancePlaceholder}
                        className="input-field w-full min-h-[44px] pl-3.5 pr-10 py-2 text-sm font-mono tabular-nums placeholder:text-fg-muted"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-fg-muted">
                        {t.steps_km_unit}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label
                      htmlFor="rt-dur"
                      className="font-display text-xs font-semibold uppercase tracking-wider text-fg"
                    >
                      {t.editor_routine_duration_label}
                    </label>
                    <span className="font-mono text-xs font-bold text-accent tabular-nums shrink-0">
                      +{draftRoutineXp} {t.profile_xp_unit}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="rt-dur"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={draftDurationInput}
                      onChange={(e) => {
                        setHasTouchedDuration(true);
                        const digits = e.target.value.replace(/\D/g, '');
                        if (digits === '') {
                          setDraftDurationInput('');
                          return;
                        }
                        setDraftDurationInput(String(Math.min(240, parseInt(digits, 10))));
                      }}
                      onBlur={() => {
                        const parsed = parseInt(draftDurationInput, 10);
                        setDraftDurationInput(
                          String(
                            Number.isFinite(parsed) && parsed >= 1 ? Math.min(240, parsed) : 45
                          )
                        );
                      }}
                      className="input-field w-full min-h-[44px] pl-3.5 pr-12 py-2 text-sm font-mono tabular-nums"
                    />
                    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-fg-muted">
                      {t.training_min_short}
                    </span>
                  </div>
                </div>
              )}

              {/* 4. Ejercicios (Fuerza/Híbrida) o Tramos opcionales (Cardio) */}
              <div className="space-y-2.5">
                <div>
                  <p className="font-display text-xs font-semibold uppercase tracking-wider text-fg">
                    {isDraftCardio ? t.editor_cardio_blocks_label : t.editor_exercises_label}{' '}
                    ({draftExercises.length})
                  </p>
                  {isDraftCardio && (
                    <p className="text-[11px] text-fg-muted mt-0.5">
                      {t.editor_cardio_blocks_hint}
                    </p>
                  )}
                </div>

                {draftExercises.length > 0 && (
                  <div className="divide-y divide-subtle border-y border-subtle">
                    {draftExercises.map((exercise) => (
                      <div key={exercise.id} className="py-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-fg truncate flex-1 min-w-0">
                            {exercise.name}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-mono text-accent tabular-nums">
                              +{perDraftExerciseXp} {t.profile_xp_unit}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setDraftExercises((prev) =>
                                  prev.filter((item) => item.id !== exercise.id)
                                )
                              }
                              aria-label={`${t.common_delete} ${exercise.name}`}
                              className="btn-quiet min-h-[34px] min-w-[34px] -mr-1.5 flex items-center justify-center shrink-0"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {isDraftCardio ? (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={exercise.durationInput}
                                onChange={(e) =>
                                  handleUpdateDraftExerciseField(exercise.id, {
                                    durationInput: sanitizeDecimalDraft(e.target.value, 1),
                                  })
                                }
                                placeholder={t.editor_block_time_placeholder}
                                aria-label={`${exercise.name} ${t.training_min_short}`}
                                className="input-field w-full min-h-[38px] pl-3 pr-10 py-1.5 text-xs font-mono tabular-nums placeholder:text-fg-muted"
                              />
                              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-fg-muted">
                                {t.training_min_short}
                              </span>
                            </div>

                            <div className="relative">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={exercise.distanceInput}
                                onChange={(e) =>
                                  handleUpdateDraftExerciseField(exercise.id, {
                                    distanceInput: sanitizeDecimalDraft(e.target.value),
                                  })
                                }
                                placeholder={t.editor_distance_placeholder}
                                aria-label={`${exercise.name} ${t.steps_km_unit}`}
                                className="input-field w-full min-h-[38px] pl-3 pr-9 py-1.5 text-xs font-mono tabular-nums placeholder:text-fg-muted"
                              />
                              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-fg-muted">
                                {t.steps_km_unit}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
                            <input
                              type="text"
                              value={exercise.setsReps}
                              onChange={(e) =>
                                handleUpdateDraftExerciseField(exercise.id, {
                                  setsReps: e.target.value,
                                })
                              }
                              placeholder={t.editor_sets_placeholder}
                              aria-label={`${exercise.name} ${t.editor_sets_optional_label}`}
                              className="input-field sm:col-span-4 min-h-[38px] px-3 py-1.5 text-xs font-mono placeholder:text-fg-muted"
                            />

                            <div className="relative sm:col-span-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={exercise.weightInput}
                                onChange={(e) =>
                                  handleUpdateDraftExerciseField(exercise.id, {
                                    weightInput: sanitizeDecimalDraft(e.target.value),
                                  })
                                }
                                placeholder="—"
                                aria-label={`${exercise.name} ${t.training_kg_unit}`}
                                className="input-field w-full min-h-[38px] pl-3 pr-8 py-1.5 text-xs font-mono tabular-nums placeholder:text-fg-muted"
                              />
                              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-fg-muted">
                                {t.training_kg_unit}
                              </span>
                            </div>

                            {categorySupportsMuscles(draftCategory) && (
                              <div className="col-span-2 sm:col-span-5">
                                <MuscleGroupSelect
                                  compact
                                  value={exercise.muscleGroups ?? []}
                                  onChange={(nextMuscles) =>
                                    handleUpdateDraftExerciseMuscles(exercise.id, nextMuscles)
                                  }
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Creador de nuevo ejercicio (Fuerza/Híbrida) o nuevo tramo (Cardio) */}
                <div className="rounded-[4px] bg-canvas/65 border border-subtle p-3 space-y-2.5">
                  <input
                    type="text"
                    value={newExerciseName}
                    onChange={(e) => setNewExerciseName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddDraftExercise();
                      }
                    }}
                    placeholder={
                      isDraftCardio
                        ? t.editor_cardio_block_placeholder
                        : t.editor_exercise_placeholder
                    }
                    aria-label={
                      isDraftCardio
                        ? t.editor_cardio_block_placeholder
                        : t.editor_exercise_placeholder
                    }
                    className="input-field w-full min-h-[42px] px-3 py-2 text-xs placeholder:text-fg-muted"
                  />

                  {isDraftCardio ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor="new-stage-min"
                          className="block font-display text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-1 truncate"
                        >
                          {t.editor_block_time_optional_label}
                        </label>
                        <div className="relative">
                          <input
                            id="new-stage-min"
                            type="text"
                            inputMode="decimal"
                            value={newStageDuration}
                            onChange={(e) =>
                              setNewStageDuration(sanitizeDecimalDraft(e.target.value, 1))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddDraftExercise();
                              }
                            }}
                            placeholder={t.editor_block_time_placeholder}
                            className="input-field w-full min-h-[40px] pl-3 pr-10 py-1.5 text-xs font-mono tabular-nums placeholder:text-fg-muted"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-fg-muted">
                            {t.training_min_short}
                          </span>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="new-stage-km"
                          className="block font-display text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-1 truncate"
                        >
                          {t.editor_distance_optional_label}
                        </label>
                        <div className="relative">
                          <input
                            id="new-stage-km"
                            type="text"
                            inputMode="decimal"
                            value={newStageDistance}
                            onChange={(e) =>
                              setNewStageDistance(sanitizeDecimalDraft(e.target.value))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddDraftExercise();
                              }
                            }}
                            placeholder={t.editor_distance_placeholder}
                            className="input-field w-full min-h-[40px] pl-3 pr-9 py-1.5 text-xs font-mono tabular-nums placeholder:text-fg-muted"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-fg-muted">
                            {t.steps_km_unit}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label
                            htmlFor="new-ex-sets"
                            className="block font-display text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-1 truncate"
                          >
                            {t.editor_sets_optional_label}
                          </label>
                          <input
                            id="new-ex-sets"
                            type="text"
                            value={newExerciseSets}
                            onChange={(e) => setNewExerciseSets(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddDraftExercise();
                              }
                            }}
                            placeholder={t.editor_sets_placeholder}
                            className="input-field w-full min-h-[40px] px-3 py-1.5 text-xs font-mono placeholder:text-fg-muted"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="new-ex-kg"
                            className="block font-display text-[10px] font-semibold uppercase tracking-wider text-fg-muted mb-1 truncate"
                          >
                            {t.editor_weight_optional_label}
                          </label>
                          <div className="relative">
                            <input
                              id="new-ex-kg"
                              type="text"
                              inputMode="decimal"
                              value={newExerciseWeight}
                              onChange={(e) =>
                                setNewExerciseWeight(sanitizeDecimalDraft(e.target.value))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddDraftExercise();
                                }
                              }}
                              placeholder={t.editor_weight_placeholder}
                              className="input-field w-full min-h-[40px] pl-3 pr-9 py-1.5 text-xs font-mono tabular-nums placeholder:text-fg-muted"
                            />
                            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-fg-muted">
                              {t.training_kg_unit}
                            </span>
                          </div>
                        </div>
                      </div>

                      {categorySupportsMuscles(draftCategory) && (
                        <MuscleGroupSelect
                          value={newExerciseMuscles}
                          onChange={setNewExerciseMuscles}
                        />
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    onClick={handleAddDraftExercise}
                    disabled={!newExerciseName.trim()}
                    className="btn-secondary w-full min-h-[40px] px-3 py-1.5 text-xs font-semibold text-accent flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-45 disabled:pointer-events-none"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {isDraftCardio ? t.editor_add_cardio_block_btn : t.editor_add_exercise_btn}
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="btn-secondary min-h-[44px] px-4 py-2 text-xs whitespace-nowrap"
                >
                  {t.common_cancel}
                </button>
                <button
                  type="submit"
                  className="btn-primary min-h-[44px] px-4 py-2 text-xs whitespace-nowrap"
                >
                  {t.common_save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Papelera de Rutinas */}
      {isTrashOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trash-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsTrashOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto modal-sheet sheet-panel rounded-t-xl sm:rounded-md p-5 sm:p-6 safe-bottom-modal">
            <div className="w-9 h-1 bg-elevated rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between gap-4 pb-2 border-b border-subtle">
              <h3
                id="trash-title"
                className="text-base font-bold uppercase tracking-wide text-fg"
              >
                {t.trash_title}
              </h3>
              <button
                type="button"
                onClick={() => setIsTrashOpen(false)}
                aria-label={t.common_close}
                className="btn-quiet min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {trashedRoutines.length === 0 ? (
              <p className="py-8 text-center text-xs text-fg-muted">{t.trash_empty}</p>
            ) : (
              <div className="mt-2 divide-y divide-subtle">
                {trashedRoutines.map((item) => (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fg truncate">{item.title}</p>
                      <p className="text-xs font-mono text-fg-muted tabular-nums mt-0.5">
                        {formatCategory(item.category)} · {item.durationMin} {t.training_min_short}
                        {item.distanceKm !== undefined
                          ? ` · ${formatMetricNumber(item.distanceKm, language)} ${t.steps_km_unit}`
                          : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onRestoreRoutine(item.id)}
                        aria-label={`${t.trash_restore_btn} ${item.title}`}
                        className="btn-primary min-h-[38px] px-3 text-xs flex items-center gap-1 whitespace-nowrap"
                      >
                        <Undo2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{t.trash_restore_btn}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onPermanentDeleteRoutine(item.id)}
                        aria-label={`${t.common_delete} ${item.title}`}
                        className="btn-quiet min-h-[38px] min-w-[38px] flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
