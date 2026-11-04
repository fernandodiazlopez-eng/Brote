/**
 * Bug — Mascota 8-bits de Upgrade:
 * - Bola de píxeles en el color secundario/acento de la app, apoyada en reposo sin flotar ni emitir chispas continuas.
 * - Mirada curiosa según ubicación (hacia abajo en Rutinas y Estadísticas; hacia el avatar o al frente en Perfil) y parpadeo ocasional.
 * - Nivel 3: Desbloqueo de Bug en la interfaz y carrusel de metro.
 * - Nivel 4: Acariciar con Doble Tap (ojos en arcos felices, parpadeo y destello de chispas del color secundario; sin texto).
 * - Nivel 5: Jugar con Bug con el dedo (círculo completo, rebota limpio con chispas y sonido 8-bits, frena y se teletransporta a su sitio).
 * - Nivel 25: Personalización con gorros 8-bits (Cascos de música y Lacito) con color por código RGB.
 * - Horario de sueño (22:00 – 06:00): duerme con Zzz; despierta confundido si subes rápido, lo lanzas o suena alarma; feliz al acariciarlo; sigue dormido al teletransportarse entre pestañas.
 * - Reacción multimedia: baila con notas musicales 8-bits en la cabeza cuando suena música/multimedia.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  clampRgbByte,
  DEFAULT_BUG_HAT_COLORS,
  getBugMilestoneCopy,
} from '../data/bugCompanionData';
import { useI18n } from '../i18n/I18nContext';
import { BugHatId, BugMusicMode, BugUnlockMilestone, RgbColor } from '../types';
import { playBugBounceSound } from '../utils/audioEffects';

export type BugEyeExpression =
  | 'neutral'
  | 'blink'
  | 'happy'
  | 'sad'
  | 'scared'
  | 'sleeping'
  | 'confused';
export type BugGazeMode = 'down' | 'avatar-front';
export type BugGlobalMood = 'none' | 'sad' | 'happy';

export interface BugReactionContextValue {
  isAlarmRinging: boolean;
  trophyCelebrateToken: number;
  scrollTopHopToken: number;
  fastScrollUpToken: number;
  tabTeleportToken: number;
  muteBounceSound: boolean;
  isSleepHours: boolean;
  isMusicPlaying: boolean;
  musicMode: BugMusicMode;
  equippedHat: BugHatId;
  equippedHatColor: RgbColor;
}

export const BugReactionContext = createContext<BugReactionContextValue>({
  isAlarmRinging: false,
  trophyCelebrateToken: 0,
  scrollTopHopToken: 0,
  fastScrollUpToken: 0,
  tabTeleportToken: 0,
  muteBounceSound: false,
  isSleepHours: false,
  isMusicPlaying: false,
  musicMode: 'auto',
  equippedHat: 'none',
  equippedHatColor: DEFAULT_BUG_HAT_COLORS.headphones,
});

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

function buildHatShades(color: RgbColor): { main: string; hi: string; shade: string } {
  const r = clampRgbByte(color.r);
  const g = clampRgbByte(color.g);
  const b = clampRgbByte(color.b);
  const hiR = Math.min(255, Math.round(r + (255 - r) * 0.45));
  const hiG = Math.min(255, Math.round(g + (255 - g) * 0.45));
  const hiB = Math.min(255, Math.round(b + (255 - b) * 0.45));
  const shR = Math.round(r * 0.58);
  const shG = Math.round(g * 0.58);
  const shB = Math.round(b * 0.58);
  return {
    main: `rgb(${r}, ${g}, ${b})`,
    hi: `rgb(${hiR}, ${hiG}, ${hiB})`,
    shade: `rgb(${shR}, ${shG}, ${shB})`,
  };
}

interface BugPixelGraphicProps {
  expression: BugEyeExpression;
  gazeX?: -1 | 0 | 1;
  gazeY?: -1 | 0 | 1;
  isFullCircle?: boolean;
  hat?: BugHatId;
  hatColor?: RgbColor;
  showSleepingZzz?: boolean;
  showMusicNotes?: boolean;
}

export const BugPixelGraphic: React.FC<BugPixelGraphicProps> = React.memo(({
  expression,
  gazeX = 0,
  gazeY = 0,
  isFullCircle = false,
  hat = 'none',
  hatColor,
  showSleepingZzz = false,
  showMusicNotes = false,
}) => {
  const resolvedHatShades =
    hat === 'none'
      ? null
      : buildHatShades(
          hatColor ??
            (hat === 'bow' ? DEFAULT_BUG_HAT_COLORS.bow : DEFAULT_BUG_HAT_COLORS.headphones)
        );

  return (
    <g shapeRendering="crispEdges">
      <g className={expression === 'sleeping' && !isFullCircle ? 'animate-bug-sleep-breathe' : undefined}>
        <path
          d={isFullCircle ? BUG_FULL_CIRCLE_PATH : BUG_PERCHED_BODY_PATH}
          fill="var(--app-accent-fill)"
        />
        {/* Brillo especular pixelado sutil en la esquina superior izquierda */}
        <rect x={3} y={2} width={2} height={1} fill="#ffffff" fillOpacity={0.28} />
        <rect x={2} y={3} width={1} height={1} fill="#ffffff" fillOpacity={0.22} />

        {/* Expresiones de los ojos 8-bits */}
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

        {expression === 'sleeping' && (
          <g fill="var(--app-accent-fg)">
            <rect x={3} y={8} width={4} height={1} />
            <rect x={9} y={8} width={4} height={1} />
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

        {expression === 'confused' && (
          <g>
            {/* Mirada confundida asimétrica mirando al usuario */}
            <g fill="var(--app-accent-fg)">
              {/* Ceja izquierda alzada + ojo grande */}
              <rect x={3} y={4} width={3} height={1} />
              <rect x={3} y={6} width={3} height={3} />
              {/* Ojo derecho entrecerrado */}
              <rect x={9} y={6} width={4} height={1} />
              <rect x={10} y={7} width={2} height={2} />
            </g>
            {/* Signo de interrogación 8-bits (?) sobre la cabeza */}
            <g fill="var(--app-accent-fill)">
              <rect x={15} y={-9} width={3} height={1} />
              <rect x={14} y={-8} width={1} height={1} />
              <rect x={18} y={-8} width={1} height={2} />
              <rect x={16} y={-6} width={2} height={1} />
              <rect x={16} y={-5} width={1.2} height={1.5} />
              <rect x={16} y={-2.5} width={1.4} height={1.4} />
            </g>
          </g>
        )}

        {expression === 'scared' && (
          <g>
            {/* Signo de exclamación 8-bits sobre la cabeza al asustarse con la alarma */}
            <rect x={7} y={-8} width={2} height={3.5} fill="var(--app-accent-fill)" />
            <rect x={7} y={-3.5} width={2} height={1.5} fill="var(--app-accent-fill)" />
            {/* Ojos desorbitados 8-bits (anillos abiertos 4×4 de alto contraste) */}
            <rect x={3} y={5} width={4} height={4} fill="var(--app-accent-fg)" />
            <rect x={4} y={6} width={2} height={2} fill="var(--app-accent-fill)" />
            <rect x={9} y={5} width={4} height={4} fill="var(--app-accent-fg)" />
            <rect x={10} y={6} width={2} height={2} fill="var(--app-accent-fill)" />
          </g>
        )}

        {/* Gorros 8-bits personalizables con código RGB (Nivel 25+) */}
        {hat === 'headphones' && resolvedHatShades && (
          <g>
            {/* Diadema superior */}
            <rect x={4} y={-2} width={8} height={2} fill={resolvedHatShades.main} />
            <rect x={5} y={-2} width={6} height={1} fill={resolvedHatShades.hi} />
            <rect x={2} y={-1} width={2} height={2} fill={resolvedHatShades.main} />
            <rect x={12} y={-1} width={2} height={2} fill={resolvedHatShades.main} />
            <rect x={0} y={1} width={2} height={2} fill={resolvedHatShades.main} />
            <rect x={14} y={1} width={2} height={2} fill={resolvedHatShades.main} />
            <rect x={-1} y={3} width={1} height={1} fill={resolvedHatShades.shade} />
            <rect x={16} y={3} width={1} height={1} fill={resolvedHatShades.shade} />
            {/* Auricular izquierdo */}
            <rect x={-2} y={4} width={3} height={5} fill={resolvedHatShades.main} />
            <rect x={0} y={4} width={1} height={5} fill={resolvedHatShades.shade} />
            <rect x={-2} y={5} width={1} height={2} fill={resolvedHatShades.hi} />
            {/* Auricular derecho */}
            <rect x={15} y={4} width={3} height={5} fill={resolvedHatShades.main} />
            <rect x={15} y={4} width={1} height={5} fill={resolvedHatShades.shade} />
            <rect x={17} y={5} width={1} height={2} fill={resolvedHatShades.hi} />
          </g>
        )}

        {hat === 'bow' && resolvedHatShades && (
          <g>
            {/* Lazo izquierdo */}
            <rect x={3} y={-3} width={3} height={4} fill={resolvedHatShades.main} />
            <rect x={6} y={-2} width={1} height={2} fill={resolvedHatShades.main} />
            <rect x={3} y={-3} width={2} height={1} fill={resolvedHatShades.hi} />
            <rect x={3} y={0} width={3} height={1} fill={resolvedHatShades.shade} />
            {/* Lazo derecho */}
            <rect x={10} y={-3} width={3} height={4} fill={resolvedHatShades.main} />
            <rect x={9} y={-2} width={1} height={2} fill={resolvedHatShades.main} />
            <rect x={11} y={-3} width={2} height={1} fill={resolvedHatShades.hi} />
            <rect x={10} y={0} width={3} height={1} fill={resolvedHatShades.shade} />
            {/* Nudo central */}
            <rect x={7} y={-2} width={2} height={3} fill={resolvedHatShades.shade} />
            <rect x={7} y={-2} width={2} height={1} fill={resolvedHatShades.hi} />
            <rect x={7} y={-1} width={2} height={1} fill={resolvedHatShades.main} />
          </g>
        )}
      </g>

      {/* Zzz flotantes 8-bits mientras duerme (22:00 – 06:00) */}
      {showSleepingZzz && (
        <g fill="var(--app-accent-fill)">
          <g className="animate-bug-zzz-1">
            <rect x={14} y={-4} width={3} height={0.9} />
            <rect x={15} y={-3.1} width={1} height={0.9} />
            <rect x={14} y={-2.2} width={3} height={0.9} />
          </g>
          <g className="animate-bug-zzz-2">
            <rect x={17} y={-8} width={3.5} height={0.9} />
            <rect x={18.6} y={-7.1} width={1} height={0.9} />
            <rect x={17.7} y={-6.2} width={1} height={0.9} />
            <rect x={17} y={-5.3} width={3.5} height={0.9} />
          </g>
          <g className="animate-bug-zzz-3">
            <rect x={20} y={-12} width={4} height={1} />
            <rect x={22} y={-11} width={1} height={1} />
            <rect x={21} y={-10} width={1} height={1} />
            <rect x={20} y={-9} width={4} height={1} />
          </g>
        </g>
      )}

      {/* Notas musicales 8-bits sobre la cabeza al bailar con música */}
      {showMusicNotes && (
        <g fill="var(--app-accent-fill)">
          {/* Nota izquierda (♪) */}
          <g className="animate-bug-note-1">
            <rect x={-3.5} y={-5.5} width={2.2} height={1.8} />
            <rect x={-2.2} y={-9.5} width={0.9} height={4.5} />
            <rect x={-1.3} y={-9.5} width={1.6} height={0.9} />
            <rect x={-0.5} y={-8.6} width={0.9} height={0.9} />
          </g>
          {/* Nota doble derecha (♫) */}
          <g className="animate-bug-note-2">
            <rect x={15} y={-5.5} width={2} height={1.8} />
            <rect x={16.1} y={-9.5} width={0.9} height={4.5} />
            <rect x={18.5} y={-6.5} width={2} height={1.8} />
            <rect x={19.6} y={-10.5} width={0.9} height={4.5} />
            <rect x={16.1} y={-10.5} width={4.4} height={1} />
          </g>
        </g>
      )}
    </g>
  );
});

type NightSleepPhase = 'asleep' | 'confused' | 'pet-happy' | 'settling-blink';

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
  const {
    isAlarmRinging,
    trophyCelebrateToken,
    scrollTopHopToken,
    fastScrollUpToken,
    tabTeleportToken,
    muteBounceSound,
    isSleepHours,
    isMusicPlaying,
    musicMode,
    equippedHat,
    equippedHatColor,
  } = useContext(BugReactionContext);

  const muteBounceSoundRef = useRef(muteBounceSound);
  muteBounceSoundRef.current = muteBounceSound;

  const isSleepHoursRef = useRef(isSleepHours);
  isSleepHoursRef.current = isSleepHours;

  const [gazeOffset, setGazeOffset] = useState<{ x: -1 | 0 | 1; y: -1 | 0 | 1 }>(() =>
    gazeMode === 'down' ? { x: 0, y: 1 } : { x: 0, y: 0 }
  );
  const [isIdleBlinking, setIsIdleBlinking] = useState(false);
  const [localPetPhase, setLocalPetPhase] = useState<'none' | 'happy' | 'blink'>('none');
  const [nightPhase, setNightPhase] = useState<NightSleepPhase>('asleep');
  const nightPhaseRef = useRef<NightSleepPhase>('asleep');
  nightPhaseRef.current = nightPhase;

  const [teleportKey, setTeleportKey] = useState<number>(() => (tabTeleportToken > 0 ? 1 : 0));
  const [isTeleportingIn, setIsTeleportingIn] = useState<boolean>(() => tabTeleportToken > 0);

  // Estados de saltos y despertares reactivos
  const [activeJumpAnim, setActiveJumpAnim] = useState<
    'none' | 'trophy' | 'top-hop' | 'confused'
  >('none');
  const [jumpAnimKey, setJumpAnimKey] = useState(0);
  const lastSeenTrophyTokenRef = useRef(trophyCelebrateToken);
  const lastSeenTopHopTokenRef = useRef(scrollTopHopToken);
  const lastSeenFastScrollTokenRef = useRef(fastScrollUpToken);
  const lastSeenTabTeleportRef = useRef(tabTeleportToken);
  const wasAlarmRingingRef = useRef(isAlarmRinging);
  const jumpTimerRef = useRef<number | null>(null);
  const teleportInTimerRef = useRef<number | null>(null);
  const returnTeleportTimerRef = useRef<number | null>(null);
  const nightTimersRef = useRef<number[]>([]);

  // Estado para modo Air Hockey (Nivel 5+)
  const [hockeyMode, setHockeyMode] = useState<'idle' | 'grabbed' | 'flying' | 'returning'>('idle');
  const hockeyModeRef = useRef<'idle' | 'grabbed' | 'flying' | 'returning'>('idle');
  hockeyModeRef.current = hockeyMode;

  const [puckExpression, setPuckExpression] = useState<BugEyeExpression>('neutral');
  const [returnSpot, setReturnSpot] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 390,
    h: typeof window !== 'undefined' ? window.innerHeight : 844,
  }));

  const perchButtonRef = useRef<HTMLDivElement | null>(null);
  const petSparksGroupRef = useRef<SVGGElement | null>(null);
  const petRafRef = useRef<number | null>(null);
  const petTimersRef = useRef<number[]>([]);
  const lastTapMsRef = useRef<number>(0);

  // Referencias mutables de captura táctil y física Air Hockey (60/120fps)
  const longPressTimerRef = useRef<number | null>(null);
  const isPressingRef = useRef<boolean>(false);
  const activePointerIdRef = useRef<number | null>(null);
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

  const clearNightTimers = useCallback(() => {
    nightTimersRef.current.forEach((id) => window.clearTimeout(id));
    nightTimersRef.current = [];
  }, []);

  const scheduleSettleBackToSleep = useCallback(
    (awakeDurationMs: number) => {
      clearNightTimers();
      const tBlink = window.setTimeout(() => {
        setNightPhase('settling-blink');
      }, awakeDurationMs);
      const tSleep = window.setTimeout(() => {
        setNightPhase('asleep');
        setActiveJumpAnim((prev) => (prev === 'confused' ? 'none' : prev));
      }, awakeDurationMs + 300);
      nightTimersRef.current.push(tBlink, tSleep);
    },
    [clearNightTimers]
  );

  const triggerNightWakeConfused = useCallback(
    (durationMs = 3000) => {
      clearNightTimers();
      setNightPhase('confused');
      setActiveJumpAnim('confused');
      setJumpAnimKey((k) => k + 1);
      scheduleSettleBackToSleep(durationMs);
    },
    [clearNightTimers, scheduleSettleBackToSleep]
  );

  // Al entrar o salir del horario nocturno (22:00 – 06:00), sincronizar fase de sueño
  useEffect(() => {
    clearNightTimers();
    setNightPhase('asleep');
    if (!isSleepHours) {
      setActiveJumpAnim((prev) => (prev === 'confused' ? 'none' : prev));
    }
  }, [isSleepHours, clearNightTimers]);

  // Sincronizar dirección base al cambiar gazeMode
  useEffect(() => {
    setGazeOffset(gazeMode === 'down' ? { x: 0, y: 1 } : { x: 0, y: 0 });
  }, [gazeMode]);

  // Mirada curiosa y parpadeo ocasional en reposo (pausado mientras duerme)
  useEffect(() => {
    const isCurrentlySleeping = isSleepHours && nightPhase === 'asleep' && musicMode !== 'on';
    if (hockeyMode !== 'idle' || isAlarmRinging || isCurrentlySleeping) return;

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
          setIsIdleBlinking(true);
          blinkResetTimer = window.setTimeout(() => {
            if (!cancelled) setIsIdleBlinking(false);
          }, 125);
        } else if (gazeMode === 'down') {
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
  }, [gazeMode, hockeyMode, isAlarmRinging, isSleepHours, nightPhase, musicMode]);

  // Limpieza global al desmontar
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
      if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current);
      if (teleportInTimerRef.current !== null) window.clearTimeout(teleportInTimerRef.current);
      if (returnTeleportTimerRef.current !== null) {
        window.clearTimeout(returnTeleportTimerRef.current);
      }
      if (petRafRef.current !== null) window.cancelAnimationFrame(petRafRef.current);
      if (flightRafRef.current !== null) window.cancelAnimationFrame(flightRafRef.current);
      petTimersRef.current.forEach((id) => window.clearTimeout(id));
      nightTimersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // Destello de chispas 8-bits (usado al acariciar y al celebrar un logro)
  const emitLocalSparksBurst = useCallback(() => {
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

  const triggerPetSparksAndExpression = useCallback(() => {
    petTimersRef.current.forEach((id) => window.clearTimeout(id));
    petTimersRef.current = [];

    if (isSleepHoursRef.current) {
      // Si lo acaricias dormido: despierta feliz y vuelve a dormirse tranquilamente
      clearNightTimers();
      setActiveJumpAnim('none');
      setNightPhase('pet-happy');
      emitLocalSparksBurst();
      scheduleSettleBackToSleep(1650);
      return;
    }

    setLocalPetPhase('happy');
    const t1 = window.setTimeout(() => setLocalPetPhase('blink'), 170);
    const t2 = window.setTimeout(() => setLocalPetPhase('happy'), 280);
    const t3 = window.setTimeout(() => setLocalPetPhase('none'), 1450);
    petTimersRef.current.push(t1, t2, t3);

    emitLocalSparksBurst();
  }, [clearNightTimers, emitLocalSparksBurst, scheduleSettleBackToSleep]);

  // Partículas verticales 8-bits de teletransporte al materializarse en su sitio
  const emitTeleportParticles = useCallback(() => {
    if (petRafRef.current !== null) {
      window.cancelAnimationFrame(petRafRef.current);
      petRafRef.current = null;
    }

    const columns = [-1, 2, 5, 8, 11, 14, 17];
    const particles: PixelSparkParticle[] = columns.map((colX, idx) => ({
      x: colX,
      y: 12 - (idx % 3) * 3,
      vx: (idx - 3) * 4,
      vy: -(34 + (idx % 3) * 14),
      life: 0,
      maxLife: 0.34 + (idx % 2) * 0.07,
      size: idx % 2 === 0 ? 1.8 : 1.4,
    }));

    let lastTs = performance.now();
    const stepTeleportSparks = (now: number) => {
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

        const progress = p.life / p.maxLife;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', (Math.round(p.x * 2) / 2).toFixed(1));
        rect.setAttribute('y', (Math.round(p.y * 2) / 2).toFixed(1));
        rect.setAttribute('width', p.size.toFixed(1));
        rect.setAttribute('height', (p.size * 1.8).toFixed(1));
        rect.setAttribute('fill', 'var(--app-accent-fill)');
        rect.setAttribute('fill-opacity', (1 - progress * 0.88).toFixed(2));
        group.appendChild(rect);
      }

      if (aliveCount > 0) {
        petRafRef.current = window.requestAnimationFrame(stepTeleportSparks);
      } else {
        petRafRef.current = null;
      }
    };

    petRafRef.current = window.requestAnimationFrame(stepTeleportSparks);
  }, []);

  const triggerTeleportArrival = useCallback(() => {
    if (teleportInTimerRef.current !== null) {
      window.clearTimeout(teleportInTimerRef.current);
    }
    setTeleportKey((k) => k + 1);
    setIsTeleportingIn(true);
    emitTeleportParticles();
    teleportInTimerRef.current = window.setTimeout(() => {
      setIsTeleportingIn(false);
      teleportInTimerRef.current = null;
    }, 360);
  }, [emitTeleportParticles]);

  const teleportBackFromPosition = useCallback(
    (spotX: number, spotY: number) => {
      if (returnTeleportTimerRef.current !== null) {
        window.clearTimeout(returnTeleportTimerRef.current);
      }
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
      setReturnSpot({ x: spotX, y: spotY });
      hockeyModeRef.current = 'returning';
      setHockeyMode('returning');

      returnTeleportTimerRef.current = window.setTimeout(() => {
        returnTeleportTimerRef.current = null;
        hockeyModeRef.current = 'idle';
        setHockeyMode('idle');
        setPuckExpression('neutral');
        triggerTeleportArrival();

        // Al volver de haber sido lanzado por la noche, se queda mirando confundido antes de dormirse
        if (isSleepHoursRef.current) {
          clearNightTimers();
          setNightPhase('confused');
          scheduleSettleBackToSleep(3200);
        }
      }, 160);
    },
    [clearNightTimers, scheduleSettleBackToSleep, triggerTeleportArrival]
  );

  // Efecto de teletransporte al montar tras cambiar entre Rutinas, Perfil y Estadísticas (sigue dormido si era de noche)
  useEffect(() => {
    if (tabTeleportToken <= 0) return;
    emitTeleportParticles();
    teleportInTimerRef.current = window.setTimeout(() => {
      setIsTeleportingIn(false);
      teleportInTimerRef.current = null;
    }, 360);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // También si cambia de vista permaneciendo el mismo componente montado (sigue dormido)
  useEffect(() => {
    if (tabTeleportToken <= lastSeenTabTeleportRef.current) return;
    lastSeenTabTeleportRef.current = tabTeleportToken;
    if (hockeyModeRef.current !== 'idle') return;
    triggerTeleportArrival();
  }, [tabTeleportToken, triggerTeleportArrival]);

  // Alarma en horario de sueño: despierta confundido mientras suena y al parar vuelve a dormirse
  useEffect(() => {
    if (isSleepHours) {
      if (isAlarmRinging) {
        clearNightTimers();
        setNightPhase('confused');
        setActiveJumpAnim('confused');
        setJumpAnimKey((k) => k + 1);
      } else if (wasAlarmRingingRef.current) {
        scheduleSettleBackToSleep(3000);
      }
    }
    wasAlarmRingingRef.current = isAlarmRinging;
  }, [isAlarmRinging, isSleepHours, clearNightTimers, scheduleSettleBackToSleep]);

  // Reacción 1: Salto feliz cuando el usuario desbloquea un logro
  useEffect(() => {
    if (trophyCelebrateToken <= lastSeenTrophyTokenRef.current) return;
    lastSeenTrophyTokenRef.current = trophyCelebrateToken;
    if (hockeyModeRef.current !== 'idle' || isAlarmRinging) return;

    if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current);
    petTimersRef.current.forEach((id) => window.clearTimeout(id));
    petTimersRef.current = [];

    if (isSleepHoursRef.current) {
      clearNightTimers();
      setNightPhase('pet-happy');
      scheduleSettleBackToSleep(2200);
    } else {
      setLocalPetPhase('happy');
      const happyEndId = window.setTimeout(() => setLocalPetPhase('none'), 2400);
      petTimersRef.current.push(happyEndId);
    }

    setActiveJumpAnim('trophy');
    setJumpAnimKey((k) => k + 1);
    emitLocalSparksBurst();

    jumpTimerRef.current = window.setTimeout(() => {
      setActiveJumpAnim('none');
      jumpTimerRef.current = null;
    }, 1300);
  }, [
    trophyCelebrateToken,
    isAlarmRinging,
    clearNightTimers,
    scheduleSettleBackToSleep,
    emitLocalSparksBurst,
  ]);

  // Reacción 2: Subir rápido la pantalla durante la noche -> despierta confundido
  useEffect(() => {
    if (fastScrollUpToken <= lastSeenFastScrollTokenRef.current) return;
    lastSeenFastScrollTokenRef.current = fastScrollUpToken;
    if (!isSleepHoursRef.current || hockeyModeRef.current !== 'idle' || isAlarmRinging) return;
    triggerNightWakeConfused(3000);
  }, [fastScrollUpToken, isAlarmRinging, triggerNightWakeConfused]);

  // Reacción 3: Saltito cuando el usuario sube la app hasta el tope (o despierta confundido de noche)
  useEffect(() => {
    if (scrollTopHopToken <= lastSeenTopHopTokenRef.current) return;
    lastSeenTopHopTokenRef.current = scrollTopHopToken;
    if (hockeyModeRef.current !== 'idle' || isAlarmRinging || activeJumpAnim === 'trophy') return;

    if (isSleepHoursRef.current) {
      triggerNightWakeConfused(3000);
      return;
    }

    if (jumpTimerRef.current !== null) window.clearTimeout(jumpTimerRef.current);
    setLocalPetPhase('happy');
    const calmId = window.setTimeout(() => setLocalPetPhase('none'), 420);
    petTimersRef.current.push(calmId);

    setActiveJumpAnim('top-hop');
    setJumpAnimKey((k) => k + 1);

    jumpTimerRef.current = window.setTimeout(() => {
      setActiveJumpAnim('none');
      jumpTimerRef.current = null;
    }, 360);
  }, [scrollTopHopToken, isAlarmRinging, activeJumpAnim, triggerNightWakeConfused]);

  // Bloquear gestos nativos del navegador móvil sobre Bug (selección de texto, menú contextual y scroll accidental)
  useEffect(() => {
    const el = perchButtonRef.current;
    if (!el || (!canLaunchHockey && !canPet)) return;

    const handleNativeTouchStart = (ev: TouchEvent) => {
      ev.stopPropagation();
      if (canLaunchHockey && ev.cancelable) {
        ev.preventDefault();
      }
    };

    const handleNativeTouchMove = (ev: TouchEvent) => {
      if ((isPressingRef.current || hockeyModeRef.current === 'grabbed') && ev.cancelable) {
        ev.preventDefault();
      }
    };

    el.addEventListener('touchstart', handleNativeTouchStart, { passive: false });
    el.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', handleNativeTouchStart);
      el.removeEventListener('touchmove', handleNativeTouchMove);
    };
  }, [canLaunchHockey, canPet]);

  const spawnWallCollisionSparks = useCallback(
    (hitX: number, hitY: number, nx: number, ny: number) => {
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
    },
    []
  );

  const enterGrabbedHockeyMode = useCallback(
    (initialX: number, initialY: number) => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (hockeyModeRef.current !== 'idle') return;

      const w = window.innerWidth;
      const h = window.innerHeight;
      const clampedX = Math.max(22, Math.min(w - 22, initialX));
      const clampedY = Math.max(22, Math.min(h - 22, initialY));
      const now = performance.now();

      setViewportSize({ w, h });
      puckPosRef.current = { x: clampedX, y: clampedY, vx: 0, vy: 0 };
      if (pointerHistoryRef.current.length === 0) {
        pointerHistoryRef.current = [{ x: clampedX, y: clampedY, t: now }];
      } else {
        pointerHistoryRef.current.push({ x: clampedX, y: clampedY, t: now });
      }
      wallSparksRef.current = [];

      if (isSleepHoursRef.current) {
        clearNightTimers();
        setNightPhase('confused');
        setPuckExpression('confused');
      } else {
        setPuckExpression('happy');
      }

      hockeyModeRef.current = 'grabbed';
      setHockeyMode('grabbed');

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(18);
        } catch {
          // Ignorar restricciones de vibración
        }
      }
    },
    [clearNightTimers]
  );

  // Seguimiento fluido del dedo o ratón mientras Bug está agarrado (modo Air Hockey)
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

    const recordMoveAt = (clientX: number, clientY: number) => {
      const now = performance.now();
      const w = window.innerWidth;
      const h = window.innerHeight;
      const clampedX = Math.max(22, Math.min(w - 22, clientX));
      const clampedY = Math.max(22, Math.min(h - 22, clientY));

      puckPosRef.current.x = clampedX;
      puckPosRef.current.y = clampedY;
      updatePuckTransform(clampedX, clampedY);

      const history = pointerHistoryRef.current;
      history.push({ x: clampedX, y: clampedY, t: now });
      while (history.length > 1 && now - history[0].t > 165) {
        history.shift();
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
        return;
      }
      if (e.cancelable) e.preventDefault();
      recordMoveAt(e.clientX, e.clientY);
    };

    const handleTouchMoveWindow = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      recordMoveAt(touch.clientX, touch.clientY);
    };

    let didFinish = false;
    const finishGrabAndLaunch = () => {
      if (didFinish) return;
      didFinish = true;
      isPressingRef.current = false;
      activePointerIdRef.current = null;
      downOriginRef.current = null;

      const now = performance.now();
      const history = pointerHistoryRef.current;
      let vx = 0;
      let vy = 0;

      if (history.length >= 2) {
        const latest = history[history.length - 1];
        let anchor = history[0];
        for (let i = history.length - 2; i >= 0; i -= 1) {
          const dtMs = latest.t - history[i].t;
          if (dtMs >= 14 && dtMs <= 145) {
            anchor = history[i];
          }
        }
        const dtSec = Math.max(0.004, (latest.t - anchor.t) / 1000);
        const idleSinceLastMoveMs = now - latest.t;
        if (idleSinceLastMoveMs < 220) {
          vx = ((latest.x - anchor.x) / dtSec) * 1.18;
          vy = ((latest.y - anchor.y) / dtSec) * 1.18;
        }
      }

      const rawSpeed = Math.hypot(vx, vy);
      if (rawSpeed < 50) {
        teleportBackFromPosition(puckPosRef.current.x, puckPosRef.current.y);
        return;
      }

      const maxSpeed = 2400;
      const clampedSpeed = Math.min(maxSpeed, Math.max(280, rawSpeed));
      const scale = clampedSpeed / rawSpeed;
      puckPosRef.current.vx = vx * scale;
      puckPosRef.current.vy = vy * scale;
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
      setPuckExpression(isSleepHoursRef.current ? 'confused' : 'happy');
      bounceHappyUntilRef.current = now + 340;
      hockeyModeRef.current = 'flying';
      setHockeyMode('flying');
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('touchmove', handleTouchMoveWindow, { passive: false });
    window.addEventListener('pointerup', finishGrabAndLaunch);
    window.addEventListener('pointercancel', finishGrabAndLaunch);
    window.addEventListener('touchend', finishGrabAndLaunch);
    window.addEventListener('touchcancel', finishGrabAndLaunch);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('touchmove', handleTouchMoveWindow);
      window.removeEventListener('pointerup', finishGrabAndLaunch);
      window.removeEventListener('pointercancel', finishGrabAndLaunch);
      window.removeEventListener('touchend', finishGrabAndLaunch);
      window.removeEventListener('touchcancel', finishGrabAndLaunch);
    };
  }, [hockeyMode, teleportBackFromPosition]);

  // Bucle físico de disco Air Hockey (Nivel 5+)
  useEffect(() => {
    if (hockeyMode !== 'flying') return;

    let lastTs = performance.now();
    let currentExpr: BugEyeExpression = isSleepHoursRef.current ? 'confused' : 'happy';

    const stepPhysics = (now: number) => {
      const dt = Math.min(0.032, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      const w = window.innerWidth;
      const h = window.innerHeight;
      const minX = 22;
      const maxX = Math.max(minX + 1, w - 22);
      const minY = 22;
      const maxY = Math.max(minY + 1, h - 22);

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
        if (!muteBounceSoundRef.current) {
          playBugBounceSound(Math.min(1, speedAfterBounce / 1450));
        }
        bounceHappyUntilRef.current = now + 280;
      }

      const desiredExpr: BugEyeExpression = isSleepHoursRef.current
        ? 'confused'
        : isAlarmRinging
        ? 'scared'
        : now < bounceHappyUntilRef.current
        ? 'happy'
        : 'neutral';
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
        wallSparksRef.current = [];
        flightRafRef.current = null;
        teleportBackFromPosition(state.x, state.y);
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
  }, [hockeyMode, isAlarmRinging, spawnWallCollisionSparks, teleportBackFromPosition]);

  const clearPendingHold = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    isPressingRef.current = false;
    activePointerIdRef.current = null;
    downOriginRef.current = null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    if (canLaunchHockey && e.cancelable) {
      e.preventDefault();
    }
    if (hockeyModeRef.current !== 'idle') return;

    clearPendingHold();
    isPressingRef.current = true;
    activePointerIdRef.current = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const now = performance.now();
    downOriginRef.current = { x: startX, y: startY };
    pointerHistoryRef.current = [{ x: startX, y: startY, t: now }];

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignorar si el navegador no soporta captura en este puntero
    }

    if (canLaunchHockey) {
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        if (!isPressingRef.current || hockeyModeRef.current !== 'idle') return;
        const latestSample =
          pointerHistoryRef.current[pointerHistoryRef.current.length - 1] || {
            x: startX,
            y: startY,
          };
        enterGrabbedHockeyMode(latestSample.x, latestSample.y);
      }, 155);
    }
  };

  const handlePointerMoveLocal = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPressingRef.current || hockeyModeRef.current !== 'idle' || !downOriginRef.current) {
      return;
    }
    const now = performance.now();
    pointerHistoryRef.current.push({ x: e.clientX, y: e.clientY, t: now });
    while (pointerHistoryRef.current.length > 1 && now - pointerHistoryRef.current[0].t > 165) {
      pointerHistoryRef.current.shift();
    }

    const dist = Math.hypot(
      e.clientX - downOriginRef.current.x,
      e.clientY - downOriginRef.current.y
    );

    if (dist >= 8) {
      if (canLaunchHockey) {
        enterGrabbedHockeyMode(e.clientX, e.clientY);
      } else {
        clearPendingHold();
      }
    }
  };

  const handlePointerUpLocal = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignorar
    }

    if (hockeyModeRef.current !== 'idle') return;

    const wasQuickTap = isPressingRef.current;
    clearPendingHold();

    if (!wasQuickTap) return;

    if (canPet) {
      const now = Date.now();
      if (now - lastTapMsRef.current <= 380) {
        lastTapMsRef.current = 0;
        triggerPetSparksAndExpression();
      } else {
        lastTapMsRef.current = now;
      }
    }
  };

  const isDetached = hockeyMode !== 'idle';
  const effectiveNightSleepMode = isSleepHours && musicMode !== 'on';
  const isDancingToMusic =
    !isDetached &&
    isMusicPlaying &&
    !isAlarmRinging &&
    activeJumpAnim === 'none' &&
    !isTeleportingIn &&
    !effectiveNightSleepMode;

  let resolvedExpression: BugEyeExpression;
  if (effectiveNightSleepMode) {
    if (isAlarmRinging || nightPhase === 'confused') {
      resolvedExpression = 'confused';
    } else if (nightPhase === 'pet-happy') {
      resolvedExpression = 'happy';
    } else if (nightPhase === 'settling-blink') {
      resolvedExpression = 'blink';
    } else {
      resolvedExpression = 'sleeping';
    }
  } else if (isAlarmRinging) {
    resolvedExpression = 'scared';
  } else if (localPetPhase === 'blink') {
    resolvedExpression = 'blink';
  } else if (localPetPhase === 'happy') {
    resolvedExpression = 'happy';
  } else if (isDancingToMusic) {
    resolvedExpression = isIdleBlinking ? 'blink' : 'happy';
  } else if (globalMood === 'sad') {
    resolvedExpression = 'sad';
  } else if (globalMood === 'happy') {
    resolvedExpression = 'happy';
  } else if (isIdleBlinking) {
    resolvedExpression = 'blink';
  } else {
    resolvedExpression = 'neutral';
  }

  const showSleepingZzz =
    !isDetached && effectiveNightSleepMode && resolvedExpression === 'sleeping';
  const showMusicNotes = isDancingToMusic;

  const perchedMotionClass = isTeleportingIn
    ? 'animate-bug-teleport-in'
    : isAlarmRinging
    ? effectiveNightSleepMode
      ? 'animate-bug-confused'
      : 'animate-bug-scared'
    : activeJumpAnim === 'trophy'
    ? 'animate-bug-trophy-jump'
    : activeJumpAnim === 'confused'
    ? 'animate-bug-confused'
    : activeJumpAnim === 'top-hop'
    ? 'animate-bug-top-hop'
    : isDancingToMusic
    ? 'animate-bug-music-dance'
    : teleportKey > 0
    ? 'animate-bug-teleport-in'
    : '';

  return (
    <>
      <div
        ref={perchButtonRef}
        role="button"
        tabIndex={0}
        aria-label="Bug"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMoveLocal}
        onPointerUp={handlePointerUpLocal}
        onPointerCancel={() => {
          if (hockeyModeRef.current === 'idle') {
            clearPendingHold();
          }
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && canPet) {
            e.preventDefault();
            triggerPetSparksAndExpression();
          }
        }}
        className={`relative z-20 inline-flex items-end justify-center min-w-[46px] min-h-[42px] -mx-[7px] -mt-[14px] pt-[14px] select-none ${
          canPet || canLaunchHockey ? 'cursor-pointer' : 'cursor-default'
        } ${
          canLaunchHockey ? 'touch-none' : 'touch-manipulation'
        } leading-none ${
          hockeyMode === 'flying' || hockeyMode === 'returning' ? 'pointer-events-none' : ''
        } ${className}`}
      >
        <svg
          key={`${teleportKey}-${jumpAnimKey}-${isAlarmRinging ? 'alarm' : 'calm'}`}
          viewBox="-12 -14 40 28"
          className={`w-[60px] h-[42px] -mx-[14px] -mt-[14px] block overflow-visible pointer-events-none ${
            isDetached ? 'opacity-0' : perchedMotionClass
          }`}
          shapeRendering="crispEdges"
        >
          {/* Haz pixelado 8-bits de teletransporte al aparecer en su sitio */}
          {!isDetached && isTeleportingIn && (
            <g className="animate-bug-teleport-beam" fill="var(--app-accent-fill)">
              <rect x={7} y={-12} width={2} height={26} fillOpacity={0.62} />
              <rect x={4} y={-9} width={1} height={22} fillOpacity={0.38} />
              <rect x={11} y={-9} width={1} height={22} fillOpacity={0.38} />
              <rect x={1} y={13} width={14} height={1} fillOpacity={0.85} />
            </g>
          )}
          <BugPixelGraphic
            expression={resolvedExpression}
            gazeX={gazeOffset.x}
            gazeY={gazeOffset.y}
            hat={equippedHat}
            hatColor={equippedHatColor}
            showSleepingZzz={showSleepingZzz}
            showMusicNotes={showMusicNotes}
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
            {hockeyMode === 'returning' ? (
              <g
                transform={`translate(${Math.round(returnSpot.x - 16)} ${Math.round(
                  returnSpot.y - 16
                )}) scale(2)`}
              >
                <g className="animate-bug-teleport-out">
                  <rect
                    x={7}
                    y={-8}
                    width={2}
                    height={26}
                    fill="var(--app-accent-fill)"
                    fillOpacity={0.68}
                  />
                  <rect
                    x={4}
                    y={-4}
                    width={1}
                    height={20}
                    fill="var(--app-accent-fill)"
                    fillOpacity={0.4}
                  />
                  <rect
                    x={11}
                    y={-4}
                    width={1}
                    height={20}
                    fill="var(--app-accent-fill)"
                    fillOpacity={0.4}
                  />
                  <BugPixelGraphic
                    expression={effectiveNightSleepMode ? 'confused' : 'happy'}
                    gazeX={0}
                    gazeY={0}
                    isFullCircle
                    hat={equippedHat}
                    hatColor={equippedHatColor}
                  />
                </g>
              </g>
            ) : (
              <g ref={flyingPuckGroupRef}>
                <BugPixelGraphic
                  expression={puckExpression}
                  gazeX={0}
                  gazeY={0}
                  isFullCircle
                  hat={equippedHat}
                  hatColor={equippedHatColor}
                />
              </g>
            )}
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
 * desbloquear acariciarlo (Nivel 4), jugar con él (Nivel 5) o desbloquear gorros (Nivel 25).
 */
export const BugUnlockBanner: React.FC<BugUnlockBannerProps> = ({
  milestone,
  onDismiss,
}) => {
  const { language } = useI18n();
  const copy = getBugMilestoneCopy(milestone, language);
  const isPlayMilestone = milestone === 'level5';
  const isCustomMilestone = milestone === 'level25';
  const litSlotsCount =
    milestone === 'level25' || milestone === 'level5'
      ? 5
      : milestone === 'level4'
      ? 3
      : 2;

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
          viewBox="-5 -5 26 24"
          className="w-12 h-12 block"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          {/* Chispas decorativas 8-bits en el emblema de desbloqueo */}
          <rect x={-3} y={0} width={1.5} height={1.5} fill="var(--app-accent-fill)" />
          <rect x={17.5} y={-1} width={1.5} height={1.5} fill="var(--app-accent-fill)" />
          {(isPlayMilestone || isCustomMilestone) && (
            <>
              <rect x={-3.5} y={11} width={1.5} height={1.5} fill="var(--app-accent-fill)" />
              <rect x={18} y={12} width={1.5} height={1.5} fill="var(--app-accent-fill)" />
            </>
          )}
          <BugPixelGraphic
            expression="happy"
            gazeX={0}
            gazeY={0}
            isFullCircle={isPlayMilestone}
            hat={isCustomMilestone ? 'headphones' : 'none'}
            hatColor={DEFAULT_BUG_HAT_COLORS.headphones}
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
