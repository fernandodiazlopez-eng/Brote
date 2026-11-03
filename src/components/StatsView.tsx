/**
 * Vista de Estadísticas y Vitrina de Trofeos (Nothing OS × Cyberpunk):
 * - Resumen de sesiones semanales, XP semanal, media de pasos diarios y % de constancia.
 * - Módulo gráfico interactivo con flechas < > en la esquina superior para alternar entre 4 gráficas:
 *   1) Pasos semanales (con meta diaria y distancia en km)
 *   2) Grupos musculares trabajados (últimos 28 días, 10 zonas)
 *   3) Experiencia diaria ganada (Lunes a Domingo: rutinas + pasos)
 *   4) Progresión de XP y Nivel (curva de los últimos 28 días)
 * - Matriz LED de constancia de 28 días y desglose por modalidad (Fuerza / Híbrida / Cardio).
 * - Vitrina de trofeos desbloqueados ordenada por calidad (Diamante -> Bronce).
 */

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Trophy as TrophyIcon } from 'lucide-react';
import {
  getLocalizedTrophy,
  getTrophyTierLabel,
  TROPHY_CATALOG,
  TROPHY_TIER_STYLES,
} from '../data/trophiesCatalog';
import { useI18n } from '../i18n/I18nContext';
import {
  DailyActivityRecord,
  MuscleGroupId,
  Routine,
  RoutineCategory,
  XpFormulas,
} from '../types';
import {
  addDaysToIso,
  buildWeekDaysInfo,
  countDaysBetweenIso,
  getDailyRecord,
  getMondayDateIso,
  getWeekdayIndexMondayFirst,
  parseLocalDateIso,
} from '../utils/calendarDates';
import {
  ALL_MUSCLE_GROUPS,
  categorySupportsMuscles,
  getLocalizedMuscleLabel,
} from '../utils/muscleRecovery';
import {
  calculateDailyTotalXp,
  calculateLevelFromXp,
  KM_PER_STEP,
} from '../utils/progressionRules';
import { BugGlobalMood, BugPerch } from './BugCompanion';
import { TrophyCardSheen, TrophyEmblem, TrophyTierRankLeds } from './TrophyEmblem';

interface StatsViewProps {
  todayIso: string;
  firstOpenDateIso: string;
  daysByIso: Record<string, DailyActivityRecord>;
  routines: Routine[];
  trashedRoutines: Routine[];
  xpFormulas: XpFormulas;
  totalXp: number;
  stepGoal: number;
  unlockedTrophies: Record<string, string>;
  showBug?: boolean;
  bugMood?: BugGlobalMood;
  canPetBug?: boolean;
  canLaunchBugHockey?: boolean;
}

type StatsChartMode = 'steps' | 'muscles' | 'xp' | 'trend';

const CHART_MODES: readonly StatsChartMode[] = ['steps', 'muscles', 'xp', 'trend'];
const CATEGORIES: RoutineCategory[] = ['Fuerza', 'Híbrida', 'Cardio'];

export const StatsView: React.FC<StatsViewProps> = React.memo(({
  todayIso,
  firstOpenDateIso,
  daysByIso,
  routines,
  trashedRoutines,
  xpFormulas,
  totalXp,
  stepGoal,
  unlockedTrophies,
  showBug = false,
  bugMood = 'none',
  canPetBug = false,
  canLaunchBugHockey = false,
}) => {
  const { language, locale, t, formatCategory } = useI18n();
  const rawUid = useId().replace(/:/g, '');
  const trendAreaGradId = `stats-trend-grad-${rawUid}`;

  const todayWeekdayIdx = useMemo(() => getWeekdayIndexMondayFirst(todayIso), [todayIso]);
  const [chartIndex, setChartIndex] = useState<number>(0);
  const [selectedWeekdayIdx, setSelectedWeekdayIdx] = useState<number>(todayWeekdayIdx);
  const [selectedMuscleIdx, setSelectedMuscleIdx] = useState<number>(0);
  const [selectedTrendIdx, setSelectedTrendIdx] = useState<number>(27);
  const [selectedGridDateIso, setSelectedGridDateIso] = useState<string | null>(null);
  const swipeOriginRef = useRef<{ x: number; y: number } | null>(null);

  const activeChartMode = CHART_MODES[chartIndex] ?? 'steps';

  useEffect(() => {
    setSelectedWeekdayIdx(todayWeekdayIdx);
    setSelectedTrendIdx(27);
    setSelectedGridDateIso(null);
  }, [todayWeekdayIdx, todayIso]);

  const monthShortNames = useMemo(
    () => [
      t.month_jan,
      t.month_feb,
      t.month_mar,
      t.month_apr,
      t.month_may,
      t.month_jun,
      t.month_jul,
      t.month_aug,
      t.month_sep,
      t.month_oct,
      t.month_nov,
      t.month_dec,
    ],
    [
      t.month_jan,
      t.month_feb,
      t.month_mar,
      t.month_apr,
      t.month_may,
      t.month_jun,
      t.month_jul,
      t.month_aug,
      t.month_sep,
      t.month_oct,
      t.month_nov,
      t.month_dec,
    ]
  );

  const {
    weeklyDaysData,
    totalWorkoutsWeek,
    totalXpWeek,
    avgDailySteps,
    consistencyPercentage,
    modalityStats,
    twentyEightDayGrid,
    muscleFrequencyData,
    topMuscleIndex,
    totalMuscleHits28d,
    trend28DaysData,
  } = useMemo(() => {
    const routineById = new Map<string, Routine>();
    for (const r of trashedRoutines) {
      routineById.set(r.id, r);
    }
    for (const r of routines) {
      routineById.set(r.id, r);
    }

    const currentWeekMondayIso = getMondayDateIso(todayIso);
    const weekDaysInfo = buildWeekDaysInfo(currentWeekMondayIso, t);

    const computedWeekDays = weekDaysInfo.map((dayInfo) => {
      const record = getDailyRecord(daysByIso, dayInfo.dateIso);
      const dailyXp = calculateDailyTotalXp(record, xpFormulas);
      return {
        dateIso: dayInfo.dateIso,
        shortLabel: dayInfo.shortLabel,
        fullLabel: `${dayInfo.dayName} ${dayInfo.dayOfMonth} ${dayInfo.monthShort}`,
        steps: record.steps,
        xpEarned: dailyXp,
        workoutsCount: record.completedWorkouts.length,
      };
    });

    const sumWorkoutsWeek = computedWeekDays.reduce((sum, d) => sum + d.workoutsCount, 0);
    const sumXpWeek = computedWeekDays.slice(0, todayWeekdayIdx + 1).reduce(
      (sum, d) => sum + d.xpEarned,
      0
    );

    const elapsedDaysThisWeek = computedWeekDays.slice(0, todayWeekdayIdx + 1);
    const computedAvgSteps = Math.round(
      elapsedDaysThisWeek.reduce((sum, d) => sum + d.steps, 0) /
        Math.max(1, elapsedDaysThisWeek.length)
    );

    const safeStartIso = firstOpenDateIso <= todayIso ? firstOpenDateIso : todayIso;
    const totalDaysSinceStart = Math.max(1, countDaysBetweenIso(safeStartIso, todayIso) + 1);

    let activeWorkoutDays = 0;
    const categorySessionCounts: Record<RoutineCategory, number> = {
      Fuerza: 0,
      Híbrida: 0,
      Cardio: 0,
    };

    for (const [iso, record] of Object.entries(daysByIso)) {
      if (iso < safeStartIso || iso > todayIso) continue;
      if (record.completedWorkouts.length > 0) {
        activeWorkoutDays += 1;
        for (const workout of record.completedWorkouts) {
          if (workout.category === 'Fuerza') {
            categorySessionCounts.Fuerza += 1;
          } else if (workout.category === 'Híbrida') {
            categorySessionCounts.Híbrida += 1;
          } else {
            categorySessionCounts.Cardio += 1;
          }
        }
      }
    }

    const computedConsistency = Math.round((activeWorkoutDays / totalDaysSinceStart) * 100);
    const totalAllTimeSessions =
      categorySessionCounts.Fuerza +
      categorySessionCounts.Híbrida +
      categorySessionCounts.Cardio;

    const computedModalities = CATEGORIES.map((category) => ({
      modality: category,
      sessions: categorySessionCounts[category],
      percentage:
        totalAllTimeSessions > 0
          ? Math.round((categorySessionCounts[category] / totalAllTimeSessions) * 100)
          : 0,
    }));

    // 1) Frecuencia muscular de los últimos 28 días (usando grupos musculares de ejercicios/rutinas)
    const muscleCounts: Record<MuscleGroupId, number> = {
      pecho: 0,
      hombro: 0,
      biceps: 0,
      triceps: 0,
      antebrazo: 0,
      abdomen: 0,
      espalda: 0,
      gluteo: 0,
      muslo: 0,
      gemelos: 0,
    };

    const window28StartIso = addDaysToIso(todayIso, -27);
    for (let offset = 0; offset < 28; offset += 1) {
      const slotIso = addDaysToIso(window28StartIso, offset);
      const dayRecord = daysByIso[slotIso];
      if (!dayRecord || dayRecord.completedWorkouts.length === 0) continue;

      for (const workout of dayRecord.completedWorkouts) {
        if (!categorySupportsMuscles(workout.category)) continue;
        const resolvedMuscles =
          workout.muscleGroups !== undefined
            ? workout.muscleGroups
            : workout.routineId
            ? routineById.get(workout.routineId)?.muscleGroups
            : undefined;
        if (!resolvedMuscles || resolvedMuscles.length === 0) continue;
        for (const m of resolvedMuscles) {
          muscleCounts[m] = (muscleCounts[m] ?? 0) + 1;
        }
      }
    }

    const sumMuscleHits = ALL_MUSCLE_GROUPS.reduce((sum, id) => sum + muscleCounts[id], 0);
    let bestMuscleIdx = 0;
    let bestMuscleCount = -1;

    const computedMuscleData = ALL_MUSCLE_GROUPS.map((id, idx) => {
      const count = muscleCounts[id];
      if (count > bestMuscleCount) {
        bestMuscleCount = count;
        bestMuscleIdx = idx;
      }
      const label = getLocalizedMuscleLabel(id, t);
      const cleanShort = label
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .slice(0, 3)
        .toUpperCase();

      return {
        id,
        label,
        shortCode: cleanShort,
        count,
        sharePct: sumMuscleHits > 0 ? Math.round((count / sumMuscleHits) * 100) : 0,
      };
    });

    // 2) Curva de evolución de XP y Nivel durante los últimos 28 días hasta hoy
    const dailyEarned28 = Array.from({ length: 28 }, (_, i) => {
      const slotIso = addDaysToIso(window28StartIso, i);
      return calculateDailyTotalXp(daysByIso[slotIso], xpFormulas);
    });

    const reconstructedTotalXp = new Array<number>(28).fill(0);
    reconstructedTotalXp[27] = totalXp;
    for (let i = 27; i >= 1; i -= 1) {
      const prevSlotIso = addDaysToIso(window28StartIso, i - 1);
      if (prevSlotIso < safeStartIso) {
        reconstructedTotalXp[i - 1] = 0;
      } else {
        reconstructedTotalXp[i - 1] = Math.max(
          0,
          reconstructedTotalXp[i] - dailyEarned28[i]
        );
      }
    }

    const computedTrend28 = Array.from({ length: 28 }, (_, i) => {
      const slotIso = addDaysToIso(window28StartIso, i);
      const parsed = parseLocalDateIso(slotIso);
      const cumXp = reconstructedTotalXp[i];
      return {
        dateIso: slotIso,
        dayOfMonth: parsed.getDate(),
        dateLabel: `${parsed.getDate()} ${monthShortNames[parsed.getMonth()] ?? ''}`,
        dailyXp: dailyEarned28[i],
        cumulativeXp: cumXp,
        level: calculateLevelFromXp(cumXp),
      };
    });

    // 3) Matriz calendario de 28 días (4 semanas)
    const firstWeekMondayIso = getMondayDateIso(safeStartIso);
    const elapsedWeeks = Math.floor(
      countDaysBetweenIso(firstWeekMondayIso, currentWeekMondayIso) / 7
    );
    const gridStartMondayIso =
      elapsedWeeks < 4 ? firstWeekMondayIso : addDaysToIso(currentWeekMondayIso, -21);

    const computedGrid = Array.from({ length: 28 }, (_, i) => {
      const slotIso = addDaysToIso(gridStartMondayIso, i);
      const parsedDate = parseLocalDateIso(slotIso);
      const record = daysByIso[slotIso];
      const workoutsCount = record ? record.completedWorkouts.length : 0;
      const steps = record ? record.steps : 0;
      const xpEarned = record ? calculateDailyTotalXp(record, xpFormulas) : 0;
      return {
        dateIso: slotIso,
        dayOfMonth: parsedDate.getDate(),
        dateLabel: `${parsedDate.getDate()} ${monthShortNames[parsedDate.getMonth()] ?? ''}`,
        isToday: slotIso === todayIso,
        isReached: slotIso >= safeStartIso && slotIso <= todayIso,
        hasWorkout: workoutsCount > 0,
        workoutsCount,
        steps,
        xpEarned,
      };
    });

    return {
      weeklyDaysData: computedWeekDays,
      totalWorkoutsWeek: sumWorkoutsWeek,
      totalXpWeek: sumXpWeek,
      avgDailySteps: computedAvgSteps,
      consistencyPercentage: computedConsistency,
      modalityStats: computedModalities,
      twentyEightDayGrid: computedGrid,
      muscleFrequencyData: computedMuscleData,
      topMuscleIndex: bestMuscleIdx,
      totalMuscleHits28d: sumMuscleHits,
      trend28DaysData: computedTrend28,
    };
  }, [
    daysByIso,
    firstOpenDateIso,
    monthShortNames,
    routines,
    t,
    todayIso,
    todayWeekdayIdx,
    totalXp,
    trashedRoutines,
    xpFormulas,
  ]);

  useEffect(() => {
    setSelectedMuscleIdx(topMuscleIndex);
  }, [topMuscleIndex]);

  const triggerSubtleFeedback = () => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(8);
      }
    } catch {
      // Ignorar en dispositivos sin soporte háptico
    }
  };

  const handlePrevChart = () => {
    triggerSubtleFeedback();
    setChartIndex((prev) => (prev - 1 + CHART_MODES.length) % CHART_MODES.length);
  };

  const handleNextChart = () => {
    triggerSubtleFeedback();
    setChartIndex((prev) => (prev + 1) % CHART_MODES.length);
  };

  const handleChartTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    swipeOriginRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleChartTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    const origin = swipeOriginRef.current;
    swipeOriginRef.current = null;
    const touch = e.changedTouches[0];
    if (!origin || !touch) return;

    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;
    if (Math.abs(dx) >= 44 && Math.abs(dx) > Math.abs(dy) * 1.35) {
      if (dx < 0) {
        handleNextChart();
      } else {
        handlePrevChart();
      }
    }
  };

  const focusedDay =
    weeklyDaysData[selectedWeekdayIdx] ||
    weeklyDaysData[todayWeekdayIdx] ||
    weeklyDaysData[0];

  const focusedMuscle =
    muscleFrequencyData[selectedMuscleIdx] || muscleFrequencyData[0];

  const focusedTrendDay =
    trend28DaysData[selectedTrendIdx] || trend28DaysData[trend28DaysData.length - 1];

  const maxStepsValue = Math.max(...weeklyDaysData.map((d) => d.steps), stepGoal, 1_000);
  const maxMuscleCount = Math.max(...muscleFrequencyData.map((m) => m.count), 4);
  const maxDailyXpValue = Math.max(...weeklyDaysData.map((d) => d.xpEarned), 100);

  const trendMinXp = Math.min(...trend28DaysData.map((d) => d.cumulativeXp));
  const trendMaxXp = Math.max(...trend28DaysData.map((d) => d.cumulativeXp));
  const trendSpanXp = Math.max(50, trendMaxXp - trendMinXp);

  const chartTitle =
    activeChartMode === 'steps'
      ? t.stats_chart_steps_title
      : activeChartMode === 'muscles'
      ? t.stats_chart_muscles_title
      : activeChartMode === 'xp'
      ? t.stats_chart_xp_title
      : t.stats_chart_trend_title;

  const focusedStepsKm = (focusedDay.steps * KM_PER_STEP).toLocaleString(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const activeHeadline =
    activeChartMode === 'steps' || activeChartMode === 'xp'
      ? focusedDay.fullLabel
      : activeChartMode === 'muscles'
      ? focusedMuscle.label
      : focusedTrendDay.dateLabel;

  const activeValueReadout =
    activeChartMode === 'steps'
      ? `${focusedDay.steps.toLocaleString(locale)} ${t.stats_steps_unit_lower} · ${focusedStepsKm} ${t.steps_km_unit}`
      : activeChartMode === 'muscles'
      ? totalMuscleHits28d > 0
        ? `${focusedMuscle.count} ${t.stats_sessions_short} · ${focusedMuscle.sharePct}%`
        : `0 ${t.stats_sessions_short}`
      : activeChartMode === 'xp'
      ? `+${focusedDay.xpEarned.toLocaleString(locale)} ${t.profile_xp_unit}`
      : `${t.profile_level_prefix} ${focusedTrendDay.level} · ${focusedTrendDay.cumulativeXp.toLocaleString(locale)} ${t.profile_xp_unit}`;

  const unlockedTrophyItems = useMemo(
    () =>
      TROPHY_CATALOG.map((trophy, catalogIdx) => ({
        trophy,
        catalogIdx,
        unlockedDateIso: unlockedTrophies[trophy.id] ?? '',
        qualityRank: TROPHY_TIER_STYLES[trophy.tier].qualityRank,
      }))
        .filter((item) => Boolean(item.unlockedDateIso))
        .sort((a, b) => {
          if (b.qualityRank !== a.qualityRank) return b.qualityRank - a.qualityRank;
          if (b.unlockedDateIso !== a.unlockedDateIso) {
            return b.unlockedDateIso.localeCompare(a.unlockedDateIso);
          }
          return b.catalogIdx - a.catalogIdx;
        }),
    [unlockedTrophies]
  );

  const diamondTrophyItem =
    unlockedTrophyItems[0]?.trophy.tier === 'diamante' ? unlockedTrophyItems[0] : null;
  const standardTrophyItems = diamondTrophyItem
    ? unlockedTrophyItems.slice(1)
    : unlockedTrophyItems;

  const gridDayHeaders = [
    t.day_mon_short,
    t.day_tue_short,
    t.day_wed_short,
    t.day_thu_short,
    t.day_fri_short,
    t.day_sat_short,
    t.day_sun_short,
  ];

  const stepGoalLineY = 128 - Math.min(112, (stepGoal / maxStepsValue) * 112);

  const trendPoints = useMemo(
    () =>
      trend28DaysData.map((d, idx) => {
        const x = 14 + (idx / 27) * 420;
        const normalizedY =
          trendMaxXp === 0 ? 0 : (d.cumulativeXp - trendMinXp) / trendSpanXp;
        const y = 126 - normalizedY * 96;
        return { x, y, data: d };
      }),
    [trend28DaysData, trendMaxXp, trendMinXp, trendSpanXp]
  );

  const trendPolylineStr = useMemo(
    () => trendPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    [trendPoints]
  );

  const trendAreaPathStr = useMemo(() => {
    if (trendPoints.length === 0) return '';
    const first = trendPoints[0];
    const last = trendPoints[trendPoints.length - 1];
    const lineSegments = trendPoints
      .map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
    return `M ${first.x.toFixed(1)} 128 ${lineSegments} L ${last.x.toFixed(1)} 128 Z`;
  }, [trendPoints]);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="pb-3 border-b border-subtle">
        <h1 className="text-2xl font-bold uppercase tracking-wide text-fg">{t.stats_title}</h1>
      </div>

      {/* Franja de indicadores principales (Bug apoyado en la esquina superior derecha sobre los bloques de datos) */}
      <div className={`relative ${showBug ? 'mt-7' : ''}`}>
        {showBug && (
          <div className="absolute right-3.5 sm:right-5 bottom-full z-10 flex items-end">
            <BugPerch
              gazeMode="down"
              globalMood={bugMood}
              canPet={canPetBug}
              canLaunchHockey={canLaunchBugHockey}
            />
          </div>
        )}
        <div className="sheet-panel grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-subtle">
        <div className="p-4">
          <p className="font-display text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            {t.stats_kpi_sessions}
          </p>
          <p className="font-mono text-2xl font-bold text-fg tabular-nums mt-1">
            {totalWorkoutsWeek}
          </p>
        </div>

        <div className="p-4 border-l border-subtle sm:border-l-0">
          <p className="font-display text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            {t.stats_kpi_xp_week}
          </p>
          <p className="font-mono text-2xl font-bold text-accent tabular-nums mt-1">
            +{totalXpWeek.toLocaleString(locale)}
          </p>
        </div>

        <div className="p-4">
          <p className="font-display text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            {t.stats_kpi_steps_day}
          </p>
          <p className="font-mono text-2xl font-bold text-fg tabular-nums mt-1">
            {avgDailySteps.toLocaleString(locale)}
          </p>
        </div>

        <div className="p-4 border-l border-subtle sm:border-l-0">
          <p className="font-display text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            {t.stats_kpi_consistency}
          </p>
          <p className="font-mono text-2xl font-bold text-fg tabular-nums mt-1">
            {consistencyPercentage}%
          </p>
        </div>
      </div>
      </div>

      {/* Módulo de gráficas interactivas con selector < > en la esquina superior derecha y gesto táctil horizontal */}
      <section
        onTouchStart={handleChartTouchStart}
        onTouchEnd={handleChartTouchEnd}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            handlePrevChart();
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            handleNextChart();
          }
        }}
        tabIndex={0}
        aria-label={chartTitle}
        className="sheet-panel ndot-surface p-5 sm:p-6 space-y-3.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-fill"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <p className="font-display text-[11px] font-bold uppercase tracking-wider text-fg-muted truncate">
                {chartTitle}
              </p>
              <span
                aria-hidden="true"
                className="inline-flex items-center gap-1 shrink-0"
              >
                {CHART_MODES.map((mode, idx) => (
                  <span
                    key={mode}
                    className={`w-1.5 h-1.5 rounded-[1px] transition-colors ${
                      idx === chartIndex ? 'bg-accent-fill' : 'bg-elevated'
                    }`}
                  />
                ))}
              </span>
            </div>

            <div className="flex items-baseline flex-wrap gap-x-3 gap-y-0.5">
              <h2 className="text-base font-bold uppercase tracking-wide text-fg">
                {activeHeadline}
              </h2>
              <span className="font-mono text-sm font-bold text-accent tabular-nums">
                {activeValueReadout}
              </span>
            </div>
          </div>

          {/* Flechas < > en la esquina superior derecha */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handlePrevChart}
              aria-label={t.stats_prev_chart}
              className="btn-secondary min-h-[32px] min-w-[32px] flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextChart}
              aria-label={t.stats_next_chart}
              className="btn-secondary min-h-[32px] min-w-[32px] flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* GRÁFICA 1: PASOS SEMANALES */}
        {activeChartMode === 'steps' && (
          <svg
            viewBox="0 0 448 164"
            className="w-full h-40 overflow-visible"
            role="img"
            aria-label={t.stats_chart_steps_title}
          >
            {[28, 78, 128].map((yLine, lineIdx) => (
              <line
                key={yLine}
                x1={0}
                x2={448}
                y1={yLine}
                y2={yLine}
                stroke="var(--app-border-strong)"
                strokeOpacity={lineIdx === 2 ? 0.75 : 0.35}
                strokeDasharray={lineIdx === 2 ? undefined : '2 4'}
              />
            ))}

            {/* Línea de referencia de la meta diaria de pasos */}
            <line
              x1={0}
              x2={448}
              y1={stepGoalLineY}
              y2={stepGoalLineY}
              stroke="var(--app-accent)"
              strokeOpacity={0.55}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text
              x={446}
              y={Math.max(12, stepGoalLineY - 4)}
              textAnchor="end"
              fill="var(--app-accent)"
              opacity={0.8}
              className="text-[9px] font-mono uppercase"
            >
              {t.stats_goal_short}
            </text>

            {weeklyDaysData.map((dayItem, idx) => {
              const isSelected = idx === selectedWeekdayIdx;
              const value = dayItem.steps;
              const maxBarHeight = 112;
              const barHeight =
                value === 0 ? 3 : Math.max(8, (value / maxStepsValue) * maxBarHeight);
              const xCenter = idx * 64 + 32;
              const barWidth = 22;
              const yTop = 128 - barHeight;
              const reachedGoal = value >= stepGoal && stepGoal > 0;

              return (
                <g
                  key={dayItem.dateIso}
                  role="button"
                  tabIndex={0}
                  aria-label={`${dayItem.fullLabel}: ${dayItem.steps.toLocaleString(locale)} ${t.stats_steps_unit_lower}`}
                  onClick={() => setSelectedWeekdayIdx(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedWeekdayIdx(idx);
                    }
                  }}
                  className="cursor-pointer focus:outline-none"
                >
                  <rect x={idx * 64 + 4} y={6} width={56} height={154} fill="transparent" />
                  <rect
                    x={xCenter - barWidth / 2}
                    y={yTop}
                    width={barWidth}
                    height={barHeight}
                    rx={1.5}
                    fill={
                      isSelected
                        ? 'var(--app-accent-fill)'
                        : value > 0
                        ? 'var(--app-border-strong)'
                        : 'var(--app-elevated)'
                    }
                    className="transition-opacity duration-150 hover:opacity-85"
                  />
                  {reachedGoal && !isSelected && (
                    <rect
                      x={xCenter - barWidth / 2}
                      y={yTop}
                      width={barWidth}
                      height={3}
                      rx={1}
                      fill="var(--app-accent-fill)"
                    />
                  )}
                  <text
                    x={xCenter}
                    y={150}
                    textAnchor="middle"
                    fill="currentColor"
                    className={`text-[11px] font-mono uppercase ${
                      isSelected ? 'text-fg font-bold' : 'text-fg-muted'
                    }`}
                  >
                    {dayItem.shortLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* GRÁFICA 2: GRUPOS MUSCULARES TRABAJADOS (ÚLTIMOS 28 DÍAS) */}
        {activeChartMode === 'muscles' && (
          <svg
            viewBox="0 0 448 164"
            className="w-full h-40 overflow-visible"
            role="img"
            aria-label={t.stats_chart_muscles_title}
          >
            {[28, 78, 128].map((yLine, lineIdx) => (
              <line
                key={yLine}
                x1={0}
                x2={448}
                y1={yLine}
                y2={yLine}
                stroke="var(--app-border-strong)"
                strokeOpacity={lineIdx === 2 ? 0.75 : 0.35}
                strokeDasharray={lineIdx === 2 ? undefined : '2 4'}
              />
            ))}

            {muscleFrequencyData.map((muscleItem, idx) => {
              const isSelected = idx === selectedMuscleIdx;
              const value = muscleItem.count;
              const maxBarHeight = 108;
              const barHeight =
                value === 0 ? 3 : Math.max(10, (value / maxMuscleCount) * maxBarHeight);
              const xCenter = idx * 44 + 26;
              const barWidth = 18;
              const yTop = 128 - barHeight;

              return (
                <g
                  key={muscleItem.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${muscleItem.label}: ${muscleItem.count} ${t.stats_sessions_short}`}
                  onClick={() => setSelectedMuscleIdx(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedMuscleIdx(idx);
                    }
                  }}
                  className="cursor-pointer focus:outline-none"
                >
                  <rect x={idx * 44 + 4} y={6} width={44} height={154} fill="transparent" />
                  <rect
                    x={xCenter - barWidth / 2}
                    y={yTop}
                    width={barWidth}
                    height={barHeight}
                    rx={1.5}
                    fill={
                      isSelected
                        ? 'var(--app-accent-fill)'
                        : value > 0
                        ? 'var(--app-border-strong)'
                        : 'var(--app-elevated)'
                    }
                    className="transition-opacity duration-150 hover:opacity-85"
                  />
                  {value > 0 && (
                    <text
                      x={xCenter}
                      y={yTop - 5}
                      textAnchor="middle"
                      fill="currentColor"
                      className={`text-[9px] font-mono tabular-nums ${
                        isSelected ? 'text-accent font-bold' : 'text-fg-muted'
                      }`}
                    >
                      {value}
                    </text>
                  )}
                  <text
                    x={xCenter}
                    y={150}
                    textAnchor="middle"
                    fill="currentColor"
                    className={`text-[9.5px] font-display uppercase tracking-tight ${
                      isSelected ? 'text-fg font-bold' : 'text-fg-muted'
                    }`}
                  >
                    {muscleItem.shortCode}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* GRÁFICA 3: EXPERIENCIA DIARIA GANADA (ESTA SEMANA) */}
        {activeChartMode === 'xp' && (
          <svg
            viewBox="0 0 448 164"
            className="w-full h-40 overflow-visible"
            role="img"
            aria-label={t.stats_chart_xp_title}
          >
            {[28, 78, 128].map((yLine, lineIdx) => (
              <line
                key={yLine}
                x1={0}
                x2={448}
                y1={yLine}
                y2={yLine}
                stroke="var(--app-border-strong)"
                strokeOpacity={lineIdx === 2 ? 0.75 : 0.35}
                strokeDasharray={lineIdx === 2 ? undefined : '2 4'}
              />
            ))}

            {weeklyDaysData.map((dayItem, idx) => {
              const isSelected = idx === selectedWeekdayIdx;
              const value = dayItem.xpEarned;
              const maxBarHeight = 108;
              const barHeight =
                value === 0 ? 3 : Math.max(8, (value / maxDailyXpValue) * maxBarHeight);
              const xCenter = idx * 64 + 32;
              const barWidth = 22;
              const yTop = 128 - barHeight;

              return (
                <g
                  key={dayItem.dateIso}
                  role="button"
                  tabIndex={0}
                  aria-label={`${dayItem.fullLabel}: +${value} ${t.profile_xp_unit}`}
                  onClick={() => setSelectedWeekdayIdx(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedWeekdayIdx(idx);
                    }
                  }}
                  className="cursor-pointer focus:outline-none"
                >
                  <rect x={idx * 64 + 4} y={6} width={56} height={154} fill="transparent" />
                  <rect
                    x={xCenter - barWidth / 2}
                    y={yTop}
                    width={barWidth}
                    height={barHeight}
                    rx={1.5}
                    fill={
                      isSelected
                        ? 'var(--app-accent-fill)'
                        : value > 0
                        ? 'var(--app-border-strong)'
                        : 'var(--app-elevated)'
                    }
                    className="transition-opacity duration-150 hover:opacity-85"
                  />
                  {value > 0 && isSelected && (
                    <text
                      x={xCenter}
                      y={Math.max(12, yTop - 5)}
                      textAnchor="middle"
                      fill="var(--app-accent)"
                      className="text-[9.5px] font-mono font-bold tabular-nums"
                    >
                      +{value}
                    </text>
                  )}
                  <text
                    x={xCenter}
                    y={150}
                    textAnchor="middle"
                    fill="currentColor"
                    className={`text-[11px] font-mono uppercase ${
                      isSelected ? 'text-fg font-bold' : 'text-fg-muted'
                    }`}
                  >
                    {dayItem.shortLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* GRÁFICA 4: CURVA DE PROGRESIÓN DE XP Y NIVEL (ÚLTIMOS 28 DÍAS) */}
        {activeChartMode === 'trend' && (
          <svg
            viewBox="0 0 448 164"
            className="w-full h-40 overflow-visible"
            role="img"
            aria-label={t.stats_chart_trend_title}
          >
            <defs>
              <linearGradient id={trendAreaGradId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--app-accent-fill)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--app-accent-fill)" stopOpacity={0} />
              </linearGradient>
            </defs>

            {[28, 78, 128].map((yLine, lineIdx) => (
              <line
                key={yLine}
                x1={0}
                x2={448}
                y1={yLine}
                y2={yLine}
                stroke="var(--app-border-strong)"
                strokeOpacity={lineIdx === 2 ? 0.75 : 0.35}
                strokeDasharray={lineIdx === 2 ? undefined : '2 4'}
              />
            ))}

            {trendAreaPathStr && (
              <path d={trendAreaPathStr} fill={`url(#${trendAreaGradId})`} />
            )}

            {trendPolylineStr && (
              <polyline
                points={trendPolylineStr}
                fill="none"
                stroke="var(--app-accent-fill)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {/* Etiquetas de fecha de referencia en el eje X (cada ~9 días + hoy) */}
            {[0, 9, 18, 27].map((tickIdx) => {
              const pt = trendPoints[tickIdx];
              if (!pt) return null;
              const isSelected = tickIdx === selectedTrendIdx;
              return (
                <text
                  key={pt.data.dateIso}
                  x={pt.x}
                  y={150}
                  textAnchor={tickIdx === 0 ? 'start' : tickIdx === 27 ? 'end' : 'middle'}
                  fill="currentColor"
                  className={`text-[10px] font-mono uppercase ${
                    isSelected ? 'text-fg font-bold' : 'text-fg-muted'
                  }`}
                >
                  {pt.data.dateLabel}
                </text>
              );
            })}

            {/* Retícula vertical y nodo cuadrado del día seleccionado */}
            {trendPoints[selectedTrendIdx] && (
              <g pointerEvents="none">
                <line
                  x1={trendPoints[selectedTrendIdx].x}
                  x2={trendPoints[selectedTrendIdx].x}
                  y1={20}
                  y2={128}
                  stroke="var(--app-accent)"
                  strokeOpacity={0.45}
                  strokeDasharray="2 3"
                />
                <rect
                  x={trendPoints[selectedTrendIdx].x - 3.5}
                  y={trendPoints[selectedTrendIdx].y - 3.5}
                  width={7}
                  height={7}
                  rx={1}
                  fill="var(--app-accent-fill)"
                  stroke="var(--app-surface)"
                  strokeWidth={1.5}
                />
              </g>
            )}

            {/* Zonas táctiles para los 28 puntos */}
            {trendPoints.map((pt, idx) => (
              <rect
                key={pt.data.dateIso}
                x={pt.x - 8}
                y={8}
                width={16}
                height={146}
                fill="transparent"
                role="button"
                tabIndex={0}
                aria-label={`${pt.data.dateLabel}: ${t.profile_level_prefix} ${pt.data.level}, ${pt.data.cumulativeXp} ${t.profile_xp_unit}`}
                onClick={() => setSelectedTrendIdx(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedTrendIdx(idx);
                  }
                }}
                className="cursor-pointer focus:outline-none"
              />
            ))}
          </svg>
        )}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Matriz LED interactiva de 28 días */}
        <section className="sheet-panel p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-2 min-h-[24px]">
            <h2 className="text-base font-bold uppercase tracking-wide text-fg shrink-0">
              {t.stats_28_days}
            </h2>
            {(() => {
              const selectedSlot = selectedGridDateIso
                ? twentyEightDayGrid.find((s) => s.dateIso === selectedGridDateIso)
                : null;
              if (!selectedSlot) return null;
              return (
                <span className="font-mono text-[11px] text-fg-secondary tabular-nums truncate">
                  <span className="text-fg font-semibold">{selectedSlot.dateLabel}</span>
                  {' · '}
                  {selectedSlot.workoutsCount > 0
                    ? `${selectedSlot.workoutsCount} ${t.stats_sessions_short}`
                    : `${selectedSlot.steps.toLocaleString(locale)} ${t.stats_steps_unit_lower}`}
                  {selectedSlot.xpEarned > 0 && (
                    <span className="text-accent font-bold">
                      {' · +'}
                      {selectedSlot.xpEarned.toLocaleString(locale)} {t.profile_xp_unit}
                    </span>
                  )}
                </span>
              );
            })()}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {gridDayHeaders.map((label, idx) => (
              <span
                key={idx}
                className="text-center text-[11px] font-display font-semibold uppercase tracking-wider text-fg-muted"
              >
                {label}
              </span>
            ))}
            {twentyEightDayGrid.map((slot) => {
              const isSelectedSlot = selectedGridDateIso === slot.dateIso;
              if (!slot.isReached && !slot.isToday) {
                return (
                  <div
                    key={slot.dateIso}
                    aria-hidden="true"
                    className="h-8 rounded-[3px] flex items-center justify-center font-mono text-[11px] tabular-nums bg-canvas border border-subtle text-fg-muted/45 select-none"
                  >
                    {slot.dayOfMonth}
                  </div>
                );
              }
              return (
                <button
                  key={slot.dateIso}
                  type="button"
                  aria-pressed={isSelectedSlot}
                  aria-label={`${slot.dateLabel}: ${slot.workoutsCount} ${t.stats_sessions_short}, +${slot.xpEarned} ${t.profile_xp_unit}`}
                  onClick={() => {
                    triggerSubtleFeedback();
                    setSelectedGridDateIso((prev) =>
                      prev === slot.dateIso ? null : slot.dateIso
                    );
                  }}
                  className={`h-8 rounded-[3px] flex items-center justify-center font-mono text-[11px] tabular-nums transition cursor-pointer ${
                    slot.hasWorkout
                      ? 'bg-accent-fill text-accent-fg font-bold'
                      : slot.isToday
                      ? 'bg-canvas border border-accent-fill text-fg font-semibold'
                      : 'bg-elevated text-fg-secondary hover:text-fg'
                  } ${isSelectedSlot ? 'ring-2 ring-fg ring-offset-1 ring-offset-surface' : ''}`}
                >
                  {slot.dayOfMonth}
                </button>
              );
            })}
          </div>
        </section>

        {/* Modalidades */}
        <section className="sheet-panel p-5 space-y-4">
          <h2 className="text-base font-bold uppercase tracking-wide text-fg">
            {t.stats_modalities}
          </h2>
          <div className="space-y-3.5">
            {modalityStats.map((item) => (
              <div key={item.modality} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-display font-semibold uppercase tracking-wider text-fg">
                    {formatCategory(item.modality)}
                  </span>
                  <span className="font-mono text-fg-muted tabular-nums">
                    {item.sessions} {t.stats_sessions_short} · {item.percentage}%
                  </span>
                </div>
                <svg
                  viewBox="0 0 200 6"
                  preserveAspectRatio="none"
                  className="w-full h-2 rounded-[2px] overflow-hidden block"
                  aria-hidden="true"
                >
                  <rect
                    x={0}
                    y={0}
                    width={200}
                    height={6}
                    fill="var(--app-elevated)"
                  />
                  <rect
                    x={0}
                    y={0}
                    width={item.percentage * 2}
                    height={6}
                    fill="var(--app-accent-fill)"
                  />
                </svg>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Vitrina de Trofeos Nothing OS × Cyberpunk */}
      <section className="sheet-panel overflow-hidden">
        <div className="p-5 sm:p-6 pb-4 space-y-3 border-b border-subtle">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <TrophyIcon className="w-4 h-4 text-accent shrink-0" />
              <h2 className="text-base font-bold uppercase tracking-wide text-fg truncate">
                {t.stats_trophy_showcase}
              </h2>
            </div>
            <span className="font-mono text-sm font-semibold text-fg-muted tabular-nums shrink-0">
              <span className="text-accent font-bold">{unlockedTrophyItems.length}</span> /{' '}
              {TROPHY_CATALOG.length}
            </span>
          </div>

          {/* Barra LED segmentada de los 31 logros del sistema */}
          <svg
            viewBox={`0 0 ${TROPHY_CATALOG.length * 10 - 2} 6`}
            preserveAspectRatio="none"
            className="w-full h-1.5 block"
            aria-hidden="true"
          >
            {TROPHY_CATALOG.map((catalogTrophy, idx) => {
              const isLit = idx < unlockedTrophyItems.length;
              return (
                <rect
                  key={catalogTrophy.id}
                  x={idx * 10}
                  y={0}
                  width={8}
                  height={6}
                  rx={0.8}
                  fill={isLit ? 'var(--app-accent-fill)' : 'var(--app-elevated)'}
                />
              );
            })}
          </svg>
        </div>

        {unlockedTrophyItems.length === 0 ? (
          <div className="ndot-surface p-5 sm:p-6 flex items-center gap-4">
            <TrophyEmblem tier="bronce" locked />
            <p className="text-xs text-fg-muted leading-relaxed">{t.stats_trophy_empty}</p>
          </div>
        ) : (
          <div key={`trophy-sync-${unlockedTrophyItems.length}`}>
            {diamondTrophyItem && (() => {
              const tierStyle = TROPHY_TIER_STYLES.diamante;
              const localizedTrophy = getLocalizedTrophy(diamondTrophyItem.trophy, language);
              const tierLabel = getTrophyTierLabel('diamante', language);

              return (
                <div
                  className={`relative ndot-surface p-4 sm:p-5 flex items-start gap-4 overflow-hidden ${
                    standardTrophyItems.length > 0 ? 'border-b border-subtle' : ''
                  }`}
                >
                  {tierStyle.topAccentLineClass && (
                    <div
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-x-0 top-0 h-[1.5px] ${tierStyle.topAccentLineClass}`}
                    />
                  )}
                  <TrophyCardSheen tier="diamante" />

                  <TrophyEmblem tier="diamante" size="lg" />

                  <div className="relative z-10 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <div className="flex items-center gap-2 min-w-0">
                        <TrophyTierRankLeds tier="diamante" />
                        <span
                          className={`font-bold uppercase tracking-wider truncate ${tierStyle.iconTextClass}`}
                        >
                          {tierLabel}
                        </span>
                      </div>
                      <span className="text-fg-muted tabular-nums shrink-0">
                        {diamondTrophyItem.unlockedDateIso}
                      </span>
                    </div>

                    <p className="font-display text-sm sm:text-base font-bold uppercase tracking-wide text-fg truncate mt-1">
                      {localizedTrophy.title}
                    </p>
                    <p className="text-xs text-fg-secondary leading-relaxed mt-0.5">
                      {localizedTrophy.description}
                    </p>
                  </div>
                </div>
              );
            })()}

            {standardTrophyItems.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2">
                {standardTrophyItems.map(({ trophy, unlockedDateIso }, idx) => {
                  const tierStyle = TROPHY_TIER_STYLES[trophy.tier];
                  const localizedTrophy = getLocalizedTrophy(trophy, language);
                  const tierLabel = getTrophyTierLabel(trophy.tier, language);

                  const totalStd = standardTrophyItems.length;
                  const isLastMobile = idx === totalStd - 1;
                  const lastRowStartDesktop = totalStd - (totalStd % 2 === 0 ? 2 : 1);
                  const isLastRowDesktop = idx >= lastRowStartDesktop;
                  const isLeftColDesktop = idx % 2 === 0;

                  const cellBorders = [
                    !isLastMobile ? 'border-b border-subtle' : '',
                    isLastRowDesktop ? 'sm:border-b-0' : '',
                    isLeftColDesktop ? 'sm:border-r sm:border-subtle' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <div
                      key={trophy.id}
                      className={`relative ndot-surface p-4 sm:p-5 flex items-start gap-3.5 overflow-hidden ${cellBorders}`}
                    >
                      {tierStyle.topAccentLineClass && (
                        <div
                          aria-hidden="true"
                          className={`pointer-events-none absolute inset-x-0 top-0 h-[1px] ${tierStyle.topAccentLineClass}`}
                        />
                      )}
                      <TrophyCardSheen tier={trophy.tier} />

                      <TrophyEmblem tier={trophy.tier} size="md" />

                      <div className="relative z-10 min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                          <div className="flex items-center gap-2 min-w-0">
                            <TrophyTierRankLeds tier={trophy.tier} />
                            <span
                              className={`font-bold uppercase tracking-wider truncate ${tierStyle.iconTextClass}`}
                            >
                              {tierLabel}
                            </span>
                          </div>
                          <span className="text-fg-muted tabular-nums shrink-0">
                            {unlockedDateIso}
                          </span>
                        </div>

                        <p className="font-display text-sm font-bold uppercase tracking-wide text-fg truncate mt-1">
                          {localizedTrophy.title}
                        </p>
                        <p className="text-xs text-fg-secondary leading-snug mt-0.5">
                          {localizedTrophy.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
});
