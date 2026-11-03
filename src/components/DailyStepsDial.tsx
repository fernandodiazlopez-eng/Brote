/**
 * Cronógrafo circular interactivo de pasos diarios (estilo Nothing OS × Cyberpunk):
 * - Escala radial de 60 marcas técnicas con iluminación progresiva.
 * - Permite girar el anillo con el dedo o tocar el centro para escribir la cifra exacta.
 * - Permite editar el objetivo diario de pasos tocando el límite superior.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Edit3 } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { XpFormulas } from '../types';
import { calculateStepsXp, KM_PER_STEP } from '../utils/progressionRules';

interface DailyStepsDialProps {
  activeDateIso: string;
  isSelectedToday: boolean;
  isSelectedPast: boolean;
  savedSteps: number;
  stepGoal: number;
  xpFormulas: XpFormulas;
  onUpdateDaySteps: (dateIso: string, nextSteps: number) => void;
  onUpdateStepGoal: (newGoal: number) => void;
}

const DIAL_SIZE = 224;
const DIAL_CENTER = DIAL_SIZE / 2;
const DIAL_RADIUS = 82;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;
const TICK_COUNT = 60;

const CHRONO_TICKS = Array.from({ length: TICK_COUNT }, (_, i) => {
  const rad = (i * (360 / TICK_COUNT) * Math.PI) / 180 - Math.PI / 2;
  const isCardinal = i % 15 === 0;
  const isMajor = i % 5 === 0;
  const innerRadius = isCardinal ? 93.5 : isMajor ? 95.5 : 98;
  const outerRadius = 102.5;
  return {
    index: i,
    threshold: i / TICK_COUNT,
    isCardinal,
    isMajor,
    x1: Number((DIAL_CENTER + innerRadius * Math.cos(rad)).toFixed(2)),
    y1: Number((DIAL_CENTER + innerRadius * Math.sin(rad)).toFixed(2)),
    x2: Number((DIAL_CENTER + outerRadius * Math.cos(rad)).toFixed(2)),
    y2: Number((DIAL_CENTER + outerRadius * Math.sin(rad)).toFixed(2)),
  };
});

function computeDialStepsFromPointer(
  clientX: number,
  clientY: number,
  centerX: number,
  centerY: number,
  previousSteps: number,
  maxSteps: number
): number {
  const dx = clientX - centerX;
  const dy = clientY - centerY;

  let angleRad = Math.atan2(dx, -dy);
  if (angleRad < 0) angleRad += 2 * Math.PI;

  const rawRatio = angleRad / (2 * Math.PI);
  const previousRatio = Math.min(1, previousSteps / Math.max(1, maxSteps));

  // Evitar salto brusco entre el 100% y el 0% al cruzar las 12 en punto
  if (previousRatio > 0.82 && rawRatio < 0.25) return maxSteps;
  if (previousRatio < 0.18 && rawRatio > 0.75) return 0;

  const stepIncrement = maxSteps >= 5_000 ? 50 : 10;
  return Math.round((rawRatio * maxSteps) / stepIncrement) * stepIncrement;
}

export const DailyStepsDial: React.FC<DailyStepsDialProps> = React.memo(({
  activeDateIso,
  isSelectedToday,
  isSelectedPast,
  savedSteps,
  stepGoal,
  xpFormulas,
  onUpdateDaySteps,
  onUpdateStepGoal,
}) => {
  const { locale, t } = useI18n();
  const safeGoal = Math.max(500, stepGoal);
  const safeSavedSteps = Math.max(0, savedSteps);

  const [isEditingSavedSteps, setIsEditingSavedSteps] = useState(false);
  const [draftSteps, setDraftSteps] = useState<number>(safeSavedSteps);
  const [hasModifiedDraft, setHasModifiedDraft] = useState(false);

  const [isTypingExactSteps, setIsTypingExactSteps] = useState(false);
  const [exactStepsInput, setExactStepsInput] = useState('');

  const [isDraggingRing, setIsDraggingRing] = useState(false);
  const [dragCeilingSteps, setDragCeilingSteps] = useState<number>(safeGoal);

  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const svgRef = useRef<SVGSVGElement | null>(null);
  const cachedCenterRef = useRef<{ cx: number; cy: number } | null>(null);

  useEffect(() => {
    setDraftSteps(safeSavedSteps);
    setHasModifiedDraft(false);
    setIsEditingSavedSteps(false);
    setIsTypingExactSteps(false);
    setIsEditingGoal(false);
    setIsDraggingRing(false);
    cachedCenterRef.current = null;
  }, [activeDateIso, safeSavedSteps, safeGoal]);

  const isDialInteractive =
    isSelectedToday && (safeSavedSteps === 0 || isEditingSavedSteps);
  const showConfirmButtons =
    isSelectedToday && (isEditingSavedSteps || (safeSavedSteps === 0 && hasModifiedDraft));
  const showEditButton =
    isSelectedToday && safeSavedSteps > 0 && !isEditingSavedSteps;

  const typedPreviewSteps =
    isDialInteractive && isTypingExactSteps
      ? exactStepsInput === ''
        ? 0
        : Math.min(200_000, parseInt(exactStepsInput, 10) || 0)
      : null;

  const displayedSteps = isDialInteractive ? draftSteps : safeSavedSteps;
  const liveSteps = typedPreviewSteps !== null ? typedPreviewSteps : displayedSteps;
  const dynamicGoal = Math.max(safeGoal, liveSteps);
  const activeStepLimit = isDraggingRing ? Math.max(dragCeilingSteps, draftSteps) : dynamicGoal;

  const displayedStepsXp = useMemo(
    () => calculateStepsXp(liveSteps, xpFormulas),
    [liveSteps, xpFormulas]
  );

  const fillRatio = Math.min(1, liveSteps / Math.max(1, activeStepLimit));
  const dashOffset = DIAL_CIRCUMFERENCE * (1 - fillRatio);

  const thumbAngleRad = fillRatio * 2 * Math.PI - Math.PI / 2;
  const thumbX = DIAL_CENTER + DIAL_RADIUS * Math.cos(thumbAngleRad);
  const thumbY = DIAL_CENTER + DIAL_RADIUS * Math.sin(thumbAngleRad);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDialInteractive || isTypingExactSteps) return;
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const distanceFromCenter = Math.hypot(e.clientX - cx, e.clientY - cy);
    const innerDeadZoneRadius = (rect.width / DIAL_SIZE) * 52;

    if (distanceFromCenter < innerDeadZoneRadius) return;

    cachedCenterRef.current = { cx, cy };
    const ceiling = Math.max(safeGoal, draftSteps);
    setDragCeilingSteps(ceiling);
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingRing(true);

    const updatedSteps = computeDialStepsFromPointer(
      e.clientX,
      e.clientY,
      cx,
      cy,
      draftSteps,
      ceiling
    );
    setDraftSteps((prev) => (prev === updatedSteps ? prev : updatedSteps));
    if (!hasModifiedDraft) setHasModifiedDraft(true);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDialInteractive || !isDraggingRing) return;
    const center = cachedCenterRef.current;
    if (!center) return;

    setDraftSteps((prev) => {
      const updated = computeDialStepsFromPointer(
        e.clientX,
        e.clientY,
        center.cx,
        center.cy,
        prev,
        dragCeilingSteps
      );
      return prev === updated ? prev : updated;
    });
    if (!hasModifiedDraft) setHasModifiedDraft(true);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDraggingRing) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    cachedCenterRef.current = null;
    setIsDraggingRing(false);
  };

  const openExactStepsInput = () => {
    if (!isDialInteractive) return;
    setExactStepsInput(draftSteps === 0 ? '' : String(draftSteps));
    setIsTypingExactSteps(true);
  };

  const handleExactStepsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (digits === '') {
      setExactStepsInput('');
      return;
    }
    setExactStepsInput(String(Math.min(200_000, parseInt(digits, 10))));
  };

  const commitExactStepsInput = () => {
    const parsed = exactStepsInput === '' ? 0 : parseInt(exactStepsInput, 10);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.max(0, Math.min(200_000, parsed));
      setDraftSteps(clamped);
      if (clamped > 0 || isEditingSavedSteps) {
        setHasModifiedDraft(true);
      }
    }
    setIsTypingExactSteps(false);
  };

  const handleConfirmSteps = () => {
    onUpdateDaySteps(activeDateIso, draftSteps);
    setIsEditingSavedSteps(false);
    setHasModifiedDraft(false);
  };

  const handleSliderKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!isDialInteractive || isTypingExactSteps) return;
    let delta: number | null = null;
    const fineStep = e.shiftKey ? 1_000 : 250;

    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      delta = fineStep;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      delta = -fineStep;
    } else if (e.key === 'PageUp') {
      delta = 1_000;
    } else if (e.key === 'PageDown') {
      delta = -1_000;
    } else if (e.key === 'Home') {
      e.preventDefault();
      setDraftSteps(0);
      setHasModifiedDraft(true);
      return;
    } else if (e.key === 'End') {
      e.preventDefault();
      setDraftSteps(activeStepLimit);
      setHasModifiedDraft(true);
      return;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmSteps();
      return;
    }

    if (delta !== null) {
      e.preventDefault();
      setDraftSteps((prev) => Math.max(0, Math.min(200_000, prev + delta!)));
      setHasModifiedDraft(true);
    }
  };

  const openGoalInput = () => {
    if (isSelectedPast) return;
    setGoalInput(String(activeStepLimit));
    setIsEditingGoal(true);
  };

  const handleGoalInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (digits === '') {
      setGoalInput('');
      return;
    }
    setGoalInput(String(Math.min(200_000, parseInt(digits, 10))));
  };

  const commitGoalInput = () => {
    const parsed = parseInt(goalInput, 10);
    if (!Number.isNaN(parsed) && parsed >= 500) {
      onUpdateStepGoal(Math.min(200_000, parsed));
    }
    setIsEditingGoal(false);
  };

  return (
    <section className="lg:col-span-5 sheet-panel ndot-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold uppercase tracking-wide text-fg">{t.steps_title}</h2>

        {!isSelectedPast && isEditingGoal ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitGoalInput();
            }}
            className="inline-flex items-center gap-1"
          >
            <span className="font-mono text-xs text-fg-muted">/</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoFocus
              value={goalInput}
              onChange={handleGoalInputChange}
              onBlur={commitGoalInput}
              aria-label={t.steps_title}
              className="input-field w-24 sm:w-20 px-2 py-1 font-mono text-xs font-bold text-right tabular-nums"
            />
          </form>
        ) : !isSelectedPast ? (
          <button
            type="button"
            onClick={openGoalInput}
            className="btn-quiet min-h-[34px] px-2 font-mono text-xs tabular-nums"
          >
            / {activeStepLimit.toLocaleString(locale)}
          </button>
        ) : (
          <span className="font-mono text-xs text-fg-muted tabular-nums">
            / {activeStepLimit.toLocaleString(locale)}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col items-center justify-center">
        <div className="relative w-[220px] h-[220px] flex items-center justify-center select-none">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleSliderKeyDown}
            tabIndex={isDialInteractive ? 0 : undefined}
            className={`w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full ${
              isDialInteractive ? 'touch-none cursor-grab active:cursor-grabbing' : ''
            }`}
            role={isDialInteractive ? 'slider' : 'img'}
            aria-label={t.steps_title}
            aria-valuemin={isDialInteractive ? 0 : undefined}
            aria-valuemax={isDialInteractive ? activeStepLimit : undefined}
            aria-valuenow={isDialInteractive ? displayedSteps : undefined}
          >
            {/* Escala radial de cronógrafo Nothing de 60 marcas */}
            {CHRONO_TICKS.map((tick) => {
              const isLit = fillRatio > 0 && tick.threshold <= fillRatio + 0.001;
              return (
                <line
                  key={tick.index}
                  x1={tick.x1}
                  y1={tick.y1}
                  x2={tick.x2}
                  y2={tick.y2}
                  stroke={isLit ? 'var(--app-accent-fill)' : 'var(--app-border-strong)'}
                  strokeWidth={tick.isCardinal ? 2 : tick.isMajor ? 1.5 : 1}
                  strokeOpacity={isLit ? 1 : tick.isMajor ? 0.85 : 0.45}
                />
              );
            })}

            {/* Anillo interior punteado de precisión */}
            <circle
              cx={DIAL_CENTER}
              cy={DIAL_CENTER}
              r={68}
              fill="none"
              stroke="var(--app-border-strong)"
              strokeWidth="1"
              strokeDasharray="2 5"
              strokeOpacity="0.6"
            />

            {/* Pista principal */}
            <circle
              cx={DIAL_CENTER}
              cy={DIAL_CENTER}
              r={DIAL_RADIUS}
              fill="none"
              stroke="var(--app-elevated)"
              strokeWidth="8"
            />

            {/* Arco activo con terminación geométrica recta */}
            <circle
              cx={DIAL_CENTER}
              cy={DIAL_CENTER}
              r={DIAL_RADIUS}
              fill="none"
              stroke="var(--app-accent-fill)"
              strokeWidth="8"
              strokeLinecap="butt"
              strokeDasharray={DIAL_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${DIAL_CENTER} ${DIAL_CENTER})`}
            />

            {isDialInteractive && (
              <g transform={`translate(${thumbX} ${thumbY})`}>
                <circle
                  cx={0}
                  cy={0}
                  r={8.5}
                  fill="var(--app-fg)"
                  stroke="var(--app-canvas)"
                  strokeWidth={2}
                />
                <circle
                  cx={0}
                  cy={0}
                  r={3}
                  fill="var(--app-canvas)"
                />
              </g>
            )}
          </svg>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {isDialInteractive && isTypingExactSteps ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitExactStepsInput();
                }}
                className="pointer-events-auto flex flex-col items-center"
              >
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoFocus
                  value={exactStepsInput}
                  onChange={handleExactStepsChange}
                  onBlur={commitExactStepsInput}
                  aria-label={t.steps_title}
                  className="input-field w-28 text-center font-mono text-2xl font-bold py-1.5 px-2 tabular-nums"
                />
              </form>
            ) : isDialInteractive ? (
              <button
                type="button"
                onClick={openExactStepsInput}
                className="pointer-events-auto min-h-[54px] px-3 rounded-[4px] flex flex-col items-center justify-center hover:bg-elevated/70 transition cursor-pointer"
              >
                <span className="font-mono text-3xl font-bold tracking-tight text-fg tabular-nums">
                  {displayedSteps.toLocaleString(locale)}
                </span>
                <span className="text-[11px] font-mono text-fg-muted tabular-nums mt-0.5">
                  {(displayedSteps * KM_PER_STEP).toFixed(1)} {t.steps_km_unit}
                  {displayedStepsXp > 0 && (
                    <span className="text-accent font-semibold">
                      {' '}
                      · +{displayedStepsXp} {t.profile_xp_unit}
                    </span>
                  )}
                </span>
              </button>
            ) : (
              <div className="flex flex-col items-center justify-center px-3">
                <span className="font-mono text-3xl font-bold tracking-tight text-fg tabular-nums">
                  {displayedSteps.toLocaleString(locale)}
                </span>
                <span className="text-[11px] font-mono text-fg-muted tabular-nums mt-0.5">
                  {(displayedSteps * KM_PER_STEP).toFixed(1)} {t.steps_km_unit}
                  {displayedStepsXp > 0 && (
                    <span className="text-accent font-semibold">
                      {' '}
                      · +{displayedStepsXp} {t.profile_xp_unit}
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {showConfirmButtons && (
          <div className="mt-3 flex items-center justify-center gap-2 w-full max-w-[240px]">
            {isEditingSavedSteps && (
              <button
                type="button"
                onClick={() => {
                  setDraftSteps(safeSavedSteps);
                  setIsEditingSavedSteps(false);
                  setHasModifiedDraft(false);
                }}
                className="btn-secondary min-h-[42px] px-3.5 text-xs whitespace-nowrap"
              >
                {t.common_cancel}
              </button>
            )}
            <button
              type="button"
              onClick={handleConfirmSteps}
              className="btn-primary flex-1 min-h-[42px] px-4 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{t.steps_confirm_btn}</span>
            </button>
          </div>
        )}

        {showEditButton && (
          <button
            type="button"
            onClick={() => {
              setDraftSteps(safeSavedSteps);
              setIsEditingSavedSteps(true);
            }}
            className="btn-secondary mt-3 min-h-[40px] px-4 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Edit3 className="w-3.5 h-3.5 shrink-0" />
            <span>{t.common_edit}</span>
          </button>
        )}
      </div>
    </section>
  );
});
