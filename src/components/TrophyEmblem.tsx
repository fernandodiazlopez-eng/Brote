import React, { useId } from 'react';
import { TROPHY_TIER_STYLES } from '../data/trophiesCatalog';
import { TrophyTier } from '../types';

interface SparkleSpec {
  x: number;
  y: number;
  scale: number;
  color: string;
  animClass: string;
  eightPoint?: boolean;
}

const EMBLEM_SPARKLES: Record<TrophyTier, SparkleSpec[]> = {
  // Bronce: 1 destello sutil en el borde del cáliz
  bronce: [
    { x: 44, y: 17, scale: 0.55, color: '#fcd34d', animClass: 'animate-sparkle-1' },
  ],
  // Plata: 3 brillitos plateados nítidos
  plata: [
    { x: 47, y: 14, scale: 0.72, color: '#ffffff', animClass: 'animate-sparkle-1' },
    { x: 15, y: 22, scale: 0.58, color: '#e2e8f0', animClass: 'animate-sparkle-2' },
    { x: 49, y: 39, scale: 0.5, color: '#f8fafc', animClass: 'animate-sparkle-3' },
  ],
  // Oro: 6 brillitos dorados intensos
  oro: [
    { x: 49, y: 11, scale: 0.9, color: '#fef9c3', animClass: 'animate-sparkle-1', eightPoint: true },
    { x: 13, y: 15, scale: 0.72, color: '#fde047', animClass: 'animate-sparkle-2' },
    { x: 53, y: 31, scale: 0.68, color: '#fef08a', animClass: 'animate-sparkle-3' },
    { x: 11, y: 36, scale: 0.6, color: '#facc15', animClass: 'animate-sparkle-4' },
    { x: 32, y: 7, scale: 0.65, color: '#ffffff', animClass: 'animate-sparkle-5' },
    { x: 46, y: 50, scale: 0.54, color: '#fde047', animClass: 'animate-sparkle-6' },
  ],
  // Platino: 10 brillitos celestiales blanco-cian
  platino: [
    { x: 32, y: 6, scale: 0.96, color: '#ffffff', animClass: 'animate-sparkle-1', eightPoint: true },
    { x: 52, y: 11, scale: 0.85, color: '#bae6fd', animClass: 'animate-sparkle-2', eightPoint: true },
    { x: 12, y: 12, scale: 0.8, color: '#e0f2fe', animClass: 'animate-sparkle-3' },
    { x: 56, y: 26, scale: 0.72, color: '#38bdf8', animClass: 'animate-sparkle-4' },
    { x: 8, y: 27, scale: 0.7, color: '#7dd3fc', animClass: 'animate-sparkle-5' },
    { x: 51, y: 44, scale: 0.65, color: '#ffffff', animClass: 'animate-sparkle-6' },
    { x: 13, y: 45, scale: 0.62, color: '#bae6fd', animClass: 'animate-sparkle-1' },
    { x: 42, y: 16, scale: 0.55, color: '#ffffff', animClass: 'animate-sparkle-3' },
    { x: 21, y: 17, scale: 0.52, color: '#7dd3fc', animClass: 'animate-sparkle-4' },
    { x: 32, y: 56, scale: 0.55, color: '#e0f2fe', animClass: 'animate-sparkle-2' },
  ],
  // Platino Diamante: 15 brillitos prismáticos deslumbrantes
  diamante: [
    { x: 32, y: 4, scale: 1.05, color: '#ffffff', animClass: 'animate-sparkle-1', eightPoint: true },
    { x: 53, y: 9, scale: 0.95, color: '#f5d0fe', animClass: 'animate-sparkle-2', eightPoint: true },
    { x: 11, y: 9, scale: 0.92, color: '#bae6fd', animClass: 'animate-sparkle-3', eightPoint: true },
    { x: 58, y: 22, scale: 0.82, color: '#fde047', animClass: 'animate-sparkle-4' },
    { x: 6, y: 22, scale: 0.82, color: '#f0abfc', animClass: 'animate-sparkle-5' },
    { x: 56, y: 38, scale: 0.78, color: '#7dd3fc', animClass: 'animate-sparkle-6', eightPoint: true },
    { x: 8, y: 38, scale: 0.76, color: '#fef08a', animClass: 'animate-sparkle-1' },
    { x: 49, y: 53, scale: 0.7, color: '#ffffff', animClass: 'animate-sparkle-2' },
    { x: 15, y: 53, scale: 0.7, color: '#e879f9', animClass: 'animate-sparkle-3' },
    { x: 43, y: 14, scale: 0.62, color: '#ffffff', animClass: 'animate-sparkle-4' },
    { x: 21, y: 14, scale: 0.62, color: '#fde047', animClass: 'animate-sparkle-5' },
    { x: 47, y: 29, scale: 0.58, color: '#38bdf8', animClass: 'animate-sparkle-6' },
    { x: 17, y: 29, scale: 0.58, color: '#f5d0fe', animClass: 'animate-sparkle-2' },
    { x: 38, y: 58, scale: 0.55, color: '#bae6fd', animClass: 'animate-sparkle-4' },
    { x: 26, y: 58, scale: 0.55, color: '#fef08a', animClass: 'animate-sparkle-5' },
  ],
};

const CARD_SPARKLES: Record<TrophyTier, SparkleSpec[]> = {
  bronce: [],
  plata: [
    { x: 356, y: 18, scale: 0.62, color: '#e2e8f0', animClass: 'animate-sparkle-2' },
    { x: 382, y: 42, scale: 0.48, color: '#f8fafc', animClass: 'animate-sparkle-4' },
  ],
  oro: [
    { x: 374, y: 16, scale: 0.82, color: '#fef08a', animClass: 'animate-sparkle-1', eightPoint: true },
    { x: 342, y: 26, scale: 0.58, color: '#facc15', animClass: 'animate-sparkle-3' },
    { x: 386, y: 54, scale: 0.65, color: '#fde047', animClass: 'animate-sparkle-5' },
    { x: 310, y: 14, scale: 0.5, color: '#ffffff', animClass: 'animate-sparkle-2' },
    { x: 360, y: 74, scale: 0.52, color: '#fde047', animClass: 'animate-sparkle-6' },
  ],
  platino: [
    { x: 378, y: 15, scale: 0.92, color: '#ffffff', animClass: 'animate-sparkle-1', eightPoint: true },
    { x: 344, y: 20, scale: 0.7, color: '#7dd3fc', animClass: 'animate-sparkle-2' },
    { x: 388, y: 48, scale: 0.76, color: '#bae6fd', animClass: 'animate-sparkle-3', eightPoint: true },
    { x: 315, y: 14, scale: 0.58, color: '#38bdf8', animClass: 'animate-sparkle-4' },
    { x: 362, y: 72, scale: 0.65, color: '#e0f2fe', animClass: 'animate-sparkle-5' },
    { x: 278, y: 22, scale: 0.52, color: '#ffffff', animClass: 'animate-sparkle-6' },
    { x: 332, y: 66, scale: 0.5, color: '#7dd3fc', animClass: 'animate-sparkle-1' },
    { x: 235, y: 15, scale: 0.48, color: '#bae6fd', animClass: 'animate-sparkle-3' },
    { x: 384, y: 80, scale: 0.56, color: '#ffffff', animClass: 'animate-sparkle-4' },
  ],
  diamante: [
    { x: 380, y: 14, scale: 1.02, color: '#ffffff', animClass: 'animate-sparkle-1', eightPoint: true },
    { x: 346, y: 18, scale: 0.82, color: '#f5d0fe', animClass: 'animate-sparkle-2', eightPoint: true },
    { x: 388, y: 46, scale: 0.88, color: '#7dd3fc', animClass: 'animate-sparkle-3', eightPoint: true },
    { x: 314, y: 14, scale: 0.72, color: '#fde047', animClass: 'animate-sparkle-4' },
    { x: 364, y: 74, scale: 0.78, color: '#f0abfc', animClass: 'animate-sparkle-5', eightPoint: true },
    { x: 276, y: 20, scale: 0.65, color: '#ffffff', animClass: 'animate-sparkle-6' },
    { x: 330, y: 68, scale: 0.62, color: '#bae6fd', animClass: 'animate-sparkle-1' },
    { x: 238, y: 14, scale: 0.6, color: '#fef08a', animClass: 'animate-sparkle-2' },
    { x: 196, y: 22, scale: 0.55, color: '#e879f9', animClass: 'animate-sparkle-3' },
    { x: 294, y: 76, scale: 0.58, color: '#fde047', animClass: 'animate-sparkle-4' },
    { x: 158, y: 15, scale: 0.52, color: '#7dd3fc', animClass: 'animate-sparkle-5' },
    { x: 122, y: 74, scale: 0.54, color: '#f5d0fe', animClass: 'animate-sparkle-6' },
    { x: 386, y: 82, scale: 0.66, color: '#fde047', animClass: 'animate-sparkle-2' },
    { x: 252, y: 72, scale: 0.5, color: '#ffffff', animClass: 'animate-sparkle-1' },
  ],
};

const SparkleStar: React.FC<{ spec: SparkleSpec }> = ({ spec }) => (
  <g transform={`translate(${spec.x} ${spec.y}) scale(${spec.scale})`}>
    <g className={`sparkle-origin ${spec.animClass}`}>
      <path
        d="M0 -6 L1.5 -1.5 L6 0 L1.5 1.5 L0 6 L-1.5 1.5 L-6 0 L-1.5 -1.5 Z"
        fill={spec.color}
      />
      {spec.eightPoint && (
        <path
          d="M-3.6 -3.6 L-0.7 -1.3 L3.6 -3.6 L1.3 -0.7 L3.6 3.6 L0.7 1.3 L-3.6 3.6 L-1.3 0.7 Z"
          fill="#ffffff"
          opacity={0.85}
        />
      )}
      <circle cx={0} cy={0} r={1.15} fill="#ffffff" />
    </g>
  </g>
);

export const TrophyCardSparkles: React.FC<{ tier: TrophyTier }> = ({ tier }) => {
  const specs = CARD_SPARKLES[tier];
  if (specs.length === 0) return null;

  return (
    <svg
      viewBox="0 0 400 96"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 w-full h-full overflow-hidden"
    >
      {specs.map((sp, idx) => (
        <SparkleStar key={idx} spec={sp} />
      ))}
    </svg>
  );
};

interface TrophyEmblemProps {
  tier: TrophyTier;
  size?: 'md' | 'lg';
  animatePop?: boolean;
}

export const TrophyEmblem: React.FC<TrophyEmblemProps> = ({
  tier,
  size = 'md',
  animatePop = false,
}) => {
  const rawUid = useId().replace(/:/g, '');
  const meta = TROPHY_TIER_STYLES[tier];
  const sparkles = EMBLEM_SPARKLES[tier];

  const boxSizeClass = size === 'lg' ? 'w-16 h-16 rounded-2xl' : 'w-14 h-14 rounded-2xl';
  const svgSizeClass = size === 'lg' ? 'w-14 h-14' : 'w-12 h-12';

  const metalGradId = `metal-${tier}-${rawUid}`;
  const darkMetalGradId = `dark-metal-${tier}-${rawUid}`;
  const baseGradId = `base-${tier}-${rawUid}`;
  const gemGradId = `gem-${tier}-${rawUid}`;
  const auraGradId = `aura-${tier}-${rawUid}`;

  const isSilverPlus = tier !== 'bronce';
  const isGoldPlus = tier === 'oro' || tier === 'platino' || tier === 'diamante';
  const isPlatinumPlus = tier === 'platino' || tier === 'diamante';
  const isDiamond = tier === 'diamante';

  return (
    <div
      className={`relative ${boxSizeClass} ${meta.emblemFrameClass} flex items-center justify-center shrink-0 overflow-hidden ${
        animatePop ? 'animate-trophy-emblem' : ''
      }`}
    >
      <svg
        viewBox="0 0 64 64"
        className={`${svgSizeClass} overflow-visible`}
        aria-hidden="true"
      >
        <defs>
          {/* Gradientes metálicos principales por categoría */}
          {tier === 'bronce' && (
            <>
              <linearGradient id={metalGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="32%" stopColor="#d97706" />
                <stop offset="72%" stopColor="#92400e" />
                <stop offset="100%" stopColor="#451a03" />
              </linearGradient>
              <linearGradient id={darkMetalGradId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#b45309" />
                <stop offset="100%" stopColor="#451a03" />
              </linearGradient>
              <linearGradient id={baseGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#292524" />
                <stop offset="50%" stopColor="#57534e" />
                <stop offset="100%" stopColor="#1c1917" />
              </linearGradient>
            </>
          )}

          {tier === 'plata' && (
            <>
              <linearGradient id={metalGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="35%" stopColor="#e2e8f0" />
                <stop offset="70%" stopColor="#94a3b8" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>
              <linearGradient id={darkMetalGradId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#cbd5e1" />
                <stop offset="100%" stopColor="#334155" />
              </linearGradient>
              <linearGradient id={baseGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1e293b" />
                <stop offset="50%" stopColor="#475569" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>
              <radialGradient id={auraGradId} cx="50%" cy="42%" r="48%">
                <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0" />
              </radialGradient>
            </>
          )}

          {tier === 'oro' && (
            <>
              <linearGradient id={metalGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fef9c3" />
                <stop offset="28%" stopColor="#fde047" />
                <stop offset="62%" stopColor="#eab308" />
                <stop offset="100%" stopColor="#854d0e" />
              </linearGradient>
              <linearGradient id={darkMetalGradId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#facc15" />
                <stop offset="100%" stopColor="#713f12" />
              </linearGradient>
              <linearGradient id={baseGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#1c1917" />
                <stop offset="50%" stopColor="#44403c" />
                <stop offset="100%" stopColor="#0c0a09" />
              </linearGradient>
              <linearGradient id={gemGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fda4af" />
                <stop offset="45%" stopColor="#e11d48" />
                <stop offset="100%" stopColor="#881337" />
              </linearGradient>
              <radialGradient id={auraGradId} cx="50%" cy="40%" r="50%">
                <stop offset="0%" stopColor="#fde047" stopOpacity="0.45" />
                <stop offset="65%" stopColor="#eab308" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
              </radialGradient>
            </>
          )}

          {tier === 'platino' && (
            <>
              <linearGradient id={metalGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="30%" stopColor="#e0f2fe" />
                <stop offset="65%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0369a1" />
              </linearGradient>
              <linearGradient id={darkMetalGradId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#bae6fd" />
                <stop offset="100%" stopColor="#075985" />
              </linearGradient>
              <linearGradient id={baseGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0f172a" />
                <stop offset="50%" stopColor="#1e3a8a" />
                <stop offset="100%" stopColor="#090d16" />
              </linearGradient>
              <linearGradient id={gemGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="45%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#1d4ed8" />
              </linearGradient>
              <radialGradient id={auraGradId} cx="50%" cy="40%" r="52%">
                <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.58" />
                <stop offset="65%" stopColor="#0284c7" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
              </radialGradient>
            </>
          )}

          {tier === 'diamante' && (
            <>
              <linearGradient id={metalGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="26%" stopColor="#f5d0fe" />
                <stop offset="54%" stopColor="#7dd3fc" />
                <stop offset="80%" stopColor="#fde047" />
                <stop offset="100%" stopColor="#a21caf" />
              </linearGradient>
              <linearGradient id={darkMetalGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fde047" />
                <stop offset="50%" stopColor="#e879f9" />
                <stop offset="100%" stopColor="#0284c7" />
              </linearGradient>
              <linearGradient id={baseGradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2e1065" />
                <stop offset="50%" stopColor="#581c87" />
                <stop offset="100%" stopColor="#1e1b4b" />
              </linearGradient>
              <linearGradient id={gemGradId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="40%" stopColor="#f0abfc" />
                <stop offset="75%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#7e22ce" />
              </linearGradient>
              <radialGradient id={auraGradId} cx="50%" cy="38%" r="54%">
                <stop offset="0%" stopColor="#f5d0fe" stopOpacity="0.7" />
                <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
              </radialGradient>
            </>
          )}
        </defs>

        {/* RESPLANDOR DE FONDO (Plata en adelante, crece en intensidad) */}
        {isSilverPlus && (
          <circle
            cx={32}
            cy={28}
            r={isDiamond ? 30 : isPlatinumPlus ? 27 : 24}
            fill={`url(#${auraGradId})`}
            className={isGoldPlus ? 'animate-halo-pulse' : ''}
          />
        )}

        {/* HALO SOLAR / ANILLOS GEOMÉTRICOS (Oro, Platino y Diamante) */}
        {tier === 'oro' && (
          <g opacity={0.55}>
            <circle
              cx={32}
              cy={26}
              r={19}
              fill="none"
              stroke="#fde047"
              strokeWidth={0.9}
              strokeDasharray="3 2.5"
            />
          </g>
        )}

        {isPlatinumPlus && (
          <g opacity={isDiamond ? 0.85 : 0.65}>
            <circle
              cx={32}
              cy={26}
              r={21}
              fill="none"
              stroke={isDiamond ? '#f0abfc' : '#7dd3fc'}
              strokeWidth={1}
              strokeDasharray="4 2"
            />
            {isDiamond && (
              <polygon
                points="32,5 37,20 53,26 37,32 32,47 27,32 11,26 27,20"
                fill={`url(#${darkMetalGradId})`}
                opacity={0.28}
              />
            )}
          </g>
        )}

        {/* ALAS CELESTIALES (Platino y Platino Diamante) */}
        {isPlatinumPlus && (
          <g>
            {/* Ala izquierda */}
            <path
              d="M20 26 C11 22, 6 15, 7 9 C11 12, 16 14, 20 18 C13 17, 9 20, 9 24 C13 23, 17 24, 21 28 C14 28, 11 31, 12 35 C15 33, 19 32, 23 33 Z"
              fill={`url(#${metalGradId})`}
              stroke={isDiamond ? '#fdf4ff' : '#e0f2fe'}
              strokeWidth={0.6}
            />
            {/* Ala derecha */}
            <path
              d="M44 26 C53 22, 58 15, 57 9 C53 12, 48 14, 44 18 C51 17, 55 20, 55 24 C51 23, 47 24, 43 28 C50 28, 53 31, 52 35 C49 33, 45 32, 41 33 Z"
              fill={`url(#${metalGradId})`}
              stroke={isDiamond ? '#fdf4ff' : '#e0f2fe'}
              strokeWidth={0.6}
            />
          </g>
        )}

        {/* CORONA DE LAUREL (Plata sutil en tallo; Oro y Diamante corona triunfal completa) */}
        {(tier === 'plata' || tier === 'oro' || isDiamond) && (
          <g
            fill="none"
            stroke={isDiamond ? '#fde047' : `url(#${metalGradId})`}
            strokeWidth={tier === 'plata' ? 1.3 : 1.7}
            strokeLinecap="round"
          >
            <path d="M23 41 C15 36, 13 25, 17 17" />
            <path d="M41 41 C49 36, 51 25, 47 17" />
            {tier !== 'plata' && (
              <>
                <path d="M16 32 L13 29 M15 26 L12 23 M16 21 L14 17" />
                <path d="M48 32 L51 29 M49 26 L52 23 M48 21 L50 17" />
              </>
            )}
          </g>
        )}

        {/* ASAS ESCULPIDAS DEL CÁLIZ */}
        <path
          d="M21 19 C13 19, 12 30, 21 32 L22 30 C16 28.5, 16.5 21.5, 21.5 21.5 Z"
          fill={`url(#${darkMetalGradId})`}
        />
        <path
          d="M43 19 C51 19, 52 30, 43 32 L42 30 C48 28.5, 47.5 21.5, 42.5 21.5 Z"
          fill={`url(#${darkMetalGradId})`}
        />

        {/* PEDESTAL ESCALONADO Y COLUMNA */}
        {/* Columna */}
        <path d="M29 37 L35 37 L36.5 46 L27.5 46 Z" fill={`url(#${darkMetalGradId})`} />
        {/* Anillo central del tallo */}
        <ellipse cx={32} cy={41} rx={4.8} ry={1.7} fill={`url(#${metalGradId})`} />

        {/* Base superior metálica */}
        <path d="M23 46 L41 46 L43 50 L21 50 Z" fill={`url(#${metalGradId})`} />
        {/* Pedestal inferior de piedra/metal noble */}
        <rect x={18} y={50} width={28} height={7} rx={2} fill={`url(#${baseGradId})`} />
        <rect
          x={18}
          y={50}
          width={28}
          height={7}
          rx={2}
          fill="none"
          stroke={`url(#${metalGradId})`}
          strokeWidth={0.9}
        />
        {/* Placa grabada en el pedestal */}
        <rect x={24} y={52} width={16} height={3} rx={0.8} fill={`url(#${metalGradId})`} />

        {/* COPA / CÁLIZ PRINCIPAL */}
        <path
          d="M19 16 L45 16 L43 27 C41.8 33.8, 37.5 38, 32 38 C26.5 38, 22.2 33.8, 21 27 Z"
          fill={`url(#${metalGradId})`}
        />

        {/* Facetas cristalinas interiores exclusivas de Platino Diamante */}
        {isDiamond && (
          <g opacity={0.55}>
            <polygon points="19,16 32,16 26,35" fill="#ffffff" opacity={0.45} />
            <polygon points="32,16 45,16 38,35" fill="#38bdf8" opacity={0.35} />
            <polygon points="26,35 32,16 38,35 32,38" fill="#f0abfc" opacity={0.45} />
          </g>
        )}

        {/* Banda de reflejo especular metálico vertical */}
        <path
          d="M22.5 17.5 L27 17.5 L26 33.5 C24.2 31.8, 23.1 29.2, 22.7 25.8 Z"
          fill="#ffffff"
          opacity={tier === 'bronce' ? 0.25 : 0.42}
        />

        {/* Labio superior moldeado de la copa */}
        <rect x={17.5} y={14} width={29} height={3} rx={1.5} fill={`url(#${metalGradId})`} />

        {/* CORONA REAL / CRESTA SUPERIOR SEGÚN DIFICULTAD */}
        {tier === 'oro' && (
          <path
            d="M23 14 L25 9.5 L29 12.5 L32 8 L35 12.5 L39 9.5 L41 14 Z"
            fill={`url(#${metalGradId})`}
          />
        )}

        {tier === 'platino' && (
          <polygon
            points="32,6.5 33.8,10.5 38,11 34.8,13.5 35.8,17 32,14.8 28.2,17 29.2,13.5 26,11 30.2,10.5"
            fill="#ffffff"
            stroke="#38bdf8"
            strokeWidth={0.6}
          />
        )}

        {isDiamond && (
          <g>
            {/* Corona imperial flotante */}
            <path
              d="M22 13 L23.5 7.5 L28 10.8 L32 5.5 L36 10.8 L40.5 7.5 L42 13 Z"
              fill="#fde047"
              stroke="#ffffff"
              strokeWidth={0.6}
            />
            <circle cx={32} cy={5.3} r={1.3} fill="#ffffff" />
            <circle cx={23.5} cy={7.3} r={1} fill="#38bdf8" />
            <circle cx={40.5} cy={7.3} r={1} fill="#f0abfc" />
          </g>
        )}

        {/* EMBLEMA CENTRAL / GEMA EN EL PECHO DE LA COPA */}
        {tier === 'bronce' && (
          <path
            d="M32 21 L36 23 L35 28.5 L32 31 L29 28.5 L28 23 Z"
            fill="#451a03"
            stroke="#fbbf24"
            strokeWidth={0.9}
          />
        )}

        {tier === 'plata' && (
          <polygon
            points="32,20.5 33.6,24.2 37.5,24.6 34.5,27.1 35.4,31 32,28.9 28.6,31 29.5,27.1 26.5,24.6 30.4,24.2"
            fill="#ffffff"
            stroke="#64748b"
            strokeWidth={0.6}
          />
        )}

        {isGoldPlus && (
          <g>
            {/* Gema facetada (Rubí en Oro, Zafiro en Platino, Diamante Prismático en Leyenda) */}
            <polygon
              points="32,20 36.8,25.5 32,31.5 27.2,25.5"
              fill={`url(#${gemGradId})`}
              stroke="#ffffff"
              strokeWidth={0.85}
            />
            <polygon points="32,20 34.5,25.5 32,25.5" fill="#ffffff" opacity={0.65} />
          </g>
        )}

        {/* CAPA DE BRILLITOS PROGRESIVOS (1 -> 3 -> 6 -> 10 -> 15) */}
        {sparkles.map((sp, idx) => (
          <SparkleStar key={idx} spec={sp} />
        ))}
      </svg>
    </div>
  );
};
