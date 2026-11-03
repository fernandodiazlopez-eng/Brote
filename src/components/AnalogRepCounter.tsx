/**
 * Contador de repeticiones (00 a 99) con funcionamiento mecánico de rodillos (estilo analógico)
 * pero integrado al 100% en la estética Nothing OS × Cyberpunk y tipografía digital de Upgrade:
 * - Dos ruedas numéricas verticales (decenas y unidades) que giran suavemente al sumar (+1),
 *   al reiniciar a 00 o al deslizar/girar directamente cada rueda con el dedo o el ratón.
 */

import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';

interface AnalogRepCounterProps {
  value: number;
  label: string;
  resetLabel: string;
  onIncrement: () => void;
  onReset: () => void;
  onChangeValue: (nextValue: number) => void;
}

// Índices 0..13:
// - slot 1 ('9') == slot 11 ('9') para giro continuo hacia atrás (0 -> 9)
// - slot 12 ('0') == slot 2 ('0') para giro continuo hacia adelante (9 -> 0)
const DRUM_STRIP_DIGITS = [8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1] as const;

const SLOT_CLASS_BY_INDEX: Record<number, string> = {
  1: 'rep-drum-slot-1',
  2: 'rep-drum-slot-2',
  3: 'rep-drum-slot-3',
  4: 'rep-drum-slot-4',
  5: 'rep-drum-slot-5',
  6: 'rep-drum-slot-6',
  7: 'rep-drum-slot-7',
  8: 'rep-drum-slot-8',
  9: 'rep-drum-slot-9',
  10: 'rep-drum-slot-10',
  11: 'rep-drum-slot-11',
  12: 'rep-drum-slot-12',
};

const DRAG_STEP_PX = 20;

interface DrumRenderState {
  slot: number;
  mode: 'roll' | 'rewind' | 'snap';
}

interface RepDrumWheelProps {
  digit: number;
  direction: 1 | -1;
  rewindSignal: number;
  isActive: boolean;
  ariaLabel: string;
  onStepWheel: (stepDelta: 1 | -1) => void;
}

const RepDrumWheel: React.FC<RepDrumWheelProps> = ({
  digit,
  direction,
  rewindSignal,
  isActive,
  ariaLabel,
  onStepWheel,
}) => {
  const clampedDigit = Math.max(0, Math.min(9, digit));
  const [renderState, setRenderState] = useState<DrumRenderState>(() => ({
    slot: clampedDigit + 2,
    mode: 'snap',
  }));

  const slotRef = useRef<number>(clampedDigit + 2);
  const prevDigitRef = useRef<number>(clampedDigit);
  const prevRewindRef = useRef<number>(rewindSignal);
  const snapTimerRef = useRef<number | null>(null);
  const rafOuterRef = useRef<number | null>(null);
  const rafInnerRef = useRef<number | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragAnchorYRef = useRef<number>(0);

  const commitRenderState = (next: DrumRenderState) => {
    slotRef.current = next.slot;
    setRenderState(next);
  };

  useEffect(() => {
    return () => {
      if (snapTimerRef.current !== null) window.clearTimeout(snapTimerRef.current);
      if (rafOuterRef.current !== null) window.cancelAnimationFrame(rafOuterRef.current);
      if (rafInnerRef.current !== null) window.cancelAnimationFrame(rafInnerRef.current);
    };
  }, []);

  useEffect(() => {
    const prevDigit = prevDigitRef.current;
    const isRewind = rewindSignal !== prevRewindRef.current;
    prevDigitRef.current = clampedDigit;
    prevRewindRef.current = rewindSignal;

    if (prevDigit === clampedDigit && !isRewind) {
      return;
    }

    if (snapTimerRef.current !== null) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
    if (rafOuterRef.current !== null) {
      window.cancelAnimationFrame(rafOuterRef.current);
      rafOuterRef.current = null;
    }
    if (rafInnerRef.current !== null) {
      window.cancelAnimationFrame(rafInnerRef.current);
      rafInnerRef.current = null;
    }

    const normalTargetSlot = clampedDigit + 2;

    if (isRewind) {
      if (slotRef.current === 12 && clampedDigit === 0) {
        commitRenderState({ slot: 2, mode: 'snap' });
      } else {
        commitRenderState({ slot: normalTargetSlot, mode: 'rewind' });
      }
      return;
    }

    const currentSlot = slotRef.current;

    // Si estaba en una ranura puente (12 o 1) y llega otra pulsación rápida antes de 195ms,
    // ajustamos primero a su ranura equivalente real (2 u 11) sin transición y luego rodamos.
    if (currentSlot === 12 || currentSlot === 1) {
      const canonicalSlot = currentSlot === 12 ? 2 : 11;
      commitRenderState({ slot: canonicalSlot, mode: 'snap' });

      const nextSlot =
        canonicalSlot === 11 && clampedDigit === 0 && direction > 0
          ? 12
          : canonicalSlot === 2 && clampedDigit === 9 && direction < 0
            ? 1
            : normalTargetSlot;

      rafOuterRef.current = window.requestAnimationFrame(() => {
        rafInnerRef.current = window.requestAnimationFrame(() => {
          commitRenderState({ slot: nextSlot, mode: 'roll' });
          if (nextSlot === 12 || nextSlot === 1) {
            snapTimerRef.current = window.setTimeout(() => {
              commitRenderState({ slot: nextSlot === 12 ? 2 : 11, mode: 'snap' });
              snapTimerRef.current = null;
            }, 195);
          }
        });
      });
      return;
    }

    // Giro continuo hacia adelante 9 -> 0
    if (prevDigit === 9 && clampedDigit === 0 && direction > 0) {
      commitRenderState({ slot: 12, mode: 'roll' });
      snapTimerRef.current = window.setTimeout(() => {
        commitRenderState({ slot: 2, mode: 'snap' });
        snapTimerRef.current = null;
      }, 195);
      return;
    }

    // Giro continuo hacia atrás 0 -> 9
    if (prevDigit === 0 && clampedDigit === 9 && direction < 0) {
      commitRenderState({ slot: 1, mode: 'roll' });
      snapTimerRef.current = window.setTimeout(() => {
        commitRenderState({ slot: 11, mode: 'snap' });
        snapTimerRef.current = null;
      }, 195);
      return;
    }

    commitRenderState({ slot: normalTargetSlot, mode: 'roll' });
  }, [clampedDigit, direction, rewindSignal]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragPointerIdRef.current = e.pointerId;
    dragAnchorYRef.current = e.clientY;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignorar si el navegador no soporta captura de puntero
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragPointerIdRef.current !== e.pointerId) return;
    const deltaY = e.clientY - dragAnchorYRef.current;

    if (Math.abs(deltaY) < DRAG_STEP_PX) return;

    // Arrastrar hacia arriba gira el rodillo hacia el siguiente número (+1), hacia abajo retrocede (-1)
    const steps = Math.trunc(Math.abs(deltaY) / DRAG_STEP_PX);
    const stepDirection: 1 | -1 = deltaY < 0 ? 1 : -1;

    dragAnchorYRef.current += (deltaY < 0 ? -1 : 1) * steps * DRAG_STEP_PX;
    for (let i = 0; i < steps; i += 1) {
      onStepWheel(stepDirection);
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragPointerIdRef.current !== e.pointerId) return;
    dragPointerIdRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignorar errores de liberación
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) < 4) return;
    e.preventDefault();
    onStepWheel(e.deltaY > 0 ? 1 : -1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      onStepWheel(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onStepWheel(-1);
    }
  };

  const transitionClass =
    renderState.mode === 'roll'
      ? 'rep-drum-roll'
      : renderState.mode === 'rewind'
        ? 'rep-drum-rewind'
        : 'rep-drum-snap';

  const slotClass = SLOT_CLASS_BY_INDEX[renderState.slot] || 'rep-drum-slot-2';

  return (
    <div
      role="spinbutton"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={9}
      aria-valuenow={clampedDigit}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      className="rep-drum-wheel relative overflow-hidden select-none cursor-ns-resize focus-visible:outline-none focus-visible:bg-elevated/60"
    >
      <div
        aria-hidden="true"
        className={`rep-drum-strip flex flex-col items-center font-mono tabular-nums ${transitionClass} ${slotClass}`}
      >
        {DRUM_STRIP_DIGITS.map((num, idx) => (
          <span
            key={idx}
            className={`h-[26px] leading-[26px] text-2xl sm:text-[26px] font-bold transition-colors ${
              isActive ? 'text-accent' : 'text-fg'
            }`}
          >
            {num}
          </span>
        ))}
      </div>

      {/* Líneas guía sutiles de la fila central y desvanecido superior/inferior con el color de la app */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[13px] h-px bg-subtle/80"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-[13px] h-px bg-subtle/80"
      />
      <div
        aria-hidden="true"
        className="rep-drum-fade pointer-events-none absolute inset-0"
      />
    </div>
  );
};

export const AnalogRepCounter: React.FC<AnalogRepCounterProps> = React.memo(({
  value,
  label,
  resetLabel,
  onIncrement,
  onReset,
  onChangeValue,
}) => {
  const safeValue = ((Math.round(value) % 100) + 100) % 100;
  const tensDigit = Math.floor(safeValue / 10);
  const unitsDigit = safeValue % 10;

  const [direction, setDirection] = useState<1 | -1>(1);
  const [rewindSignal, setRewindSignal] = useState(0);

  const triggerSubtleHaptic = (pattern: number | number[] = 10) => {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignorar en dispositivos sin vibración
    }
  };

  const handlePressIncrement = () => {
    setDirection(1);
    triggerSubtleHaptic(10);
    onIncrement();
  };

  const handlePressReset = () => {
    if (safeValue === 0) return;
    setDirection(-1);
    setRewindSignal((prev) => prev + 1);
    triggerSubtleHaptic([14, 20, 14]);
    onReset();
  };

  const handleStepTens = (stepDelta: 1 | -1) => {
    setDirection(stepDelta);
    triggerSubtleHaptic(8);
    const nextTens = (tensDigit + stepDelta + 10) % 10;
    onChangeValue(nextTens * 10 + unitsDigit);
  };

  const handleStepUnits = (stepDelta: 1 | -1) => {
    setDirection(stepDelta);
    triggerSubtleHaptic(8);
    const nextTotal = (safeValue + stepDelta + 100) % 100;
    onChangeValue(nextTotal);
  };

  const isActive = safeValue > 0;

  return (
    <section
      aria-label={label}
      className="sheet-panel ndot-surface px-4 py-3 sm:px-5 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Ventana de rodillos (00 - 99) con el mismo acabado y tipografía digital que el cronómetro */}
        <div className="rounded-[4px] bg-canvas/85 border border-subtle inline-flex items-center divide-x divide-subtle overflow-hidden shrink-0">
          <RepDrumWheel
            digit={tensDigit}
            direction={direction}
            rewindSignal={rewindSignal}
            isActive={isActive}
            ariaLabel={`${label} ×10`}
            onStepWheel={handleStepTens}
          />
          <RepDrumWheel
            digit={unitsDigit}
            direction={direction}
            rewindSignal={rewindSignal}
            isActive={isActive}
            ariaLabel={`${label} ×1`}
            onStepWheel={handleStepUnits}
          />
        </div>

        <div className="min-w-0 hidden sm:block">
          <p className="font-display text-xs font-bold uppercase tracking-wider text-fg leading-none truncate">
            {label}
          </p>
          <p className="font-mono text-[11px] text-fg-muted tabular-nums mt-1">
            00–99
          </p>
        </div>

        <p className="sm:hidden font-display text-[10px] font-bold uppercase tracking-wider text-fg-muted leading-tight truncate">
          {label}
        </p>
      </div>

      {/* Botones estándar Nothing × Cyberpunk idénticos al resto de la app */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handlePressReset}
          disabled={!isActive}
          aria-label={`${resetLabel} ${label}`}
          className="btn-secondary min-h-[44px] px-3 py-1.5 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:pointer-events-none"
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          <span>{resetLabel}</span>
        </button>

        <button
          type="button"
          onClick={handlePressIncrement}
          aria-label={`+1 ${label}`}
          className="btn-primary min-h-[44px] min-w-[60px] sm:min-w-[68px] px-4 py-1.5 font-mono text-sm font-bold flex items-center justify-center whitespace-nowrap"
        >
          +1
        </button>
      </div>
    </section>
  );
});
