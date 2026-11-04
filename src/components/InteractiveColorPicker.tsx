/**
 * Selector de color interactivo táctil (Nothing OS × Cyberpunk):
 * - Permite explorar, deslizar y previsualizar cualquier color en móvil y escritorio
 *   sin auto-seleccionarlo al primer toque.
 * - Admite tanto código HEX (#RRGGBB) como código RGB (R, G, B) y canales 0–255.
 * - Solo confirma y aplica el color cuando el usuario pulsa explícitamente «Aplicar».
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  clampRgbByte,
  formatRgbCode,
  HsvColor,
  hsvToRgb,
  parseAnyColorCodeInput,
  rgbColorToHex,
  rgbToHsv,
} from '../data/bugCompanionData';
import { RgbColor } from '../types';

export type ColorCodeFormatMode = 'hex' | 'rgb';

interface InteractiveColorPickerProps {
  appliedColor: RgbColor;
  isAppliedActive?: boolean;
  defaultCodeMode?: ColorCodeFormatMode;
  previewLabel: string;
  currentLabel: string;
  hintText: string;
  placeholder: string;
  applyLabel: string;
  activeLabel: string;
  errorText: string;
  onDraftColorChange?: (draft: RgbColor) => void;
  onApplyColor: (selected: RgbColor) => void;
}

function areSameRgb(a: RgbColor, b: RgbColor): boolean {
  return (
    clampRgbByte(a.r) === clampRgbByte(b.r) &&
    clampRgbByte(a.g) === clampRgbByte(b.g) &&
    clampRgbByte(a.b) === clampRgbByte(b.b)
  );
}

export const InteractiveColorPicker: React.FC<InteractiveColorPickerProps> = ({
  appliedColor,
  isAppliedActive = true,
  defaultCodeMode = 'hex',
  previewLabel,
  currentLabel,
  hintText,
  placeholder,
  applyLabel,
  activeLabel,
  errorText,
  onDraftColorChange,
  onApplyColor,
}) => {
  const inputId = useId();
  const svCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hueCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingSvRef = useRef<boolean>(false);
  const isDraggingHueRef = useRef<boolean>(false);

  const [codeMode, setCodeMode] = useState<ColorCodeFormatMode>(defaultCodeMode);
  const [hsv, setHsv] = useState<HsvColor>(() => rgbToHsv(appliedColor));
  const [draftRgb, setDraftRgb] = useState<RgbColor>(() => ({
    r: clampRgbByte(appliedColor.r),
    g: clampRgbByte(appliedColor.g),
    b: clampRgbByte(appliedColor.b),
  }));
  const [codeInput, setCodeInput] = useState<string>(() =>
    defaultCodeMode === 'rgb'
      ? formatRgbCode(appliedColor)
      : rgbColorToHex(appliedColor).toUpperCase()
  );
  const [showError, setShowError] = useState<boolean>(false);

  const formatForMode = useCallback((rgb: RgbColor, mode: ColorCodeFormatMode): string => {
    return mode === 'rgb' ? formatRgbCode(rgb) : rgbColorToHex(rgb).toUpperCase();
  }, []);

  // Sincronizar cuando cambia el color aplicado externo (p. ej. al cambiar de gorro)
  useEffect(() => {
    if (isDraggingSvRef.current || isDraggingHueRef.current) return;
    const cleanApplied: RgbColor = {
      r: clampRgbByte(appliedColor.r),
      g: clampRgbByte(appliedColor.g),
      b: clampRgbByte(appliedColor.b),
    };
    setDraftRgb(cleanApplied);
    setHsv((prev) => {
      const next = rgbToHsv(cleanApplied);
      return {
        h: next.s < 0.01 ? prev.h : next.h,
        s: next.s,
        v: next.v,
      };
    });
    setCodeInput(formatForMode(cleanApplied, codeMode));
    setShowError(false);
    onDraftColorChange?.(cleanApplied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedColor.r, appliedColor.g, appliedColor.b]);

  const emitDraftUpdate = useCallback(
    (nextRgb: RgbColor, nextHsv: HsvColor, syncInputText = true) => {
      setDraftRgb(nextRgb);
      setHsv(nextHsv);
      if (syncInputText) {
        setCodeInput(formatForMode(nextRgb, codeMode));
      }
      setShowError(false);
      onDraftColorChange?.(nextRgb);
    },
    [codeMode, formatForMode, onDraftColorChange]
  );

  // Dibujar matriz 2D de Saturación / Brillo + retícula táctil
  const drawSvCanvas = useCallback(() => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(180, Math.round(rect.width || 280));
    const cssH = Math.max(96, Math.round(rect.height || 124));
    const dpr = typeof window !== 'undefined' ? Math.min(2.5, window.devicePixelRatio || 1) : 1;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    const pureHue = hsvToRgb(hsv.h, 1, 1);
    ctx.fillStyle = `rgb(${pureHue.r}, ${pureHue.g}, ${pureHue.b})`;
    ctx.fillRect(0, 0, cssW, cssH);

    const whiteGrad = ctx.createLinearGradient(0, 0, cssW, 0);
    whiteGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = whiteGrad;
    ctx.fillRect(0, 0, cssW, cssH);

    const blackGrad = ctx.createLinearGradient(0, 0, 0, cssH);
    blackGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    blackGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = blackGrad;
    ctx.fillRect(0, 0, cssW, cssH);

    const cx = Math.max(7, Math.min(cssW - 7, hsv.s * cssW));
    const cy = Math.max(7, Math.min(cssH - 7, (1 - hsv.v) * cssH));

    // Cursor cuadrado de alto contraste estilo Nothing OS
    ctx.fillStyle = `rgb(${draftRgb.r}, ${draftRgb.g}, ${draftRgb.b})`;
    ctx.fillRect(cx - 6, cy - 6, 12, 12);

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#08080a';
    ctx.strokeRect(cx - 7, cy - 7, 14, 14);

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(cx - 5.5, cy - 5.5, 11, 11);

    ctx.restore();
  }, [hsv.h, hsv.s, hsv.v, draftRgb.r, draftRgb.g, draftRgb.b]);

  // Dibujar barra horizontal de Tono (Hue 0°..360°) + cursor
  const drawHueCanvas = useCallback(() => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(180, Math.round(rect.width || 280));
    const cssH = Math.max(20, Math.round(rect.height || 24));
    const dpr = typeof window !== 'undefined' ? Math.min(2.5, window.devicePixelRatio || 1) : 1;
    const targetW = Math.round(cssW * dpr);
    const targetH = Math.round(cssH * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    const hueGrad = ctx.createLinearGradient(0, 0, cssW, 0);
    hueGrad.addColorStop(0, '#ff0000');
    hueGrad.addColorStop(1 / 6, '#ffff00');
    hueGrad.addColorStop(2 / 6, '#00ff00');
    hueGrad.addColorStop(3 / 6, '#00ffff');
    hueGrad.addColorStop(4 / 6, '#0000ff');
    hueGrad.addColorStop(5 / 6, '#ff00ff');
    hueGrad.addColorStop(1, '#ff0000');
    ctx.fillStyle = hueGrad;
    ctx.fillRect(0, 0, cssW, cssH);

    const hx = Math.max(5, Math.min(cssW - 5, (hsv.h / 360) * cssW));
    const pureHue = hsvToRgb(hsv.h, 1, 1);

    ctx.fillStyle = `rgb(${pureHue.r}, ${pureHue.g}, ${pureHue.b})`;
    ctx.fillRect(hx - 4, 1, 8, cssH - 2);

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#08080a';
    ctx.strokeRect(hx - 5, 1, 10, cssH - 2);

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(hx - 3.5, 2.5, 7, cssH - 5);

    ctx.restore();
  }, [hsv.h]);

  useEffect(() => {
    drawSvCanvas();
    drawHueCanvas();
  }, [drawSvCanvas, drawHueCanvas]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      drawSvCanvas();
      drawHueCanvas();
    });
    if (svCanvasRef.current) ro.observe(svCanvasRef.current);
    if (hueCanvasRef.current) ro.observe(hueCanvasRef.current);
    return () => ro.disconnect();
  }, [drawSvCanvas, drawHueCanvas]);

  const updateSvFromPointer = (clientX: number, clientY: number) => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nextS = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextV = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
    const nextHsv: HsvColor = { h: hsv.h, s: nextS, v: nextV };
    const nextRgb = hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v);
    emitDraftUpdate(nextRgb, nextHsv, true);
  };

  const updateHueFromPointer = (clientX: number) => {
    const canvas = hueCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextH = Math.min(359.9, ratio * 360);
    // Si el borrador estaba en blanco/negro puro, dar saturación/brillo visibles al mover el tono
    const effectiveS = hsv.s < 0.03 ? 0.85 : hsv.s;
    const effectiveV = hsv.v < 0.06 ? 0.92 : hsv.v;
    const nextHsv: HsvColor = { h: nextH, s: effectiveS, v: effectiveV };
    const nextRgb = hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v);
    emitDraftUpdate(nextRgb, nextHsv, true);
  };

  const handleSwitchMode = (nextMode: ColorCodeFormatMode) => {
    setCodeMode(nextMode);
    setCodeInput(formatForMode(draftRgb, nextMode));
    setShowError(false);
  };

  const handleChannelInputChange = (channel: 'r' | 'g' | 'b', rawVal: string) => {
    const digits = rawVal.replace(/\D/g, '').slice(0, 3);
    const numeric = digits === '' ? 0 : clampRgbByte(Number.parseInt(digits, 10));
    const nextRgb: RgbColor = {
      ...draftRgb,
      [channel]: numeric,
    };
    const nextHsv = rgbToHsv(nextRgb);
    emitDraftUpdate(
      nextRgb,
      {
        h: nextHsv.s < 0.01 ? hsv.h : nextHsv.h,
        s: nextHsv.s,
        v: nextHsv.v,
      },
      true
    );
  };

  const handleCodeInputChange = (rawVal: string) => {
    setCodeInput(rawVal);
    const parsed = parseAnyColorCodeInput(rawVal);
    if (parsed) {
      const nextHsv = rgbToHsv(parsed);
      emitDraftUpdate(
        parsed,
        {
          h: nextHsv.s < 0.01 ? hsv.h : nextHsv.h,
          s: nextHsv.s,
          v: nextHsv.v,
        },
        false
      );
    }
  };

  const handleCommitColor = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const parsedFromText = parseAnyColorCodeInput(codeInput);
    if (!parsedFromText) {
      setShowError(true);
      return;
    }
    setShowError(false);
    const cleanRgb: RgbColor = {
      r: clampRgbByte(parsedFromText.r),
      g: clampRgbByte(parsedFromText.g),
      b: clampRgbByte(parsedFromText.b),
    };
    const nextHsv = rgbToHsv(cleanRgb);
    setDraftRgb(cleanRgb);
    setHsv((prev) => ({
      h: nextHsv.s < 0.01 ? prev.h : nextHsv.h,
      s: nextHsv.s,
      v: nextHsv.v,
    }));
    setCodeInput(formatForMode(cleanRgb, codeMode));
    onDraftColorChange?.(cleanRgb);
    onApplyColor(cleanRgb);
  };

  const isAlreadyCommitted = isAppliedActive && areSameRgb(draftRgb, appliedColor) && !showError;
  const appliedHexUpper = rgbColorToHex(appliedColor).toUpperCase();
  const draftHexUpper = rgbColorToHex(draftRgb).toUpperCase();

  return (
    <div className="rounded-[4px] bg-canvas border border-subtle p-3 space-y-2.5">
      {/* Cabecera: Comparativa Actual vs Vista previa + Selector HEX/RGB */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 rounded-[3px] bg-surface border border-subtle px-2 py-1">
            <svg
              viewBox="0 0 28 14"
              className="w-7 h-3.5 rounded-[2px] border border-subtle shrink-0"
              aria-hidden="true"
            >
              <rect
                x={0}
                y={0}
                width={14}
                height={14}
                fill={`rgb(${clampRgbByte(appliedColor.r)}, ${clampRgbByte(appliedColor.g)}, ${clampRgbByte(appliedColor.b)})`}
              />
              <rect
                x={14}
                y={0}
                width={14}
                height={14}
                fill={`rgb(${clampRgbByte(draftRgb.r)}, ${clampRgbByte(draftRgb.g)}, ${clampRgbByte(draftRgb.b)})`}
              />
              <line x1={14} y1={0} x2={14} y2={14} stroke="#08080a" strokeWidth={1} />
            </svg>
            <div className="text-[10px] font-mono leading-tight tabular-nums truncate">
              <span className="text-fg-muted">{currentLabel}: </span>
              <span className="text-fg-secondary">{appliedHexUpper}</span>
              <span className="text-fg-muted"> → </span>
              <span className="text-fg font-bold">{previewLabel}: {draftHexUpper}</span>
            </div>
          </div>
        </div>

        <div className="seg-group grid grid-cols-2 gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => handleSwitchMode('hex')}
            aria-pressed={codeMode === 'hex'}
            className={`seg-btn min-h-[28px] px-2 py-0.5 text-[10px] font-mono uppercase whitespace-nowrap ${
              codeMode === 'hex' ? 'seg-btn-active' : ''
            }`}
          >
            HEX
          </button>
          <button
            type="button"
            onClick={() => handleSwitchMode('rgb')}
            aria-pressed={codeMode === 'rgb'}
            className={`seg-btn min-h-[28px] px-2 py-0.5 text-[10px] font-mono uppercase whitespace-nowrap ${
              codeMode === 'rgb' ? 'seg-btn-active' : ''
            }`}
          >
            RGB
          </button>
        </div>
      </div>

      {/* Área táctil 2D Saturación / Brillo (no confirma al tocar; solo actualiza la vista previa) */}
      <div className="relative w-full h-[124px] rounded-[4px] overflow-hidden border border-subtle touch-none select-none">
        <canvas
          ref={svCanvasRef}
          onPointerDown={(e) => {
            e.preventDefault();
            isDraggingSvRef.current = true;
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Ignorar si el navegador no soporta captura
            }
            updateSvFromPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (!isDraggingSvRef.current) return;
            e.preventDefault();
            updateSvFromPointer(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            isDraggingSvRef.current = false;
            try {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            } catch {
              // Ignorar
            }
          }}
          onPointerCancel={() => {
            isDraggingSvRef.current = false;
          }}
          className="block w-full h-full touch-none select-none cursor-crosshair"
        />
      </div>

      {/* Barra táctil de Tono (Hue 0°..360°) con zona táctil generosa para móvil */}
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          isDraggingHueRef.current = true;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Ignorar
          }
          updateHueFromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!isDraggingHueRef.current) return;
          e.preventDefault();
          updateHueFromPointer(e.clientX);
        }}
        onPointerUp={(e) => {
          isDraggingHueRef.current = false;
          try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          } catch {
            // Ignorar
          }
        }}
        onPointerCancel={() => {
          isDraggingHueRef.current = false;
        }}
        className="min-h-[38px] py-1.5 flex items-center touch-none select-none cursor-ew-resize"
      >
        <canvas
          ref={hueCanvasRef}
          className="block w-full h-[24px] rounded-[4px] border border-subtle pointer-events-none"
        />
      </div>

      {/* Canales numéricos R, G, B opcionales en modo RGB */}
      {codeMode === 'rgb' && (
        <div className="grid grid-cols-3 gap-2">
          {(['r', 'g', 'b'] as const).map((channel) => (
            <div key={channel} className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold uppercase text-fg-muted">
                {channel}
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={String(draftRgb[channel])}
                onChange={(e) => handleChannelInputChange(channel, e.target.value)}
                aria-label={`${channel.toUpperCase()} (0-255)`}
                className="input-field w-full min-h-[38px] pl-6 pr-2 py-1 text-xs font-mono text-right tabular-nums"
              />
            </div>
          ))}
        </div>
      )}

      {/* Entrada de código (#HEX o R, G, B) + botón explícito «Aplicar» */}
      <form onSubmit={handleCommitColor} className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {placeholder}
        </label>
        <input
          id={inputId}
          type="text"
          spellCheck={false}
          autoComplete="off"
          value={codeInput}
          onChange={(e) => handleCodeInputChange(e.target.value)}
          placeholder={placeholder}
          className={`input-field flex-1 min-w-0 min-h-[42px] px-3 py-2 font-mono text-xs tabular-nums ${
            showError ? 'ring-1 ring-red-400/70' : ''
          }`}
        />

        <button
          type="submit"
          className={`min-h-[42px] px-3.5 py-2 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
            isAlreadyCommitted ? 'btn-secondary text-accent' : 'btn-primary'
          }`}
        >
          {isAlreadyCommitted && <Check className="w-3.5 h-3.5 shrink-0" />}
          <span>{isAlreadyCommitted ? activeLabel : applyLabel}</span>
        </button>
      </form>

      {showError ? (
        <p role="alert" className="text-[11px] font-medium text-red-400">
          {errorText}
        </p>
      ) : (
        <p className="text-[10px] text-fg-muted leading-snug">{hintText}</p>
      )}
    </div>
  );
};
