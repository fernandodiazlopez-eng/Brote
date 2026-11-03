/**
 * Integración con sensores de movimiento del móvil (podómetro en vivo)
 * e importación directa de datos de actividad reales desde las apps de salud
 * por defecto del teléfono (Apple Salud XML, Google Fit / Health Connect / Samsung Health CSV y JSON, GPX / TCX).
 */

import { CompletedWorkout, RoutineCategory, XpFormulas } from '../types';
import { getTodayDateIso } from './calendarDates';
import { KM_PER_STEP, MAX_TOTAL_XP, recalculateDailyWorkoutsMarginalXp } from './progressionRules';

interface DeviceMotionEventWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

export function isMotionSensorSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'DeviceMotionEvent' in window || 'Accelerometer' in window;
}

export function needsExplicitMotionPermission(): boolean {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return false;
  const ctor = window.DeviceMotionEvent as unknown as DeviceMotionEventWithPermission;
  return typeof ctor?.requestPermission === 'function';
}

/**
 * Debe invocarse dentro de un gesto directo del usuario (`click`) para compatibilidad con iOS Safari 13+.
 */
export async function requestMotionSensorPermission(): Promise<
  'granted' | 'denied' | 'unsupported'
> {
  if (!isMotionSensorSupported()) return 'unsupported';

  try {
    const ctor = window.DeviceMotionEvent as unknown as DeviceMotionEventWithPermission;
    if (typeof ctor?.requestPermission === 'function') {
      const response = await ctor.requestPermission();
      return response === 'granted' ? 'granted' : 'denied';
    }
  } catch {
    return 'denied';
  }

  // En Android / Chromium, comprobar Permissions API si está disponible
  try {
    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions) {
      const status = await navigator.permissions.query({
        name: 'accelerometer' as PermissionName,
      });
      if (status.state === 'denied') return 'denied';
    }
  } catch {
    // Muchos navegadores no exponen 'accelerometer' en permissions.query pero sí emiten devicemotion
  }

  return 'granted';
}

export interface ImportedDayHealthPatch {
  steps?: number;
  workouts: CompletedWorkout[];
}

export interface MobileHealthImportResult {
  daysPatch: Record<string, ImportedDayHealthPatch>;
  daysCount: number;
  totalSteps: number;
  workoutsCount: number;
}

function toLocalDateIso(rawDate: string | number): string | null {
  if (typeof rawDate === 'number' && Number.isFinite(rawDate)) {
    const ms = rawDate > 1e12 ? rawDate : rawDate * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return formatDateObjIso(d);
  }
  if (typeof rawDate !== 'string') return null;
  const trimmed = rawDate.trim();
  if (!trimmed) return null;

  const directIsoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (directIsoMatch) {
    return `${directIsoMatch[1]}-${directIsoMatch[2]}-${directIsoMatch[3]}`;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slashMatch) {
    const first = Number.parseInt(slashMatch[1], 10);
    const second = Number.parseInt(slashMatch[2], 10);
    const year = slashMatch[3];
    // Formato DD/MM/YYYY habitual en español salvo que el segundo supere 12
    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  // Apple Health: '2026-11-03 09:41:12 +0100'
  const appleNormalized = trimmed.replace(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{2})(\d{2})$/,
    '$1T$2$3:$4'
  );
  const parsed = new Date(appleNormalized);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDateObjIso(parsed);
  }
  return null;
}

function extractTimeLabel(rawDate: string | number): string {
  const d =
    typeof rawDate === 'number'
      ? new Date(rawDate > 1e12 ? rawDate : rawDate * 1000)
      : new Date(
          rawDate
            .trim()
            .replace(
              /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+([+-]\d{2})(\d{2})$/,
              '$1T$2$3:$4'
            )
        );
  if (Number.isNaN(d.getTime())) return '12:00';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateObjIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function classifyWorkoutType(rawType: string): {
  category: RoutineCategory;
  defaultTitleEs: string;
} {
  const lower = rawType.toLowerCase();
  if (
    lower.includes('strength') ||
    lower.includes('weight') ||
    lower.includes('fuerza') ||
    lower.includes('pesas') ||
    lower.includes('gym') ||
    lower.includes('core') ||
    lower.includes('calisthenics')
  ) {
    return { category: 'Fuerza', defaultTitleEs: 'Entrenamiento de fuerza' };
  }
  if (
    lower.includes('hiit') ||
    lower.includes('cross') ||
    lower.includes('functional') ||
    lower.includes('circuit') ||
    lower.includes('mixed') ||
    lower.includes('martial') ||
    lower.includes('boxing') ||
    lower.includes('híbrid') ||
    lower.includes('hybrid')
  ) {
    return { category: 'Híbrida', defaultTitleEs: 'Sesión híbrida' };
  }
  if (lower.includes('cycle') || lower.includes('biking') || lower.includes('ciclismo')) {
    return { category: 'Cardio', defaultTitleEs: 'Ciclismo' };
  }
  if (lower.includes('swim') || lower.includes('natación')) {
    return { category: 'Cardio', defaultTitleEs: 'Natación' };
  }
  if (lower.includes('walk') || lower.includes('caminata') || lower.includes('hike')) {
    return { category: 'Cardio', defaultTitleEs: 'Caminata' };
  }
  if (lower.includes('run') || lower.includes('carrera')) {
    return { category: 'Cardio', defaultTitleEs: 'Carrera' };
  }
  return { category: 'Cardio', defaultTitleEs: 'Actividad móvil' };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function finalizeDaysPatch(
  rawStepsByDay: Record<string, number>,
  rawWorkoutsByDay: Record<string, CompletedWorkout[]>,
  xpFormulas: XpFormulas
): MobileHealthImportResult | null {
  const todayIso = getTodayDateIso();
  const allDates = new Set<string>([
    ...Object.keys(rawStepsByDay),
    ...Object.keys(rawWorkoutsByDay),
  ]);

  const daysPatch: Record<string, ImportedDayHealthPatch> = {};
  let daysCount = 0;
  let totalSteps = 0;
  let workoutsCount = 0;

  for (const iso of allDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso > todayIso) continue;
    const rawSteps = Math.min(200_000, Math.max(0, Math.round(rawStepsByDay[iso] || 0)));
    const dayWorkouts = rawWorkoutsByDay[iso] || [];
    const recalculated =
      dayWorkouts.length > 0
        ? recalculateDailyWorkoutsMarginalXp(dayWorkouts, xpFormulas)
        : [];

    if (rawSteps <= 0 && recalculated.length === 0) continue;

    daysPatch[iso] = {
      ...(rawSteps > 0 ? { steps: rawSteps } : {}),
      workouts: recalculated,
    };
    daysCount += 1;
    totalSteps += rawSteps;
    workoutsCount += recalculated.length;
  }

  if (daysCount === 0) return null;
  return { daysPatch, daysCount, totalSteps, workoutsCount };
}

function parseAppleHealthXml(
  xmlText: string,
  xpFormulas: XpFormulas
): MobileHealthImportResult | null {
  // Agrupar pasos por día y por fuente (para no duplicar iPhone + Apple Watch el mismo día)
  const stepsByDayAndSource: Record<string, Record<string, number>> = {};
  const workoutsByDay: Record<string, CompletedWorkout[]> = {};

  const recordRegex = /<Record\b([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null = null;
  let idxCounter = 0;

  while ((match = recordRegex.exec(xmlText)) !== null) {
    const attrs = match[1];
    if (!attrs.includes('HKQuantityTypeIdentifierStepCount')) continue;

    const valueMatch = attrs.match(/\bvalue="([^"]+)"/i);
    const startMatch = attrs.match(/\bstartDate="([^"]+)"/i);
    if (!valueMatch || !startMatch) continue;

    const val = Number.parseFloat(valueMatch[1]);
    if (!Number.isFinite(val) || val <= 0) continue;

    const dateIso = toLocalDateIso(startMatch[1]);
    if (!dateIso) continue;

    const sourceMatch = attrs.match(/\bsourceName="([^"]+)"/i);
    const sourceKey = sourceMatch ? sourceMatch[1] : 'default';
    if (!stepsByDayAndSource[dateIso]) stepsByDayAndSource[dateIso] = {};
    stepsByDayAndSource[dateIso][sourceKey] =
      (stepsByDayAndSource[dateIso][sourceKey] || 0) + val;
  }

  const stepsByDay: Record<string, number> = {};
  for (const [iso, bySource] of Object.entries(stepsByDayAndSource)) {
    const maxSourceSteps = Math.max(0, ...Object.values(bySource));
    if (maxSourceSteps > 0) {
      stepsByDay[iso] = Math.round(maxSourceSteps);
    }
  }

  const workoutRegex = /<Workout\b([^>]*?)\/?>/gi;
  while ((match = workoutRegex.exec(xmlText)) !== null) {
    const attrs = match[1];
    const typeMatch = attrs.match(/\bworkoutActivityType="([^"]+)"/i);
    const durMatch = attrs.match(/\bduration="([^"]+)"/i);
    const startMatch = attrs.match(/\bstartDate="([^"]+)"/i);
    if (!typeMatch || !durMatch || !startMatch) continue;

    const rawDuration = Number.parseFloat(durMatch[1]);
    if (!Number.isFinite(rawDuration) || rawDuration < 1) continue;
    const durUnitMatch = attrs.match(/\bdurationUnit="([^"]+)"/i);
    const durationMin = Math.max(
      1,
      Math.min(
        720,
        Math.round(
          durUnitMatch && durUnitMatch[1].toLowerCase().startsWith('sec')
            ? rawDuration / 60
            : durUnitMatch && durUnitMatch[1].toLowerCase().startsWith('hr')
            ? rawDuration * 60
            : rawDuration
        )
      )
    );

    const dateIso = toLocalDateIso(startMatch[1]);
    if (!dateIso) continue;

    const distMatch = attrs.match(/\btotalDistance="([^"]+)"/i);
    const distUnitMatch = attrs.match(/\btotalDistanceUnit="([^"]+)"/i);
    let distanceKm: number | undefined;
    if (distMatch) {
      const rawDist = Number.parseFloat(distMatch[1]);
      if (Number.isFinite(rawDist) && rawDist > 0) {
        const unit = (distUnitMatch?.[1] || 'km').toLowerCase();
        const km =
          unit === 'm'
            ? rawDist / 1000
            : unit.startsWith('mi')
            ? rawDist * 1.60934
            : rawDist;
        if (km >= 0.05) {
          distanceKm = Math.round(km * 100) / 100;
        }
      }
    }

    const cleanType = typeMatch[1].replace(/^HKWorkoutActivityType/i, '');
    const classified = classifyWorkoutType(cleanType);
    idxCounter += 1;
    if (!workoutsByDay[dateIso]) workoutsByDay[dateIso] = [];
    workoutsByDay[dateIso].push({
      id: `health-wk-${dateIso}-${idxCounter}`,
      title: classified.defaultTitleEs,
      category: classified.category,
      durationMin,
      ...(distanceKm ? { distanceKm } : {}),
      xpEarned: 0,
      timeLabel: extractTimeLabel(startMatch[1]),
      completionRatio: 1,
    });
  }

  return finalizeDaysPatch(stepsByDay, workoutsByDay, xpFormulas);
}

function parseGpxOrTcx(
  xmlText: string,
  fileName: string,
  xpFormulas: XpFormulas
): MobileHealthImportResult | null {
  const stepsByDay: Record<string, number> = {};
  const workoutsByDay: Record<string, CompletedWorkout[]> = {};

  // Soporte TCX (Garmin / Google Fit / Samsung Health / Polar)
  if (/<TrainingCenterDatabase/i.test(xmlText) || /<Activity\b/i.test(xmlText)) {
    const activityRegex = /<Activity\b[^>]*Sport="([^"]*)"[^>]*>([\s\S]*?)<\/Activity>/gi;
    let actMatch: RegExpExecArray | null = null;
    let count = 0;
    while ((actMatch = activityRegex.exec(xmlText)) !== null) {
      const sport = actMatch[1] || 'Running';
      const body = actMatch[2];
      const idMatch = body.match(/<Id>([^<]+)<\/Id>/i);
      const dateIso = idMatch ? toLocalDateIso(idMatch[1]) : getTodayDateIso();
      if (!dateIso) continue;

      let totalSec = 0;
      const secRegex = /<TotalTimeSeconds>([^<]+)<\/TotalTimeSeconds>/gi;
      let sm: RegExpExecArray | null = null;
      while ((sm = secRegex.exec(body)) !== null) {
        const v = Number.parseFloat(sm[1]);
        if (Number.isFinite(v) && v > 0) totalSec += v;
      }

      let totalMeters = 0;
      const distRegex = /<DistanceMeters>([^<]+)<\/DistanceMeters>/gi;
      let dm: RegExpExecArray | null = null;
      while ((dm = distRegex.exec(body)) !== null) {
        const v = Number.parseFloat(dm[1]);
        if (Number.isFinite(v) && v > 0) totalMeters += v;
      }

      const durationMin = Math.max(1, Math.min(720, Math.round(totalSec / 60) || 30));
      const distanceKm =
        totalMeters >= 50 ? Math.round((totalMeters / 1000) * 100) / 100 : undefined;
      const classified = classifyWorkoutType(sport);
      count += 1;

      if (!workoutsByDay[dateIso]) workoutsByDay[dateIso] = [];
      workoutsByDay[dateIso].push({
        id: `tcx-${dateIso}-${count}`,
        title: classified.defaultTitleEs,
        category: classified.category,
        durationMin,
        ...(distanceKm ? { distanceKm } : {}),
        xpEarned: 0,
        timeLabel: idMatch ? extractTimeLabel(idMatch[1]) : '12:00',
        completionRatio: 1,
      });
    }
    return finalizeDaysPatch(stepsByDay, workoutsByDay, xpFormulas);
  }

  // Soporte GPX estándar
  const ptRegex = /<trkpt\b[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
  let ptMatch: RegExpExecArray | null = null;
  let prevLat: number | null = null;
  let prevLon: number | null = null;
  let totalKm = 0;
  let firstTimeMs: number | null = null;
  let lastTimeMs: number | null = null;
  let firstRawTime: string | null = null;

  while ((ptMatch = ptRegex.exec(xmlText)) !== null) {
    const lat = Number.parseFloat(ptMatch[1]);
    const lon = Number.parseFloat(ptMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      if (prevLat !== null && prevLon !== null) {
        const segKm = haversineKm(prevLat, prevLon, lat, lon);
        if (segKm < 2) totalKm += segKm;
      }
      prevLat = lat;
      prevLon = lon;
    }
    const timeMatch = ptMatch[3].match(/<time>([^<]+)<\/time>/i);
    if (timeMatch) {
      const ms = new Date(timeMatch[1].trim()).getTime();
      if (Number.isFinite(ms)) {
        if (firstTimeMs === null) {
          firstTimeMs = ms;
          firstRawTime = timeMatch[1].trim();
        }
        lastTimeMs = ms;
      }
    }
  }

  if (totalKm <= 0 && firstTimeMs === null) return null;

  const dateIso = (firstRawTime && toLocalDateIso(firstRawTime)) || getTodayDateIso();
  const durationMin =
    firstTimeMs !== null && lastTimeMs !== null && lastTimeMs > firstTimeMs
      ? Math.max(1, Math.min(720, Math.round((lastTimeMs - firstTimeMs) / 60000)))
      : Math.max(5, Math.round(totalKm * 6));
  const nameMatch = xmlText.match(/<name>([^<]+)<\/name>/i);
  const rawTitle = nameMatch ? nameMatch[1].trim() : fileName.replace(/\.[^.]+$/, '');
  const classified = classifyWorkoutType(rawTitle);
  const roundedKm = totalKm >= 0.05 ? Math.round(totalKm * 100) / 100 : undefined;

  workoutsByDay[dateIso] = [
    {
      id: `gpx-${dateIso}-${Date.now()}`,
      title: rawTitle.slice(0, 80) || classified.defaultTitleEs,
      category: classified.category,
      durationMin,
      ...(roundedKm ? { distanceKm: roundedKm } : {}),
      xpEarned: 0,
      timeLabel: firstRawTime ? extractTimeLabel(firstRawTime) : '12:00',
      completionRatio: 1,
    },
  ];

  if (
    roundedKm &&
    (classified.defaultTitleEs === 'Carrera' || classified.defaultTitleEs === 'Caminata')
  ) {
    stepsByDay[dateIso] = Math.round(roundedKm / KM_PER_STEP);
  }

  return finalizeDaysPatch(stepsByDay, workoutsByDay, xpFormulas);
}

function splitCsvRow(line: string, delimiter: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      cols.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function parseCsvHealthExport(
  csvText: string,
  xpFormulas: XpFormulas
): MobileHealthImportResult | null {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  if (lines.length < 2) return null;

  // Samsung Health a veces incluye una primera fila de metadatos antes de la cabecera real
  let headerIdx = 0;
  if (
    lines.length >= 3 &&
    lines[0].includes('com.samsung.') &&
    (lines[1].toLowerCase().includes('count') || lines[1].toLowerCase().includes('step'))
  ) {
    headerIdx = 1;
  }

  const headerLine = lines[headerIdx];
  const delimiter =
    headerLine.split(';').length > headerLine.split(',').length ? ';' : ',';
  const headers = splitCsvRow(headerLine, delimiter).map((h) => h.toLowerCase());

  const dateCol = headers.findIndex((h) =>
    /(^date$|^fecha$|start_time|start time|day_time|create_time|hora de inicio|día|dia)/.test(h)
  );
  const stepsCol = headers.findIndex((h) =>
    /(step|paso|^count$|recuento de pasos)/.test(h)
  );
  const distCol = headers.findIndex((h) => /(distance|distancia)/.test(h));
  const durCol = headers.findIndex((h) =>
    /(move minutes|minutos de movimiento|active minutes|minutos activos|duration|duración|duracion)/.test(
      h
    )
  );

  if (dateCol === -1 || (stepsCol === -1 && durCol === -1 && distCol === -1)) {
    return null;
  }

  const distIsMeters =
    distCol !== -1 &&
    (headers[distCol].includes('(m)') ||
      headers[distCol].includes('_m') ||
      (!headers[distCol].includes('km') && headers[distCol].includes('meter')));

  const durIsMs =
    durCol !== -1 && (headers[durCol].includes('ms') || headers[durCol].includes('millis'));
  const durIsSec =
    durCol !== -1 && (headers[durCol].includes('(s)') || headers[durCol].includes('sec'));

  const stepsByDay: Record<string, number> = {};
  const workoutsByDay: Record<string, CompletedWorkout[]> = {};

  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const cols = splitCsvRow(lines[i], delimiter);
    const rawDateVal = cols[dateCol];
    if (!rawDateVal) continue;

    const numericTs = /^\d{10,13}$/.test(rawDateVal) ? Number(rawDateVal) : null;
    const dateIso = toLocalDateIso(numericTs ?? rawDateVal);
    if (!dateIso) continue;

    if (stepsCol !== -1 && cols[stepsCol]) {
      const parsedSteps = Number.parseFloat(cols[stepsCol].replace(',', '.'));
      if (Number.isFinite(parsedSteps) && parsedSteps > 0) {
        stepsByDay[dateIso] = (stepsByDay[dateIso] || 0) + Math.round(parsedSteps);
      }
    }

    if (durCol !== -1 && cols[durCol]) {
      const rawDur = Number.parseFloat(cols[durCol].replace(',', '.'));
      if (Number.isFinite(rawDur) && rawDur > 0) {
        const minutes = Math.round(
          durIsMs ? rawDur / 60000 : durIsSec ? rawDur / 60 : rawDur
        );
        // Si no hay pasos en esa fila o supera 15 min de actividad continua, registrar como sesión Cardio
        if (minutes >= 15 && stepsCol === -1) {
          let distanceKm: number | undefined;
          if (distCol !== -1 && cols[distCol]) {
            const rawDist = Number.parseFloat(cols[distCol].replace(',', '.'));
            if (Number.isFinite(rawDist) && rawDist > 0) {
              const km = distIsMeters ? rawDist / 1000 : rawDist;
              if (km >= 0.05) distanceKm = Math.round(km * 100) / 100;
            }
          }
          if (!workoutsByDay[dateIso]) workoutsByDay[dateIso] = [];
          workoutsByDay[dateIso].push({
            id: `csv-wk-${dateIso}-${i}`,
            title: 'Actividad móvil',
            category: 'Cardio',
            durationMin: Math.min(720, minutes),
            ...(distanceKm ? { distanceKm } : {}),
            xpEarned: 0,
            timeLabel: extractTimeLabel(numericTs ?? rawDateVal),
            completionRatio: 1,
          });
        }
      }
    }
  }

  return finalizeDaysPatch(stepsByDay, workoutsByDay, xpFormulas);
}

function parseJsonHealthExport(
  jsonText: string,
  xpFormulas: XpFormulas
): MobileHealthImportResult | null {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    const stepsByDay: Record<string, number> = {};
    const workoutsByDay: Record<string, CompletedWorkout[]> = {};

    const items: Record<string, unknown>[] = Array.isArray(parsed)
      ? (parsed.filter((x) => x && typeof x === 'object') as Record<string, unknown>[])
      : parsed && typeof parsed === 'object'
      ? Array.isArray((parsed as Record<string, unknown>).data)
        ? ((parsed as Record<string, unknown>).data as Record<string, unknown>[])
        : Array.isArray((parsed as Record<string, unknown>).activities)
        ? ((parsed as Record<string, unknown>).activities as Record<string, unknown>[])
        : Array.isArray((parsed as Record<string, unknown>).records)
        ? ((parsed as Record<string, unknown>).records as Record<string, unknown>[])
        : [parsed as Record<string, unknown>]
      : [];

    items.forEach((entry, idx) => {
      const rawDate =
        entry.date ??
        entry.dateIso ??
        entry.startTime ??
        entry.start_time ??
        entry.startDate ??
        entry.timestamp ??
        entry.day;

      const dateIso =
        typeof rawDate === 'string' || typeof rawDate === 'number'
          ? toLocalDateIso(rawDate)
          : null;
      if (!dateIso) return;

      const rawSteps = entry.steps ?? entry.stepCount ?? entry.step_count ?? entry.count;
      if (typeof rawSteps === 'number' && Number.isFinite(rawSteps) && rawSteps > 0) {
        stepsByDay[dateIso] = Math.max(stepsByDay[dateIso] || 0, Math.min(MAX_TOTAL_XP, Math.round(rawSteps)));
      }

      const rawDurationMin =
        entry.durationMin ?? entry.duration_min ?? entry.activeMinutes ?? entry.moveMinutes;
      const rawDurationSec = entry.durationSec ?? entry.duration_sec;
      const durationMin =
        typeof rawDurationMin === 'number' && rawDurationMin >= 1
          ? Math.round(rawDurationMin)
          : typeof rawDurationSec === 'number' && rawDurationSec >= 60
          ? Math.round(rawDurationSec / 60)
          : 0;

      if (durationMin >= 5 && (entry.workoutType || entry.activityType || entry.sport || entry.title)) {
        const typeStr = String(
          entry.workoutType ?? entry.activityType ?? entry.sport ?? entry.title ?? 'Cardio'
        );
        const classified = classifyWorkoutType(typeStr);
        const rawDistKm = entry.distanceKm ?? entry.distance_km;
        const rawDistM = entry.distanceMeters ?? entry.distance_m;
        const distanceKm =
          typeof rawDistKm === 'number' && rawDistKm >= 0.05
            ? Math.round(rawDistKm * 100) / 100
            : typeof rawDistM === 'number' && rawDistM >= 50
            ? Math.round((rawDistM / 1000) * 100) / 100
            : undefined;

        if (!workoutsByDay[dateIso]) workoutsByDay[dateIso] = [];
        workoutsByDay[dateIso].push({
          id: `json-wk-${dateIso}-${idx}`,
          title:
            typeof entry.title === 'string' && entry.title.trim() !== ''
              ? entry.title.trim().slice(0, 80)
              : classified.defaultTitleEs,
          category: classified.category,
          durationMin: Math.min(720, durationMin),
          ...(distanceKm ? { distanceKm } : {}),
          xpEarned: 0,
          timeLabel:
            typeof rawDate === 'string' || typeof rawDate === 'number'
              ? extractTimeLabel(rawDate)
              : '12:00',
          completionRatio: 1,
        });
      }
    });

    return finalizeDaysPatch(stepsByDay, workoutsByDay, xpFormulas);
  } catch {
    return null;
  }
}

export function parseMobileHealthExport(
  fileName: string,
  rawContent: string,
  xpFormulas: XpFormulas
): MobileHealthImportResult | null {
  const lowerName = fileName.toLowerCase();
  const trimmed = rawContent.trim();
  if (!trimmed) return null;

  if (
    lowerName.endsWith('.gpx') ||
    lowerName.endsWith('.tcx') ||
    /<gpx\b/i.test(trimmed) ||
    /<TrainingCenterDatabase/i.test(trimmed)
  ) {
    return parseGpxOrTcx(trimmed, fileName, xpFormulas);
  }

  if (
    lowerName.endsWith('.xml') ||
    /<HealthData\b/i.test(trimmed) ||
    trimmed.includes('HKQuantityTypeIdentifierStepCount')
  ) {
    return parseAppleHealthXml(trimmed, xpFormulas);
  }

  if (lowerName.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseJsonHealthExport(trimmed, xpFormulas);
  }

  return parseCsvHealthExport(trimmed, xpFormulas);
}
