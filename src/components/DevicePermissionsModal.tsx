/**
 * Diálogo informativo único de permisos opcionales del móvil:
 * - Se muestra una única vez al usuario tras completar la bienvenida inicial.
 * - Explica con claridad para qué sirve cada permiso (temporizador con pantalla apagada / fuera de la app
 *   y lectura de pasos/actividad del móvil) e indica explícitamente que son opcionales.
 * - Ejecuta las solicitudes nativas del navegador dentro del gesto directo de clic para compatibilidad con iOS y Android.
 */

import React, { useState } from 'react';
import { Activity, BellRing, Check, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import {
  isNotificationSupported,
  requestTimerNotificationPermission,
} from '../utils/audioEffects';
import {
  isMotionSensorSupported,
  requestMotionSensorPermission,
} from '../utils/mobileHealthSync';

interface DevicePermissionsModalProps {
  isOpen: boolean;
  onComplete: (result: {
    timerNotificationsEnabled: boolean;
    motionStepsEnabled: boolean;
  }) => void;
}

export const DevicePermissionsModal: React.FC<DevicePermissionsModalProps> = ({
  isOpen,
  onComplete,
}) => {
  const { t } = useI18n();
  const notifSupported = isNotificationSupported();
  const motionSupported = isMotionSensorSupported();

  const [wantTimerNotifs, setWantTimerNotifs] = useState<boolean>(true);
  const [wantMotionSteps, setWantMotionSteps] = useState<boolean>(true);
  const [isRequesting, setIsRequesting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSkipOptional = () => {
    if (isRequesting) return;
    onComplete({
      timerNotificationsEnabled: false,
      motionStepsEnabled: false,
    });
  };

  const handleAcceptSelected = async () => {
    if (isRequesting) return;
    setIsRequesting(true);

    let grantedTimerNotifs = false;
    let grantedMotionSteps = false;

    try {
      // Ejecutar primero el permiso de movimiento dentro del gesto táctil (requisito estricto en iOS Safari)
      if (wantMotionSteps && motionSupported) {
        const motionRes = await requestMotionSensorPermission();
        grantedMotionSteps = motionRes === 'granted';
      }

      if (wantTimerNotifs && notifSupported) {
        const notifRes = await requestTimerNotificationPermission();
        grantedTimerNotifs = notifRes === 'granted';
      }
    } finally {
      setIsRequesting(false);
      onComplete({
        timerNotificationsEnabled: grantedTimerNotifs,
        motionStepsEnabled: grantedMotionSteps,
      });
    }
  };

  const hasAnySelected = wantTimerNotifs || wantMotionSteps;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-permissions-heading"
    >
      <div className="w-full max-w-md max-h-[88vh] overflow-y-auto modal-sheet sheet-panel ndot-surface rounded-md border border-accent-fill p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-subtle">
          <div className="space-y-1 min-w-0">
            <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-accent">
              {t.perm_optional_tag}
            </p>
            <h2
              id="device-permissions-heading"
              className="font-display text-lg font-bold uppercase tracking-wide text-fg"
            >
              {t.perm_modal_title}
            </h2>
          </div>

          <button
            type="button"
            onClick={handleSkipOptional}
            aria-label={t.common_close}
            className="btn-quiet min-h-[36px] min-w-[36px] -mr-1.5 -mt-1 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm leading-relaxed text-fg-secondary">
          {t.perm_modal_intro}
        </p>

        <div className="space-y-2.5">
          {/* Opción 1: Temporizador en segundo plano / pantalla apagada */}
          <button
            type="button"
            role="checkbox"
            aria-checked={wantTimerNotifs}
            onClick={() => setWantTimerNotifs((prev) => !prev)}
            className={`w-full p-3.5 rounded-[4px] border text-left flex items-start gap-3 transition cursor-pointer ${
              wantTimerNotifs
                ? 'bg-accent-soft border-accent-fill'
                : 'bg-canvas border-subtle'
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 w-5 h-5 rounded-[3px] border flex items-center justify-center shrink-0 ${
                wantTimerNotifs
                  ? 'bg-accent-fill border-accent-fill text-accent-fg'
                  : 'border-strong bg-surface text-transparent'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[2.8]" />
            </span>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <BellRing className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="font-display text-xs sm:text-sm font-bold uppercase tracking-wide text-fg">
                  {t.perm_timer_title}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-fg-secondary">{t.perm_timer_desc}</p>
            </div>
          </button>

          {/* Opción 2: Sensor de pasos y actividad del móvil */}
          <button
            type="button"
            role="checkbox"
            aria-checked={wantMotionSteps}
            onClick={() => setWantMotionSteps((prev) => !prev)}
            className={`w-full p-3.5 rounded-[4px] border text-left flex items-start gap-3 transition cursor-pointer ${
              wantMotionSteps
                ? 'bg-accent-soft border-accent-fill'
                : 'bg-canvas border-subtle'
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 w-5 h-5 rounded-[3px] border flex items-center justify-center shrink-0 ${
                wantMotionSteps
                  ? 'bg-accent-fill border-accent-fill text-accent-fg'
                  : 'border-strong bg-surface text-transparent'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[2.8]" />
            </span>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="font-display text-xs sm:text-sm font-bold uppercase tracking-wide text-fg">
                  {t.perm_motion_title}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-fg-secondary">{t.perm_motion_desc}</p>
            </div>
          </button>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row-reverse gap-2">
          <button
            type="button"
            disabled={isRequesting}
            onClick={() => {
              if (!hasAnySelected) {
                handleSkipOptional();
              } else {
                void handleAcceptSelected();
              }
            }}
            className="btn-primary flex-1 min-h-[44px] px-4 py-2 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Check className="w-4 h-4 shrink-0" />
            <span>{hasAnySelected ? t.perm_enable_btn : t.perm_skip_btn}</span>
          </button>

          <button
            type="button"
            disabled={isRequesting}
            onClick={handleSkipOptional}
            className="btn-secondary sm:w-auto min-h-[44px] px-4 py-2 text-xs flex items-center justify-center whitespace-nowrap"
          >
            {t.perm_skip_btn}
          </button>
        </div>
      </div>
    </div>
  );
};
