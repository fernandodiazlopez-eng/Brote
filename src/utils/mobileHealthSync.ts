/**
 * Gestión del permiso de Actividad Física / Sensores de Movimiento del móvil
 * para el podómetro automático (sin importación manual de archivos):
 * - En iOS 13+: solicita el permiso nativo de Movimiento y Actividad (`DeviceMotionEvent.requestPermission()`).
 * - En Android / Chromium: activa y solicita permiso de los sensores de hardware W3C
 *   (`LinearAccelerationSensor` / `Accelerometer` a 50 Hz) + puente nativo `ACTIVITY_RECOGNITION`
 *   si la app se ejecuta empaquetada con podómetro de hardware (`StepCounter` / `Pedometer`).
 */

interface DeviceMotionEventWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

export interface W3CMotionSensorInstance {
  readonly x?: number | null;
  readonly y?: number | null;
  readonly z?: number | null;
  addEventListener: (type: 'reading' | 'error' | 'activate', listener: (ev?: unknown) => void) => void;
  removeEventListener: (type: 'reading' | 'error' | 'activate', listener: (ev?: unknown) => void) => void;
  start: () => void;
  stop: () => void;
}

export type W3CMotionSensorConstructor = new (options?: {
  frequency?: number;
  referenceFrame?: 'device' | 'screen';
}) => W3CMotionSensorInstance;

export interface NativePedometerBridge {
  requestPermission?: () => Promise<boolean | 'granted' | 'denied' | { granted?: boolean; receive?: string }>;
  getTodaySteps?: () => Promise<number>;
  start?: (onStep?: (totalTodaySteps: number) => void) => Promise<void> | void;
  stop?: () => Promise<void> | void;
}

export interface HealthSummaryData {
  stepsToday: number;
  caloriesBurnedTodayKcal: number;
  distanceTodayKm: number;
  isAvailable: boolean;
  hasPermissions: boolean;
}

export function getNativePedometerBridge(): NativePedometerBridge | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AndroidStepCounter?: NativePedometerBridge;
    StepCounter?: NativePedometerBridge;
    Capacitor?: {
      Plugins?: {
        Pedometer?: NativePedometerBridge & {
          getDistance?: () => Promise<{ distance: number }>;
          getStepCount?: () => Promise<{ numberOfSteps: number }>;
          startPedometerUpdates?: (options: Record<string, unknown>, callback: (data: { numberOfSteps: number; distance?: number }) => void) => Promise<void>;
        };
        StepCounter?: NativePedometerBridge;
      };
    };
  };
  return (
    win.AndroidStepCounter ||
    win.StepCounter ||
    win.Capacitor?.Plugins?.Pedometer ||
    win.Capacitor?.Plugins?.StepCounter ||
    null
  );
}

/**
 * Consulta y sincroniza datos de salud desde Google Health Connect (Android 14+ / APK)
 * usando el plugin de Capacitor @capawesome/capacitor-health-connect.
 */
export async function syncNativeHealthConnect(): Promise<HealthSummaryData | null> {
  if (typeof window === 'undefined') return null;

  const win = window as unknown as {
    Capacitor?: {
      Plugins?: {
        HealthConnect?: {
          checkAvailability?: () => Promise<{ availability: string }>;
          requestPermissions?: (options: { read: string[]; write?: string[] }) => Promise<void>;
          getRecord?: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
          getSteps?: (options: { startTime: string; endTime: string }) => Promise<{ count: number }>;
          getTotalCaloriesBurned?: (options: { startTime: string; endTime: string }) => Promise<{ energy: { inKilocalories: number } }>;
          getDistance?: (options: { startTime: string; endTime: string }) => Promise<{ distance: { inMeters: number } }>;
        };
      };
    };
  };

  const healthConnect = win.Capacitor?.Plugins?.HealthConnect;
  if (!healthConnect) return null;

  try {
    const availability = await healthConnect.checkAvailability?.();
    const isAvailable = availability?.availability === 'AVAILABLE';
    if (!isAvailable) {
      return {
        stepsToday: 0,
        caloriesBurnedTodayKcal: 0,
        distanceTodayKm: 0,
        isAvailable: false,
        hasPermissions: false,
      };
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
    const endOfDay = now.toISOString();

    let steps = 0;
    let calories = 0;
    let distanceKm = 0;

    try {
      const stepsRes = await healthConnect.getSteps?.({ startTime: startOfDay, endTime: endOfDay });
      if (typeof stepsRes?.count === 'number') {
        steps = Math.round(stepsRes.count);
      }
    } catch {
      // Ignorar si el usuario no concedió lectura de pasos
    }

    try {
      const calsRes = await healthConnect.getTotalCaloriesBurned?.({ startTime: startOfDay, endTime: endOfDay });
      if (typeof calsRes?.energy?.inKilocalories === 'number') {
        calories = Math.round(calsRes.energy.inKilocalories);
      }
    } catch {
      // Ignorar si no está concedido
    }

    try {
      const distRes = await healthConnect.getDistance?.({ startTime: startOfDay, endTime: endOfDay });
      if (typeof distRes?.distance?.inMeters === 'number') {
        distanceKm = Number((distRes.distance.inMeters / 1000).toFixed(2));
      }
    } catch {
      // Ignorar si no está concedido
    }

    return {
      stepsToday: steps,
      caloriesBurnedTodayKcal: calories,
      distanceTodayKm: distanceKm,
      isAvailable: true,
      hasPermissions: true,
    };
  } catch {
    return null;
  }
}

export function getLinearAccelerationSensorCtor(): W3CMotionSensorConstructor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { LinearAccelerationSensor?: W3CMotionSensorConstructor })
    .LinearAccelerationSensor;
  return typeof ctor === 'function' ? ctor : null;
}

export function getAccelerometerCtor(): W3CMotionSensorConstructor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { Accelerometer?: W3CMotionSensorConstructor }).Accelerometer;
  return typeof ctor === 'function' ? ctor : null;
}

export function isMotionSensorSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    getNativePedometerBridge() ||
      getLinearAccelerationSensorCtor() ||
      getAccelerometerCtor() ||
      'DeviceMotionEvent' in window
  );
}

export function needsExplicitMotionPermission(): boolean {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return false;
  const ctor = window.DeviceMotionEvent as unknown as DeviceMotionEventWithPermission;
  return typeof ctor?.requestPermission === 'function';
}

/**
 * Solicita el permiso de actividad física / sensores de movimiento del dispositivo.
 * Debe ejecutarse directamente dentro de un clic del usuario para compatibilidad con iOS y Android.
 */
export async function requestMotionSensorPermission(): Promise<
  'granted' | 'denied' | 'unsupported'
> {
  if (!isMotionSensorSupported()) return 'unsupported';

  // 1) Si existe puente nativo de podómetro de hardware (ACTIVITY_RECOGNITION / CMPedometer)
  const nativeBridge = getNativePedometerBridge();
  if (nativeBridge && typeof nativeBridge.requestPermission === 'function') {
    try {
      const res = await nativeBridge.requestPermission();
      if (
        res === true ||
        res === 'granted' ||
        (typeof res === 'object' && res !== null && (res.granted === true || res.receive === 'granted'))
      ) {
        return 'granted';
      }
      return 'denied';
    } catch {
      // Continuar con sensores estándar del sistema
    }
  }

  // 2) iOS Safari / PWA: solicitud nativa obligatoria dentro del gesto táctil
  try {
    if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
      const ctor = window.DeviceMotionEvent as unknown as DeviceMotionEventWithPermission;
      if (typeof ctor?.requestPermission === 'function') {
        const response = await ctor.requestPermission();
        return response === 'granted' ? 'granted' : 'denied';
      }
    }
  } catch {
    return 'denied';
  }

  // 3) Android / Chromium: comprobar permisos y arrancar brevemente el sensor de hardware
  //    para disparar el cuadro real de permiso de "Sensores de movimiento / Actividad física" si está en 'prompt'
  if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions) {
    try {
      const status = await navigator.permissions.query({
        name: 'accelerometer' as PermissionName,
      });
      if (status.state === 'denied') {
        return 'denied';
      }
    } catch {
      // Ignorar nombres de permiso no soportados por el navegador
    }
  }

  const SensorCtor = getLinearAccelerationSensorCtor() || getAccelerometerCtor();
  if (SensorCtor) {
    const sensorCheck = await new Promise<'granted' | 'denied' | 'fallback'>((resolve) => {
      let settled = false;
      let probe: W3CMotionSensorInstance | null = null;
      const finish = (val: 'granted' | 'denied' | 'fallback') => {
        if (settled) return;
        settled = true;
        try {
          probe?.stop();
        } catch {
          // Ignorar
        }
        resolve(val);
      };

      try {
        probe = new SensorCtor({ frequency: 30 });
        probe.addEventListener('activate', () => finish('granted'));
        probe.addEventListener('reading', () => finish('granted'));
        probe.addEventListener('error', (ev: unknown) => {
          const errName = (ev as { error?: { name?: string } })?.error?.name;
          if (errName === 'NotAllowedError') {
            finish('denied');
          } else {
            finish('fallback');
          }
        });
        probe.start();
        window.setTimeout(() => finish('granted'), 320);
      } catch (err) {
        const errName = (err as { name?: string })?.name;
        finish(errName === 'SecurityError' || errName === 'NotAllowedError' ? 'fallback' : 'fallback');
      }
    });

    if (sensorCheck === 'denied') {
      return 'denied';
    }
  }

  return 'granted';
}
