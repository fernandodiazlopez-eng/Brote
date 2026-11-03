/**
 * Vista de Rutinas:
 * - Modo A (Biblioteca): Crear, editar, iniciar o enviar rutinas a la papelera (con restauración).
 * - Modo B (Sesión activa): Cronómetro digital Nothing × Cyberpunk, Temporizador de descanso editable,
 *   lista interactiva de ejercicios y cierre de sesión con cálculo real de minutos/XP.
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
  const { t, formatCategory } = useI18n();

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
  const [draftExercises, setDraftExercises] = useState<RoutineExercise[]>([]);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseSets, setNewExerciseSets] = useState('4 × 10');
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

  const openCreateRoutineModal = () => {
    setEditingRoutineId(null);
    setDraftTitle('');
    setDraftCategory('Fuerza');
    setDraftDurationInput('45');
    setDraftExercises([]);
    setNewExerciseName('');
    setNewExerciseSets('4 × 10');
    setNewExerciseMuscles([]);
    setIsEditorOpen(true);
  };

  const openEditRoutineModal = (routine: Routine) => {
    setEditingRoutineId(routine.id);
    setDraftTitle(routine.title);
    setDraftCategory(routine.category);
    setDraftDurationInput(String(routine.durationMin));
    setDraftExercises(
      routine.exercises.map((ex) => ({
        ...ex,
        ...(ex.muscleGroups ? { muscleGroups: [...ex.muscleGroups] } : {}),
      }))
    );
    setNewExerciseName('');
    setNewExerciseSets('4 × 10');
    setNewExerciseMuscles([]);
    setIsEditorOpen(true);
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

  const handleAddDraftExercise = () => {
    const trimmedName = newExerciseName.trim();
    if (!trimmedName) return;
    const includeMuscles =
      categorySupportsMuscles(draftCategory) && newExerciseMuscles.length > 0;
    setDraftExercises((prev) => [
      ...prev,
      {
        id: `ex-${Date.now()}`,
        name: trimmedName,
        setsReps: newExerciseSets.trim() || '3 × 10',
        ...(includeMuscles ? { muscleGroups: [...newExerciseMuscles] } : {}),
      },
    ]);
    setNewExerciseName('');
    setNewExerciseMuscles([]);
  };

  const handleSaveRoutineForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = draftTitle.trim() || t.editor_default_routine_name;
    const parsedDuration = parseInt(draftDurationInput, 10);
    const safeDuration =
      Number.isFinite(parsedDuration) && parsedDuration >= 1
        ? Math.min(240, parsedDuration)
        : 45;
    const supportsMuscles = categorySupportsMuscles(draftCategory);
    const pendingExerciseName = newExerciseName.trim();
    const rawExercises: RoutineExercise[] = pendingExerciseName
      ? [
          ...draftExercises,
          {
            id: `ex-${Date.now()}`,
            name: pendingExerciseName,
            setsReps: newExerciseSets.trim() || '3 × 10',
            ...(supportsMuscles && newExerciseMuscles.length > 0
              ? { muscleGroups: [...newExerciseMuscles] }
              : {}),
          },
        ]
      : draftExercises;

    const finalExercises: RoutineExercise[] = supportsMuscles
      ? rawExercises
      : rawExercises.map(({ muscleGroups: _removed, ...rest }) => rest);

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
        xpReward,
        exercises: finalExercises,
        ...(cleanedMuscles ? { muscleGroups: cleanedMuscles } : {}),
      },
      !editingRoutineId
    );
    setNewExerciseName('');
    setNewExerciseMuscles([]);
    setIsEditorOpen(false);
  };

  // --- MODO B: SESIÓN DE ENTRENAMIENTO ACTIVA ---
  if (activeSessionRoutine) {
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

          <span className="font-mono text-xs font-bold text-accent tabular-nums">
            {totalExercises > 0
              ? `+${earnedSessionXp} / ${effectiveSessionXp} ${t.profile_xp_unit}`
              : `+${effectiveSessionXp} ${t.profile_xp_unit}`}
          </span>
        </div>

        {/* Reloj: Cronómetro o Temporizador Digital Nothing × Cyberpunk */}
        <section className="sheet-panel ndot-surface p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-wide text-fg">
              {activeSessionRoutine.title}
            </h1>

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

        {/* Contador de repeticiones de rodillos (00 a 99) */}
        <AnalogRepCounter
          value={repCounter}
          label={t.session_reps_label}
          resetLabel={t.session_reset_label}
          onIncrement={onIncrementRepCounter}
          onReset={onResetRepCounter}
          onChangeValue={onChangeRepCounter}
        />

        {/* Lista de ejercicios de la sesión */}
        <section className="sheet-panel p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold uppercase tracking-wide text-fg">
              {t.editor_exercises_label}
            </h2>
            <span className="font-mono text-xs text-fg-muted tabular-nums">
              {completedCount}/{activeSessionRoutine.exercises.length}
            </span>
          </div>

          {activeSessionRoutine.exercises.length === 0 ? (
            <p className="text-xs text-fg-muted py-2">{t.session_no_exercises}</p>
          ) : (
            <div className="divide-y divide-subtle border-y border-subtle">
              {activeSessionRoutine.exercises.map((exercise) => {
                const isDone = Boolean(checkedExercises[exercise.id]);
                return (
                  <button
                    key={exercise.id}
                    type="button"
                    onClick={() => onToggleExerciseCheck(exercise.id)}
                    className="w-full min-h-[52px] py-2.5 flex items-center justify-between gap-3 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-[3px] border flex items-center justify-center transition shrink-0 ${
                          isDone
                            ? 'bg-accent-fill border-accent-fill text-accent-fg'
                            : 'bg-canvas border-strong text-transparent'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[2.75]" />
                      </span>
                      <span
                        className={`text-sm font-medium truncate ${
                          isDone ? 'line-through text-fg-muted' : 'text-fg'
                        }`}
                      >
                        {exercise.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 max-w-[58%] text-right">
                      {categorySupportsMuscles(activeSessionRoutine.category) &&
                        exercise.muscleGroups &&
                        exercise.muscleGroups.length > 0 && (
                          <>
                            <span className="text-[11px] text-fg-secondary truncate">
                              {exercise.muscleGroups
                                .map((m) => getLocalizedMuscleLabel(m, t))
                                .join(' · ')}
                            </span>
                            <span aria-hidden="true" className="text-xs text-fg-muted shrink-0">
                              ·
                            </span>
                          </>
                        )}
                      <span className="text-xs font-mono text-fg-muted tabular-nums shrink-0">
                        {exercise.setsReps}
                      </span>
                      <span aria-hidden="true" className="text-xs text-fg-muted shrink-0">
                        ·
                      </span>
                      <span
                        className={`text-xs font-mono tabular-nums shrink-0 ${
                          isDone ? 'text-accent font-semibold' : 'text-fg-muted'
                        }`}
                      >
                        +{perExerciseXp} {t.profile_xp_unit}
                      </span>
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
      </div>
    );
  }

  // --- MODO A: BIBLIOTECA DE RUTINAS ---
  const parsedDraftDuration = parseInt(draftDurationInput, 10);
  const safeDraftDuration =
    Number.isFinite(parsedDraftDuration) && parsedDraftDuration >= 1
      ? Math.min(240, parsedDraftDuration)
      : 45;
  const draftRoutineXp = calculateRoutineBaseXp(draftCategory, safeDraftDuration, xpFormulas);
  const perDraftExerciseXp =
    draftExercises.length > 0 ? Math.round(draftRoutineXp / draftExercises.length) : 0;
  return (
    <div className="max-w-3xl mx-auto space-y-5">
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
          {routines.map((routine) => (
            <div key={routine.id} className="py-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-fg truncate">{routine.title}</h2>
                <div className="flex items-center gap-2 text-xs text-fg-muted font-mono tabular-nums mt-0.5 flex-wrap">
                  <span>{formatCategory(routine.category)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {routine.durationMin} {t.training_min_short}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {routine.exercises.length} {t.training_exercises_short}
                  </span>
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
          ))}
        </div>
      )}

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
                  placeholder={t.editor_name_placeholder}
                  className="input-field w-full min-h-[44px] px-3.5 py-2 text-sm placeholder:text-fg-muted"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="rt-cat"
                    className="block font-display text-xs font-semibold uppercase tracking-wider text-fg mb-1.5"
                  >
                    {t.editor_type_label}
                  </label>
                  <select
                    id="rt-cat"
                    value={draftCategory}
                    onChange={(e) => setDraftCategory(e.target.value as RoutineCategory)}
                    className="input-field w-full min-h-[44px] px-3 py-2 text-sm"
                  >
                    {ROUTINE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {formatCategory(category)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="rt-dur"
                    className="block font-display text-xs font-semibold uppercase tracking-wider text-fg mb-1.5"
                  >
                    {t.editor_minutes_label}
                  </label>
                  <input
                    id="rt-dur"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={draftDurationInput}
                    onChange={(e) => {
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
                    className="input-field w-full min-h-[44px] px-3.5 py-2 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-2.5">
                <p className="font-display text-xs font-semibold uppercase tracking-wider text-fg">
                  {t.editor_exercises_label} ({draftExercises.length})
                </p>

                {draftExercises.length > 0 && (
                  <div className="divide-y divide-subtle border-y border-subtle">
                    {draftExercises.map((exercise) => (
                      <div
                        key={exercise.id}
                        className="py-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-fg truncate">{exercise.name}</p>
                          <p className="text-[11px] font-mono text-fg-muted tabular-nums">
                            <span>{exercise.setsReps}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="text-accent">
                              +{perDraftExerciseXp} {t.profile_xp_unit}
                            </span>
                          </p>
                        </div>

                        {categorySupportsMuscles(draftCategory) && (
                          <div className="w-36 sm:w-44 shrink-0">
                            <MuscleGroupSelect
                              compact
                              value={exercise.muscleGroups ?? []}
                              onChange={(nextMuscles) =>
                                handleUpdateDraftExerciseMuscles(exercise.id, nextMuscles)
                              }
                            />
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setDraftExercises((prev) =>
                              prev.filter((item) => item.id !== exercise.id)
                            )
                          }
                          aria-label={`${t.common_delete} ${exercise.name}`}
                          className="btn-quiet min-h-[34px] min-w-[34px] flex items-center justify-center shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-12 gap-2">
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
                      placeholder={t.editor_exercise_placeholder}
                      aria-label={t.editor_exercise_placeholder}
                      className="input-field col-span-6 min-h-[42px] px-3 py-2 text-xs placeholder:text-fg-muted"
                    />
                    <input
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
                      aria-label={t.editor_sets_placeholder}
                      className="input-field col-span-4 min-h-[42px] px-3 py-2 text-xs font-mono placeholder:text-fg-muted"
                    />
                    <button
                      type="button"
                      onClick={handleAddDraftExercise}
                      aria-label={t.profile_add_btn}
                      className="btn-secondary col-span-2 min-h-[42px] text-accent flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {categorySupportsMuscles(draftCategory) && (
                    <MuscleGroupSelect
                      value={newExerciseMuscles}
                      onChange={setNewExerciseMuscles}
                    />
                  )}
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
