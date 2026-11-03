/**
 * Podómetro automático con sensores físicos del dispositivo:
 * - Si existe puente nativo de podómetro de hardware (`StepCounter` / `ACTIVITY_RECOGNITION` / `CMPedometer`),
 *   sincroniza directamente el contador acumulado del chip incluso al reabrir tras pantalla apagada.
 * - En navegador / PWA utiliza `LinearAccelerationSensor` (50 Hz con gravedad compensada por hardware en Android),
 *   `Accelerometer` o `DeviceMotionEvent` (`acceleration` lineal por hardware o filtro paso-alto) para detectar
 *   la cadencia real de pasos al caminar o correr con el móvil encima.
 */

import { useEffect, useRef, useState } from 'react';
import {
  getAccelerometerCtor,
  getLinearAccelerationSensorCtor,
  getNativePedometerBridge,
  isMotionSensorSupported,
  needsExplicitMotionPermission,
  W3CMotionSensorInstance,
} from '../utils/mobileHealthSync';

interface UseMobileStepSensorOptions {
  enabled: boolean;
  currentSavedSteps: number;
  onStepsDetected: (deltaSteps: number) => void;
  onSyncHardwareTotalSteps?: (hardwareTodaySteps: number) => void;
}

export interface MobileStepSensorStatus {
  isSupported: boolean;
  isReceivingMotion: boolean;
}

const PEAK_THRESHOLD_MPS2 = 1.18;
const TROUGH_RESET_MPS2 = 0.38;
const MIN_STEP_INTERVAL_MS = 270; // máx ~222 pasos/min corriendo
const MAX_STEP_INTERVAL_MS = 2200; // mín ~27 pasos/min caminando despacio
const CADENCE_WARMUP_STEPS = 4; // exige 4 pasos rítmicos seguidos para descartar gestos aislados

export function useMobileStepSensor({
  enabled,
  currentSavedSteps,
  onStepsDetected,
  onSyncHardwareTotalSteps,
}: UseMobileStepSensorOptions): MobileStepSensorStatus {
  const [isReceivingMotion, setIsReceivingMotion] = useState(false);
  const deltaCallbackRef = useRef(onStepsDetected);
  deltaCallbackRef.current = onStepsDetected;

  const totalSyncCallbackRef = useRef(onSyncHardwareTotalSteps);
  totalSyncCallbackRef.current = onSyncHardwareTotalSteps;

  const savedStepsRef = useRef(currentSavedSteps);
  savedStepsRef.current = currentSavedSteps;

  const isSupported = isMotionSensorSupported();

  useEffect(() => {
    if (!enabled || !isSupported || typeof window === 'undefined') {
      setIsReceivingMotion(false);
      return;
    }

    let disposed = false;
    let hasSeenRealSample = false;
    let gravityMag = 9.81;
    let gravityInitialized = false;
    let prevDyn1 = 0;
    let prevDyn2 = 0;
    let armedForPeak = true;
    let lastStepPeakMs = 0;
    let streakSteps = 0;
    let streakCommitted = false;
    let pendingStepsBuffer = 0;
    let lastPointerTouchMs = 0;

    const markActive = () => {
      if (!hasSeenRealSample && !disposed) {
        hasSeenRealSample = true;
        setIsReceivingMotion(true);
      }
    };

    // 1. Si hay contador nativo de pasos por hardware, leer y suscribirse también al volver de pantalla apagada
    const nativeBridge = getNativePedometerBridge();
    const syncFromNativeHardware = async () => {
      if (!nativeBridge || typeof nativeBridge.getTodaySteps !== 'function') return;
      try {
        const hwSteps = await nativeBridge.getTodaySteps();
        if (disposed || !Number.isFinite(hwSteps) || hwSteps <= 0) return;
        markActive();
        const rounded = Math.round(hwSteps);
        if (totalSyncCallbackRef.current) {
          totalSyncCallbackRef.current(rounded);
        } else if (rounded > savedStepsRef.current) {
          deltaCallbackRef.current(rounded - savedStepsRef.current);
        }
      } catch {
        // Ignorar errores del puente nativo
      }
    };

    if (nativeBridge) {
      void syncFromNativeHardware();
      if (typeof nativeBridge.start === 'function') {
        try {
          void nativeBridge.start((hwTotal) => {
            if (disposed || !Number.isFinite(hwTotal) || hwTotal <= 0) return;
            markActive();
            const rounded = Math.round(hwTotal);
            if (totalSyncCallbackRef.current) {
              totalSyncCallbackRef.current(rounded);
            }
          });
        } catch {
          // Ignorar y continuar con sensores de movimiento
        }
      }
    }

    const handleVisibilitySync = () => {
      if (document.visibilityState === 'visible') {
        void syncFromNativeHardware();
      }
    };

    const handlePointerDown = () => {
      lastPointerTouchMs = performance.now();
    };

    const flushIntervalId = window.setInterval(() => {
      if (pendingStepsBuffer > 0) {
        const delta = pendingStepsBuffer;
        pendingStepsBuffer = 0;
        deltaCallbackRef.current(delta);
      }
    }, 1500);

    const processAccelerationSample = (
      ax: number,
      ay: number,
      az: number,
      includesGravity: boolean
    ) => {
      if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) return;
      markActive();

      const now = performance.now();
      // Ignorar micro-vibraciones al tocar controles en pantalla
      if (now - lastPointerTouchMs < 220) return;

      const mag = Math.hypot(ax, ay, az);
      let rawDyn: number;

      if (!includesGravity) {
        // Sensor lineal con gravedad ya eliminada por hardware: centrar respecto a su media móvil lenta
        if (!gravityInitialized) {
          gravityMag = mag;
          gravityInitialized = true;
          return;
        }
        gravityMag = gravityMag * 0.92 + mag * 0.08;
        rawDyn = mag - gravityMag * 0.55;
      } else {
        if (!gravityInitialized) {
          gravityMag = mag;
          gravityInitialized = true;
          return;
        }
        gravityMag = gravityMag * 0.9 + mag * 0.1;
        rawDyn = mag - gravityMag;
      }

      const filteredDyn = (rawDyn + prevDyn1 + prevDyn2) / 3;
      prevDyn2 = prevDyn1;
      prevDyn1 = rawDyn;

      if (armedForPeak && filteredDyn >= PEAK_THRESHOLD_MPS2) {
        armedForPeak = false;
        const dt = now - lastStepPeakMs;

        if (lastStepPeakMs === 0 || dt > MAX_STEP_INTERVAL_MS) {
          streakSteps = 1;
          streakCommitted = false;
          lastStepPeakMs = now;
        } else if (dt >= MIN_STEP_INTERVAL_MS) {
          streakSteps += 1;
          lastStepPeakMs = now;

          if (!streakCommitted && streakSteps >= CADENCE_WARMUP_STEPS) {
            streakCommitted = true;
            pendingStepsBuffer += streakSteps;
          } else if (streakCommitted) {
            pendingStepsBuffer += 1;
          }
        }
      } else if (!armedForPeak && filteredDyn <= TROUGH_RESET_MPS2) {
        armedForPeak = true;
      }
    };

    // 2. Intentar primero sensor W3C de hardware (50 Hz) en Android / Chromium; si falla o no existe, usar devicemotion
    let w3cSensor: W3CMotionSensorInstance | null = null;
    let usingW3CSensor = false;

    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      if (usingW3CSensor) return;
      const linAcc = event.acceleration;
      if (
        linAcc &&
        linAcc.x !== null &&
        linAcc.y !== null &&
        linAcc.z !== null &&
        (Math.abs(linAcc.x) > 0.001 || Math.abs(linAcc.y) > 0.001 || Math.abs(linAcc.z) > 0.001)
      ) {
        processAccelerationSample(linAcc.x, linAcc.y, linAcc.z, false);
        return;
      }
      const gravAcc = event.accelerationIncludingGravity;
      if (!gravAcc || gravAcc.x === null || gravAcc.y === null || gravAcc.z === null) return;
      processAccelerationSample(gravAcc.x, gravAcc.y, gravAcc.z, true);
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilitySync);
    window.addEventListener('pageshow', handleVisibilitySync);

    const LinearCtor = getLinearAccelerationSensorCtor();
    const AccelCtor = getAccelerometerCtor();
    const ChosenCtor = LinearCtor || AccelCtor;
    const sensorIncludesGravity = !LinearCtor;

    if (ChosenCtor) {
      try {
        const instance = new ChosenCtor({ frequency: 50 });
        const onReading = () => {
          const sx = instance.x;
          const sy = instance.y;
          const sz = instance.z;
          if (typeof sx === 'number' && typeof sy === 'number' && typeof sz === 'number') {
            usingW3CSensor = true;
            processAccelerationSample(sx, sy, sz, sensorIncludesGravity);
          }
        };
        const onError = () => {
          usingW3CSensor = false;
          try {
            instance.stop();
          } catch {
            // Ignorar
          }
        };
        instance.addEventListener('reading', onReading);
        instance.addEventListener('error', onError);
        instance.start();
        w3cSensor = instance;
      } catch {
        usingW3CSensor = false;
      }
    }

    return () => {
      disposed = true;
      window.clearInterval(flushIntervalId);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('devicemotion', handleDeviceMotion);
      document.removeEventListener('visibilitychange', handleVisibilitySync);
      window.removeEventListener('pageshow', handleVisibilitySync);

      if (w3cSensor) {
        try {
          w3cSensor.stop();
        } catch {
          // Ignorar
        }
      }
      if (nativeBridge && typeof nativeBridge.stop === 'function') {
        try {
          void nativeBridge.stop();
        } catch {
          // Ignorar
        }
      }
      if (pendingStepsBuffer > 0) {
        const remaining = pendingStepsBuffer;
        pendingStepsBuffer = 0;
        deltaCallbackRef.current(remaining);
      }
    };
  }, [enabled, isSupported]);

  return {
    isSupported: isSupported && (!needsExplicitMotionPermission() || enabled),
    isReceivingMotion,
  };
}
