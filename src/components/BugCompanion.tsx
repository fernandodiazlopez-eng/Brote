/**
 * Bug — Mascota 8-bits de Upgrade:
 * - Bola de píxeles en el color secundario/acento de la app, apoyada en reposo sin flotar ni emitir chispas continuas.
 * - Mirada curiosa según ubicación (hacia abajo en Rutinas y Estadísticas; hacia el avatar o al frente en Perfil) y parpadeo ocasional.
 * - Nivel 3: Desbloqueo de Bug en la interfaz y carrusel de metro.
 * - Nivel 4: Acariciar con Doble Tap (ojos en arcos felices, parpadeo y destello de chispas del color secundario; sin texto).
 * - Nivel 5: Jugar con Bug al mantener pulsado (pasa a círculo completo al cogerlo y lanzarlo, rebota limpio con chispas y sonido 8-bits, frena progresivamente y reaparece de inmediato en su sitio).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getBugMilestoneCopy } from '../data/bugCompanionData';
import { useI18n } from '../i18n/I18nContext';
import { BugUnlockMilestone } from '../types';
import { playBugBounceSound } from '../utils/audioEffects';

export type BugEyeExpression = 'neutral' | 'blink' | 'happy' | 'sad';
export type BugGazeMode = 'down' | 'avatar-front';
export type BugGlobalMood = 'none' | 'sad' | 'happy';

interface PixelSparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Silueta de bola de píxeles 16×14 apoyada sobre su base plana (y = 14) en reposo. */
const BUG_PERCHED_BODY_PATH =
  'M5 0h6v1H5zM3 1h10v1H3zM2 2h12v1H2zM1 3h14v2H1zM0 5h16v5H0zM1 10h14v2H1zM2 12h12v1H2zM3 13h10v1H3z';

/** Silueta de círculo completo simétrico 16×16 al coger y lanzar a Bug jugando con él. */
const BUG_FULL_CIRCLE_PATH =
  'M5 0h6v1H5zM3 1h10v1H3zM2 2h12v1H2zM1 3h14v2H1zM0 5h16v6H0zM1 11h14v2H1zM2 13h12v1H2zM3 14h10v1H3zM5 15h6v1H5z';

interface BugPixelGraphicProps {
  expression: BugEyeExpression;
  gazeX?: -1 | 0 | 1;
  gazeY?: -1 | 0 | 1;
  isFullCircle?: boolean;
}

export const BugPixelGraphic: React.FC<BugPixelGraphicProps> = React.memo(({
  expression,
  gazeX = 0,
  gazeY = 0,
  isFullCircle = false,
}) => {
  return (
    <g shapeRendering="crispEdges">
      <path
        d={isFullCircle ? BUG_FULL_CIRCLE_PATH : BUG_PERCHED_BODY_PATH}
        fill="var(--app-accent-fill)"
      />
      {/* Brillo especular pixelado sutil en la esquina superior izquierda */}
      <rect x={3} y={2} width={2} height={1} fill="#ffffff" fillOpacity={0.28} />
      <rect x={2} y={3} width={1} height={1} fill="#ffffff" fillOpacity={0.22} />

      {/* Expresiones de los ojos 8-bits (sin corazones) */}
      {expression === 'neutral' && (
        <g fill="var(--app-accent-fg)">
          <rect x={4 + gazeX} y={6 + gazeY} width={2} height={3} />
          <rect x={10 + gazeX} y={6 + gazeY} width={2} height={3} />
        </g>
      )}

      {expression === 'blink' && (
        <g fill="var(--app-accent-fg)">
          <rect x={4 + gazeX} y={7 + gazeY} width={2} height={1} />
          <rect x={10 + gazeX} y={7 + gazeY} width={2} height={1} />
        </g>
      )}

      {expression === 'happy' && (
        <g fill="var(--app-accent-fg)">
          {/* Arco feliz izquierdo (^ sin corazones) */}
          <rect x={3} y={8} width={1} height={1} />
          <rect x={4} y={7} width={2} height={1} />
          <rect x={6} y={8} width={1} height={1} />
          {/* Arco feliz derecho */}
          <rect x={9} y={8} width={1} height={1} />
          <rect x={10} y={7} width={2} height={1} />
          <rect x={12} y={8} width={1} height={1} />
        </g>
      )}

      {expression === 'sad' && (
        <g fill="var(--app-accent-fg)">
          {/* Ojos tristes inclinados hacia el exterior */}
          <rect x={4} y={7} width={2} height={1} />
          <rect x={3} y={8} width={2} height={1} />
          <rect x={10} y={7} width={2} height={1} />
          <rect x={11} y={8} width={2} height={1} />
        </g>
      )}
    </g>
  );
});

interface BugPerchProps {
  gazeMode: BugGazeMode;
  globalMood: BugGlobalMood;
  canPet: boolean;
  canLaunchHockey: boolean;
  className?: string;
}

export const BugPerch: React.FC<BugPerchProps> = React.memo(({
  gazeMode,
  globalMood,
  canPet,
  canLaunchHockey,
  className = '',
}) => {
  const [gazeOffset, setGazeOffset] = useState<{ x: -1 | 0 | 1; y: -1 | 0 | 1 }>(() =>
    gazeMode === 'down' ? { x: 0, y: 1 } : { x: 0, y: 0 }
  );
  const [isIdleBlinking, setIsIdleBlinking] = useState(false);
  const [localPetPhase, setLocalPetPhase] = useState<'none' | 'happy' | 'blink'>('none');
  const [respawnKey, setRespawnKey] = useState(0);

  // Estado para modo Air Hockey (Nivel 50+)
  const [hockeyMode, setHockeyMode] = useState<'idle' | 'grabbed' | 'flying'>('idle');
  const [puckExpression, setPuckExpression] = useState<BugEyeExpression>('neutral');
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 390,
    h: typeof window !== 'undefined' ? window.innerHeight : 844,
  }));

  const perchButtonRef = useRef<HTMLDivElement | null>(null);
  const petSparksGroupRef = useRef<SVGGElement | null>(null);
  const petRafRef = useRef<number | null>(null);
  const petTimersRef = useRef<number[]>([]);
  const lastTapMsRef = useRef<number>(0);

  // Referencias mutables de física Air Hockey (60/120fps sin re-renderizar React en cada frame)
  const longPressTimerRef = useRef<number | null>(null);
  const downOriginRef = useRef<{ x: number; y: number } | null>(null);
  const pointerHistoryRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const puckPosRef = useRef<{ x: number; y: number; vx: number; vy: number }>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
  });
  const wallSparksRef = useRef<PixelSparkParticle[]>([]);
  const flyingPuckGroupRef = useRef<SVGGElement | null>(null);
  const wallSparksGroupRef = useRef<SVGGElement | null>(null);
  const flightRafRef = useRef<number | null>(null);
  const bounceHappyUntilRef = useRef<number>(0);

  // Sincronizar dirección base al cambiar gazeMode
  useEffect(() => {
    setGazeOffset(gazeMode === 'down' ? { x: 0, y: 1 } : { x: 0, y: 0 });
  }, [gazeMode]);

  // Mirada curiosa y parpadeo ocasional en reposo
  useEffect(() => {
    if (hockeyMode !== 'idle') return;

    let actionTimer: number | null = null;
    let blinkResetTimer: number | null = null;
    let cancelled = false;

    const scheduleNext = () => {
      const nextDelay = 2100 + Math.floor(Math.random() * 2400);
      actionTimer = window.setTimeout(() => {
        if (cancelled) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          scheduleNext();
          return;
        }

        const roll = Math.random();
        if (roll < 0.42) {
          // Parpadeo corto ocasional
          setIsIdleBlinking(true);
          blinkResetTimer = window.setTimeout(() => {
            if (!cancelled) setIsIdleBlinking(false);
          }, 125);
        } else if (gazeMode === 'down') {
          // Mirada curiosa hacia abajo (rutinas / gráficos)
          const downChoices: { x: -1 | 0 | 1; y: -1 | 0 | 1 }[] = [
            { x: 0, y: 1 },
            { x: -1, y: 1 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
            { x: 0, y: 0 },
          ];
          const picked = downChoices[Math.floor(Math.random() * downChoices.length)] || {
            x: 0,
            y: 1,
          };
          setGazeOffset(picked);
        } else {
          // Perfil (zona inferior izquierda del avatar): mira hacia el avatar (arriba-derecha / derecha) o al frente
          const profileChoices: { x: -1 | 0 | 1; y: -1 | 0 | 1 }[] = [
            { x: 0, y: 0 },
            { x: 1, y: -1 },
            { x: 1, y: 0 },
            { x: 0, y: 0 },
            { x: 1, y: -1 },
          ];
          const picked = profileChoices[Math.floor(Math.random() * profileChoices.length)] || {
            x: 0,
            y: 0,
          };
          setGazeOffset(picked);
        }

        scheduleNext();
      }, nextDelay);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (actionTimer !== null) window.clearTimeout(actionTimer);
      if (blinkResetTimer !== null) window.clearTimeout(blinkResetTimer);
    };
  }, [gazeMode, hockeyMode]);

  // Limpieza global al desmontar
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
      if (petRafRef.current !== null) window.cancelAnimationFrame(petRafRef.current);
      if (flightRafRef.current !== null) window.cancelAnimationFrame(flightRafRef.current);
      petTimersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // Destello de chispas 8-bits al acariciar (Doble Tap en Nivel 5+)
  const triggerPetSparksAndExpression = useCallback(() => {
    petTimersRef.current.forEach((id) => window.clearTimeout(id));
    petTimersRef.current = [];

    // Ojos en arco -> parpadeo feliz -> ojos en arco
    setLocalPetPhase('happy');
    const t1 = window.setTimeout(() => setLocalPetPhase('blink'), 170);
    const t2 = window.setTimeout(() => setLocalPetPhase('happy'), 280);
    const t3 = window.setTimeout(() => setLocalPetPhase('none'), 1450);
    petTimersRef.current.push(t1, t2, t3);

    if (petRafRef.current !== null) {
      window.cancelAnimationFrame(petRafRef.current);
      petRafRef.current = null;
    }

    const angles = [
      -Math.PI * 0.92,
      -Math.PI * 0.75,
      -Math.PI * 0.58,
      -Math.PI * 0.42,
      -Math.PI * 0.25,
      -Math.PI * 0.08,
      Math.PI * 0.12,
      Math.PI * 0.88,
    ];
    const particles: PixelSparkParticle[] = angles.map((ang, i) => {
      const speed = 26 + (i % 3) * 8;
      return {
        x: 8 + Math.cos(ang) * 5,
        y: 7 + Math.sin(ang) * 5,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - 4,
        life: 0,
        maxLife: 0.44 + (i % 2) * 0.08,
        size: i % 2 === 0 ? 2 : 1.6,
      };
    });

    let lastTs = performance.now();

    const stepSparks = (now: number) => {
      const dt = Math.min(0.04, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      const group = petSparksGroupRef.current;
      if (!group) return;

      while (group.firstChild) {
        group.removeChild(group.firstChild);
      }

      let aliveCount = 0;
      for (const p of particles) {
        p.life += dt;
        if (p.life >= p.maxLife) continue;
        aliveCount += 1;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;

        const progress = p.life / p.maxLife;
        const rect = document.createElementNS(SVG_NS, 'rect');
        const snapX = Math.round(p.x * 2) / 2;
        const snapY = Math.round(p.y * 2) / 2;
        const curSize = progress > 0.7 ? p.size * 0.65 : p.size;
        rect.setAttribute('x', snapX.toFixed(1));
        rect.setAttribute('y', snapY.toFixed(1));
        rect.setAttribute('width', curSize.toFixed(1));
        rect.setAttribute('height', curSize.toFixed(1));
        rect.setAttribute('fill', 'var(--app-accent-fill)');
        rect.setAttribute('fill-opacity', (1 - progress * 0.85).toFixed(2));
        group.appendChild(rect);
      }

      if (aliveCount > 0) {
        petRafRef.current = window.requestAnimationFrame(stepSparks);
      } else {
        petRafRef.current = null;
      }
    };

    petRafRef.current = window.requestAnimationFrame(stepSparks);
  }, []);

  const spawnWallCollisionSparks = useCallback((hitX: number, hitY: number, nx: number, ny: number) => {
    const baseAngle = Math.atan2(ny, nx);
    for (let i = 0; i < 8; i += 1) {
      const spread = (i - 3.5) * 0.34 + (Math.random() - 0.5) * 0.14;
      const angle = baseAngle + spread;
      const speed = 95 + Math.random() * 145;
      wallSparksRef.current.push({
        x: hitX,
        y: hitY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.28 + Math.random() * 0.14,
        size: i % 2 === 0 ? 5 : 4,
      });
    }
  }, []);

  // Seguimiento de arrastre durante Long Press (modo Air Hockey)
  useEffect(() => {
    if (hockeyMode !== 'grabbed') return;

    const updatePuckTransform = (cx: number, cy: number) => {
      if (flyingPuckGroupRef.current) {
        flyingPuckGroupRef.current.setAttribute(
          'transform',
          `translate(${Math.round(cx - 16)} ${Math.round(cy - 16)}) scale(2)`
        );
      }
    };

    updatePuckTransform(puckPosRef.current.x, puckPosRef.current.y);

    const handlePointerMove = (e: PointerEvent) => {
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      const w = window.innerWidth;
      const h = window.innerHeight;
      const clampedX = Math.max(16, Math.min(w - 16, e.clientX));
      const clampedY = Math.max(16, Math.min(h - 16, e.clientY));

      puckPosRef.current.x = clampedX;
      puckPosRef.current.y = clampedY;
      updatePuckTransform(clampedX, clampedY);

      const history = pointerHistoryRef.current;
      history.push({ x: clampedX, y: clampedY, t: now });
      while (history.length > 1 && now - history[0].t > 105) {
        history.shift();
      }
    };

    const finishGrabAndLaunch = () => {
      const now = performance.now();
      const history = pointerHistoryRef.current;
      let vx = 0;
      let vy = 0;

      if (history.length >= 2) {
        const latest = history[history.length - 1];
        let anchor = history[0];
        for (let i = history.length - 2; i >= 0; i -= 1) {
          const dtMs = latest.t - history[i].t;
          if (dtMs >= 18 && dtMs <= 95) {
            anchor = history[i];
          }
        }
        const dtSec = (latest.t - anchor.t) / 1000;
        const idleSinceLastMoveMs = now - latest.t;
        if (dtSec > 0.004 && idleSinceLastMoveMs < 95) {
          vx = ((latest.x - anchor.x) / dtSec) * 1.12;
          vy = ((latest.y - anchor.y) / dtSec) * 1.12;
        }
      }

      const rawSpeed = Math.hypot(vx, vy);
      if (rawSpeed < 95) {
        // Si se soltó quieto sin lanzarlo, reaparece de inmediato en su sitio habitual
        setHockeyMode('idle');
        setPuckExpression('neutral');
        setRespawnKey((k) => k + 1);
        return;
      }

      const maxSpeed = 2350;
      const clampedSpeed = Math.min(maxSpeed, Math.max(220, rawSpeed));
      const scale = clampedSpeed / rawSpeed;
      puckPosRef.current.vx = vx * scale;
      puckPosRef.current.vy = vy * scale;
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
      setPuckExpression('happy');
      bounceHappyUntilRef.current = now + 320;
      setHockeyMode('flying');
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', finishGrabAndLaunch);
    window.addEventListener('pointercancel', finishGrabAndLaunch);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishGrabAndLaunch);
      window.removeEventListener('pointercancel', finishGrabAndLaunch);
    };
  }, [hockeyMode]);

  // Bucle físico de disco Air Hockey (Nivel 50+)
  useEffect(() => {
    if (hockeyMode !== 'flying') return;

    let lastTs = performance.now();
    let currentExpr: BugEyeExpression = 'happy';

    const stepPhysics = (now: number) => {
      const dt = Math.min(0.032, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      const w = window.innerWidth;
      const h = window.innerHeight;
      const minX = 16;
      const maxX = Math.max(minX + 1, w - 16);
      const minY = 16;
      const maxY = Math.max(minY + 1, h - 16);

      const state = puckPosRef.current;
      state.x += state.vx * dt;
      state.y += state.vy * dt;

      let collided = false;
      if (state.x <= minX) {
        state.x = minX;
        state.vx = Math.abs(state.vx) * 0.92;
        spawnWallCollisionSparks(2, state.y, 1, 0);
        collided = true;
      } else if (state.x >= maxX) {
        state.x = maxX;
        state.vx = -Math.abs(state.vx) * 0.92;
        spawnWallCollisionSparks(w - 2, state.y, -1, 0);
        collided = true;
      }

      if (state.y <= minY) {
        state.y = minY;
        state.vy = Math.abs(state.vy) * 0.92;
        spawnWallCollisionSparks(state.x, 2, 0, 1);
        collided = true;
      } else if (state.y >= maxY) {
        state.y = maxY;
        state.vy = -Math.abs(state.vy) * 0.92;
        spawnWallCollisionSparks(state.x, h - 2, 0, -1);
        collided = true;
      }

      const speedAfterBounce = Math.hypot(state.vx, state.vy);

      if (collided) {
        playBugBounceSound(Math.min(1, speedAfterBounce / 1450));
        bounceHappyUntilRef.current = now + 280;
      }

      const desiredExpr: BugEyeExpression =
        now < bounceHappyUntilRef.current ? 'happy' : 'neutral';
      if (desiredExpr !== currentExpr) {
        currentExpr = desiredExpr;
        setPuckExpression(desiredExpr);
      }

      // Fricción progresiva de mesa de Air Hockey hasta detenerse por completo
      if (speedAfterBounce > 0) {
        const nextSpeed = Math.max(
          0,
          speedAfterBounce * Math.pow(0.46, dt) - 44 * dt
        );
        const ratio = nextSpeed / speedAfterBounce;
        state.vx *= ratio;
        state.vy *= ratio;
      }

      if (flyingPuckGroupRef.current) {
        flyingPuckGroupRef.current.setAttribute(
          'transform',
          `translate(${Math.round(state.x - 16)} ${Math.round(state.y - 16)}) scale(2)`
        );
      }

      // Actualizar chispas de impacto contra las paredes
      const sparksLayer = wallSparksGroupRef.current;
      if (sparksLayer) {
        while (sparksLayer.firstChild) {
          sparksLayer.removeChild(sparksLayer.firstChild);
        }
        const nextSparks: PixelSparkParticle[] = [];
        for (const sp of wallSparksRef.current) {
          sp.life += dt;
          if (sp.life >= sp.maxLife) continue;
          sp.x += sp.vx * dt;
          sp.y += sp.vy * dt;
          sp.vx *= 0.9;
          sp.vy *= 0.9;
          nextSparks.push(sp);

          const progress = sp.life / sp.maxLife;
          const rect = document.createElementNS(SVG_NS, 'rect');
          const curSize = progress > 0.65 ? Math.max(2, sp.size - 2) : sp.size;
          rect.setAttribute('x', Math.round(sp.x - curSize / 2).toString());
          rect.setAttribute('y', Math.round(sp.y - curSize / 2).toString());
          rect.setAttribute('width', curSize.toString());
          rect.setAttribute('height', curSize.toString());
          rect.setAttribute('fill', 'var(--app-accent-fill)');
          rect.setAttribute('fill-opacity', (1 - progress * 0.82).toFixed(2));
          sparksLayer.appendChild(rect);
        }
        wallSparksRef.current = nextSparks;
      }

      const remainingSpeed = Math.hypot(state.vx, state.vy);
      if (remainingSpeed <= 15) {
        // Una vez frenado por completo, desaparece y reaparece de inmediato en su sitio de siempre
        wallSparksRef.current = [];
        flightRafRef.current = null;
        setHockeyMode('idle');
        setPuckExpression('neutral');
        setRespawnKey((k) => k + 1);
        return;
      }

      flightRafRef.current = window.requestAnimationFrame(stepPhysics);
    };

    flightRafRef.current = window.requestAnimationFrame(stepPhysics);

    return () => {
      if (flightRafRef.current !== null) {
        window.cancelAnimationFrame(flightRafRef.current);
        flightRafRef.current = null;
      }
    };
  }, [hockeyMode, spawnWallCollisionSparks]);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    downOriginRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    if (hockeyMode !== 'idle') return;

    clearLongPress();
    const startX = e.clientX;
    const startY = e.clientY;
    downOriginRef.current = { x: startX, y: startY };

    if (canLaunchHockey) {
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        const rect = perchButtonRef.current?.getBoundingClientRect();
        const cx = rect ? rect.left + rect.width / 2 : startX;
        const cy = rect ? rect.top + rect.height / 2 : startY;
        const now = performance.now();

        setViewportSize({ w: window.innerWidth, h: window.innerHeight });
        puckPosRef.current = { x: cx, y: cy, vx: 0, vy: 0 };
        pointerHistoryRef.current = [{ x: cx, y: cy, t: now }];
        wallSparksRef.current = [];
        setPuckExpression('happy');
        setHockeyMode('grabbed');

        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(18);
          } catch {
            // Ignorar restricciones de vibración
          }
        }
      }, 250);
    }
  };

  const handlePointerMoveLocal = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!downOriginRef.current || longPressTimerRef.current === null) return;
    const dist = Math.hypot(
      e.clientX - downOriginRef.current.x,
      e.clientY - downOriginRef.current.y
    );
    if (dist > 11) {
      clearLongPress();
    }
  };

  const handlePointerUpLocal = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const wasWaitingLongPress = longPressTimerRef.current !== null || !canLaunchHockey;
    clearLongPress();

    if (hockeyMode !== 'idle' || !wasWaitingLongPress) return;

    if (canPet) {
      const now = Date.now();
      if (now - lastTapMsRef.current <= 330) {
        lastTapMsRef.current = 0;
        triggerPetSparksAndExpression();
      } else {
        lastTapMsRef.current = now;
      }
    }
  };

  const resolvedExpression: BugEyeExpression =
    localPetPhase === 'blink'
      ? 'blink'
      : localPetPhase === 'happy'
      ? 'happy'
      : globalMood === 'sad'
      ? 'sad'
      : globalMood === 'happy'
      ? 'happy'
      : isIdleBlinking
      ? 'blink'
      : 'neutral';

  const isDetached = hockeyMode !== 'idle';

  return (
    <>
      <div
        ref={perchButtonRef}
        role="button"
        tabIndex={0}
        aria-label="Bug"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          if (canLaunchHockey) e.preventDefault();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMoveLocal}
        onPointerUp={handlePointerUpLocal}
        onPointerCancel={clearLongPress}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && canPet) {
            e.preventDefault();
            triggerPetSparksAndExpression();
          }
        }}
        className={`inline-flex items-end justify-center select-none ${
          canPet || canLaunchHockey ? 'cursor-pointer' : 'cursor-default'
        } ${
          canLaunchHockey ? 'touch-none' : 'touch-manipulation'
        } leading-none ${isDetached ? 'opacity-0 pointer-events-none' : ''} ${className}`}
      >
        <svg
          key={respawnKey}
          viewBox="-10 -12 36 26"
          className={`w-[54px] h-[39px] -mx-[11px] -mt-[11px] block overflow-visible pointer-events-none ${
            respawnKey > 0 ? 'animate-bug-respawn' : ''
          }`}
          shapeRendering="crispEdges"
        >
          <BugPixelGraphic
            expression={resolvedExpression}
            gazeX={gazeOffset.x}
            gazeY={gazeOffset.y}
          />
          <g ref={petSparksGroupRef} />
        </svg>
      </div>

      {isDetached &&
        typeof document !== 'undefined' &&
        createPortal(
          <svg
            viewBox={`0 0 ${viewportSize.w} ${viewportSize.h}`}
            className="fixed inset-0 w-screen h-screen pointer-events-none z-50 select-none"
            shapeRendering="crispEdges"
            aria-hidden="true"
          >
            <g ref={wallSparksGroupRef} />
            <g ref={flyingPuckGroupRef}>
              <BugPixelGraphic expression={puckExpression} gazeX={0} gazeY={0} isFullCircle />
            </g>
          </svg>,
          document.body
        )}
    </>
  );
});

interface BugSubwayMarqueeProps {
  message: string | null;
  messageId: number;
  shiftedDown?: boolean;
  onComplete: (completedId: number) => void;
}

/**
 * Panel luminoso estilo metro (marquee LED sin bocadillos) que desplaza las frases de Bug
 * de derecha a izquierda con prefijo «Bug dice:» y duración proporcional a la longitud real del texto.
 */
export const BugSubwayMarquee: React.FC<BugSubwayMarqueeProps> = React.memo(({
  message,
  messageId,
  shiftedDown = false,
  onComplete,
}) => {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const trainRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!message) return;
    const trackEl = trackRef.current;
    const trainEl = trainRef.current;
    if (!trackEl || !trainEl) return;

    const containerWidth = Math.max(180, trackEl.clientWidth);
    const textWidth = Math.max(80, trainEl.offsetWidth);
    const totalTravelPx = containerWidth + textWidth + 20;

    // Duración proporcional al tamaño del texto: frases cortas (~3.6s) y frases largas (~8.5s–9.8s)
    const durationMs = Math.round(
      Math.max(3200, Math.min(13000, (containerWidth / 160 + textWidth / 76) * 1000))
    );

    if (typeof trainEl.animate !== 'function') {
      const fallbackTimer = window.setTimeout(() => onComplete(messageId), durationMs);
      return () => window.clearTimeout(fallbackTimer);
    }

    const anim = trainEl.animate(
      [
        { transform: 'translate3d(0, 0, 0)' },
        { transform: `translate3d(-${totalTravelPx}px, 0, 0)` },
      ],
      {
        duration: durationMs,
        easing: 'linear',
        fill: 'forwards',
      }
    );

    anim.onfinish = () => {
      onComplete(messageId);
    };

    return () => {
      anim.onfinish = null;
      anim.cancel();
    };
  }, [message, messageId, t.bug_marquee_prefix, onComplete]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed ${
        shiftedDown ? 'safe-top-marquee-shifted' : 'safe-top-marquee'
      } left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[432px] z-40 pointer-events-none select-none transition-all duration-200`}
    >
      <div className="bug-metro-panel h-[30px] px-2.5 flex items-center gap-2 overflow-hidden">
        {/* Indicador LED cuadrado 8-bits a la izquierda del panel de metro */}
        <span
          aria-hidden="true"
          className="w-[5px] h-[5px] bg-accent-fill shrink-0"
        />

        <div ref={trackRef} className="relative flex-1 overflow-hidden h-full flex items-center">
          <span
            ref={trainRef}
            key={messageId}
            className="absolute left-full whitespace-nowrap text-[11px] leading-none bug-metro-text bug-metro-train inline-flex items-center gap-2"
          >
            <span className="font-bold">{t.bug_marquee_prefix}</span>
            <span>{message}</span>
          </span>
        </div>
      </div>
    </div>
  );
});

interface BugUnlockBannerProps {
  milestone: BugUnlockMilestone;
  onDismiss: () => void;
}

/**
 * Cuadro emergente estilo logro Nothing OS × Cyberpunk al descubrir a Bug (Nivel 3),
 * desbloquear acariciarlo (Nivel 4) o desbloquear jugar con él / lanzarlo (Nivel 5).
 */
export const BugUnlockBanner: React.FC<BugUnlockBannerProps> = ({
  milestone,
  onDismiss,
}) => {
  const { language } = useI18n();
  const copy = getBugMilestoneCopy(milestone, language);
  const isPlayMilestone = milestone === 'level5';
  const litSlotsCount = milestone === 'level5' ? 5 : milestone === 'level4' ? 3 : 2;

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      className="fixed safe-top-banner left-4 right-4 sm:left-auto sm:right-6 sm:w-[404px] z-50 modal-sheet sheet-panel ndot-surface rounded-[5px] border border-accent-fill p-3.5 flex items-center gap-3.5 cursor-pointer select-none overflow-hidden animate-bug-toast"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-accent-fill"
      />

      <div className="relative w-16 h-16 trophy-oled-window border border-accent-fill flex items-center justify-center shrink-0 overflow-hidden animate-trophy-emblem">
        <svg
          viewBox="-4 -4 24 24"
          className="w-12 h-12 block"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          {/* Chispas decorativas 8-bits en el emblema de desbloqueo */}
          <rect x={-2} y={1} width={1.5} height={1.5} fill="var(--app-accent-fill)" />
          <rect x={16.5} y={0} width={1.5} height={1.5} fill="var(--app-accent-fill)" />
          {isPlayMilestone && (
            <>
              <rect x={-2.5} y={11} width={1.5} height={1.5} fill="var(--app-accent-fill)" />
              <rect x={17} y={12} width={1.5} height={1.5} fill="var(--app-accent-fill)" />
            </>
          )}
          <BugPixelGraphic
            expression="happy"
            gazeX={0}
            gazeY={0}
            isFullCircle={isPlayMilestone}
          />
        </svg>
      </div>

      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span aria-hidden="true" className="inline-flex items-center gap-[2px] shrink-0">
            {[1, 2, 3, 4, 5].map((slot) => (
              <span
                key={slot}
                className={`w-[3px] h-[7px] rounded-[0.5px] ${
                  slot <= litSlotsCount ? 'bg-accent-fill' : 'bg-elevated'
                }`}
              />
            ))}
          </span>
          <span className="font-bold uppercase tracking-wider text-accent shrink-0">
            {copy.kickerLeft}
          </span>
          <span aria-hidden="true" className="text-fg-muted">
            ·
          </span>
          <span className="text-fg-muted uppercase tracking-wider truncate">
            {copy.kickerRight}
          </span>
        </div>

        <p className="font-display text-sm font-bold uppercase tracking-wide text-fg truncate mt-1">
          {copy.title}
        </p>
        <p className="text-xs text-fg-secondary leading-snug line-clamp-3 mt-0.5">
          {copy.description}
        </p>
      </div>
    </div>
  );
};
