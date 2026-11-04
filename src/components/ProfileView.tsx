/**
 * Vista principal de Perfil:
 * - Cabecera minimalista con accesos directos a información del sistema y ajustes.
 * - Módulo central de Nivel, mapa de recuperación muscular y matriz LED segmentada de XP.
 * - Agenda semanal en calendario real (con soporte de arrastrar/copiar rutinas y vista de próxima semana en fin de semana).
 * - Cronógrafo interactivo de pasos diarios (DailyStepsDial).
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Info, Play, Plus, Repeat, Settings, Trash2, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { UiTextKey } from '../i18n/translations';
import {
  AccentPaletteId,
  BugDialogueCategory,
  BugHatId,
  BugMusicMode,
  BugWearableHatId,
  CompletedWorkout,
  CustomBugPhrase,
  DailyActivityRecord,
  MuscleGroupId,
  RgbColor,
  Routine,
  ThemeMode,
  WeekDayInfo,
  XpFormulas,
} from '../types';
import {
  addDaysToIso,
  buildWeekDaysInfo,
  getDailyRecord,
  getMondayDateIso,
  getWeekdayIndexMondayFirst,
} from '../utils/calendarDates';
import { getHexRelativeLuminance } from '../utils/localStorageState';
import { DailyStepsDial } from './DailyStepsDial';
import { BugGlobalMood } from './BugCompanion';
import { MuscleRecoveryMap } from './MuscleRecoveryMap';
import { PointsSystemInfoModal, ProfileSettingsModal } from './ProfileModals';

interface ProfileViewProps {
  todayIso: string;
  level: number;
  maxLevel: number;
  totalXp: number;
  levelMinXp: number;
  nextLevelXp: number;
  xpPulseToken: number;
  lastXpGain: number;
  stepGoal: number;
  onUpdateStepGoal: (newGoal: number) => void;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  accentPalette: AccentPaletteId;
  onChangeAccentPalette: (palette: AccentPaletteId) => void;
  customAccentHex?: string;
  onApplyCustomAccentHex: (hex: string) => void;
  xpFormulas: XpFormulas;
  onUpdateXpFormulas: (nextFormulas: XpFormulas) => void;
  daysByIso: Record<string, DailyActivityRecord>;
  routines: Routine[];
  trashedRoutines: Routine[];
  activeSessionMuscles?: MuscleGroupId[];
  selectedDateIso: string;
  onSelectDate: (dateIso: string) => void;
  dismissedRepeatWeeks: string[];
  onRepeatPreviousWeek: (targetWeekMondayIso: string) => void;
  onDismissRepeatWeek: (targetWeekMondayIso: string) => void;
  onAssignRoutineToDate: (dateIso: string, routineId: string) => void;
  onRemoveScheduledRoutine: (dateIso: string, routineId: string) => void;
  onMoveScheduledRoutine: (fromDateIso: string, toDateIso: string, routineId: string) => void;
  onCopyCompletedWorkoutToDate: (workoutLog: CompletedWorkout, toDateIso: string) => void;
  onDeleteCompletedWorkoutToday: (logId: string) => void;
  onUpdateDaySteps: (dateIso: string, nextSteps: number) => void;
  onStartRoutineFromProfile: (routineId: string) => void;
  onExportBackup: () => void;
  onImportBackupJson: (rawText: string) => boolean;
  isBugUnlocked?: boolean;
  isBugCustomizationUnlocked?: boolean;
  hideBug?: boolean;
  onChangeHideBug?: (hide: boolean) => void;
  muteBugText?: boolean;
  onChangeMuteBugText?: (mute: boolean) => void;
  muteBugBounceSound?: boolean;
  onChangeMuteBugBounceSound?: (mute: boolean) => void;
  bugMusicMode?: BugMusicMode;
  onChangeBugMusicMode?: (mode: BugMusicMode) => void;
  bugSelectedHat?: BugHatId;
  onChangeBugSelectedHat?: (hat: BugHatId) => void;
  bugHatColors?: Partial<Record<BugWearableHatId, RgbColor>>;
  onChangeBugHatColor?: (hat: BugWearableHatId, color: RgbColor) => void;
  bugUnlockedHats?: BugWearableHatId[];
  isBugGrown?: boolean;
  isBugSuperSaiyanUnlocked?: boolean;
  bugDisableSuperSaiyan?: boolean;
  onChangeBugDisableSuperSaiyan?: (disable: boolean) => void;
  onUnlockSecretScouter?: () => void;
  deletedBugPhraseKeys?: string[];
  customBugPhrases?: CustomBugPhrase[];
  onAddCustomBugPhrase?: (category: BugDialogueCategory, text: string) => void;
  onUpdateCustomBugPhrase?: (id: string, text: string) => void;
  onDeleteCustomBugPhrase?: (id: string) => void;
  onDeleteDefaultBugPhrase?: (key: UiTextKey) => void;
  onRestoreDeletedBugPhrases?: () => void;
  showBug?: boolean;
  bugMood?: BugGlobalMood;
  canPetBug?: boolean;
  canLaunchBugHockey?: boolean;
  onOpenTutorial?: () => void;
  isMotionSensorReceiving?: boolean;
  timerNotificationsEnabled?: boolean;
  onChangeTimerNotifications?: (enabled: boolean) => void;
  motionStepsEnabled?: boolean;
  onChangeMotionSteps?: (enabled: boolean) => void;
}

interface RoutineTransferDragState {
  mode: 'move' | 'copy';
  routineId?: string;
  completedLog?: CompletedWorkout;
  title: string;
  sourceDateIso: string;
}

const LED_SEGMENT_COUNT = 40;
const LED_SEGMENT_INDICES = Array.from({ length: LED_SEGMENT_COUNT }, (_, i) => i);

let lastConsumedBarPulseToken = 0;

export const ProfileView: React.FC<ProfileViewProps> = React.memo(({
  todayIso,
  level,
  maxLevel,
  totalXp,
  levelMinXp,
  nextLevelXp,
  xpPulseToken,
  lastXpGain,
  stepGoal,
  onUpdateStepGoal,
  themeMode,
  onChangeThemeMode,
  accentPalette,
  onChangeAccentPalette,
  customAccentHex,
  onApplyCustomAccentHex,
  xpFormulas,
  onUpdateXpFormulas,
  daysByIso,
  routines,
  trashedRoutines,
  activeSessionMuscles,
  selectedDateIso,
  onSelectDate,
  dismissedRepeatWeeks,
  onRepeatPreviousWeek,
  onDismissRepeatWeek,
  onAssignRoutineToDate,
  onRemoveScheduledRoutine,
  onMoveScheduledRoutine,
  onCopyCompletedWorkoutToDate,
  onDeleteCompletedWorkoutToday,
  onUpdateDaySteps,
  onStartRoutineFromProfile,
  onExportBackup,
  onImportBackupJson,
  isBugUnlocked = false,
  isBugCustomizationUnlocked = false,
  hideBug = false,
  onChangeHideBug,
  muteBugText = false,
  onChangeMuteBugText,
  muteBugBounceSound = false,
  onChangeMuteBugBounceSound,
  bugMusicMode = 'auto',
  onChangeBugMusicMode,
  bugSelectedHat = 'none',
  onChangeBugSelectedHat,
  bugHatColors,
  onChangeBugHatColor,
  bugUnlockedHats,
  isBugGrown = false,
  isBugSuperSaiyanUnlocked = false,
  bugDisableSuperSaiyan = false,
  onChangeBugDisableSuperSaiyan,
  onUnlockSecretScouter,
  deletedBugPhraseKeys,
  customBugPhrases,
  onAddCustomBugPhrase,
  onUpdateCustomBugPhrase,
  onDeleteCustomBugPhrase,
  onDeleteDefaultBugPhrase,
  onRestoreDeletedBugPhrases,
  showBug = false,
  bugMood = 'none',
  canPetBug = false,
  canLaunchBugHockey = false,
  onOpenTutorial,
  isMotionSensorReceiving = false,
  timerNotificationsEnabled = false,
  onChangeTimerNotifications,
  motionStepsEnabled = false,
  onChangeMotionSteps,
}) => {
  const { language, locale, t, formatCategory } = useI18n();
  const formatKmValue = (km: number) => {
    const rounded = String(Math.round(km * 100) / 100);
    return language === 'es' ? rounded.replace('.', ',') : rounded;
  };

  const rawBarUid = useId().replace(/:/g, '');
  const xpBarClipId = `xp-clip-${rawBarUid}`;
  const xpBarShimmerGradId = `xp-shimmer-${rawBarUid}`;

  const [activeBarPulseKey, setActiveBarPulseKey] = useState<number>(0);

  useEffect(() => {
    if (xpPulseToken <= 0 || xpPulseToken <= lastConsumedBarPulseToken) return;
    lastConsumedBarPulseToken = xpPulseToken;
    setActiveBarPulseKey(xpPulseToken);
    const timer = window.setTimeout(() => {
      setActiveBarPulseKey((prev) => (prev === xpPulseToken ? 0 : prev));
    }, 1280);
    return () => window.clearTimeout(timer);
  }, [xpPulseToken]);

  const isXpBarPulsing = activeBarPulseKey > 0;

  // Ventanas modales
  const [isPointsInfoOpen, setIsPointsInfoOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedCompletedLogId, setSelectedCompletedLogId] = useState<string | null>(null);

  // En sábado (5) y domingo (6) se habilita planificar también la próxima semana
  const todayWeekdayIdx = useMemo(() => getWeekdayIndexMondayFirst(todayIso), [todayIso]);
  const isWeekend = todayWeekdayIdx === 5 || todayWeekdayIdx === 6;

  const currentWeekMondayIso = useMemo(() => getMondayDateIso(todayIso), [todayIso]);
  const nextWeekMondayIso = useMemo(
    () => addDaysToIso(currentWeekMondayIso, 7),
    [currentWeekMondayIso]
  );

  const [viewingNextWeek, setViewingNextWeek] = useState<boolean>(
    () => isWeekend && getMondayDateIso(selectedDateIso) === nextWeekMondayIso
  );

  useEffect(() => {
    if (!isWeekend && viewingNextWeek) {
      setViewingNextWeek(false);
    }
  }, [isWeekend, viewingNextWeek]);

  const displayedWeekMondayIso =
    isWeekend && viewingNextWeek ? nextWeekMondayIso : currentWeekMondayIso;
  const displayedWeekDays: WeekDayInfo[] = useMemo(
    () => buildWeekDaysInfo(displayedWeekMondayIso, t),
    [displayedWeekMondayIso, t]
  );

  const selectedDayInfo =
    displayedWeekDays.find((d) => d.dateIso === selectedDateIso) ||
    displayedWeekDays.find((d) => d.dateIso === todayIso) ||
    displayedWeekDays[0];

  const activeDateIso = selectedDayInfo.dateIso;
  const selectedDayRecord = getDailyRecord(daysByIso, activeDateIso);

  const isSelectedToday = activeDateIso === todayIso;
  const isSelectedPast = activeDateIso < todayIso;
  const isSelectedFuture = activeDateIso > todayIso;
  const canModifySchedule = !isSelectedPast;

  // Detectar si la semana previa tuvo rutinas para sugerir "Repetir misma rutina"
  const previousWeekHadRoutines = useMemo(() => {
    const prevWeekMondayIso = addDaysToIso(displayedWeekMondayIso, -7);
    const activeRoutineIdSet = new Set(routines.map((r) => r.id));

    return Array.from({ length: 7 }, (_, idx) => {
      const prevDateIso = addDaysToIso(prevWeekMondayIso, idx);
      const record = daysByIso[prevDateIso];
      if (!record) return false;
      const fromCompleted = record.completedWorkouts.some(
        (w) => w.routineId && activeRoutineIdSet.has(w.routineId)
      );
      const fromPlanned = record.plannedRoutineIds.some((id) => activeRoutineIdSet.has(id));
      return fromCompleted || fromPlanned;
    }).some(Boolean);
  }, [daysByIso, displayedWeekMondayIso, routines]);

  const showRepeatWeekBanner =
    previousWeekHadRoutines && !dismissedRepeatWeeks.includes(displayedWeekMondayIso);

  // Gestos de mantener pulsado (long-press) para mover rutinas o copiar entrenamientos hechos
  const [routineTransfer, setRoutineTransfer] = useState<RoutineTransferDragState | null>(null);
  const [isDraggingPointer, setIsDraggingPointer] = useState(false);
  const [dragHoverDateIso, setDragHoverDateIso] = useState<string | null>(null);

  const longPressTimerRef = useRef<number | null>(null);
  const didTriggerLongPressRef = useRef(false);
  const weekSwitchHoverTimerRef = useRef<number | null>(null);
  const hoveredWeekTargetRef = useRef<'current' | 'next' | null>(null);
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const dragHoverDateRef = useRef<string | null>(null);
  const routineTransferRef = useRef<RoutineTransferDragState | null>(null);

  useEffect(() => {
    routineTransferRef.current = routineTransfer;
  }, [routineTransfer]);

  useEffect(() => {
    dragHoverDateRef.current = dragHoverDateIso;
  }, [dragHoverDateIso]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressOriginRef.current = null;
  };

  const clearWeekSwitchTimer = () => {
    if (weekSwitchHoverTimerRef.current !== null) {
      window.clearTimeout(weekSwitchHoverTimerRef.current);
      weekSwitchHoverTimerRef.current = null;
    }
    hoveredWeekTargetRef.current = null;
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
      clearWeekSwitchTimer();
    };
  }, []);

  useEffect(() => {
    if (!isScheduleModalOpen && !routineTransfer) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isScheduleModalOpen) {
          setIsScheduleModalOpen(false);
        } else if (routineTransfer) {
          setRoutineTransfer(null);
          setDragHoverDateIso(null);
          setIsDraggingPointer(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isScheduleModalOpen, routineTransfer]);

  const executeTransferToDate = (transfer: RoutineTransferDragState, targetIso: string) => {
    if (targetIso < todayIso || targetIso === transfer.sourceDateIso) return;
    if (transfer.mode === 'move' && transfer.routineId) {
      onMoveScheduledRoutine(transfer.sourceDateIso, targetIso, transfer.routineId);
    } else if (transfer.mode === 'copy' && transfer.completedLog) {
      onCopyCompletedWorkoutToDate(transfer.completedLog, targetIso);
    }
    onSelectDate(targetIso);
    setRoutineTransfer(null);
    setDragHoverDateIso(null);
  };

  useEffect(() => {
    if (!isDraggingPointer) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (e.cancelable) e.preventDefault();

      const targetEl = document.elementFromPoint(e.clientX, e.clientY);
      if (!targetEl) {
        setDragHoverDateIso(null);
        clearWeekSwitchTimer();
        return;
      }

      const weekSwitchEl = targetEl.closest('[data-week-switch]') as HTMLElement | null;
      if (weekSwitchEl && isWeekend) {
        const targetWeek = weekSwitchEl.getAttribute('data-week-switch') as
          | 'current'
          | 'next'
          | null;
        if (targetWeek && hoveredWeekTargetRef.current !== targetWeek) {
          clearWeekSwitchTimer();
          hoveredWeekTargetRef.current = targetWeek;
          weekSwitchHoverTimerRef.current = window.setTimeout(() => {
            setViewingNextWeek(targetWeek === 'next');
          }, 380);
        }
      } else {
        clearWeekSwitchTimer();
      }

      const dayEl = targetEl.closest('[data-day-iso]') as HTMLElement | null;
      if (dayEl) {
        const candidateIso = dayEl.getAttribute('data-day-iso');
        if (candidateIso && candidateIso >= todayIso) {
          setDragHoverDateIso((prev) => (prev === candidateIso ? prev : candidateIso));
          return;
        }
      }
      setDragHoverDateIso((prev) => (prev === null ? prev : null));
    };

    const finishPointerDrag = () => {
      clearWeekSwitchTimer();
      setIsDraggingPointer(false);

      const currentTransfer = routineTransferRef.current;
      const targetIso = dragHoverDateRef.current;

      if (
        currentTransfer &&
        targetIso &&
        targetIso >= todayIso &&
        targetIso !== currentTransfer.sourceDateIso
      ) {
        if (currentTransfer.mode === 'move' && currentTransfer.routineId) {
          onMoveScheduledRoutine(
            currentTransfer.sourceDateIso,
            targetIso,
            currentTransfer.routineId
          );
        } else if (currentTransfer.mode === 'copy' && currentTransfer.completedLog) {
          onCopyCompletedWorkoutToDate(currentTransfer.completedLog, targetIso);
        }
        onSelectDate(targetIso);
        setRoutineTransfer(null);
        setDragHoverDateIso(null);
      } else {
        setDragHoverDateIso(null);
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove, { passive: false });
    window.addEventListener('pointerup', finishPointerDrag);
    window.addEventListener('pointercancel', finishPointerDrag);

    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', finishPointerDrag);
      window.removeEventListener('pointercancel', finishPointerDrag);
    };
  }, [
    isDraggingPointer,
    isWeekend,
    onCopyCompletedWorkoutToDate,
    onMoveScheduledRoutine,
    onSelectDate,
    todayIso,
  ]);

  const startLongPressTransfer = (
    e: React.PointerEvent<HTMLElement>,
    transferPayload: RoutineTransferDragState,
    ignoreChildButtons: boolean
  ) => {
    if (ignoreChildButtons && (e.target as HTMLElement).closest('button')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    clearLongPressTimer();
    didTriggerLongPressRef.current = false;
    pressOriginRef.current = { x: e.clientX, y: e.clientY };

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      didTriggerLongPressRef.current = true;
      setSelectedCompletedLogId(null);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(25);
        } catch {
          // Ignorar errores de vibración
        }
      }
      setRoutineTransfer(transferPayload);
      setIsDraggingPointer(true);
    }, 360);
  };

  const handleRowPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!pressOriginRef.current || longPressTimerRef.current === null) return;
    const distance = Math.hypot(
      e.clientX - pressOriginRef.current.x,
      e.clientY - pressOriginRef.current.y
    );
    if (distance > 10) {
      clearLongPressTimer();
    }
  };

  // Cálculo de la Matriz LED de Nivel (40 segmentos estilo Nothing Glyph × Cyberpunk)
  const xpBracketSpan = Math.max(1, nextLevelXp - levelMinXp);
  const xpEarnedInBracket = Math.max(0, totalXp - levelMinXp);
  const xpFillRatio = level >= maxLevel ? 1 : Math.min(1, xpEarnedInBracket / xpBracketSpan);
  const exactLitSegments = xpFillRatio * LED_SEGMENT_COUNT;
  const fullLitSegments = Math.floor(exactLitSegments);
  const partialSegmentOpacity = exactLitSegments - fullLitSegments;
  const xpBarSvgWidth =
    level >= maxLevel
      ? 400
      : xpEarnedInBracket === 0
      ? 0
      : Math.max(10, Math.round(xpFillRatio * 400));
  const nextLevel = Math.min(maxLevel, level + 1);

  const scheduledRoutines = useMemo(
    () =>
      selectedDayRecord.plannedRoutineIds
        .map((id) => routines.find((r) => r.id === id))
        .filter((r): r is Routine => Boolean(r)),
    [routines, selectedDayRecord.plannedRoutineIds]
  );

  const switchDisplayedWeek = (nextWeek: boolean) => {
    setViewingNextWeek(nextWeek);
    setSelectedCompletedLogId(null);
    if (!routineTransfer) {
      onSelectDate(nextWeek ? nextWeekMondayIso : todayIso);
    }
  };

  return (
    <div className={`space-y-5 ${isDraggingPointer ? 'select-none touch-none' : ''}`}>
      {/* 1. ACCESOS RÁPIDOS SUPERIORES SIN RECUADRO (INFO IZQUIERDA · AJUSTES DERECHA) */}
      <header className="flex items-center justify-between -mb-2">
        <button
          type="button"
          onClick={() => setIsPointsInfoOpen(true)}
          aria-label={t.info_title}
          className="min-h-[40px] min-w-[40px] -ml-2 flex items-center justify-center text-fg-secondary active:scale-95 transition cursor-pointer focus-visible:outline-none focus-visible:text-accent"
        >
          <Info className="w-[18px] h-[18px]" />
        </button>

        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          aria-label={t.settings_title}
          className="min-h-[40px] min-w-[40px] -mr-2 flex items-center justify-center text-fg-secondary active:scale-95 transition cursor-pointer focus-visible:outline-none focus-visible:text-accent"
        >
          <Settings className="w-[18px] h-[18px]" />
        </button>
      </header>

      {/* 2. MÓDULO DE NIVEL + ESQUEMA + BARRA DE NIVELES + XP CENTRADO */}
      <section
        data-tutorial="profile-level"
        className="sheet-panel ndot-surface px-4 py-3.5 sm:px-5 sm:py-4 flex flex-col gap-2.5"
      >
        <h1 className="font-display text-xl sm:text-2xl font-bold leading-none tracking-wide text-fg text-center tabular-nums">
          {t.profile_level_prefix} {level}
        </h1>

        <MuscleRecoveryMap
          todayIso={todayIso}
          daysByIso={daysByIso}
          routines={routines}
          trashedRoutines={trashedRoutines}
          activeSessionMuscles={activeSessionMuscles}
          showBug={showBug}
          bugMood={bugMood}
          canPetBug={canPetBug}
          canLaunchBugHockey={canLaunchBugHockey}
        />

        <div className="space-y-1.5">
          <div className="flex items-center gap-3 w-full min-w-0">
            <span className="font-mono text-xs font-bold text-fg tabular-nums min-w-[24px] text-left shrink-0">
              {level}
            </span>

            <div
              key={isXpBarPulsing ? `xp-track-${activeBarPulseKey}` : 'xp-track-idle'}
              className={`relative flex-1 min-w-0 h-4 ${
                isXpBarPulsing ? 'animate-xp-bar-pulse' : ''
              }`}
              role="progressbar"
              aria-valuenow={totalXp}
              aria-valuemin={levelMinXp}
              aria-valuemax={nextLevelXp}
              aria-label={t.profile_xp_unit}
            >
              <svg
                viewBox="0 0 400 16"
                preserveAspectRatio="none"
                className="block w-full h-full"
              >
                <defs>
                  <clipPath id={xpBarClipId}>
                    <rect x={0} y={0} width={xpBarSvgWidth} height={16} />
                  </clipPath>
                  <linearGradient id={xpBarShimmerGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                    {(() => {
                      const useDarkShimmer =
                        (themeMode === 'dark' && accentPalette === 'monocromo') ||
                        (accentPalette === 'custom' &&
                          getHexRelativeLuminance(customAccentHex) > 0.72);
                      const shimmerColor = useDarkShimmer ? '#08080a' : '#ffffff';
                      const midOpacity = useDarkShimmer ? '0.45' : '0.85';
                      return (
                        <>
                          <stop offset="0%" stopColor={shimmerColor} stopOpacity="0" />
                          <stop offset="50%" stopColor={shimmerColor} stopOpacity={midOpacity} />
                          <stop offset="100%" stopColor={shimmerColor} stopOpacity="0" />
                        </>
                      );
                    })()}
                  </linearGradient>
                </defs>

                {LED_SEGMENT_INDICES.map((segIdx) => {
                  const segX = segIdx * 10 + 1;
                  const isFull = segIdx < fullLitSegments;
                  const isPartial =
                    !isFull && segIdx === fullLitSegments && partialSegmentOpacity > 0.04;

                  return (
                    <g key={segIdx}>
                      <rect
                        x={segX}
                        y={1}
                        width={8}
                        height={14}
                        rx={1}
                        fill="var(--app-elevated)"
                      />
                      {(isFull || isPartial) && (
                        <rect
                          x={segX}
                          y={1}
                          width={8}
                          height={14}
                          rx={1}
                          fill="var(--app-accent-fill)"
                          fillOpacity={isFull ? 1 : Math.max(0.35, partialSegmentOpacity)}
                        />
                      )}
                    </g>
                  );
                })}

                {isXpBarPulsing && xpBarSvgWidth > 0 && (
                  <g clipPath={`url(#${xpBarClipId})`}>
                    <rect
                      x={0}
                      y={0}
                      width={110}
                      height={16}
                      fill={`url(#${xpBarShimmerGradId})`}
                      className="animate-xp-bar-sweep"
                    />
                  </g>
                )}
              </svg>
            </div>

            <span className="font-mono text-xs text-fg-muted tabular-nums min-w-[24px] text-right shrink-0">
              {nextLevel}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 text-center">
            <p
              key={isXpBarPulsing ? `xp-txt-${activeBarPulseKey}` : 'xp-txt-idle'}
              className={`font-mono text-[11px] tabular-nums transition-colors duration-300 ${
                isXpBarPulsing
                  ? 'text-accent font-bold animate-xp-counter-pop'
                  : 'text-fg-secondary'
              }`}
            >
              {totalXp.toLocaleString(locale)}{' '}
              <span className="text-fg-muted">
                / {nextLevelXp.toLocaleString(locale)} {t.profile_xp_unit}
              </span>
            </p>
            {isXpBarPulsing && lastXpGain > 0 && (
              <span
                key={`xp-gain-${activeBarPulseKey}`}
                className="font-mono text-[11px] font-bold text-accent tabular-nums animate-xp-counter-pop"
              >
                +{lastXpGain.toLocaleString(locale)} {t.profile_xp_unit}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* 4. AGENDA SEMANAL + CRONÓGRAFO DE PASOS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <section
          data-tutorial="profile-week"
          className="lg:col-span-7 sheet-panel p-4 sm:p-5 space-y-4"
        >
          {isWeekend && (
            <div
              role="group"
              aria-label={t.profile_this_week}
              className="seg-group grid grid-cols-2 gap-1"
            >
              <button
                type="button"
                data-week-switch="current"
                onClick={() => switchDisplayedWeek(false)}
                className={`seg-btn min-h-[36px] px-3 py-1 text-xs uppercase whitespace-nowrap ${
                  !viewingNextWeek ? 'seg-btn-active' : ''
                }`}
              >
                {t.profile_this_week}
              </button>
              <button
                type="button"
                data-week-switch="next"
                onClick={() => switchDisplayedWeek(true)}
                className={`seg-btn min-h-[36px] px-3 py-1 text-xs uppercase whitespace-nowrap ${
                  viewingNextWeek ? 'seg-btn-active' : ''
                }`}
              >
                {t.profile_next_week}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 min-h-[40px]">
            <div className="flex items-baseline gap-2.5 min-w-0">
              <h2 className="text-lg font-bold uppercase tracking-wide text-fg truncate">
                {selectedDayInfo.dayName}
              </h2>
              <span className="font-mono text-xs text-fg-muted uppercase tabular-nums shrink-0">
                {selectedDayInfo.dayOfMonth} {selectedDayInfo.monthShort}
              </span>
            </div>

            {canModifySchedule && (
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(true)}
                className="btn-primary min-h-[38px] px-3.5 py-1.5 text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>{t.profile_add_btn}</span>
              </button>
            )}
          </div>

          {showRepeatWeekBanner && (
            <div className="py-2.5 border-y border-subtle flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onRepeatPreviousWeek(displayedWeekMondayIso)}
                className="btn-secondary min-h-[36px] px-3 py-1.5 text-xs flex items-center gap-1.5 whitespace-nowrap"
              >
                <Repeat className="w-3.5 h-3.5 text-accent shrink-0" />
                <span>{t.profile_repeat_week_btn}</span>
              </button>

              <button
                type="button"
                onClick={() => onDismissRepeatWeek(displayedWeekMondayIso)}
                aria-label={t.common_close}
                className="btn-quiet min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div
            role="tablist"
            aria-label={t.profile_this_week}
            className="grid grid-cols-7 gap-1 sm:gap-1.5 pb-1"
          >
            {displayedWeekDays.map((day) => {
              const dayRec = getDailyRecord(daysByIso, day.dateIso);
              const isSelected = day.dateIso === activeDateIso;
              const isToday = day.dateIso === todayIso;
              const isPast = day.dateIso < todayIso;
              const hasCompleted = dayRec.completedWorkouts.length > 0;
              const hasPlanned = dayRec.plannedRoutineIds.length > 0;

              const isValidDropTarget =
                routineTransfer !== null &&
                !isPast &&
                day.dateIso !== routineTransfer.sourceDateIso;
              const isHoveredDropTarget =
                isValidDropTarget && dragHoverDateIso === day.dateIso;

              return (
                <button
                  key={day.dateIso}
                  type="button"
                  role="tab"
                  data-day-iso={day.dateIso}
                  aria-selected={isSelected}
                  onClick={() => {
                    if (routineTransfer) {
                      executeTransferToDate(routineTransfer, day.dateIso);
                      return;
                    }
                    setSelectedCompletedLogId(null);
                    onSelectDate(day.dateIso);
                  }}
                  className={`min-h-[58px] py-1.5 px-1 rounded-[4px] border flex flex-col items-center justify-center transition cursor-pointer ${
                    isHoveredDropTarget
                      ? 'bg-accent-fill text-accent-fg border-accent-fill font-bold'
                      : routineTransfer && isPast
                      ? 'border-transparent text-fg-muted opacity-35 cursor-not-allowed'
                      : isValidDropTarget
                      ? 'bg-elevated/70 text-fg border-accent-fill'
                      : isSelected
                      ? 'bg-accent-fill text-accent-fg border-transparent font-bold'
                      : isToday
                      ? 'bg-canvas text-fg border-strong'
                      : 'bg-canvas/50 border-subtle text-fg-secondary hover:bg-elevated'
                  }`}
                >
                  <span className="font-display text-[11px] uppercase tracking-wider font-semibold">
                    {day.shortLabel}
                  </span>
                  <span className="text-xs font-mono font-bold tabular-nums mt-0.5">
                    {isToday ? t.profile_today_badge : day.dayOfMonth}
                  </span>
                  <span
                    className={`text-[10px] font-mono leading-none mt-1 ${
                      isSelected || isHoveredDropTarget
                        ? 'text-accent-fg'
                        : hasCompleted
                        ? 'text-accent'
                        : 'text-fg-muted'
                    }`}
                  >
                    {hasCompleted ? '✓' : !isPast && hasPlanned ? '▪' : '–'}
                  </span>
                </button>
              );
            })}
          </div>

          {routineTransfer && (
            <div className="py-2 px-3 rounded-[4px] bg-accent-soft border border-accent-fill flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-fg truncate">
                {routineTransfer.mode === 'copy'
                  ? `${t.profile_copy_prefix} «${routineTransfer.title}» ${t.profile_copy_suffix}`
                  : `${t.profile_move_prefix} «${routineTransfer.title}» ${t.profile_move_suffix}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setRoutineTransfer(null);
                  setDragHoverDateIso(null);
                  setIsDraggingPointer(false);
                }}
                className="btn-secondary min-h-[30px] px-2.5 text-xs shrink-0 whitespace-nowrap"
              >
                {t.common_cancel}
              </button>
            </div>
          )}

          <div className="pt-3 border-t border-subtle space-y-4">
            {/* Días pasados */}
            {isSelectedPast && (
              <div>
                {selectedDayRecord.completedWorkouts.length === 0 ? (
                  <p className="py-2 text-xs text-fg-muted">{t.profile_no_workouts_past}</p>
                ) : (
                  <div className="divide-y divide-subtle">
                    {selectedDayRecord.completedWorkouts.map((log) => {
                      const isBeingCopied =
                        routineTransfer?.mode === 'copy' &&
                        routineTransfer?.completedLog?.id === log.id;

                      return (
                        <div
                          key={log.id}
                          onPointerDown={(e) =>
                            startLongPressTransfer(
                              e,
                              {
                                mode: 'copy',
                                completedLog: log,
                                title: log.title,
                                sourceDateIso: activeDateIso,
                              },
                              false
                            )
                          }
                          onPointerMove={handleRowPointerMove}
                          onPointerUp={clearLongPressTimer}
                          onPointerCancel={clearLongPressTimer}
                          onContextMenu={(e) => e.preventDefault()}
                          className={`py-2.5 flex items-center justify-between gap-3 select-none cursor-grab active:cursor-grabbing transition ${
                            isBeingCopied ? 'opacity-60' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-fg truncate">{log.title}</p>
                            <p className="text-xs text-fg-muted font-mono tabular-nums mt-0.5">
                              {formatCategory(log.category)} · {log.durationMin}{' '}
                              {t.training_min_short}
                              {log.distanceKm !== undefined
                                ? ` · ${formatKmValue(log.distanceKm)} ${t.steps_km_unit}`
                                : ''}{' '}
                              · {log.timeLabel}
                            </p>
                          </div>
                          <span className="text-xs font-mono font-bold text-accent tabular-nums shrink-0">
                            +{log.xpEarned} {t.profile_xp_unit}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Hoy */}
            {isSelectedToday && (
              <>
                <div className="space-y-1">
                  <p className="font-display text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                    {t.profile_completed_today}
                  </p>
                  {selectedDayRecord.completedWorkouts.length === 0 ? (
                    <p className="py-1.5 text-xs text-fg-muted">{t.profile_none_yet}</p>
                  ) : (
                    <div className="divide-y divide-subtle">
                      {selectedDayRecord.completedWorkouts.map((log) => {
                        const isExpanded = selectedCompletedLogId === log.id;
                        const isBeingCopied =
                          routineTransfer?.mode === 'copy' &&
                          routineTransfer?.completedLog?.id === log.id;

                        const toggleCompletedRowTap = () => {
                          if (didTriggerLongPressRef.current) {
                            didTriggerLongPressRef.current = false;
                            return;
                          }
                          setSelectedCompletedLogId((prev) =>
                            prev === log.id ? null : log.id
                          );
                        };

                        return (
                          <div
                            key={log.id}
                            onPointerDown={(e) => {
                              if (
                                (e.target as HTMLElement).closest('[data-delete-completed-btn]')
                              ) {
                                return;
                              }
                              startLongPressTransfer(
                                e,
                                {
                                  mode: 'copy',
                                  completedLog: log,
                                  title: log.title,
                                  sourceDateIso: activeDateIso,
                                },
                                false
                              );
                            }}
                            onPointerMove={handleRowPointerMove}
                            onPointerUp={clearLongPressTimer}
                            onPointerCancel={clearLongPressTimer}
                            onContextMenu={(e) => e.preventDefault()}
                            className={`py-2.5 flex items-center justify-between gap-3 select-none transition ${
                              isBeingCopied ? 'opacity-60' : ''
                            }`}
                          >
                            <button
                              type="button"
                              onClick={toggleCompletedRowTap}
                              className="min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <p className="text-sm font-semibold text-fg truncate">
                                {log.title}
                              </p>
                              <p className="text-xs text-fg-muted font-mono tabular-nums mt-0.5">
                                {formatCategory(log.category)} · {log.durationMin}{' '}
                                {t.training_min_short}
                                {log.distanceKm !== undefined
                                  ? ` · ${formatKmValue(log.distanceKm)} ${t.steps_km_unit}`
                                  : ''}{' '}
                                · {log.timeLabel}
                              </p>
                            </button>

                            {isExpanded ? (
                              <button
                                type="button"
                                data-delete-completed-btn="true"
                                onClick={() => {
                                  onDeleteCompletedWorkoutToday(log.id);
                                  setSelectedCompletedLogId(null);
                                }}
                                aria-label={`${t.common_delete} ${log.title}`}
                                className="btn-secondary min-h-[36px] px-3 text-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                <span>{t.common_delete}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={toggleCompletedRowTap}
                                className="text-xs font-mono font-bold text-accent tabular-nums shrink-0 cursor-pointer"
                              >
                                +{log.xpEarned} {t.profile_xp_unit}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {scheduledRoutines.length > 0 && (
                  <div className="pt-2 border-t border-subtle space-y-1">
                    <p className="font-display text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                      {t.profile_scheduled_heading}
                    </p>
                    <div className="divide-y divide-subtle">
                      {scheduledRoutines.map((routine) => {
                        const isBeingMoved =
                          routineTransfer?.mode === 'move' &&
                          routineTransfer?.routineId === routine.id &&
                          routineTransfer?.sourceDateIso === activeDateIso;

                        return (
                          <div
                            key={routine.id}
                            onPointerDown={(e) =>
                              startLongPressTransfer(
                                e,
                                {
                                  mode: 'move',
                                  routineId: routine.id,
                                  title: routine.title,
                                  sourceDateIso: activeDateIso,
                                },
                                true
                              )
                            }
                            onPointerMove={handleRowPointerMove}
                            onPointerUp={clearLongPressTimer}
                            onPointerCancel={clearLongPressTimer}
                            onContextMenu={(e) => e.preventDefault()}
                            className={`py-2.5 flex items-center justify-between gap-3 select-none transition ${
                              isBeingMoved ? 'opacity-60' : ''
                            }`}
                          >
                            <div className="min-w-0 flex-1 cursor-grab active:cursor-grabbing">
                              <p className="text-sm font-semibold text-fg truncate">
                                {routine.title}
                              </p>
                              <p className="text-xs text-fg-muted font-mono tabular-nums mt-0.5">
                                {formatCategory(routine.category)} · {routine.durationMin}{' '}
                                {t.training_min_short}
                                {routine.distanceKm !== undefined
                                  ? ` · ${formatKmValue(routine.distanceKm)} ${t.steps_km_unit}`
                                  : ''}{' '}
                                · +{routine.xpReward} {t.profile_xp_unit}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => onStartRoutineFromProfile(routine.id)}
                                className="btn-primary min-h-[38px] px-3 text-xs flex items-center gap-1 whitespace-nowrap"
                              >
                                <Play className="w-3 h-3 fill-current shrink-0" />
                                <span>{t.common_start}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onRemoveScheduledRoutine(activeDateIso, routine.id)
                                }
                                aria-label={`${t.common_delete} ${routine.title}`}
                                className="btn-quiet min-h-[38px] min-w-[38px] flex items-center justify-center"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Días futuros */}
            {isSelectedFuture && (
              <div>
                {scheduledRoutines.length === 0 ? (
                  <p className="py-2 text-xs text-fg-muted">{t.profile_no_scheduled}</p>
                ) : (
                  <div className="divide-y divide-subtle">
                    {scheduledRoutines.map((routine) => {
                      const isBeingMoved =
                        routineTransfer?.mode === 'move' &&
                        routineTransfer?.routineId === routine.id &&
                        routineTransfer?.sourceDateIso === activeDateIso;

                      return (
                        <div
                          key={routine.id}
                          onPointerDown={(e) =>
                            startLongPressTransfer(
                              e,
                              {
                                mode: 'move',
                                routineId: routine.id,
                                title: routine.title,
                                sourceDateIso: activeDateIso,
                              },
                              true
                            )
                          }
                          onPointerMove={handleRowPointerMove}
                          onPointerUp={clearLongPressTimer}
                          onPointerCancel={clearLongPressTimer}
                          onContextMenu={(e) => e.preventDefault()}
                          className={`py-2.5 flex items-center justify-between gap-3 select-none transition ${
                            isBeingMoved ? 'opacity-60' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1 cursor-grab active:cursor-grabbing">
                            <p className="text-sm font-semibold text-fg truncate">
                              {routine.title}
                            </p>
                            <p className="text-xs text-fg-muted font-mono tabular-nums mt-0.5">
                              {formatCategory(routine.category)} · {routine.durationMin}{' '}
                              {t.training_min_short}
                              {routine.distanceKm !== undefined
                                ? ` · ${formatKmValue(routine.distanceKm)} ${t.steps_km_unit}`
                                : ''}{' '}
                              · +{routine.xpReward} {t.profile_xp_unit}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              onRemoveScheduledRoutine(activeDateIso, routine.id)
                            }
                            aria-label={`${t.common_delete} ${routine.title}`}
                            className="btn-quiet min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <DailyStepsDial
          activeDateIso={activeDateIso}
          isSelectedToday={isSelectedToday}
          isSelectedPast={isSelectedPast}
          savedSteps={selectedDayRecord.steps}
          stepGoal={stepGoal}
          xpFormulas={xpFormulas}
          onUpdateDaySteps={onUpdateDaySteps}
          onUpdateStepGoal={onUpdateStepGoal}
          isMotionSensorReceiving={isMotionSensorReceiving}
        />
      </div>

      {/* Modales de Información y Ajustes */}
      <PointsSystemInfoModal
        isOpen={isPointsInfoOpen}
        onClose={() => setIsPointsInfoOpen(false)}
        onOpenTutorial={onOpenTutorial}
      />

      <ProfileSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themeMode={themeMode}
        onChangeThemeMode={onChangeThemeMode}
        accentPalette={accentPalette}
        onChangeAccentPalette={onChangeAccentPalette}
        customAccentHex={customAccentHex}
        onApplyCustomAccentHex={onApplyCustomAccentHex}
        xpFormulas={xpFormulas}
        onUpdateXpFormulas={onUpdateXpFormulas}
        onExportBackup={onExportBackup}
        onImportBackupJson={onImportBackupJson}
        isBugUnlocked={isBugUnlocked}
        isBugCustomizationUnlocked={isBugCustomizationUnlocked}
        hideBug={hideBug}
        onChangeHideBug={onChangeHideBug}
        muteBugText={muteBugText}
        onChangeMuteBugText={onChangeMuteBugText}
        muteBugBounceSound={muteBugBounceSound}
        onChangeMuteBugBounceSound={onChangeMuteBugBounceSound}
        bugMusicMode={bugMusicMode}
        onChangeBugMusicMode={onChangeBugMusicMode}
        bugSelectedHat={bugSelectedHat}
        onChangeBugSelectedHat={onChangeBugSelectedHat}
        bugHatColors={bugHatColors}
        onChangeBugHatColor={onChangeBugHatColor}
        bugUnlockedHats={bugUnlockedHats}
        isBugGrown={isBugGrown}
        isBugSuperSaiyanUnlocked={isBugSuperSaiyanUnlocked}
        bugDisableSuperSaiyan={bugDisableSuperSaiyan}
        onChangeBugDisableSuperSaiyan={onChangeBugDisableSuperSaiyan}
        onUnlockSecretScouter={onUnlockSecretScouter}
        deletedBugPhraseKeys={deletedBugPhraseKeys}
        customBugPhrases={customBugPhrases}
        onAddCustomBugPhrase={onAddCustomBugPhrase}
        onUpdateCustomBugPhrase={onUpdateCustomBugPhrase}
        onDeleteCustomBugPhrase={onDeleteCustomBugPhrase}
        onDeleteDefaultBugPhrase={onDeleteDefaultBugPhrase}
        onRestoreDeletedBugPhrases={onRestoreDeletedBugPhrases}
        onOpenTutorial={onOpenTutorial}
        timerNotificationsEnabled={timerNotificationsEnabled}
        onChangeTimerNotifications={onChangeTimerNotifications}
        motionStepsEnabled={motionStepsEnabled}
        onChangeMotionSteps={onChangeMotionSteps}
      />

      {/* Modal para asignar o quitar rutinas del día seleccionado */}
      {canModifySchedule && isScheduleModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-modal-heading"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsScheduleModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto modal-sheet sheet-panel rounded-t-xl sm:rounded-md p-5 sm:p-6 safe-bottom-modal">
            <div className="w-9 h-1 bg-elevated rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between gap-4 pb-2 border-b border-subtle">
              <h3
                id="schedule-modal-heading"
                className="text-base font-bold uppercase tracking-wide text-fg"
              >
                {selectedDayInfo.dayName} {selectedDayInfo.dayOfMonth} {selectedDayInfo.monthShort}
              </h3>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                aria-label={t.common_close}
                className="btn-quiet min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {routines.length === 0 ? (
              <p className="py-6 text-center text-xs text-fg-muted">
                {t.profile_no_routines_created}
              </p>
            ) : (
              <div className="mt-2 divide-y divide-subtle">
                {routines.map((routine) => {
                  const isAssigned = selectedDayRecord.plannedRoutineIds.includes(routine.id);
                  return (
                    <div
                      key={routine.id}
                      className="py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-fg truncate">{routine.title}</p>
                        <p className="text-xs text-fg-muted font-mono tabular-nums mt-0.5">
                          {formatCategory(routine.category)} · {routine.durationMin}{' '}
                          {t.training_min_short}
                          {routine.distanceKm !== undefined
                            ? ` · ${formatKmValue(routine.distanceKm)} ${t.steps_km_unit}`
                            : ''}{' '}
                          · +{routine.xpReward} {t.profile_xp_unit}
                        </p>
                      </div>

                      {isAssigned ? (
                        <button
                          type="button"
                          onClick={() => onRemoveScheduledRoutine(activeDateIso, routine.id)}
                          className="btn-secondary min-h-[38px] px-3 text-xs whitespace-nowrap shrink-0"
                        >
                          {t.common_delete}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAssignRoutineToDate(activeDateIso, routine.id)}
                          className="btn-primary min-h-[38px] px-3.5 text-xs whitespace-nowrap shrink-0"
                        >
                          {t.profile_add_btn}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
