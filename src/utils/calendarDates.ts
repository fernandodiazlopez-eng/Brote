/**
 * Utilidades de calendario real en zona horaria local (semanas de lunes a domingo).
 */

import { UiTextsMap } from '../i18n/translations';
import { DailyActivityRecord, WeekdayCode, WeekDayInfo } from '../types';

export const WEEKDAYS_MONDAY_FIRST: {
  code: WeekdayCode;
  name: string;
  short: string;
}[] = [
  { code: 'lun', name: 'Lunes', short: 'L' },
  { code: 'mar', name: 'Martes', short: 'M' },
  { code: 'mie', name: 'Miércoles', short: 'X' },
  { code: 'jue', name: 'Jueves', short: 'J' },
  { code: 'vie', name: 'Viernes', short: 'V' },
  { code: 'sab', name: 'Sábado', short: 'S' },
  { code: 'dom', name: 'Domingo', short: 'D' },
];

const MONTHS_SHORT_ES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

export function formatLocalDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDateIso(): string {
  return formatLocalDateIso(new Date());
}

export function parseLocalDateIso(dateIso: string): Date {
  const [year, month, day] = dateIso.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

export function addDaysToIso(dateIso: string, deltaDays: number): string {
  const date = parseLocalDateIso(dateIso);
  date.setDate(date.getDate() + deltaDays);
  return formatLocalDateIso(date);
}

export function countDaysBetweenIso(fromIso: string, toIso: string): number {
  const startMs = parseLocalDateIso(fromIso).getTime();
  const endMs = parseLocalDateIso(toIso).getTime();
  return Math.round((endMs - startMs) / 86_400_000);
}

/** Devuelve el índice del día de la semana empezando en lunes (0 = Lunes ... 6 = Domingo). */
export function getWeekdayIndexMondayFirst(dateIso: string): number {
  const jsWeekday = parseLocalDateIso(dateIso).getDay();
  return (jsWeekday + 6) % 7;
}

export function getMondayDateIso(dateIso: string): string {
  const offsetFromMonday = getWeekdayIndexMondayFirst(dateIso);
  return addDaysToIso(dateIso, -offsetFromMonday);
}

export function buildWeekDaysInfo(mondayIso: string, t?: UiTextsMap): WeekDayInfo[] {
  const dayNames = t
    ? [t.day_mon, t.day_tue, t.day_wed, t.day_thu, t.day_fri, t.day_sat, t.day_sun]
    : WEEKDAYS_MONDAY_FIRST.map((w) => w.name);

  const shortLabels = t
    ? [
        t.day_mon_short,
        t.day_tue_short,
        t.day_wed_short,
        t.day_thu_short,
        t.day_fri_short,
        t.day_sat_short,
        t.day_sun_short,
      ]
    : WEEKDAYS_MONDAY_FIRST.map((w) => w.short);

  const monthShorts = t
    ? [
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
    : MONTHS_SHORT_ES;

  return WEEKDAYS_MONDAY_FIRST.map((weekday, idx) => {
    const dateIso = addDaysToIso(mondayIso, idx);
    const parsed = parseLocalDateIso(dateIso);
    return {
      dateIso,
      dayCode: weekday.code,
      dayName: dayNames[idx] || weekday.name,
      shortLabel: shortLabels[idx] || weekday.short,
      dayOfMonth: parsed.getDate(),
      monthShort: monthShorts[parsed.getMonth()] || '',
    };
  });
}

export function getDailyRecord(
  daysByIso: Record<string, DailyActivityRecord>,
  dateIso: string
): DailyActivityRecord {
  return (
    daysByIso[dateIso] || {
      plannedRoutineIds: [],
      completedWorkouts: [],
      steps: 0,
    }
  );
}
