/**
 * Vista de Estadísticas y Vitrina de Trofeos:
 * - Resumen de sesiones semanales, minutos totales, media de pasos diarios y % de constancia.
 * - Gráfico interactivo de barras de lunes a domingo (Minutos o Pasos).
 * - Cuadrícula de constancia de los últimos 28 días.
 * - Desglose porcentual por modalidad (Fuerza vs Cardio).
 * - Vitrina de trofeos desbloqueados ordenada por calidad (Diamante -> Bronce).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Trophy as TrophyIcon } from 'lucide-react';
import {
  getLocalizedTrophy,
  getTrophyTierLabel,
  TROPHY_CATALOG,
  TROPHY_TIER_STYLES,
} from '../data/trophiesCatalog';
import { useI18n } from '../i18n/I18nContext';
import { DailyActivityRecord, RoutineCategory } from '../types';
import {
  addDaysToIso,
  buildWeekDaysInfo,
  countDaysBetweenIso,
  getDailyRecord,
  getMondayDateIso,
  getWeekdayIndexMondayFirst,
  parseLocalDateIso,
} from '../utils/calendarDates';
import { TrophyCardSparkles, TrophyEmblem } from './TrophyEmblem';

interface StatsViewProps {
  todayIso: string;
  firstOpenDateIso: string;
  daysByIso: Record<string, DailyActivityRecord>;
  stepGoal: number;
  unlockedTrophies: Record<string, string>;
}

type ChartMetric = 'minutes' | 'steps';

const CATEGORIES: RoutineCategory[] = ['Fuerza', 'Cardio'];

export const StatsView: React.FC<StatsViewProps> = React.memo(({
  todayIso,
  firstOpenDateIso,
  daysByIso,
  stepGoal,
  unlockedTrophies,
}) => {
  const { language, locale, t, formatCategory } = useI18n();
  const todayWeekdayIdx = useMemo(() => getWeekdayIndexMondayFirst(todayIso), [todayIso]);
  const [selectedWeekdayIdx, setSelectedWeekdayIdx] = useState<number>(todayWeekdayIdx);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('minutes');

  useEffect(() => {
    setSelectedWeekdayIdx(todayWeekdayIdx);
  }, [todayWeekdayIdx]);

  const {
    weeklyDaysData,
    totalMinutesWeek,
    totalWorkoutsWeek,
    avgDailySteps,
    consistencyPercentage,
    modalityStats,
    twentyEightDayGrid,
  } = useMemo(() => {
    const currentWeekMondayIso = getMondayDateIso(todayIso);
    const weekDaysInfo = buildWeekDaysInfo(currentWeekMondayIso, t);

    const computedWeekDays = weekDaysInfo.map((dayInfo) => {
      const record = getDailyRecord(daysByIso, dayInfo.dateIso);
      const minutes = record.completedWorkouts.reduce((sum, w) => sum + w.durationMin, 0);
      return {
        dateIso: dayInfo.dateIso,
        shortLabel: dayInfo.shortLabel,
        fullLabel: `${dayInfo.dayName} ${dayInfo.dayOfMonth} ${dayInfo.monthShort}`,
        minutes,
        steps: record.steps,
        workoutsCount: record.completedWorkouts.length,
      };
    });

    const sumMinutesWeek = computedWeekDays.reduce((sum, d) => sum + d.minutes, 0);
    const sumWorkoutsWeek = computedWeekDays.reduce((sum, d) => sum + d.workoutsCount, 0);

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
      Cardio: 0,
    };

    for (const [iso, record] of Object.entries(daysByIso)) {
      if (iso < safeStartIso || iso > todayIso) continue;
      if (record.completedWorkouts.length > 0) {
        activeWorkoutDays += 1;
        for (const workout of record.completedWorkouts) {
          if (workout.category === 'Fuerza') {
            categorySessionCounts.Fuerza += 1;
          } else {
            categorySessionCounts.Cardio += 1;
          }
        }
      }
    }

    const computedConsistency = Math.round((activeWorkoutDays / totalDaysSinceStart) * 100);
    const totalAllTimeSessions = categorySessionCounts.Fuerza + categorySessionCounts.Cardio;

    const computedModalities = CATEGORIES.map((category) => ({
      modality: category,
      sessions: categorySessionCounts[category],
      percentage:
        totalAllTimeSessions > 0
          ? Math.round((categorySessionCounts[category] / totalAllTimeSessions) * 100)
          : 0,
    }));

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
      return {
        dateIso: slotIso,
        dayOfMonth: parsedDate.getDate(),
        isToday: slotIso === todayIso,
        isReached: slotIso >= safeStartIso && slotIso <= todayIso,
        hasWorkout: Boolean(record && record.completedWorkouts.length > 0),
      };
    });

    return {
      weeklyDaysData: computedWeekDays,
      totalMinutesWeek: sumMinutesWeek,
      totalWorkoutsWeek: sumWorkoutsWeek,
      avgDailySteps: computedAvgSteps,
      consistencyPercentage: computedConsistency,
      modalityStats: computedModalities,
      twentyEightDayGrid: computedGrid,
    };
  }, [daysByIso, firstOpenDateIso, todayWeekdayIdx, todayIso, t]);

  const focusedDay =
    weeklyDaysData[selectedWeekdayIdx] ||
    weeklyDaysData[todayWeekdayIdx] ||
    weeklyDaysData[0];

  const maxChartValue =
    chartMetric === 'minutes'
      ? Math.max(...weeklyDaysData.map((d) => d.minutes), 60)
      : Math.max(...weeklyDaysData.map((d) => d.steps), stepGoal, 1_000);

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

  const gridDayHeaders = [
    t.day_mon_short,
    t.day_tue_short,
    t.day_wed_short,
    t.day_thu_short,
    t.day_fri_short,
    t.day_sat_short,
    t.day_sun_short,
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap pb-3 border-b border-subtle">
        <h1 className="text-2xl font-bold text-fg">{t.stats_title}</h1>

        <div role="group" aria-label={t.stats_title} className="seg-group inline-flex gap-0.5">
          <button
            type="button"
            onClick={() => setChartMetric('minutes')}
            className={`seg-btn min-h-[34px] px-3.5 py-1 text-xs whitespace-nowrap shrink-0 ${
              chartMetric === 'minutes' ? 'seg-btn-active' : ''
            }`}
          >
            {t.stats_metric_minutes}
          </button>
          <button
            type="button"
            onClick={() => setChartMetric('steps')}
            className={`seg-btn min-h-[34px] px-3.5 py-1 text-xs whitespace-nowrap shrink-0 ${
              chartMetric === 'steps' ? 'seg-btn-active' : ''
            }`}
          >
            {t.stats_metric_steps}
          </button>
        </div>
      </div>

      {/* Franja de indicadores principales */}
      <div className="sheet-panel grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-subtle">
        <div className="p-4">
          <p className="text-xs text-fg-muted">{t.stats_kpi_sessions}</p>
          <p className="font-mono text-2xl font-bold text-fg tabular-nums mt-1">
            {totalWorkoutsWeek}
          </p>
        </div>

        <div className="p-4 border-l border-subtle sm:border-l-0">
          <p className="text-xs text-fg-muted">{t.stats_kpi_time}</p>
          <p className="font-mono text-2xl font-bold text-accent tabular-nums mt-1">
            {totalMinutesWeek} {t.training_min_short}
          </p>
        </div>

        <div className="p-4">
          <p className="text-xs text-fg-muted">{t.stats_kpi_steps_day}</p>
          <p className="font-mono text-2xl font-bold text-fg tabular-nums mt-1">
            {avgDailySteps.toLocaleString(locale)}
          </p>
        </div>

        <div className="p-4 border-l border-subtle sm:border-l-0">
          <p className="text-xs text-fg-muted">{t.stats_kpi_consistency}</p>
          <p className="font-mono text-2xl font-bold text-fg tabular-nums mt-1">
            {consistencyPercentage}%
          </p>
        </div>
      </div>

      {/* Gráfico semanal */}
      <section className="sheet-panel p-5 sm:p-6 space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-base font-bold text-fg">{focusedDay.fullLabel}</h2>
          <span className="font-mono text-sm font-bold text-accent tabular-nums">
            {chartMetric === 'minutes'
              ? `${focusedDay.minutes} ${t.training_min_short}`
              : `${focusedDay.steps.toLocaleString(locale)} ${t.stats_steps_unit_lower}`}
          </span>
        </div>

        <svg
          viewBox="0 0 448 164"
          className="w-full h-40 overflow-visible"
          role="img"
          aria-label={t.profile_this_week}
        >
          {[28, 78, 128].map((yLine, lineIdx) => (
            <line
              key={yLine}
              x1={0}
              x2={448}
              y1={yLine}
              y2={yLine}
              stroke="currentColor"
              strokeDasharray={lineIdx === 2 ? undefined : '2 4'}
              className="text-subtle"
            />
          ))}

          {weeklyDaysData.map((dayItem, idx) => {
            const isSelected = idx === selectedWeekdayIdx;
            const value = chartMetric === 'minutes' ? dayItem.minutes : dayItem.steps;
            const maxBarHeight = 112;
            const barHeight =
              value === 0 ? 3 : Math.max(8, (value / maxChartValue) * maxBarHeight);
            const xCenter = idx * 64 + 32;
            const barWidth = 22;
            const yTop = 128 - barHeight;

            return (
              <g
                key={dayItem.dateIso}
                role="button"
                tabIndex={0}
                aria-label={`${dayItem.fullLabel}: ${
                  chartMetric === 'minutes'
                    ? `${dayItem.minutes} ${t.training_min_short}`
                    : `${dayItem.steps.toLocaleString(locale)} ${t.stats_steps_unit_lower}`
                }`}
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
                  rx={3}
                  fill="currentColor"
                  className={`transition-opacity duration-150 ${
                    isSelected ? 'text-accent' : 'text-elevated hover:opacity-80'
                  }`}
                />
                <text
                  x={xCenter}
                  y={150}
                  textAnchor="middle"
                  fill="currentColor"
                  className={`text-[11px] font-mono ${
                    isSelected ? 'text-fg font-bold' : 'text-fg-muted'
                  }`}
                >
                  {dayItem.shortLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cuadrícula de 28 días */}
        <section className="sheet-panel p-5 space-y-3">
          <h2 className="text-base font-bold text-fg">{t.stats_28_days}</h2>
          <div className="grid grid-cols-7 gap-1.5">
            {gridDayHeaders.map((label, idx) => (
              <span key={idx} className="text-center text-[11px] font-mono text-fg-muted">
                {label}
              </span>
            ))}
            {twentyEightDayGrid.map((slot) => (
              <div
                key={slot.dateIso}
                className={`h-8 rounded-[6px] flex items-center justify-center font-mono text-[11px] tabular-nums ${
                  slot.hasWorkout
                    ? 'bg-accent text-accent-fg font-bold'
                    : slot.isToday
                    ? 'bg-canvas border border-accent text-fg font-semibold'
                    : slot.isReached
                    ? 'bg-elevated text-fg-secondary'
                    : 'bg-canvas border border-subtle text-fg-muted/45'
                }`}
              >
                {slot.dayOfMonth}
              </div>
            ))}
          </div>
        </section>

        {/* Modalidades */}
        <section className="sheet-panel p-5 space-y-4">
          <h2 className="text-base font-bold text-fg">{t.stats_modalities}</h2>
          <div className="space-y-3.5">
            {modalityStats.map((item) => (
              <div key={item.modality} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-fg">{formatCategory(item.modality)}</span>
                  <span className="font-mono text-fg-muted tabular-nums">
                    {item.sessions} {t.stats_sessions_short} · {item.percentage}%
                  </span>
                </div>
                <svg
                  viewBox="0 0 200 5"
                  preserveAspectRatio="none"
                  className="w-full h-1.5 rounded-full overflow-hidden block"
                  aria-hidden="true"
                >
                  <rect
                    x={0}
                    y={0}
                    width={200}
                    height={5}
                    fill="currentColor"
                    className="text-elevated"
                  />
                  <rect
                    x={0}
                    y={0}
                    width={item.percentage * 2}
                    height={5}
                    fill="currentColor"
                    className="text-accent"
                  />
                </svg>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Vitrina de Trofeos (logros solo en español o inglés) */}
      <section className="sheet-panel p-5 sm:p-6 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrophyIcon className="w-4 h-4 text-accent shrink-0" />
            <h2 className="text-base font-bold text-fg">{t.stats_trophy_showcase}</h2>
          </div>
          <span className="font-mono text-xs font-semibold text-fg-muted tabular-nums">
            <span className="text-fg font-bold">{unlockedTrophyItems.length}</span> /{' '}
            {TROPHY_CATALOG.length}
          </span>
        </div>

        {unlockedTrophyItems.length === 0 ? (
          <p className="py-2 text-xs text-fg-muted">{t.stats_trophy_empty}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {unlockedTrophyItems.map(({ trophy, unlockedDateIso }) => {
              const tierStyle = TROPHY_TIER_STYLES[trophy.tier];
              const localizedTrophy = getLocalizedTrophy(trophy, language);
              const tierLabel = getTrophyTierLabel(trophy.tier, language);
              const isDiamondLegend = trophy.tier === 'diamante';

              return (
                <div
                  key={trophy.id}
                  className={`relative rounded-xl ${tierStyle.cardSurfaceClass} border ${tierStyle.cardBorderClass} p-3.5 flex items-start gap-3.5 overflow-hidden ${
                    isDiamondLegend ? 'sm:col-span-2' : ''
                  }`}
                >
                  <TrophyCardSparkles tier={trophy.tier} />

                  {tierStyle.sheenBarClass && (
                    <div
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-y-0 w-24 ${tierStyle.sheenBarClass} animate-trophy-sheen`}
                    />
                  )}

                  <TrophyEmblem tier={trophy.tier} size={isDiamondLegend ? 'lg' : 'md'} />

                  <div className="relative z-10 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <span className="font-bold text-fg-secondary">{tierLabel}</span>
                      <span className="text-fg-muted tabular-nums shrink-0">
                        {unlockedDateIso}
                      </span>
                    </div>

                    <p className="text-sm font-bold text-fg truncate mt-0.5">
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
      </section>
    </div>
  );
});
