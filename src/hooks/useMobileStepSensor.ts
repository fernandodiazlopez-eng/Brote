/**
 * Podómetro automático con sensores físicos del dispositivo:
 * - Si existe puente nativo de podómetro de hardware (`StepCounter` / `ACTIVITY_RECOGNITION` / `CMPedometer`),
 *   sincroniza directamente el contador acumulado del chip incluso al reabrir tras pantalla apagada.
 * - En navegador / PWA utiliza `LinearAccelerationSensor`, `Accelerometer` o `DeviceMotionEvent`
 *   con filtrado paso-alto basado en tiempo real (`dt`) para no atenuar la frecuencia de paso (~1.5–2.2 Hz)
 *   y vacía inmediatamente los pasos pendientes si la pantalla pasa a segundo plano.
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

const PEAK_THRESHOLD_MPS2 = 0.78;
const TROUGH_RESET_MPS2 = -0.06;
const MIN_STEP_INTERVAL_MS = 260; // máx ~230 pasos/min corriendo
const MAX_STEP_INTERVAL_MS = 2150; // mín ~28 pasos/min caminando despacio
const CADENCE_WARMUP_STEPS = 3; // exige 3 pasos rítmicos seguidos para descartar gestos aislados

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
    let baselineMag = 9.81;
    let baselineInitialized = false;
    let lastSamplePerfMs = 0;
    let prevDyn1 = 0;
    let prevDyn2 = 0;
    let armedForPeak = true;
    let lastStepPeakMs = 0;
    let streakSteps = 0;
    let streakCommitted = false;
    let pendingStepsBuffer = 0;
    let lastPointerTouchMs = 0;

    const flushPendingStepsNow = () => {
      if (pendingStepsBuffer > 0) {
        const delta = pendingStepsBuffer;
        pendingStepsBuffer = 0;
        deltaCallbackRef.current(delta);
      }
    };

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
      } else {
        flushPendingStepsNow();
      }
    };

    const handlePageHide = () => {
      flushPendingStepsNow();
    };

    const handlePointerDown = () => {
      lastPointerTouchMs = performance.now();
    };

    const flushIntervalId = window.setInterval(flushPendingStepsNow, 1200);

    const processAccelerationSample = (
      ax: number,
      ay: number,
      az: number,
      includesGravity: boolean
    ) => {
      if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) return;
      markActive();

      const now = performance.now();
      const dtSec =
        lastSamplePerfMs > 0 ? Math.min(0.25, Math.max(0.005, (now - lastSamplePerfMs) / 1000)) : 0.025;
      lastSamplePerfMs = now;

      // Ignorar micro-vibraciones al tocar controles en pantalla
      if (now - lastPointerTouchMs < 200) return;

      const mag = Math.hypot(ax, ay, az);
      if (!baselineInitialized) {
        baselineMag = mag;
        baselineInitialized = true;
        return;
      }

      // Filtro paso-bajo basado en tiempo real (constante ~0.95s) para estimar gravedad/nivel medio
      // sin comerse la onda de paso humano (~0.45s–0.7s) independientemente de si el sensor va a 30Hz o 60Hz
      const tauSec = includesGravity ? 0.95 : 1.15;
      const alpha = dtSec / (tauSec + dtSec);
      baselineMag = baselineMag + alpha * (mag - baselineMag);

      const rawDyn = mag - baselineMag;
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

    // 2. Intentar sensor W3C de hardware (30 Hz universalmente permitido) en Android / Chromium; fallback a devicemotion
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
        (Math.abs(linAcc.x) > 0.005 || Math.abs(linAcc.y) > 0.005 || Math.abs(linAcc.z) > 0.005)
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
    window.addEventListener('pagehide', handlePageHide);

    const LinearCtor = getLinearAccelerationSensorCtor();
    const AccelCtor = getAccelerometerCtor();
    const ChosenCtor = LinearCtor || AccelCtor;
    const sensorIncludesGravity = !LinearCtor;

    if (ChosenCtor) {
      try {
        const instance = new ChosenCtor({ frequency: 30 });
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
      window.removeEventListener('pagehide', handlePageHide);

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
      flushPendingStepsNow();
    };
  }, [enabled, isSupported]);

  return {
    isSupported: isSupported && (!needsExplicitMotionPermission() || enabled),
    isReceivingMotion,
  };
}
