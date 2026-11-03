/**
 * Tutorial interactivo de bienvenida («enseñándotelo» sobre la interfaz real):
 * - Se lanza automáticamente la primera vez que se entra en la app tras elegir idioma,
 *   y puede volver a abrirse cuando se quiera desde Información (i) o Ajustes.
 * - Cambia automáticamente entre Perfil, Rutinas y Estadísticas, desplaza la vista hasta cada módulo
 *   e ilumina la sección real mediante una máscara SVG con retícula Nothing OS × Cyberpunk.
 */

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, Play, Repeat, X } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { AppTab } from '../types';

interface OnboardingTutorialProps {
  isOpen: boolean;
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onClose: () => void;
}

interface SpotlightBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TutorialStepSpec {
  id: 'level' | 'week' | 'steps' | 'routines' | 'stats';
  tab: AppTab;
  selector: string;
  preferScrollToBottom?: boolean;
}

const TUTORIAL_STEPS: TutorialStepSpec[] = [
  {
    id: 'level',
    tab: AppTab.PROFILE,
    selector: '[data-tutorial="profile-level"]',
  },
  {
    id: 'week',
    tab: AppTab.PROFILE,
    selector: '[data-tutorial="profile-week"]',
  },
  {
    id: 'steps',
    tab: AppTab.PROFILE,
    selector: '[data-tutorial="profile-steps"]',
    preferScrollToBottom: true,
  },
  {
    id: 'routines',
    tab: AppTab.TRAINING,
    selector: '[data-tutorial="training-overview"]',
  },
  {
    id: 'stats',
    tab: AppTab.STATS,
    selector: '[data-tutorial="stats-overview"]',
  },
];

export const OnboardingTutorial: React.FC<OnboardingTutorialProps> = ({
  isOpen,
  activeTab,
  onSelectTab,
  onClose,
}) => {
  const { language, locale, t } = useI18n();
  const rawUid = useId().replace(/:/g, '');
  const maskId = `tutorial-spotlight-mask-${rawUid}`;

  const [stepIndex, setStepIndex] = useState<number>(0);
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 390,
    h: typeof window !== 'undefined' ? window.innerHeight : 844,
  }));
  const [spotlight, setSpotlight] = useState<SpotlightBox | null>(null);
  const [cardHeight, setCardHeight] = useState<number>(240);

  const cardRef = useRef<HTMLDivElement | null>(null);

  // Reiniciar al paso 1 cada vez que se abre el tutorial
  useEffect(() => {
    if (isOpen) {
      setStepIndex(0);
    }
  }, [isOpen]);

  const currentStep = TUTORIAL_STEPS[stepIndex] || TUTORIAL_STEPS[0];

  // Sincronizar pestaña activa cuando el paso requiere otra pantalla
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab !== currentStep.tab) {
      onSelectTab(currentStep.tab);
    }
  }, [isOpen, activeTab, currentStep.tab, onSelectTab]);

  // Medir la tarjeta para trazar el conector y decidir posición superior/inferior sin solapamientos
  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = cardRef.current;
    if (!el) return;
    const measured = el.getBoundingClientRect().height;
    if (measured > 0 && Math.abs(measured - cardHeight) > 2) {
      setCardHeight(measured);
    }
  }, [isOpen, stepIndex, language, cardHeight]);

  const measureTarget = useCallback(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setViewport((prev) => (prev.w === vw && prev.h === vh ? prev : { w: vw, h: vh }));

    const targetEl = document.querySelector(currentStep.selector);
    if (!targetEl) {
      setSpotlight(null);
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      setSpotlight(null);
      return;
    }

    const pad = 6;
    const x = Math.max(6, Math.round(rect.left - pad));
    const y = Math.max(6, Math.round(rect.top - pad));
    const maxW = Math.max(40, vw - x - 6);
    const w = Math.min(maxW, Math.round(rect.width + pad * 2));
    const maxSpotlightH = Math.max(120, vh - 250);
    const h = Math.min(maxSpotlightH, Math.round(rect.height + pad * 2));

    setSpotlight((prev) => {
      if (
        prev &&
        Math.abs(prev.x - x) <= 1 &&
        Math.abs(prev.y - y) <= 1 &&
        Math.abs(prev.w - w) <= 1 &&
        Math.abs(prev.h - h) <= 1
      ) {
        return prev;
      }
      return { x, y, w, h };
    });
  }, [currentStep.selector]);

  // Desplazar suavemente la ventana hacia el elemento real al cambiar de paso o pestaña
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab !== currentStep.tab) return;

    let raf1 = 0;
    let raf2 = 0;
    let settleTimer: number | null = null;
    let postScrollTimer: number | null = null;

    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        const targetEl = document.querySelector(currentStep.selector);
        if (targetEl) {
          const rect = targetEl.getBoundingClientRect();
          const vh = window.innerHeight;
          const absoluteTop = window.scrollY + rect.top;

          if (currentStep.preferScrollToBottom && vwIsCompact(window.innerWidth)) {
            // Para la rueda de pasos en móvil, situarla en la mitad inferior deja libre la zona superior para la tarjeta
            const desiredTop = Math.max(0, absoluteTop - Math.max(250, vh - rect.height - 88));
            window.scrollTo({ top: desiredTop, behavior: 'smooth' });
          } else {
            // Situar el módulo en la zona superior deja toda la mitad inferior libre para la tarjeta
            const desiredTop = stepIndex === 0 ? 0 : Math.max(0, absoluteTop - 16);
            window.scrollTo({ top: desiredTop, behavior: 'smooth' });
          }
        }
        measureTarget();
        settleTimer = window.setTimeout(measureTarget, 180);
        postScrollTimer = window.setTimeout(measureTarget, 380);
      });
    });

    const handleScrollOrResize = () => {
      measureTarget();
    };

    window.addEventListener('scroll', handleScrollOrResize, { passive: true });
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      if (postScrollTimer !== null) window.clearTimeout(postScrollTimer);
      window.removeEventListener('scroll', handleScrollOrResize);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, activeTab, currentStep.tab, currentStep.selector, currentStep.preferScrollToBottom, stepIndex, measureTarget]);

  const handlePrev = useCallback(() => {
    setStepIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    if (stepIndex >= TUTORIAL_STEPS.length - 1) {
      onClose();
      return;
    }
    setStepIndex((prev) => Math.min(TUTORIAL_STEPS.length - 1, prev + 1));
  }, [stepIndex, onClose]);

  // Navegación por teclado (Flechas y Escape)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const stepCopy = [
    {
      sectionLabel: t.nav_profile,
      title: t.tutorial_s1_title,
      body: t.tutorial_s1_body,
    },
    {
      sectionLabel: t.nav_profile,
      title: t.tutorial_s2_title,
      body: t.tutorial_s2_body,
    },
    {
      sectionLabel: t.nav_profile,
      title: t.tutorial_s3_title,
      body: t.tutorial_s3_body,
    },
    {
      sectionLabel: t.nav_training,
      title: t.tutorial_s4_title,
      body: t.tutorial_s4_body,
    },
    {
      sectionLabel: t.nav_stats,
      title: t.tutorial_s5_title,
      body: t.tutorial_s5_body,
    },
  ][stepIndex];

  const spaceAbove = spotlight ? spotlight.y : 0;
  const spaceBelow = spotlight ? viewport.h - (spotlight.y + spotlight.h) : viewport.h;
  const dockAtTop = Boolean(spotlight && spaceAbove > spaceBelow && spaceAbove > 210);

  const isLastStep = stepIndex === TUTORIAL_STEPS.length - 1;
  const tenThousandFormatted = (10_000).toLocaleString(locale);
  const sampleExtraStepsFormatted = (12_500).toLocaleString(locale);

  // Coordenadas de retícula y línea conectora entre el módulo iluminado y la tarjeta
  const connectorX = spotlight
    ? Math.max(32, Math.min(viewport.w - 32, Math.round(spotlight.x + spotlight.w / 2)))
    : Math.round(viewport.w / 2);
  const connectorY1 = spotlight
    ? dockAtTop
      ? Math.max(16, Math.min(spotlight.y - 4, cardHeight + 24))
      : spotlight.y + spotlight.h + 2
    : 0;
  const connectorY2 = spotlight
    ? dockAtTop
      ? spotlight.y - 2
      : Math.max(spotlight.y + spotlight.h + 6, viewport.h - cardHeight - 22)
    : 0;
  const showConnector = Boolean(spotlight && connectorY2 - connectorY1 >= 12);

  return createPortal(
    <div
      className="fixed inset-0 z-50 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-tutorial-title"
    >
      {/* Escudo transparente para evitar toques accidentales fuera del recorrido guiado */}
      <div className="fixed inset-0 pointer-events-auto" aria-hidden="true" />

      {/* Superposición SVG con ventana recortada sobre el módulo real + retícula industrial */}
      <svg
        viewBox={`0 0 ${viewport.w} ${viewport.h}`}
        className="fixed inset-0 w-screen h-screen pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <mask id={maskId}>
            <rect x={0} y={0} width={viewport.w} height={viewport.h} fill="#ffffff" />
            {spotlight && (
              <rect
                x={spotlight.x}
                y={spotlight.y}
                width={spotlight.w}
                height={spotlight.h}
                rx={7}
                fill="#000000"
              />
            )}
          </mask>
        </defs>

        <rect
          x={0}
          y={0}
          width={viewport.w}
          height={viewport.h}
          fill="rgba(5, 6, 9, 0.78)"
          mask={`url(#${maskId})`}
        />

        {spotlight && (
          <g>
            <rect
              x={spotlight.x}
              y={spotlight.y}
              width={spotlight.w}
              height={spotlight.h}
              rx={7}
              fill="none"
              stroke="var(--app-accent-fill)"
              strokeWidth={1.5}
            />
            {/* Esquinas de precisión Nothing OS */}
            <path
              d={`M ${spotlight.x - 3} ${spotlight.y + 10} V ${spotlight.y - 3} H ${spotlight.x + 10}
                  M ${spotlight.x + spotlight.w - 10} ${spotlight.y - 3} H ${spotlight.x + spotlight.w + 3} V ${spotlight.y + 10}
                  M ${spotlight.x - 3} ${spotlight.y + spotlight.h - 10} V ${spotlight.y + spotlight.h + 3} H ${spotlight.x + 10}
                  M ${spotlight.x + spotlight.w - 10} ${spotlight.y + spotlight.h + 3} H ${spotlight.x + spotlight.w + 3} V ${spotlight.y + spotlight.h - 10}`}
              fill="none"
              stroke="var(--app-accent-fill)"
              strokeWidth={2}
            />
          </g>
        )}

        {showConnector && (
          <g>
            <line
              x1={connectorX}
              y1={connectorY1}
              x2={connectorX}
              y2={connectorY2}
              stroke="var(--app-accent-fill)"
              strokeWidth={1.25}
              strokeDasharray="3 3"
            />
            <rect
              x={connectorX - 2.5}
              y={(dockAtTop ? connectorY2 : connectorY1) - 2.5}
              width={5}
              height={5}
              fill="var(--app-accent-fill)"
            />
          </g>
        )}
      </svg>

      {/* Tarjeta interactiva del paso actual */}
      <div
        ref={cardRef}
        key={currentStep.id}
        className={`fixed left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[440px] ${
          dockAtTop ? 'safe-top-banner' : 'bottom-4 sm:bottom-6'
        } z-10 pointer-events-auto modal-sheet sheet-panel ndot-surface rounded-md border border-accent-fill p-4 sm:p-5 space-y-3.5 animate-tutorial-card`}
      >
        {/* Cabecera: progreso de pasos + acción Saltar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums min-w-0">
            <span className="font-bold text-accent shrink-0">
              0{stepIndex + 1} / 0{TUTORIAL_STEPS.length}
            </span>
            <span aria-hidden="true" className="text-fg-muted">
              ·
            </span>
            <span className="font-display font-semibold uppercase tracking-wider text-fg-secondary truncate">
              {stepCopy.sectionLabel}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-quiet min-h-[34px] px-2 -mr-1.5 text-xs font-display font-semibold uppercase tracking-wider flex items-center gap-1 shrink-0"
          >
            <span>{t.tutorial_skip_btn}</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Título y explicación directa */}
        <div className="space-y-1">
          <h2
            id="onboarding-tutorial-title"
            className="font-display text-base sm:text-lg font-bold uppercase tracking-wide text-fg"
          >
            {stepCopy.title}
          </h2>
          <p className="text-xs sm:text-sm leading-relaxed text-fg-secondary">
            {stepCopy.body}
          </p>
        </div>

        {/* Demostración visual integrada según el paso actual */}
        {currentStep.id === 'week' && (
          <div className="pt-2.5 border-t border-subtle space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-fg-secondary">
              <span className="inline-flex items-center gap-1.5 truncate">
                <Repeat className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="truncate">{t.profile_repeat_week_btn}</span>
              </span>
              <span className="text-fg-muted shrink-0">
                {t.day_mon_short} → {t.day_thu_short}
              </span>
            </div>

            {/* Demostración animada de arrastrar una rutina de un día a otro */}
            <div className="relative grid grid-cols-5 gap-1.5 pt-0.5" aria-hidden="true">
              {[
                t.day_mon_short,
                t.day_tue_short,
                t.day_wed_short,
                t.day_thu_short,
                t.day_fri_short,
              ].map((dayLbl, idx) => (
                <div
                  key={idx}
                  className={`h-8 rounded-[3px] border flex items-center justify-center font-mono text-[10px] ${
                    idx === 3
                      ? 'border-accent-fill text-accent font-bold'
                      : 'border-subtle text-fg-muted'
                  }`}
                >
                  {dayLbl}
                </div>
              ))}
              <div className="pointer-events-none absolute left-1 top-1.5 h-6 px-2 rounded-[3px] bg-accent-fill text-accent-fg font-display text-[10px] font-bold uppercase tracking-wider flex items-center animate-tutorial-drag">
                {t.category_strength}
              </div>
            </div>
          </div>
        )}

        {currentStep.id === 'steps' && (
          <div className="pt-2.5 border-t border-subtle flex items-center justify-between gap-3 text-xs font-mono tabular-nums">
            <span className="text-fg-secondary">
              0 – <strong className="text-fg font-bold">{tenThousandFormatted}</strong>
            </span>
            <span aria-hidden="true" className="text-fg-muted">
              →
            </span>
            <span className="text-accent font-bold">
              [{sampleExtraStepsFormatted}+]
            </span>
          </div>
        )}

        {currentStep.id === 'routines' && (
          <div className="pt-2.5 border-t border-subtle flex items-center justify-between gap-2 text-xs font-mono">
            <span className="text-fg-secondary truncate">
              {t.category_cardio} · {t.category_strength} · {t.category_hybrid}
            </span>
            <span className="inline-flex items-center gap-1 text-accent font-bold uppercase shrink-0">
              <Play className="w-3 h-3 fill-current" />
              <span>{t.common_start}</span>
            </span>
          </div>
        )}

        {/* Controles inferiores: barra de progreso segmentada + Anterior / Siguiente */}
        <div className="pt-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {TUTORIAL_STEPS.map((st, idx) => (
              <span
                key={st.id}
                className={`h-1.5 rounded-[1px] transition-all ${
                  idx === stepIndex
                    ? 'w-5 bg-accent-fill'
                    : idx < stepIndex
                    ? 'w-2 bg-accent-fill/55'
                    : 'w-2 bg-elevated'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="btn-secondary min-h-[40px] px-3 py-1.5 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                <span>{t.tutorial_prev_btn}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="btn-primary min-h-[40px] px-4 py-1.5 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <span>{isLastStep ? t.tutorial_finish_btn : t.tutorial_next_btn}</span>
              {isLastStep ? (
                <Check className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

function vwIsCompact(width: number): boolean {
  return width < 1024;
}
