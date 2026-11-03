/**
 * Podómetro en tiempo real mediante el acelerómetro físico del móvil (`DeviceMotionEvent`):
 * - Filtra la gravedad terrestre con media exponencial independiente de la orientación del móvil.
 * - Descarta toques en pantalla y vibraciones aisladas exigiendo cadencia rítmica humana (4 pasos seguidos).
 * - Acumula únicamente pasos reales detectados mientras la app está abierta.
 */

import { useEffect, useRef, useState } from 'react';
import { isMotionSensorSupported, needsExplicitMotionPermission } from '../utils/mobileHealthSync';

interface UseMobileStepSensorOptions {
  enabled: boolean;
  onStepsDetected: (deltaSteps: number) => void;
}

export interface MobileStepSensorStatus {
  isSupported: boolean;
  isReceivingMotion: boolean;
}

const PEAK_THRESHOLD_MPS2 = 1.25;
const TROUGH_RESET_MPS2 = 0.42;
const MIN_STEP_INTERVAL_MS = 280; // máx ~214 pasos/min corriendo
const MAX_STEP_INTERVAL_MS = 2150; // mín ~28 pasos/min caminando despacio
const CADENCE_WARMUP_STEPS = 4; // exige 4 pasos rítmicos seguidos antes de empezar a contabilizar

export function useMobileStepSensor({
  enabled,
  onStepsDetected,
}: UseMobileStepSensorOptions): MobileStepSensorStatus {
  const [isReceivingMotion, setIsReceivingMotion] = useState(false);
  const callbackRef = useRef(onStepsDetected);
  callbackRef.current = onStepsDetected;

  const isSupported = isMotionSensorSupported();

  useEffect(() => {
    if (!enabled || !isSupported || typeof window === 'undefined') {
      setIsReceivingMotion(false);
      return;
    }

    // En iOS, si no se ha concedido previamente en gesto de usuario, no forzamos popup automático
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

    const handlePointerDown = () => {
      lastPointerTouchMs = performance.now();
    };

    const flushIntervalId = window.setInterval(() => {
      if (pendingStepsBuffer > 0) {
        const delta = pendingStepsBuffer;
        pendingStepsBuffer = 0;
        callbackRef.current(delta);
      }
    }, 1800);

    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const ax = acc.x;
      const ay = acc.y;
      const az = acc.z;
      if (ax === null || ay === null || az === null) return;
      if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) return;

      if (!hasSeenRealSample) {
        hasSeenRealSample = true;
        setIsReceivingMotion(true);
      }

      const now = performance.now();
      // Ignorar micro-picos provocados al tocar botones en la pantalla
      if (now - lastPointerTouchMs < 240) return;

      const mag = Math.hypot(ax, ay, az);
      if (!gravityInitialized) {
        gravityMag = mag;
        gravityInitialized = true;
        return;
      }

      gravityMag = gravityMag * 0.9 + mag * 0.1;
      const rawDyn = mag - gravityMag;
      const filteredDyn = (rawDyn + prevDyn1 + prevDyn2) / 3;
      prevDyn2 = prevDyn1;
      prevDyn1 = rawDyn;

      if (armedForPeak && filteredDyn >= PEAK_THRESHOLD_MPS2) {
        armedForPeak = false;
        const dt = now - lastStepPeakMs;

        if (lastStepPeakMs === 0 || dt > MAX_STEP_INTERVAL_MS) {
          // Primer paso potencial tras estar quieto
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

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });

    return () => {
      window.clearInterval(flushIntervalId);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('devicemotion', handleDeviceMotion);
      if (pendingStepsBuffer > 0) {
        const remaining = pendingStepsBuffer;
        pendingStepsBuffer = 0;
        callbackRef.current(remaining);
      }
    };
  }, [enabled, isSupported]);

  return {
    isSupported: isSupported && (!needsExplicitMotionPermission() || enabled),
    isReceivingMotion,
  };
}
