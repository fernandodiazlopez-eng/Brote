/**
 * Vista principal de Perfil:
 * - Cabecera centrada con Nivel actual, botón de información y botón de ajustes.
 * - Escenario botánico del Árbol de Nivel + barra de progreso de XP.
 * - Agenda semanal en calendario real (con soporte de arrastrar/copiar rutinas y vista de próxima semana en fin de semana).
 * - Rueda interactiva de pasos diarios (DailyStepsDial).
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Info, Play, Plus, Repeat, Settings, Trash2, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import {
  AccentPaletteId,
  CompletedWorkout,
  DailyActivityRecord,
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
import { DailyStepsDial } from './DailyStepsDial';
import { PointsSystemInfoModal, ProfileSettingsModal } from './ProfileModals';
import { TreeStage } from './TreeStage';

interface ProfileViewProps {
  todayIso: string;
  level: number;
  maxLevel: number;
  totalXp: number;
  levelMinXp: number;
  nextLevelXp: number;
  treeGrowthLevel: number;
  treeWitherProgress: number;
  xpPulseToken: number;
  lastXpGain: number;
  stepGoal: number;
  onUpdateStepGoal: (newGoal: number) => void;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  accentPalette: AccentPaletteId;
  onChangeAccentPalette: (palette: AccentPaletteId) => void;
  seasonsEnabled: boolean;
  onChangeSeasonsEnabled: (enabled: boolean) => void;
  xpFormulas: XpFormulas;
  onUpdateXpFormulas: (nextFormulas: XpFormulas) => void;
  daysByIso: Record<string, DailyActivityRecord>;
  routines: Routine[];
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
}

interface RoutineTransferDragState {
  mode: 'move' | 'copy';
  routineId?: string;
  completedLog?: CompletedWorkout;
  title: string;
  sourceDateIso: string;
}

let lastConsumedBarPulseToken = 0;

export const ProfileView: React.FC<ProfileViewProps> = React.memo(({
  todayIso,
  level,
  maxLevel,
  totalXp,
  levelMinXp,
  nextLevelXp,
  treeGrowthLevel,
  treeWitherProgress,
  xpPulseToken,
  lastXpGain,
  stepGoal,
  onUpdateStepGoal,
  themeMode,
  onChangeThemeMode,
  accentPalette,
  onChangeAccentPalette,
  seasonsEnabled,
  onChangeSeasonsEnabled,
  xpFormulas,
  onUpdateXpFormulas,
  daysByIso,
  routines,
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
}) => {
  const { locale, t, formatCategory } = useI18n();

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

  // Barra de Nivel
  const xpBracketSpan = Math.max(1, nextLevelXp - levelMinXp);
  const xpEarnedInBracket = Math.max(0, totalXp - levelMinXp);
  const xpFillRatio = level >= maxLevel ? 1 : Math.min(1, xpEarnedInBracket / xpBracketSpan);
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
    <div className={`space-y-6 ${isDraggingPointer ? 'select-none touch-none' : ''}`}>
      {/* 1. ESCENARIO DEL ÁRBOL DE NIVEL + BARRA DE XP */}
      <section className="max-w-2xl mx-auto pb-5 border-b border-subtle">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsPointsInfoOpen(true)}
            aria-label={t.info_title}
            className="btn-quiet min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
          >
            <Info className="w-4 h-4" />
          </button>

          <div className="flex-1 min-w-0 text-center">
            <span className="font-display text-base font-bold text-fg tracking-tight">
              {t.profile_level_prefix} {level}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label={t.settings_title}
            className="btn-quiet min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        <TreeStage
          todayIso={todayIso}
          level={level}
          growthStage={treeGrowthLevel}
          witherProgress={treeWitherProgress}
          xpPulseToken={xpPulseToken}
          lastXpGain={lastXpGain}
          themeMode={themeMode}
          seasonsEnabled={seasonsEnabled}
        />

        <div className="pt-1 space-y-1">
          <div className="flex items-center gap-3 w-full min-w-0">
            <span className="font-mono text-xs font-bold text-fg tabular-nums min-w-[22px] text-left shrink-0">
              {level}
            </span>

            <div
              key={isXpBarPulsing ? `xp-track-${activeBarPulseKey}` : 'xp-track-idle'}
              className={`relative flex-1 min-w-0 h-1.5 rounded-full bg-elevated overflow-hidden ${
                isXpBarPulsing ? 'animate-xp-bar-pulse' : ''
              }`}
              role="progressbar"
              aria-valuenow={totalXp}
              aria-valuemin={levelMinXp}
              aria-valuemax={nextLevelXp}
              aria-label={t.profile_xp_unit}
            >
              <svg
                viewBox="0 0 400 6"
                preserveAspectRatio="none"
                className="block w-full h-full"
              >
                <defs>
                  <clipPath id={xpBarClipId}>
                    <rect x={0} y={0} width={xpBarSvgWidth} height={6} />
                  </clipPath>
                  <linearGradient id={xpBarShimmerGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                    <stop offset="50%" stopColor="#ffffff" stopOpacity="0.88" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>
                </defs>

                <rect
                  x={0}
                  y={0}
                  width={xpBarSvgWidth}
                  height={6}
                  fill="currentColor"
                  className="text-accent transition-all duration-500"
                />

                {isXpBarPulsing && xpBarSvgWidth > 0 && (
                  <g clipPath={`url(#${xpBarClipId})`}>
                    <rect
                      x={0}
                      y={0}
                      width={110}
                      height={6}
                      fill={`url(#${xpBarShimmerGradId})`}
                      className="animate-xp-bar-sweep"
                    />
                  </g>
                )}
              </svg>
            </div>

            <span className="font-mono text-xs text-fg-muted tabular-nums min-w-[22px] text-right shrink-0">
              {nextLevel}
            </span>
          </div>

          <p className="text-center leading-none">
            <span
              key={isXpBarPulsing ? `xp-txt-${activeBarPulseKey}` : 'xp-txt-idle'}
              className={`inline-block font-mono text-[10px] tabular-nums transition-colors duration-300 ${
                isXpBarPulsing
                  ? 'text-accent font-bold animate-xp-counter-pop'
                  : 'text-fg-muted'
              }`}
            >
              {totalXp.toLocaleString(locale)} / {nextLevelXp.toLocaleString(locale)}{' '}
              {t.profile_xp_unit}
            </span>
          </p>
        </div>
      </section>

      {/* 2. AGENDA SEMANAL + RUEDA DE PASOS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 sheet-panel p-4 sm:p-5 space-y-4">
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
                className={`seg-btn min-h-[36px] px-3 py-1 text-xs whitespace-nowrap ${
                  !viewingNextWeek ? 'seg-btn-active' : ''
                }`}
              >
                {t.profile_this_week}
              </button>
              <button
                type="button"
                data-week-switch="next"
                onClick={() => switchDisplayedWeek(true)}
                className={`seg-btn min-h-[36px] px-3 py-1 text-xs whitespace-nowrap ${
                  viewingNextWeek ? 'seg-btn-active' : ''
                }`}
              >
                {t.profile_next_week}
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 min-h-[40px]">
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="text-lg font-bold text-fg truncate">{selectedDayInfo.dayName}</h2>
              <span className="font-mono text-xs text-fg-muted tabular-nums shrink-0">
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
                  className={`min-h-[56px] py-1.5 px-1 rounded-lg border flex flex-col items-center justify-center transition cursor-pointer ${
                    isHoveredDropTarget
                      ? 'bg-accent text-accent-fg border-accent font-bold'
                      : routineTransfer && isPast
                      ? 'border-transparent text-fg-muted opacity-35 cursor-not-allowed'
                      : isValidDropTarget
                      ? 'bg-elevated/60 text-fg border-accent/60'
                      : isSelected
                      ? 'bg-accent text-accent-fg border-transparent font-bold'
                      : isToday
                      ? 'bg-canvas text-fg border-subtle'
                      : 'border-transparent text-fg-secondary hover:bg-elevated/60 hover:text-fg'
                  }`}
                >
                  <span className="text-[11px] font-medium">{day.shortLabel}</span>
                  <span className="text-xs font-mono font-semibold tabular-nums mt-0.5">
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
                    {hasCompleted ? '✓' : !isPast && hasPlanned ? '•' : '–'}
                  </span>
                </button>
              );
            })}
          </div>

          {routineTransfer && (
            <div className="py-2 px-3 rounded-lg bg-accent-soft border border-accent/40 flex items-center justify-between gap-2 text-xs">
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
                              {t.training_min_short} · {log.timeLabel}
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
                  <p className="text-xs font-medium text-fg-muted">{t.profile_completed_today}</p>
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
                                {t.training_min_short} · {log.timeLabel}
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
                    <p className="text-xs font-medium text-fg-muted">
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
                                {t.training_min_short} · +{routine.xpReward} {t.profile_xp_unit}
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
                              {t.training_min_short} · +{routine.xpReward} {t.profile_xp_unit}
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
        />
      </div>

      {/* Modales de Información y Ajustes */}
      <PointsSystemInfoModal
        isOpen={isPointsInfoOpen}
        onClose={() => setIsPointsInfoOpen(false)}
      />

      <ProfileSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        themeMode={themeMode}
        onChangeThemeMode={onChangeThemeMode}
        accentPalette={accentPalette}
        onChangeAccentPalette={onChangeAccentPalette}
        seasonsEnabled={seasonsEnabled}
        onChangeSeasonsEnabled={onChangeSeasonsEnabled}
        xpFormulas={xpFormulas}
        onUpdateXpFormulas={onUpdateXpFormulas}
        onExportBackup={onExportBackup}
        onImportBackupJson={onImportBackupJson}
      />

      {/* Modal para asignar o quitar rutinas del día seleccionado */}
      {canModifySchedule && isScheduleModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-modal-heading"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsScheduleModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto modal-sheet rounded-t-2xl sm:rounded-xl p-5 sm:p-6 safe-bottom-modal">
            <div className="w-9 h-1 bg-elevated rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between gap-4 pb-2 border-b border-subtle">
              <h3 id="schedule-modal-heading" className="text-base font-bold text-fg">
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
                          {t.training_min_short} · +{routine.xpReward} {t.profile_xp_unit}
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
