/**
 * Insignia vectorial de precisión estilo Nothing OS × Cyberpunk para los 5 rangos de trofeos:
 * - Ventana óptica OLED empotrada con retículas de esquina y matriz de puntos.
 * - Brillo óptico progresivo por dificultad: Bronce (mate) -> Plata (brillo plata) ->
 *   Oro (+brillo dorado) -> Platino (++brillo cian-platino) -> Platino Diamante (máximo brillo prismático).
 */

import React, { useId } from 'react';
import { TROPHY_TIER_STYLES } from '../data/trophiesCatalog';
import { TrophyTier } from '../types';

interface LedNodeSpec {
  x: number;
  y: number;
  size: number;
  color: string;
  animClass: string;
}

const TIER_PALETTE_HEX: Record<
  TrophyTier,
  {
    reticle: string;
    ring: string;
    litFacetStart: string;
    litFacetEnd: string;
    shadowFacetStart: string;
    shadowFacetEnd: string;
    edgeStroke: string;
    coreFill: string;
    coreAccent: string;
    ledHex: string;
    auraHex: string;
    auraOpacity: number;
    cupGlowClass: string;
  }
> = {
  bronce: {
    reticle: '#b3623b',
    ring: '#9c522b',
    litFacetStart: '#e29e78',
    litFacetEnd: '#b3623b',
    shadowFacetStart: '#9c522b',
    shadowFacetEnd: '#5e2c14',
    edgeStroke: '#8f4925',
    coreFill: '#24120a',
    coreAccent: '#e29e78',
    ledHex: '#d4875e',
    auraHex: '#b3623b',
    auraOpacity: 0,
    cupGlowClass: '',
  },
  plata: {
    reticle: '#64748b',
    ring: '#94a3b8',
    litFacetStart: '#f8fafc',
    litFacetEnd: '#cbd5e1',
    shadowFacetStart: '#94a3b8',
    shadowFacetEnd: '#475569',
    edgeStroke: '#64748b',
    coreFill: '#1e293b',
    coreAccent: '#f1f5f9',
    ledHex: '#cbd5e1',
    auraHex: '#cbd5e1',
    auraOpacity: 0.22,
    cupGlowClass: 'trophy-cup-glow-plata',
  },
  oro: {
    reticle: '#d99000',
    ring: '#eab308',
    litFacetStart: '#fef08a',
    litFacetEnd: '#eab308',
    shadowFacetStart: '#ca8a04',
    shadowFacetEnd: '#784700',
    edgeStroke: '#b47800',
    coreFill: '#291a00',
    coreAccent: '#fef08a',
    ledHex: '#f5c438',
    auraHex: '#f5c438',
    auraOpacity: 0.34,
    cupGlowClass: 'trophy-cup-glow-oro',
  },
  platino: {
    reticle: '#0284c7',
    ring: '#38bdf8',
    litFacetStart: '#f0f9ff',
    litFacetEnd: '#7dd3fc',
    shadowFacetStart: '#38bdf8',
    shadowFacetEnd: '#0369a1',
    edgeStroke: '#0284c7',
    coreFill: '#082f49',
    coreAccent: '#bae6fd',
    ledHex: '#38bdf8',
    auraHex: '#38bdf8',
    auraOpacity: 0.44,
    cupGlowClass: 'trophy-cup-glow-platino',
  },
  diamante: {
    reticle: '#6366f1',
    ring: '#38bdf8',
    litFacetStart: '#ffffff',
    litFacetEnd: '#bae6fd',
    shadowFacetStart: '#818cf8',
    shadowFacetEnd: '#3730a3',
    edgeStroke: '#4f46e5',
    coreFill: '#1e1b4b',
    coreAccent: '#a5b4fc',
    ledHex: '#818cf8',
    auraHex: '#818cf8',
    auraOpacity: 0.56,
    cupGlowClass: 'trophy-cup-glow-diamante',
  },
};

const EMBLEM_LED_NODES: Record<TrophyTier, LedNodeSpec[]> = {
  // Bronce: 0 destellos (cobre satinado industrial)
  bronce: [],
  // Plata: 2 destellos plateados suaves
  plata: [
    { x: 48, y: 12, size: 1.8, color: '#94a3b8', animClass: 'animate-sparkle-1' },
    { x: 15, y: 15, size: 1.6, color: '#cbd5e1', animClass: 'animate-sparkle-3' },
  ],
  // Oro: 4 destellos dorados limpios
  oro: [
    { x: 49, y: 10, size: 2.1, color: '#eab308', animClass: 'animate-sparkle-1' },
    { x: 13, y: 12, size: 1.9, color: '#f5c438', animClass: 'animate-sparkle-2' },
    { x: 52, y: 35, size: 1.7, color: '#ca8a04', animClass: 'animate-sparkle-4' },
    { x: 12, y: 36, size: 1.7, color: '#eab308', animClass: 'animate-sparkle-5' },
  ],
  // Platino: 6 destellos platino-hielo
  platino: [
    { x: 50, y: 9, size: 2.2, color: '#38bdf8', animClass: 'animate-sparkle-1' },
    { x: 12, y: 10, size: 2.1, color: '#0284c7', animClass: 'animate-sparkle-2' },
    { x: 54, y: 24, size: 1.9, color: '#7dd3fc', animClass: 'animate-sparkle-3' },
    { x: 9, y: 25, size: 1.9, color: '#38bdf8', animClass: 'animate-sparkle-4' },
    { x: 52, y: 38, size: 1.8, color: '#0284c7', animClass: 'animate-sparkle-5' },
    { x: 11, y: 39, size: 1.8, color: '#7dd3fc', animClass: 'animate-sparkle-6' },
  ],
  // Platino Diamante: 8 destellos cristal-zafiro
  diamante: [
    { x: 51, y: 8, size: 2.4, color: '#6366f1', animClass: 'animate-sparkle-1' },
    { x: 11, y: 8, size: 2.3, color: '#38bdf8', animClass: 'animate-sparkle-2' },
    { x: 32, y: 2.5, size: 2.1, color: '#818cf8', animClass: 'animate-sparkle-5' },
    { x: 56, y: 23, size: 2.1, color: '#6366f1', animClass: 'animate-sparkle-3' },
    { x: 7, y: 23, size: 2.1, color: '#38bdf8', animClass: 'animate-sparkle-4' },
    { x: 53, y: 39, size: 1.9, color: '#38bdf8', animClass: 'animate-sparkle-6' },
    { x: 10, y: 39, size: 1.9, color: '#818cf8', animClass: 'animate-sparkle-1' },
    { x: 45, y: 14, size: 1.7, color: '#a5b4fc', animClass: 'animate-sparkle-2' },
  ],
};

const PEDESTAL_LED_X = [20.5, 25.5, 30.5, 35.5, 40.5];
const DIAMOND_LED_HEX = ['#38bdf8', '#818cf8', '#e0e7ff', '#818cf8', '#38bdf8'];

export const TrophyTierRankLeds: React.FC<{ tier: TrophyTier }> = ({ tier }) => {
  const { qualityRank, ledActiveClass } = TROPHY_TIER_STYLES[tier];

  return (
    <span aria-hidden="true" className="inline-flex items-center gap-[2px] shrink-0">
      {[1, 2, 3, 4, 5].map((slot) => (
        <span
          key={slot}
          className={`w-[3px] h-[7px] rounded-[0.5px] ${
            slot <= qualityRank ? ledActiveClass : 'bg-elevated'
          }`}
        />
      ))}
    </span>
  );
};

export const TrophyCardSheen: React.FC<{ tier: TrophyTier }> = ({ tier }) => {
  const { sheenTrackAnimClass, sheenBarClass, sheenWidthClass } = TROPHY_TIER_STYLES[tier];
  if (!sheenTrackAnimClass || !sheenBarClass) return null;

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${sheenTrackAnimClass}`}
    >
      <div
        className={`absolute inset-y-0 right-full trophy-sheen-beam ${sheenWidthClass} ${sheenBarClass}`}
      />
    </div>
  );
};

interface TrophyEmblemProps {
  tier: TrophyTier;
  size?: 'md' | 'lg';
  animatePop?: boolean;
  locked?: boolean;
}

export const TrophyEmblem: React.FC<TrophyEmblemProps> = ({
  tier,
  size = 'md',
  animatePop = false,
  locked = false,
}) => {
  const rawUid = useId().replace(/:/g, '');
  const meta = TROPHY_TIER_STYLES[tier];
  const palette = TIER_PALETTE_HEX[tier];
  const ledNodes = EMBLEM_LED_NODES[tier];

  const boxSizeClass = size === 'lg' ? 'w-16 h-16' : 'w-14 h-14';
  const svgSizeClass = size === 'lg' ? 'w-14 h-14' : 'w-12 h-12';

  if (locked) {
    return (
      <div
        className={`relative ${boxSizeClass} trophy-oled-window border border-subtle flex items-center justify-center shrink-0 overflow-hidden`}
      >
        <svg viewBox="0 0 64 64" className={svgSizeClass} aria-hidden="true">
          <g fill="none" stroke="var(--trophy-locked-stroke)" strokeWidth={1}>
            <path d="M5 10 V5 H10 M54 5 H59 V10 M5 54 V59 H10 M54 59 H59 V54" opacity={0.55} />
            <polygon points="18,15 46,15 44.5,18 19.5,18" strokeDasharray="2 2" />
            <polygon points="19.5,18 44.5,18 42,28 36.5,35 27.5,35 22,28" />
            <polyline points="19.5,20 14,20 12.5,22 12.5,27 15.5,30 21.5,30" opacity={0.7} />
            <polyline points="44.5,20 50,20 51.5,22 51.5,27 48.5,30 42.5,30" opacity={0.7} />
            <line x1={32} y1={18} x2={32} y2={35} opacity={0.45} />
            <polygon points="29.5,35 34.5,35 35.5,44.5 28.5,44.5" />
            <rect x={16} y={47} width={32} height={8.5} rx={1} />
          </g>
          {PEDESTAL_LED_X.map((xPos, idx) => (
            <rect key={idx} x={xPos} y={50} width={3} height={2.5} fill="var(--trophy-locked-led)" />
          ))}
        </svg>
      </div>
    );
  }

  const litGradId = `lit-${tier}-${rawUid}`;
  const shadowGradId = `shd-${tier}-${rawUid}`;
  const auraGradId = `aura-${tier}-${rawUid}`;
  const prismGradId = `prism-${tier}-${rawUid}`;

  const isSilverPlus = tier !== 'bronce';
  const isGoldPlus = tier === 'oro' || tier === 'platino' || tier === 'diamante';
  const isPlatinumPlus = tier === 'platino' || tier === 'diamante';
  const isDiamond = tier === 'diamante';

  return (
    <div
      className={`relative ${boxSizeClass} trophy-oled-window ${meta.emblemFrameClass} flex items-center justify-center shrink-0 overflow-hidden ${
        animatePop ? 'animate-trophy-emblem' : ''
      }`}
    >
      {/* Barrido especular interno en el cristal OLED (reposa en la derecha antes de reiniciar) */}
      {meta.emblemSheenAnimClass && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 z-20 ${meta.emblemSheenAnimClass}`}
        >
          <div
            className={`absolute inset-y-0 right-full trophy-sheen-beam ${meta.emblemSheenBeamClass}`}
          />
        </div>
      )}

      <svg
        viewBox="0 0 64 64"
        className={`relative z-10 ${svgSizeClass} overflow-visible`}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={litGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={palette.litFacetStart} />
            <stop offset="100%" stopColor={palette.litFacetEnd} />
          </linearGradient>

          <linearGradient id={shadowGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={palette.shadowFacetStart} />
            <stop offset="100%" stopColor={palette.shadowFacetEnd} />
          </linearGradient>

          {isSilverPlus && (
            <radialGradient id={auraGradId} cx="50%" cy="40%" r="50%">
              <stop offset="0%" stopColor={palette.auraHex} stopOpacity={palette.auraOpacity} />
              {isPlatinumPlus && !isDiamond && (
                <stop offset="48%" stopColor="#38bdf8" stopOpacity={0.2} />
              )}
              {isDiamond && (
                <>
                  <stop offset="38%" stopColor="#6366f1" stopOpacity={0.28} />
                  <stop offset="72%" stopColor="#38bdf8" stopOpacity={0.18} />
                </>
              )}
              <stop offset="100%" stopColor={palette.auraHex} stopOpacity="0" />
            </radialGradient>
          )}

          {isDiamond && (
            <linearGradient id={prismGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="50%" stopColor="#e0e7ff" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          )}
        </defs>

        {/* Retículas CAD en las 4 esquinas del visor OLED */}
        <path
          d="M4 9 V4 H9 M55 4 H60 V9 M4 55 V60 H9 M55 60 H60 V55"
          fill="none"
          stroke={palette.reticle}
          strokeWidth={1}
          opacity={isDiamond ? 0.9 : isPlatinumPlus ? 0.78 : isGoldPlus ? 0.65 : isSilverPlus ? 0.52 : 0.4}
        />

        {/* Halo luminoso pulsante progresivo (Plata -> Oro -> Platino -> Diamante) */}
        {isSilverPlus && (
          <circle
            cx={32}
            cy={26}
            r={isDiamond ? 29 : isPlatinumPlus ? 26.5 : isGoldPlus ? 24.5 : 22}
            fill={`url(#${auraGradId})`}
            className="animate-halo-pulse"
          />
        )}

        {/* Anillos y escudos de telemetría HUD según rango */}
        {tier === 'plata' && (
          <circle
            cx={32}
            cy={25}
            r={21}
            fill="none"
            stroke={palette.ring}
            strokeWidth={0.85}
            strokeDasharray="3 3"
            opacity={0.45}
          />
        )}

        {tier === 'oro' && (
          <circle
            cx={32}
            cy={25}
            r={22.5}
            fill="none"
            stroke={palette.ring}
            strokeWidth={0.95}
            strokeDasharray="6 2.5 1.5 2.5"
            opacity={0.62}
          />
        )}

        {tier === 'platino' && (
          <g fill="none" stroke={palette.ring} opacity={0.78}>
            <circle cx={32} cy={25} r={23.5} strokeWidth={1} strokeDasharray="5 2 1.5 2" />
            <path d="M32 0.5 V3.5 M6.5 25 H9.5 M54.5 25 H57.5" strokeWidth={1.1} />
          </g>
        )}

        {isDiamond && (
          <g fill="none">
            <polygon
              points="21,4 43,4 58,19 58,34 43,46 21,46 6,34 6,19"
              stroke={`url(#${prismGradId})`}
              strokeWidth={1.05}
              strokeDasharray="5 2"
              opacity={0.85}
            />
            <path
              d="M32 1 V4 M4 26 H7 M57 26 H60"
              stroke="#6366f1"
              strokeWidth={1.2}
              opacity={0.9}
            />
          </g>
        )}

        {/* Grupo principal del trofeo con resplandor óptico escalonado */}
        <g className={palette.cupGlowClass}>
          {/* Estabilizadores / Aletas cibernéticas angulares según dificultad */}
          {tier === 'plata' && (
            <g fill="none" stroke={palette.edgeStroke} strokeWidth={1.25} opacity={0.85}>
              <polyline points="17.5,33 12.5,29.5 12.5,23.5" />
              <polyline points="46.5,33 51.5,29.5 51.5,23.5" />
            </g>
          )}

          {tier === 'oro' && (
            <g>
              <polygon points="17,20.5 9.5,16.5 11,23.5 18,26" fill={`url(#${litGradId})`} stroke={palette.edgeStroke} strokeWidth={0.45} />
              <polygon points="18,28 11.5,27 13.5,33 20.5,33.5" fill={`url(#${shadowGradId})`} />
              <polygon points="47,20.5 54.5,16.5 53,23.5 46,26" fill={`url(#${litGradId})`} stroke={palette.edgeStroke} strokeWidth={0.45} />
              <polygon points="46,28 52.5,27 50.5,33 43.5,33.5" fill={`url(#${shadowGradId})`} />
            </g>
          )}

          {tier === 'platino' && (
            <g>
              <polygon points="18,19.5 6.5,12 9,19.5 17.5,23.5" fill={`url(#${litGradId})`} stroke={palette.edgeStroke} strokeWidth={0.5} />
              <polygon points="18,25 8,22.5 10.5,29 19.5,30.5" fill={`url(#${shadowGradId})`} />
              <polygon points="46,19.5 57.5,12 55,19.5 46.5,23.5" fill={`url(#${litGradId})`} stroke={palette.edgeStroke} strokeWidth={0.5} />
              <polygon points="46,25 56,22.5 53.5,29 44.5,30.5" fill={`url(#${shadowGradId})`} />
            </g>
          )}

          {isDiamond && (
            <g>
              <polygon points="18,18.5 5.5,10 8.5,18 17.5,22" fill="#38bdf8" />
              <polygon points="18,23.5 6.5,20.5 9.5,27 19,28.8" fill="#c7d2fe" />
              <polygon points="19.5,29.5 10.5,29 13,34.5 21.5,34" fill="#6366f1" />
              <polygon points="46,18.5 58.5,10 55.5,18 46.5,22" fill="#38bdf8" />
              <polygon points="46,23.5 57.5,20.5 54.5,27 45,28.8" fill="#c7d2fe" />
              <polygon points="44.5,29.5 53.5,29 51,34.5 42.5,34" fill="#6366f1" />
            </g>
          )}

          {/* Asas mecanizadas CNC de 45° */}
          <g
            fill="none"
            stroke={palette.edgeStroke}
            strokeWidth={1.65}
            strokeLinejoin="miter"
            opacity={0.92}
          >
            <polyline points="19.5,19.5 14,19.5 12.2,21.5 12.2,26.8 15.2,29.8 21.5,29.8" />
            <polyline points="44.5,19.5 50,19.5 51.8,21.5 51.8,26.8 48.8,29.8 42.5,29.8" />
          </g>

          {/* Columna / Pilón central mecanizado */}
          <polygon points="29.2,35 34.8,35 36,44.2 28,44.2" fill={`url(#${shadowGradId})`} />
          <rect x={27.5} y={38.8} width={9} height={2} fill={`url(#${litGradId})`} />

          {/* Plinto escalonado + Pedestal industrial con matriz de 5 LEDs */}
          <polygon points="21.5,44.2 42.5,44.2 44.5,47.2 19.5,47.2" fill={`url(#${litGradId})`} stroke={palette.edgeStroke} strokeWidth={0.5} />
          <rect
            x={15.5}
            y={47.2}
            width={33}
            height={8.8}
            rx={1}
            fill="var(--trophy-pedestal-bg)"
            stroke={palette.edgeStroke}
            strokeWidth={0.95}
          />

          {PEDESTAL_LED_X.map((xPos, idx) => {
            const isLit = idx < meta.qualityRank;
            const ledColor = isDiamond ? DIAMOND_LED_HEX[idx] : palette.ledHex;
            return (
              <rect
                key={idx}
                x={xPos}
                y={50.3}
                width={3}
                height={2.6}
                rx={0.4}
                fill={isLit ? ledColor : 'var(--trophy-pedestal-led-off)'}
              />
            );
          })}

          {/* Cáliz / Vaso facetado CNC (mitad iluminada + mitad anodizada) */}
          <polygon
            points="19.5,17.5 32,17.5 32,35.5 26.8,34 21.5,27.5"
            fill={`url(#${litGradId})`}
          />
          <polygon
            points="32,17.5 44.5,17.5 42.5,27.5 37.2,34 32,35.5"
            fill={`url(#${shadowGradId})`}
          />

          {/* Brillo especular sobre el borde izquierdo de la copa (crece desde Plata hasta Diamante) */}
          {isSilverPlus && (
            <polygon
              points="21,18.2 26,18.2 25.2,30.5 22.4,26.8"
              fill="#ffffff"
              opacity={isDiamond ? 0.65 : isPlatinumPlus ? 0.52 : isGoldPlus ? 0.42 : 0.34}
            />
          )}

          {/* Facetas internas cristalinas exclusivas de Platino Diamante */}
          {isDiamond && (
            <g>
              <polygon points="19.5,17.5 32,17.5 25.5,31" fill="#ffffff" opacity={0.62} />
              <polygon points="32,17.5 44.5,17.5 38.5,31" fill="#38bdf8" opacity={0.46} />
              <polygon points="25.5,31 32,17.5 38.5,31 32,35.5" fill="#6366f1" opacity={0.38} />
            </g>
          )}

          {/* Contorno técnico y arista central de la copa */}
          <polygon
            points="19.5,17.5 44.5,17.5 42.5,27.5 37.2,34 32,35.5 26.8,34 21.5,27.5"
            fill="none"
            stroke={palette.edgeStroke}
            strokeWidth={0.9}
          />
          <line
            x1={32}
            y1={17.5}
            x2={32}
            y2={35.5}
            stroke="#ffffff"
            strokeWidth={0.75}
            opacity={isSilverPlus ? 0.6 : 0.4}
          />

          {/* Labio superior biselado de la copa */}
          <polygon
            points="17.8,14.5 46.2,14.5 44.8,17.5 19.2,17.5"
            fill={`url(#${litGradId})`}
            stroke={palette.edgeStroke}
            strokeWidth={0.75}
          />

          {/* Cresta / Corona cibernética superior para Oro, Platino y Diamante */}
          {tier === 'oro' && (
            <polygon
              points="24.5,14.5 26.5,9.8 29.8,13 32,8 34.2,13 37.5,9.8 39.5,14.5"
              fill={`url(#${litGradId})`}
              stroke={palette.edgeStroke}
              strokeWidth={0.65}
            />
          )}

          {tier === 'platino' && (
            <polygon
              points="32,5.8 35.8,10.8 32,13.2 28.2,10.8"
              fill="#f0f9ff"
              stroke="#0284c7"
              strokeWidth={0.8}
            />
          )}

          {isDiamond && (
            <g>
              <polygon
                points="23,13.8 25,8.2 29,11.5 32,5.8 35,11.5 39,8.2 41,13.8"
                fill={`url(#${prismGradId})`}
                stroke="#4f46e5"
                strokeWidth={0.75}
              />
              <rect x={31} y={2.8} width={2} height={2} fill="#6366f1" />
              <rect x={23.8} y={5.2} width={1.8} height={1.8} fill="#38bdf8" />
              <rect x={38.4} y={5.2} width={1.8} height={1.8} fill="#818cf8" />
            </g>
          )}

          {/* Núcleo central del pecho del trofeo */}
          {tier === 'bronce' && (
            <g>
              <polygon
                points="28,22.5 36,22.5 37.5,25.5 36,28.5 28,28.5 26.5,25.5"
                fill={palette.coreFill}
                stroke={palette.coreAccent}
                strokeWidth={0.85}
              />
              <rect x={29.2} y={24.7} width={5.6} height={1.6} fill={palette.coreAccent} />
            </g>
          )}

          {tier === 'plata' && (
            <g>
              <polygon
                points="32,20.5 36.2,25.5 32,30.5 27.8,25.5"
                fill={palette.coreFill}
                stroke={palette.coreAccent}
                strokeWidth={0.95}
              />
              <rect x={30.7} y={24.2} width={2.6} height={2.6} fill="#ffffff" />
            </g>
          )}

          {isGoldPlus && (
            <g>
              <polygon
                points="32,19.8 36.8,25.5 32,31.2 27.2,25.5"
                fill={palette.coreFill}
                stroke="#ffffff"
                strokeWidth={0.95}
              />
              <polygon
                points="32,21.5 35,25.5 32,29.5 29,25.5"
                fill={isDiamond ? `url(#${prismGradId})` : palette.coreAccent}
              />
              <rect x={31.1} y={24.6} width={1.8} height={1.8} fill="#ffffff" />
            </g>
          )}
        </g>

        {/* Micro-nodos LED cuadrados de brillo progresivo (0 -> 2 -> 4 -> 6 -> 9) */}
        {ledNodes.map((node, idx) => (
          <g key={idx} transform={`translate(${node.x} ${node.y})`}>
            <rect
              x={-node.size / 2}
              y={-node.size / 2}
              width={node.size}
              height={node.size}
              fill={node.color}
              className={`sparkle-origin ${node.animClass}`}
            />
          </g>
        ))}
      </svg>
    </div>
  );
};
