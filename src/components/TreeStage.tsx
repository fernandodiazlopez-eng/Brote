import React, { useEffect, useId, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { ThemeMode, TreeSeasonId } from '../types';

interface TreeStageProps {
  todayIso: string;
  level: number;
  growthStage: number; // Nivel máximo continuo alcanzado (0 -> 100)
  witherProgress?: number; // Grado de marchitamiento por inactividad (0 -> 1)
  xpPulseToken: number;
  lastXpGain: number;
  themeMode: ThemeMode;
  seasonsEnabled: boolean;
}

interface BranchSegment {
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
  angleDeg: number;
  wStart: number;
  wEnd: number;
  depth: number;
  maxDepth: number;
}

interface RootSegment {
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
  wStart: number;
  wEnd: number;
  hasHighlight?: boolean;
}

interface LeafItem {
  x: number;
  y: number;
  angleDeg: number;
  scale: number;
  toneIdx: 0 | 1 | 2 | 3;
  breezeGroup: 0 | 1 | 2;
  keepInWinter: boolean;
  shedOrder: number;
}

interface BlossomItem {
  x: number;
  y: number;
  scale: number;
  breezeGroup: 0 | 1 | 2;
  variant: 0 | 1;
}

interface FruitItem {
  x: number;
  y: number;
  r: number;
  breezeGroup: 0 | 1 | 2;
  warmVariant: boolean;
}

interface SnowCapItem {
  pathD: string;
  thickness: number;
}

interface CanopyCloud {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
}

interface HangingTendril {
  pathD: string;
  opacity: number;
  width: number;
}

interface SeasonPalette {
  leafTones: [string, string, string, string]; // sombra profunda, media oscura, media clara, iluminada
  cloudColor: string;
  groundTint: string;
}

const YOUNG_GREEN_PALETTE: SeasonPalette = {
  leafTones: ['#365922', '#4a782c', '#61943a', '#7aa84d'],
  cloudColor: '#4a782c',
  groundTint: '#334155',
};

const WITHERED_PALETTE: SeasonPalette = {
  leafTones: ['#594127', '#755533', '#916c41', '#ab8453'],
  cloudColor: '#695139',
  groundTint: '#6b5744',
};

const SEASON_PALETTES: Record<TreeSeasonId, SeasonPalette> = {
  otono: {
    leafTones: ['#9a3412', '#c2410c', '#d97706', '#eab308'],
    cloudColor: '#b45309',
    groundTint: '#78350f',
  },
  invierno: {
    leafTones: ['#3f5252', '#526868', '#6b8285', '#94a8ad'],
    cloudColor: '#64748b',
    groundTint: '#94a3b8',
  },
  primavera: {
    leafTones: ['#3b6629', '#4f8238', '#689e4b', '#84b863'],
    cloudColor: '#52873b',
    groundTint: '#3f6212',
  },
  verano: {
    leafTones: ['#2b541e', '#3c6e29', '#4f8837', '#679f49'],
    cloudColor: '#3c6e29',
    groundTint: '#365314',
  },
};

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function lerpHexColor(hexA: string, hexB: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = parseHexRgb(hexA);
  const [r2, g2, b2] = parseHexRgb(hexB);
  const r = Math.round(r1 + (r2 - r1) * clamped);
  const g = Math.round(g1 + (g2 - g1) * clamped);
  const b = Math.round(b1 + (b2 - b1) * clamped);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
    .toString(16)
    .padStart(2, '0')}`;
}

function blendPalettes(a: SeasonPalette, b: SeasonPalette, t: number): SeasonPalette {
  return {
    leafTones: [
      lerpHexColor(a.leafTones[0], b.leafTones[0], t),
      lerpHexColor(a.leafTones[1], b.leafTones[1], t),
      lerpHexColor(a.leafTones[2], b.leafTones[2], t),
      lerpHexColor(a.leafTones[3], b.leafTones[3], t),
    ],
    cloudColor: lerpHexColor(a.cloudColor, b.cloudColor, t),
    groundTint: lerpHexColor(a.groundTint, b.groundTint, t),
  };
}

function getDayOfYearFromIso(iso: string): number {
  const parts = iso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 304;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  const start = new Date(parts[0], 0, 0);
  const diff = dt.getTime() - start.getTime();
  return Math.max(1, Math.min(366, Math.floor(diff / 86400000)));
}

// Calcula la transición gradual continua entre las 4 estaciones a lo largo de los 365 días del año
function computeGradualCalendarSeason(todayIso: string): {
  palette: SeasonPalette;
  weights: Record<TreeSeasonId, number>;
} {
  const doy = getDayOfYearFromIso(todayIso);

  // Picos estacionales: Invierno (18 ene), Primavera (18 abr), Verano (18 jul), Otoño (18 oct)
  const anchors: { doy: number; season: TreeSeasonId }[] = [
    { doy: 18, season: 'invierno' },
    { doy: 108, season: 'primavera' },
    { doy: 199, season: 'verano' },
    { doy: 291, season: 'otono' },
  ];

  let fromSeason: TreeSeasonId = 'otono';
  let toSeason: TreeSeasonId = 'invierno';
  let rawT = 0;

  if (doy >= anchors[0].doy && doy < anchors[1].doy) {
    fromSeason = 'invierno';
    toSeason = 'primavera';
    rawT = (doy - anchors[0].doy) / (anchors[1].doy - anchors[0].doy);
  } else if (doy >= anchors[1].doy && doy < anchors[2].doy) {
    fromSeason = 'primavera';
    toSeason = 'verano';
    rawT = (doy - anchors[1].doy) / (anchors[2].doy - anchors[1].doy);
  } else if (doy >= anchors[2].doy && doy < anchors[3].doy) {
    fromSeason = 'verano';
    toSeason = 'otono';
    rawT = (doy - anchors[2].doy) / (anchors[3].doy - anchors[2].doy);
  } else {
    fromSeason = 'otono';
    toSeason = 'invierno';
    const span = 365 - anchors[3].doy + anchors[0].doy;
    const dist = doy >= anchors[3].doy ? doy - anchors[3].doy : 365 - anchors[3].doy + doy;
    rawT = dist / span;
  }

  const smoothT = rawT * rawT * (3 - 2 * rawT);
  const weights: Record<TreeSeasonId, number> = {
    otono: 0,
    invierno: 0,
    primavera: 0,
    verano: 0,
  };
  weights[fromSeason] = 1 - smoothT;
  weights[toSeason] = smoothT;

  const palette = blendPalettes(
    SEASON_PALETTES[fromSeason],
    SEASON_PALETTES[toSeason],
    smoothT
  );

  return { palette, weights };
}

// Generador pseudoaleatorio determinista [0, 1) para asimetría orgánica estable entre niveles
function hash01(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function evalQuadPoint(
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  t: number
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
    y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2,
  };
}

function unitNormal(dx: number, dy: number): { nx: number; ny: number } {
  const len = Math.hypot(dx, dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}

// Escala interna HD (4x: 1440x1136) para evitar rasterización borrosa y dientes de sierra en pantallas Retina/escritorio
const HD_SCALE = 4;

function S(value: number): number {
  return Math.round(value * HD_SCALE * 100) / 100;
}

function px(value: number): number {
  return Math.round(value * HD_SCALE * 100) / 100;
}

function buildCircleSubpath(cx: number, cy: number, r: number): string {
  if (r <= 0.15) return '';
  const rad = px(r);
  const d2 = Math.round(rad * 200) / 100;
  return `M${px(cx - r)} ${px(cy)}a${rad} ${rad} 0 1 1 ${d2} 0a${rad} ${rad} 0 1 1 -${d2} 0`;
}

function buildTransformedLeafSubpath(
  tx: number,
  ty: number,
  angleDeg: number,
  scale: number,
  widthFactor: number = 1
): string {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad) * scale;
  const s = Math.sin(rad) * scale;
  const w1 = 4.1 * widthFactor;
  const w2 = 3.3 * widthFactor;

  const p0x = px(tx - 1.2 * s);
  const p0y = px(ty + 1.2 * c);
  const c1x = px(tx - w1 * c + 2.8 * s);
  const c1y = px(ty - w1 * s - 2.8 * c);
  const c2x = px(tx - w2 * c + 8.2 * s);
  const c2y = px(ty - w2 * s - 8.2 * c);
  const tipX = px(tx + 11.4 * s);
  const tipY = px(ty - 11.4 * c);
  const c3x = px(tx + w2 * c + 8.2 * s);
  const c3y = px(ty + w2 * s - 8.2 * c);
  const c4x = px(tx + w1 * c + 2.8 * s);
  const c4y = px(ty + w1 * s - 2.8 * c);

  return `M${p0x} ${p0y}C${c1x} ${c1y} ${c2x} ${c2y} ${tipX} ${tipY}C${c3x} ${c3y} ${c4x} ${c4y} ${p0x} ${p0y}Z`;
}

// Construye una rama o raíz curva y ahusada continua con remates semicirculares suaves (sin escalones ni uniones rectas)
function buildCurvedLimbPath(
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  w1: number,
  w2: number
): string {
  const startDx = Math.abs(cx - x1) + Math.abs(cy - y1) > 1e-4 ? cx - x1 : x2 - x1;
  const startDy = Math.abs(cx - x1) + Math.abs(cy - y1) > 1e-4 ? cy - y1 : y2 - y1;
  const endDx = Math.abs(x2 - cx) + Math.abs(y2 - cy) > 1e-4 ? x2 - cx : x2 - x1;
  const endDy = Math.abs(x2 - cx) + Math.abs(y2 - cy) > 1e-4 ? y2 - cy : y2 - y1;

  const nStart = unitNormal(startDx, startDy);
  const nMid = unitNormal(x2 - x1, y2 - y1);
  const nEnd = unitNormal(endDx, endDy);

  const midPt = evalQuadPoint(x1, y1, cx, cy, x2, y2, 0.5);

  const rStart = w1 / 2;
  const rMid = (w1 + w2) / 4;
  const rEnd = w2 / 2;

  const l0x = x1 + nStart.nx * rStart;
  const l0y = y1 + nStart.ny * rStart;
  const lMx = midPt.x + nMid.nx * rMid;
  const lMy = midPt.y + nMid.ny * rMid;
  const l1x = x2 + nEnd.nx * rEnd;
  const l1y = y2 + nEnd.ny * rEnd;

  const lCx = 2 * lMx - 0.5 * (l0x + l1x);
  const lCy = 2 * lMy - 0.5 * (l0y + l1y);

  const r0x = x1 - nStart.nx * rStart;
  const r0y = y1 - nStart.ny * rStart;
  const rMx = midPt.x - nMid.nx * rMid;
  const rMy = midPt.y - nMid.ny * rMid;
  const r1x = x2 - nEnd.nx * rEnd;
  const r1y = y2 - nEnd.ny * rEnd;

  const rCx = 2 * rMx - 0.5 * (r0x + r1x);
  const rCy = 2 * rMy - 0.5 * (r0y + r1y);

  const rs = px(rStart);
  const re = px(rEnd);

  return (
    `M${px(r0x)} ${px(r0y)}` +
    `Q${px(rCx)} ${px(rCy)} ${px(r1x)} ${px(r1y)}` +
    `A${re} ${re} 0 0 1 ${px(l1x)} ${px(l1y)}` +
    `Q${px(lCx)} ${px(lCy)} ${px(l0x)} ${px(l0y)}` +
    `A${rs} ${rs} 0 0 1 ${px(r0x)} ${px(r0y)}Z`
  );
}

interface GroundEllipseProps {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
  fill: string;
}

const GroundEllipse: React.FC<GroundEllipseProps> = ({ cx, cy, rx, ry, rot, fill }) => {
  const scx = px(cx);
  const scy = px(cy);
  return (
    <ellipse
      cx={scx}
      cy={scy}
      rx={px(rx)}
      ry={px(ry)}
      fill={fill}
      transform={`rotate(${rot} ${scx} ${scy})`}
    />
  );
};

let lastConsumedTreePulseToken = 0;

export const TreeStage: React.FC<TreeStageProps> = React.memo(({
  todayIso,
  level,
  growthStage,
  witherProgress = 0,
  xpPulseToken,
  lastXpGain,
  themeMode,
  seasonsEnabled,
}) => {
  const rawUid = useId().replace(/:/g, '');
  const [activePulseKey, setActivePulseKey] = useState<number>(0);

  useEffect(() => {
    if (xpPulseToken <= 0 || xpPulseToken <= lastConsumedTreePulseToken) return;
    lastConsumedTreePulseToken = xpPulseToken;
    setActivePulseKey(xpPulseToken);
    const timer = window.setTimeout(() => {
      setActivePulseKey((prev) => (prev === xpPulseToken ? 0 : prev));
    }, 1380);
    return () => window.clearTimeout(timer);
  }, [xpPulseToken]);

  const isPulsing = activePulseKey > 0;
  const isDarkMode = themeMode === 'dark';

  const effectiveLevel = useMemo(() => {
    const clamped = Math.min(100, Math.max(0, growthStage));
    return Math.round(clamped * 4) / 4;
  }, [growthStage]);

  const effectiveWither = useMemo(() => {
    const clamped = Math.min(1, Math.max(0, witherProgress));
    return Math.round(clamped * 50) / 50;
  }, [witherProgress]);

  // Las estaciones solo se aplican si están activadas en Ajustes y el árbol ya tiene marrón en el tronco (etapa >= 18)
  const hasBrownTrunk = effectiveLevel >= 18;

  const m50 = Math.min(1, effectiveLevel / 50);
  const m100 = effectiveLevel <= 50 ? 0 : Math.min(1, (effectiveLevel - 50) / 50);

  // Paleta y pesos estacionales activos mezclados con el estado de marchitamiento
  const seasonalAppearance = useMemo(() => {
    let basePalette: SeasonPalette = YOUNG_GREEN_PALETTE;
    let baseWeights: Record<TreeSeasonId, number> = {
      otono: 0,
      invierno: 0,
      primavera: 0,
      verano: 0,
    };

    if (seasonsEnabled && hasBrownTrunk) {
      // Entrada gradual de la estación a medida que el tronco adquiere su tono marrón (18 -> 26)
      const maturityBlend = Math.min(1, (effectiveLevel - 18) / 8);
      const calendarState = computeGradualCalendarSeason(todayIso);

      basePalette = blendPalettes(YOUNG_GREEN_PALETTE, calendarState.palette, maturityBlend);
      baseWeights = {
        otono: calendarState.weights.otono * maturityBlend,
        invierno: calendarState.weights.invierno * maturityBlend,
        primavera: calendarState.weights.primavera * maturityBlend,
        verano: calendarState.weights.verano * maturityBlend,
      };
    }

    if (effectiveWither <= 0) {
      return { palette: basePalette, weights: baseWeights };
    }

    const dryPaletteBlend = Math.min(1, effectiveWither * 1.12);
    const bloomSurvival = Math.max(0, 1 - effectiveWither * 1.45);

    return {
      palette: blendPalettes(basePalette, WITHERED_PALETTE, dryPaletteBlend),
      weights: {
        otono: baseWeights.otono * (1 - effectiveWither * 0.7),
        invierno: baseWeights.invierno,
        primavera: baseWeights.primavera * bloomSurvival,
        verano: baseWeights.verano * bloomSurvival,
      },
    };
  }, [seasonsEnabled, hasBrownTrunk, effectiveLevel, todayIso, effectiveWither]);

  // Colores naturales de corteza: de verde tierno -> oliva -> madera natural -> corteza profunda (y tono seco si se marchita)
  const barkColors = useMemo(() => {
    let trunkHex: string;
    let highlightHex: string;
    let midBranchHex: string;
    let twigHex: string;

    if (effectiveLevel <= 18) {
      const t = effectiveLevel / 18;
      trunkHex = lerpHexColor('#5d8c34', '#7d6c38', t);
      highlightHex = lerpHexColor('#84b34c', '#9c8a4e', t);
      midBranchHex = lerpHexColor('#68993b', '#83743b', t);
      twigHex = lerpHexColor('#74a644', '#86823e', t);
    } else if (effectiveLevel <= 50) {
      const t = (effectiveLevel - 18) / 32;
      trunkHex = lerpHexColor('#7d6c38', '#734b28', t);
      highlightHex = lerpHexColor('#9c8a4e', '#94643a', t);
      midBranchHex = lerpHexColor('#83743b', '#7f542e', t);
      twigHex = lerpHexColor('#86823e', '#7c5833', t);
    } else {
      trunkHex = lerpHexColor('#734b28', '#59371c', m100);
      highlightHex = lerpHexColor('#94643a', '#7d502b', m100);
      midBranchHex = lerpHexColor('#7f542e', '#694222', m100);
      twigHex = lerpHexColor('#7c5833', '#734a28', m100);
    }

    if (effectiveWither > 0) {
      const barkDryT = effectiveWither * 0.76;
      const dryTrunkTarget = effectiveLevel <= 18 ? '#6d6247' : '#574c43';
      const dryHighlightTarget = effectiveLevel <= 18 ? '#85785b' : '#6e6156';
      trunkHex = lerpHexColor(trunkHex, dryTrunkTarget, barkDryT);
      highlightHex = lerpHexColor(highlightHex, dryHighlightTarget, barkDryT);
      midBranchHex = lerpHexColor(midBranchHex, '#61554b', barkDryT);
      twigHex = lerpHexColor(twigHex, '#6b5e53', barkDryT);
    }

    if (isPulsing) {
      return {
        trunkHex: lerpHexColor(trunkHex, '#bfa065', 0.14),
        highlightHex: lerpHexColor(highlightHex, '#e2c98d', 0.22),
        midBranchHex: lerpHexColor(midBranchHex, '#c7a96d', 0.16),
        twigHex: lerpHexColor(twigHex, '#d1b679', 0.2),
      };
    }

    return { trunkHex, highlightHex, midBranchHex, twigHex };
  }, [effectiveLevel, m100, effectiveWither, isPulsing]);

  const treeGeometry = useMemo(() => {
    const baseX = 180;
    const baseY = 229;

    const upperBranches: BranchSegment[] = [];
    const roots: RootSegment[] = [];
    const leaves: LeafItem[] = [];
    const blossoms: BlossomItem[] = [];
    const fruits: FruitItem[] = [];
    const snowCaps: SnowCapItem[] = [];
    const clouds: CanopyCloud[] = [];
    const tendrils: HangingTendril[] = [];

    let leafCounter = 0;
    const addLeaf = (
      x: number,
      y: number,
      angleDeg: number,
      scale: number,
      toneIdx: 0 | 1 | 2 | 3
    ) => {
      leafCounter += 1;
      leaves.push({
        x,
        y,
        angleDeg,
        scale,
        toneIdx,
        breezeGroup: (leafCounter % 3) as 0 | 1 | 2,
        keepInWinter: leafCounter % 3 === 0,
        shedOrder: hash01(leafCounter * 41 + 7),
      });
    };

    // Etapa inicial de brote (0 -> 3.2): tallo curvado asimétrico con hojitas alternas (no espejadas)
    if (effectiveLevel < 3.2) {
      const t = effectiveLevel / 3.2;
      const stemBaseY = baseY + 2.2;
      const stemHeight = 29 + t * 23;
      const ctrlX = baseX - 4.8;
      const ctrlY = stemBaseY - stemHeight * 0.54;
      const topX = baseX + 2.4;
      const topY = stemBaseY - stemHeight;

      const lowLeft = evalQuadPoint(baseX, stemBaseY, ctrlX, ctrlY, topX, topY, 0.56);
      const midRight = evalQuadPoint(baseX, stemBaseY, ctrlX, ctrlY, topX, topY, 0.76);

      const leafScale = 0.7 + t * 0.32;
      addLeaf(lowLeft.x - 0.6, lowLeft.y, -64, leafScale * 0.84, 1);
      addLeaf(midRight.x + 0.6, midRight.y, 49, leafScale * 0.92, 2);
      addLeaf(topX - 0.6, topY + 1.2, -26, leafScale * 1.02, 2);
      addLeaf(topX + 1.1, topY + 0.4, 34, leafScale * 0.88, 3);

      if (effectiveLevel >= 0.9) {
        const subScale = 0.46 + ((effectiveLevel - 0.9) / 2.3) * 0.54;
        addLeaf(topX + 0.3, topY - 1.8, 7, subScale, 3);
      }

      return {
        baseX,
        baseY,
        isSprout: true,
        sproutPath: `M ${px(baseX)} ${px(stemBaseY)} Q ${px(ctrlX)} ${px(ctrlY)} ${px(
          topX
        )} ${px(topY)}`,
        sproutWidth: 2.5 + t * 1.2,
        trunkBaseWidth: 2.8 + t * 1.2,
        trunkBodyPath: '',
        trunkHighlightPath: '',
        upperBranches,
        roots,
        leaves,
        blossoms,
        fruits,
        snowCaps,
        clouds,
        tendrils,
      };
    }

    // Crecimiento orgánico asimétrico desde etapa 3.2 hasta 100
    const continuousDepth =
      effectiveLevel <= 50
        ? 1.8 + ((effectiveLevel - 3.2) / 46.8) * 3.8
        : 5.6 + m100 * 0.85;

    const maxIntDepth = Math.min(6, Math.ceil(continuousDepth));
    const trunkLength = 36 + m50 * 19 + m100 * 6;
    const trunkBaseWidth = 4.4 + m50 * 9.6 + m100 * 11.2;

    const degToRad = (deg: number) => (deg * Math.PI) / 180;

    // 1. SILUETA CONTINUA Y ORGÁNICA DEL TRONCO + CUELLO RADICULAR (C-infinito, sin esquinas ni escalones)
    const rGrow = effectiveLevel < 11 ? 0 : Math.min(1, (effectiveLevel - 11) / 39);
    const rBase = trunkBaseWidth * 0.5;
    const rMid = rBase * 0.72;
    const rTop = Math.max(0.9, rBase * 0.52);

    const midTrunkY = baseY - trunkLength * 0.52;
    const midTrunkX = baseX - (1.8 + m50 * 2.2 + m100 * 1.6);
    const trunkMidWidth = rMid * 2;

    const topTrunkY = baseY - trunkLength;
    const topTrunkX = baseX + (1.2 + m50 * 1.6 + m100 * 1.2);
    const trunkTopWidth = rTop * 2;

    const upperCtrlX = midTrunkX - 0.6;
    const upperCtrlY = baseY - trunkLength * 0.78;

    // Pies laterales del faldón radicular que se funden dentro de las raíces principales
    const leftFootX = baseX - rBase * (1.12 + rGrow * 0.26);
    const leftFootY = baseY + 1.0 - rGrow * 1.0;
    const rightFootX = baseX + rBase * (1.08 + rGrow * 0.22);
    const rightFootY = baseY + 0.9 - rGrow * 1.2;

    const leftTopX = topTrunkX - rTop;
    const leftTopY = topTrunkY;
    const rightTopX = topTrunkX + rTop;
    const rightTopY = topTrunkY;

    const leftC1X = baseX - rBase * 0.92 - (0.6 + m50 * 1.4);
    const leftC1Y = baseY - trunkLength * 0.22;
    const leftC2X = midTrunkX - rMid * 1.06;
    const leftC2Y = baseY - trunkLength * 0.68;

    const rightC1X = midTrunkX + rMid * 0.96;
    const rightC1Y = baseY - trunkLength * 0.64;
    const rightC2X = baseX + rBase * 0.8;
    const rightC2Y = baseY - trunkLength * 0.16;

    const collarBottomArchY = baseY + 1.0 - rGrow * 2.8;

    const trunkBodyPath =
      `M ${px(leftFootX)} ${px(leftFootY)} ` +
      `C ${px(leftC1X)} ${px(leftC1Y)} ${px(leftC2X)} ${px(leftC2Y)} ${px(leftTopX)} ${px(leftTopY)} ` +
      `A ${px(rTop)} ${px(rTop)} 0 0 1 ${px(rightTopX)} ${px(rightTopY)} ` +
      `C ${px(rightC1X)} ${px(rightC1Y)} ${px(rightC2X)} ${px(rightC2Y)} ${px(rightFootX)} ${px(rightFootY)} ` +
      `Q ${px(baseX)} ${px(collarBottomArchY)} ${px(leftFootX)} ${px(leftFootY)} Z`;

    const trunkHighlightPath = `M ${px(baseX - rBase * 0.44)} ${px(
      baseY - 2.4
    )} Q ${px(midTrunkX - rMid * 0.42)} ${px(midTrunkY)} ${px(
      topTrunkX - rTop * 0.34
    )} ${px(topTrunkY + 3)}`;

    // 2. RAÍCES ASIMÉTRICAS INTEGRADAS EN LOS HOMBROS DEL TRONCO
    if (effectiveLevel >= 11) {
      // Raíz 1 (izquierda principal larga y tendida)
      const r1StartX = baseX - rBase * 0.62;
      const r1StartY = baseY - (2.2 + rGrow * 1.8);
      const r1EndX = baseX - (16 + rGrow * 26 + m100 * 28);
      const r1EndY = baseY + 8.2 + rGrow * 3.6 + m100 * 1.5;
      const r1CtrlX = baseX - (9 + rGrow * 12 + m100 * 11);
      const r1CtrlY = baseY + 1.5;
      const r1WStart = 2.4 + rGrow * 3.4 + m100 * 3.2;
      roots.push({
        x1: r1StartX,
        y1: r1StartY,
        cx: r1CtrlX,
        cy: r1CtrlY,
        x2: r1EndX,
        y2: r1EndY,
        wStart: r1WStart,
        wEnd: 0.65,
        hasHighlight: true,
      });

      if (effectiveLevel >= 26) {
        const subGrow = Math.min(1, (effectiveLevel - 26) / 30);
        const forkOrigin = evalQuadPoint(
          r1StartX,
          r1StartY,
          r1CtrlX,
          r1CtrlY,
          r1EndX,
          r1EndY,
          0.54
        );
        roots.push({
          x1: forkOrigin.x,
          y1: forkOrigin.y + 0.3,
          cx: forkOrigin.x - (3 + subGrow * 5),
          cy: forkOrigin.y + 5.2,
          x2: forkOrigin.x - (8 + subGrow * 11 + m100 * 11),
          y2: forkOrigin.y + 8.5 + subGrow * 4.5,
          wStart: Math.max(1.3, r1WStart * 0.46),
          wEnd: 0.55,
        });
      }

      // Raíz 2 (derecha principal más corta y elevada, nacida desde el contrafuerte derecho)
      const r2StartX = baseX + rBase * 0.56;
      const r2StartY = baseY - (2.2 + rGrow * 1.6);
      const r2EndX = baseX + (12 + rGrow * 18 + m100 * 18);
      const r2EndY = baseY + 6.5 + rGrow * 3.0;
      roots.push({
        x1: r2StartX,
        y1: r2StartY,
        cx: baseX + (8 + rGrow * 9 + m100 * 8),
        cy: baseY + 0.8,
        x2: r2EndX,
        y2: r2EndY,
        wStart: 2.1 + rGrow * 2.8 + m100 * 2.6,
        wEnd: 0.65,
        hasHighlight: true,
      });

      // Raíz 3 (izquierda-delantera oblicua)
      if (effectiveLevel >= 19) {
        const r3Grow = Math.min(1, (effectiveLevel - 19) / 31);
        roots.push({
          x1: baseX - trunkBaseWidth * 0.18,
          y1: baseY - 2.6,
          cx: baseX - (6 + r3Grow * 6 + m100 * 6),
          cy: baseY + 5.0,
          x2: baseX - (11 + r3Grow * 11 + m100 * 13),
          y2: baseY + 11.2 + r3Grow * 4.2,
          wStart: 2.0 + r3Grow * 2.0 + m100 * 2.2,
          wEnd: 0.6,
        });
      }

      // Raíz 4 (derecha-delantera serpenteante)
      if (effectiveLevel >= 22) {
        const r4Grow = Math.min(1, (effectiveLevel - 22) / 32);
        const r4StartX = baseX + trunkBaseWidth * 0.16;
        const r4StartY = baseY - 2.6;
        const r4CtrlX = baseX + (6 + r4Grow * 8 + m100 * 9);
        const r4CtrlY = baseY + 5.6;
        const r4EndX = baseX + (13 + r4Grow * 17 + m100 * 25);
        const r4EndY = baseY + 11.8 + r4Grow * 4.4 + m100 * 1.6;

        roots.push({
          x1: r4StartX,
          y1: r4StartY,
          cx: r4CtrlX,
          cy: r4CtrlY,
          x2: r4EndX,
          y2: r4EndY,
          wStart: 2.1 + r4Grow * 2.2 + m100 * 2.5,
          wEnd: 0.6,
        });

        // Bifurcación secundaria derecha en árbol muy maduro / milenario
        if (effectiveLevel >= 46) {
          const tipGrow = Math.min(1, (effectiveLevel - 46) / 34);
          const r4Mid = evalQuadPoint(
            r4StartX,
            r4StartY,
            r4CtrlX,
            r4CtrlY,
            r4EndX,
            r4EndY,
            0.62
          );
          roots.push({
            x1: r4Mid.x,
            y1: r4Mid.y,
            cx: r4Mid.x + 6 + tipGrow * 6,
            cy: r4Mid.y - 0.5,
            x2: r4Mid.x + 11 + tipGrow * 13,
            y2: r4Mid.y + 2.4 + tipGrow * 2,
            wStart: 1.2 + tipGrow * 1.2,
            wEnd: 0.5,
          });
        }
      }

      // Raíz 5 (raicilla interior descentrada fina que rompe cualquier hueco simétrico)
      if (effectiveLevel >= 38) {
        const r5Grow = Math.min(1, (effectiveLevel - 38) / 35);
        roots.push({
          x1: baseX - trunkBaseWidth * 0.03,
          y1: baseY - 2.6,
          cx: baseX + (1.8 + r5Grow * 2.6),
          cy: baseY + 4.2,
          x2: baseX + (3.6 + r5Grow * 6.4 + m100 * 4),
          y2: baseY + 9.2 + r5Grow * 3.8,
          wStart: 1.5 + r5Grow * 1.3 + m100 * 0.8,
          wEnd: 0.5,
        });
      }
    }

    // Helper para poblar racimos asimétricos de hojas, flores y frutos en un brote terminal
    const populateTwigCluster = (
      x1: number,
      y1: number,
      cx: number,
      cy: number,
      x2: number,
      y2: number,
      angleDeg: number,
      depthGrowth: number,
      nodeId: number
    ) => {
      const hA = hash01(nodeId * 19 + 5);
      const hB = hash01(nodeId * 37 + 13);
      const hC = hash01(nodeId * 53 + 29);

      const tipScale =
        (0.6 + 0.34 * depthGrowth) * (0.9 + m50 * 0.12) * (0.9 + hA * 0.2);

      // Hojas laterales alternas (desfasadas a lo largo del brote curvo, nunca enfrentadas igual)
      const latPt1 = evalQuadPoint(x1, y1, cx, cy, x2, y2, 0.38 + hB * 0.14);
      const latPt2 = evalQuadPoint(x1, y1, cx, cy, x2, y2, 0.64 + hC * 0.14);

      addLeaf(
        latPt1.x,
        latPt1.y,
        angleDeg - (46 + hA * 20),
        tipScale * (0.82 + hB * 0.14),
        0
      );
      addLeaf(
        latPt2.x,
        latPt2.y,
        angleDeg + (44 + hC * 22),
        tipScale * (0.84 + hA * 0.14),
        1
      );

      // Ramillete irregular en la punta (3 o 4 hojas con ángulos y escalas desiguales)
      addLeaf(
        x2,
        y2,
        angleDeg - (34 + hB * 18),
        tipScale * (0.9 + hC * 0.14),
        1
      );
      addLeaf(
        x2,
        y2,
        angleDeg + (30 + hA * 20),
        tipScale * (0.88 + hB * 0.16),
        2
      );
      addLeaf(
        x2,
        y2,
        angleDeg + (hC - 0.5) * 24,
        tipScale * (0.98 + hA * 0.12),
        3
      );

      if (hB > 0.28) {
        addLeaf(
          x2,
          y2,
          angleDeg + (hA > 0.5 ? -16 : 18) + (hC - 0.5) * 10,
          tipScale * 0.92,
          2
        );
      }

      const rad = degToRad(angleDeg);
      const hashInt = Math.floor(hA * 1000) + nodeId;

      if (hashInt % 2 === 0) {
        blossoms.push({
          x: x2 + Math.sin(rad) * 1.4,
          y: y2 - Math.cos(rad) * 1.4,
          scale: 0.68 + hB * 0.3,
          breezeGroup: (hashInt % 3) as 0 | 1 | 2,
          variant: (hashInt % 2) as 0 | 1,
        });
      }

      if (hashInt % 4 === 0) {
        fruits.push({
          x: latPt2.x + (hC > 0.5 ? -2.1 : 2.1),
          y: latPt2.y + 4.1,
          r: 2.35 + hA * 0.7,
          breezeGroup: (hashInt % 3) as 0 | 1 | 2,
          warmVariant: hashInt % 8 === 0,
        });
      }
    };

    // 3. RAMIFICACIÓN ORGÁNICA Y ASIMÉTRICA (horquillas desfasadas, curvas y grosores desiguales)
    const growOrganicBranch = (
      x1: number,
      y1: number,
      angleDeg: number,
      length: number,
      widthStart: number,
      depth: number,
      nodeId: number
    ) => {
      const h1 = hash01(nodeId * 17 + 3);
      const h2 = hash01(nodeId * 31 + 11);
      const h3 = hash01(nodeId * 47 + 19);
      const h4 = hash01(nodeId * 61 + 23);
      const h5 = hash01(nodeId * 79 + 37);

      const depthGrowth =
        depth < maxIntDepth
          ? 1
          : Math.max(0.24, Math.min(1, 1 - (maxIntDepth - continuousDepth)));

      const actualLen = length * depthGrowth;
      const rad = degToRad(angleDeg);

      // Fototropismo suave: si una rama se inclina demasiado hacia el suelo, tiende a arquearse ligeramente hacia la luz
      const skyLiftDeg =
        Math.abs(angleDeg) > 54 ? -Math.sign(angleDeg) * (Math.abs(angleDeg) - 54) * 0.24 : 0;
      const endRad = degToRad(angleDeg + skyLiftDeg);

      const x2 = x1 + Math.sin(endRad) * actualLen;
      const y2 = y1 - Math.cos(endRad) * actualLen;

      // Curvatura natural propia de cada rama (ninguna rama es una línea recta rígida)
      const perpX = Math.cos(rad);
      const perpY = Math.sin(rad);
      const curveBend = (h1 - 0.48) * actualLen * 0.24;
      const cx = (x1 + x2) * 0.5 + perpX * curveBend;
      const cy = (y1 + y2) * 0.5 + perpY * curveBend;

      const taperRatio = 0.62 + h2 * 0.09 + m100 * 0.02;
      const widthEnd = Math.max(0.8, widthStart * taperRatio);

      const segWStart =
        depth === maxIntDepth
          ? Math.max(0.85, widthStart * (0.58 + 0.42 * depthGrowth))
          : widthStart;
      const segWEnd =
        depth === maxIntDepth
          ? Math.max(0.7, widthEnd * (0.52 + 0.48 * depthGrowth))
          : widthEnd;

      upperBranches.push({
        x1,
        y1,
        cx,
        cy,
        x2,
        y2,
        angleDeg,
        wStart: segWStart,
        wEnd: segWEnd,
        depth,
        maxDepth: maxIntDepth,
      });

      // Nieve posada siguiendo la curva real superior de las ramas inclinadas
      if (depth >= 2 && depth <= 5 && Math.abs(angleDeg) >= 14) {
        const sStart = evalQuadPoint(x1, y1, cx, cy, x2, y2, 0.14);
        const sMid = evalQuadPoint(x1, y1, cx, cy, x2, y2, 0.52);
        const sEnd = evalQuadPoint(x1, y1, cx, cy, x2, y2, 0.88);
        const offStart = segWStart * 0.36;
        const offMid = (segWStart + segWEnd) * 0.2;
        const offEnd = segWEnd * 0.36;
        const sCtrlX = 2 * sMid.x - 0.5 * (sStart.x + sEnd.x);
        const sCtrlY =
          2 * (sMid.y - offMid) - 0.5 * (sStart.y - offStart + (sEnd.y - offEnd));

        snowCaps.push({
          pathD: `M ${px(sStart.x)} ${px(sStart.y - offStart)} Q ${px(sCtrlX)} ${px(
            sCtrlY
          )} ${px(sEnd.x)} ${px(sEnd.y - offEnd)}`,
          thickness: Math.max(1.3, segWStart * 0.55),
        });
      }

      // Hojas alternas a lo largo de ramas sub-terminales
      if (depth >= Math.max(2, maxIntDepth - 2) && depth < maxIntDepth) {
        const subScale = (0.62 + m50 * 0.18) * (depth === maxIntDepth - 1 ? 0.94 : 0.76);
        const ptA = evalQuadPoint(x1, y1, cx, cy, x2, y2, 0.34 + h2 * 0.14);
        const ptB = evalQuadPoint(x1, y1, cx, cy, x2, y2, 0.66 + h3 * 0.16);

        addLeaf(ptA.x, ptA.y, angleDeg - (45 + h4 * 16), subScale, 0);
        addLeaf(ptB.x, ptB.y, angleDeg + (42 + h1 * 18), subScale * 0.92, 1);

        if (depth === maxIntDepth - 1 && h5 > 0.35) {
          const ptC = evalQuadPoint(x1, y1, cx, cy, x2, y2, 0.84);
          addLeaf(
            ptC.x,
            ptC.y,
            angleDeg + (h2 > 0.5 ? -38 : 38),
            subScale * 0.9,
            2
          );
        }
      }

      // Volumen suave de follaje al fondo
      if (effectiveLevel >= 20 && depth === Math.max(3, maxIntDepth - 1)) {
        const maturityCloud = Math.min(1, (effectiveLevel - 20) / 30);
        clouds.push({
          cx: x2 + (h2 - 0.5) * 6,
          cy: y2 - 2 + (h3 - 0.5) * 5,
          r: (11 + maturityCloud * 9 + m100 * 6) * (0.85 + h1 * 0.3),
          opacity: 0.07 + maturityCloud * 0.055 + m100 * 0.035,
        });
      }

      // Lianas / raíces aéreas orgánicas curvas y desiguales en etapa milenaria (65 -> 100)
      if (m100 > 0.3 && depth === 2 && Math.abs(angleDeg) > 22 && h4 > 0.22) {
        const tendrilFactor = (m100 - 0.3) / 0.7;
        const tAttach = evalQuadPoint(x1, y1, cx, cy, x2, y2, 0.58 + h2 * 0.3);
        const dropLen = (10 + h3 * 11) + tendrilFactor * (14 + h5 * 14);
        const swayX = (h1 - 0.5) * 5.5;
        tendrils.push({
          pathD: `M ${px(tAttach.x)} ${px(tAttach.y + 1)} Q ${px(tAttach.x + swayX)} ${px(
            tAttach.y + dropLen * 0.55
          )} ${px(tAttach.x + swayX * 0.45)} ${px(tAttach.y + dropLen)}`,
          opacity: 0.32 + tendrilFactor * 0.42,
          width: 0.75 + h2 * 0.45,
        });
      }

      // Algunos brotes interiores terminan un nivel antes como ramitas cortas frondosas (huecos naturales de luz)
      const isNaturalShortSpur =
        depth >= 4 && depth === maxIntDepth - 1 && maxIntDepth >= 5 && h5 < 0.18;

      if (depth >= maxIntDepth || isNaturalShortSpur) {
        populateTwigCluster(x1, y1, cx, cy, x2, y2, angleDeg, depthGrowth, nodeId);
        return;
      }

      // Alternancia orgánica de rama dominante vs rama lateral secundaria (rompe toda simetría en "Y")
      const dominantSide = (nodeId + depth + (h1 > 0.62 ? 1 : 0)) % 2 === 0 ? -1 : 1;
      const lateralSide = -dominantSide;

      // La rama dominante continúa desde la punta con menor desvío, más longitud y mayor grosor
      const domDeflect = 11 + h2 * 13 + m100 * 3;
      const domLen = length * (0.73 + h3 * 0.09 + m50 * 0.015);
      const domWidth = Math.max(0.85, widthEnd * (0.92 + h4 * 0.08));

      growOrganicBranch(
        x2,
        y2,
        angleDeg + dominantSide * domDeflect,
        domLen,
        domWidth,
        depth + 1,
        nodeId * 3 + 1
      );

      // La rama lateral nace un poco antes de la punta (horquilla desfasada) con mayor ángulo y menor grosor
      const latAttachT = 0.68 + h4 * 0.26;
      const latOrigin = evalQuadPoint(x1, y1, cx, cy, x2, y2, latAttachT);
      const latDeflect = 25 + h5 * 17 + depth * 1.1 + m100 * 4;
      const latLen = length * (0.58 + h1 * 0.13 + m50 * 0.015);
      const latWidth = Math.max(0.8, widthEnd * (0.72 + h2 * 0.12));

      growOrganicBranch(
        latOrigin.x,
        latOrigin.y,
        angleDeg + lateralSide * latDeflect,
        latLen,
        latWidth,
        depth + 1,
        nodeId * 3 + 2
      );

      // Brote terciario asimétrico en ramas principales maduras y milenarias
      if (
        (depth === 2 && effectiveLevel >= 34 && h3 > 0.35) ||
        (depth === 3 && m100 > 0.42 && h2 > 0.45)
      ) {
        const extraMaturity =
          depth === 2
            ? Math.min(1, (effectiveLevel - 34) / 36)
            : Math.min(1, (m100 - 0.42) / 0.58);
        const midOrigin = evalQuadPoint(x1, y1, cx, cy, x2, y2, 0.48 + h1 * 0.18);
        const extraSide = h4 > 0.5 ? lateralSide : dominantSide;
        const extraAngle = angleDeg + extraSide * (18 + h3 * 16);

        growOrganicBranch(
          midOrigin.x,
          midOrigin.y,
          extraAngle,
          length * (0.44 + 0.18 * extraMaturity),
          Math.max(0.8, widthEnd * 0.64),
          depth + 1,
          nodeId * 3 + 3
        );
      }
    };

    // NACIMIENTO ESCALONADO DE LAS RAMAS PRINCIPALES DESDE EL TRONCO (sin tridente simétrico)
    // 1) Gran brazo izquierdo bajo: brota al ~68% de la altura del tronco y se extiende amplio hacia la izquierda
    const lowLeftOrigin = evalQuadPoint(
      midTrunkX,
      midTrunkY,
      upperCtrlX,
      upperCtrlY,
      topTrunkX,
      topTrunkY,
      0.35
    );
    growOrganicBranch(
      lowLeftOrigin.x + 1.2,
      lowLeftOrigin.y,
      -(33 + m50 * 4 + m100 * 5),
      trunkLength * (0.72 + m50 * 0.05),
      Math.max(1.5, trunkMidWidth * 0.64),
      2,
      2
    );

    // 2) Guía principal ascendente: continúa desde el ápice del tronco inclinándose suavemente a la derecha
    growOrganicBranch(
      topTrunkX,
      topTrunkY,
      15 + m50 * 2.5 + m100 * 2,
      trunkLength * (0.79 + m50 * 0.04),
      trunkTopWidth * 0.94,
      2,
      3
    );

    // 3) Rama media derecha escalonada: nace a ~84% del tronco con ángulo más tendido (aparece al crecer el joven árbol)
    if (effectiveLevel >= 8) {
      const rightBoughGrow = Math.min(1, (effectiveLevel - 8) / 22);
      const midRightOrigin = evalQuadPoint(
        midTrunkX,
        midTrunkY,
        upperCtrlX,
        upperCtrlY,
        topTrunkX,
        topTrunkY,
        0.72
      );
      growOrganicBranch(
        midRightOrigin.x,
        midRightOrigin.y,
        40 + m50 * 4 + m100 * 5,
        trunkLength * (0.34 + 0.3 * rightBoughGrow),
        Math.max(1.2, trunkTopWidth * (0.48 + 0.24 * rightBoughGrow)),
        2,
        4
      );
    }

    // 4) Rama alta centro-izquierda que equilibra la copa madura y milenaria de forma natural
    if (effectiveLevel >= 18) {
      const crownLeftGrow = Math.min(1, (effectiveLevel - 18) / 28);
      growOrganicBranch(
        topTrunkX - 0.4,
        topTrunkY + 1.4,
        -(12 + m50 * 3),
        trunkLength * (0.38 + 0.32 * crownLeftGrow),
        Math.max(1.2, trunkTopWidth * (0.5 + 0.22 * crownLeftGrow)),
        2,
        5
      );
    }

    return {
      baseX,
      baseY,
      isSprout: false,
      sproutPath: '',
      sproutWidth: 0,
      trunkBaseWidth,
      trunkBodyPath,
      trunkHighlightPath,
      upperBranches,
      roots,
      leaves,
      blossoms,
      fruits,
      snowCaps,
      clouds,
      tendrils,
    };
  }, [effectiveLevel, m50, m100]);

  const stageGlowId = `tree-soft-amb-${rawUid}`;
  const burstGlowId = `tree-soft-burst-${rawUid}`;
  const moundWidth = 64 + m50 * 52 + m100 * 44;

  const { palette, weights } = seasonalAppearance;
  const winterWeight = weights.invierno;
  const springWeight = weights.primavera;
  const summerWeight = weights.verano;
  const autumnWeight = weights.otono;

  // En invierno parte de las hojas caducas caen de forma gradual dejando ver la nieve en las ramas
  const winterShedScale = Math.max(0, 1 - winterWeight * 0.92);
  const winterKeptScale = 1 - winterWeight * 0.25;

  // Pre-agrupar toda la geometría del árbol en trazos vectoriales puros de alta precisión
  const batchedSvgPaths = useMemo(() => {
    let rootsFillD = '';
    let rootHighlightD = '';

    for (const rt of treeGeometry.roots) {
      rootsFillD += buildCurvedLimbPath(
        rt.x1,
        rt.y1,
        rt.cx,
        rt.cy,
        rt.x2,
        rt.y2,
        rt.wStart,
        rt.wEnd
      );
      if (rt.hasHighlight && rt.wStart >= 2.6) {
        rootHighlightD += `M${px(rt.x1)} ${px(rt.y1 - rt.wStart * 0.16)}Q${px(rt.cx)} ${px(
          rt.cy - rt.wStart * 0.12
        )} ${px(rt.x2)} ${px(rt.y2)}`;
      }
    }

    let midBranchesFillD = '';
    let twigTaperedFillD = '';
    let fineTwigsStrokeD = '';

    for (const b of treeGeometry.upperBranches) {
      if (b.depth <= 3) {
        midBranchesFillD += buildCurvedLimbPath(
          b.x1,
          b.y1,
          b.cx,
          b.cy,
          b.x2,
          b.y2,
          b.wStart,
          b.wEnd
        );
      } else if (b.depth === 4) {
        twigTaperedFillD += buildCurvedLimbPath(
          b.x1,
          b.y1,
          b.cx,
          b.cy,
          b.x2,
          b.y2,
          b.wStart,
          b.wEnd
        );
      } else {
        fineTwigsStrokeD += `M${px(b.x1)} ${px(b.y1)}Q${px(b.cx)} ${px(b.cy)} ${px(
          b.x2
        )} ${px(b.y2)}`;
      }
    }

    let snowThickD = '';
    let snowThinD = '';
    if (winterWeight > 0.06) {
      for (const sc of treeGeometry.snowCaps) {
        if (sc.thickness >= 2.1) {
          snowThickD += sc.pathD;
        } else {
          snowThinD += sc.pathD;
        }
      }
    }

    let tendrilsD = '';
    for (const td of treeGeometry.tendrils) {
      tendrilsD += td.pathD;
    }

    const leafTonesD: [string, string, string, string] = ['', '', '', ''];
    let snowBudsD = '';
    let blossomPetalAD = '';
    let blossomPetalBD = '';
    let blossomCenterD = '';
    let fruitStemsD = '';
    let fruitRedD = '';
    let fruitWarmD = '';
    let fruitShineD = '';

    const leafWidthFactor = 1 - effectiveWither * 0.36;
    const shedCutoff = effectiveWither <= 0.22 ? 0 : ((effectiveWither - 0.22) / 0.78) * 0.6;

    for (const lf of treeGeometry.leaves) {
      const seasonalScale = lf.keepInWinter ? winterKeptScale : winterShedScale;
      let witherLeafScale = 1 - effectiveWither * 0.1;

      if (shedCutoff > 0 && lf.shedOrder < shedCutoff) {
        const dropProgress = Math.min(1, (shedCutoff - lf.shedOrder) / 0.14);
        witherLeafScale *= 1 - dropProgress;
      }

      const finalScale = lf.scale * seasonalScale * witherLeafScale;
      if (finalScale < 0.14) continue;

      const droopSide =
        Math.abs(lf.angleDeg) < 4
          ? lf.breezeGroup === 1
            ? -1
            : 1
          : lf.angleDeg >= 0
          ? 1
          : -1;
      const droopTargetDeg = droopSide * 156;
      const effectiveAngleDeg =
        effectiveWither > 0
          ? lf.angleDeg + (droopTargetDeg - lf.angleDeg) * effectiveWither * 0.46
          : lf.angleDeg;

      leafTonesD[lf.toneIdx] += buildTransformedLeafSubpath(
        lf.x,
        lf.y,
        effectiveAngleDeg,
        finalScale,
        leafWidthFactor
      );
    }

    if (winterWeight > 0.12 || springWeight > 0.06) {
      for (const bl of treeGeometry.blossoms) {
        if (winterWeight > 0.12) {
          snowBudsD += buildCircleSubpath(
            bl.x,
            bl.y - 1.5,
            1.9 * bl.scale * winterWeight
          );
        }
        if (springWeight > 0.06) {
          const s = bl.scale * (0.45 + 0.55 * springWeight);
          const pr = 1.85 * s;
          const petalsSub =
            buildCircleSubpath(bl.x, bl.y - 2.5 * s, pr) +
            buildCircleSubpath(bl.x + 2.4 * s, bl.y - 0.8 * s, pr) +
            buildCircleSubpath(bl.x + 1.5 * s, bl.y + 2 * s, pr) +
            buildCircleSubpath(bl.x - 1.5 * s, bl.y + 2 * s, pr) +
            buildCircleSubpath(bl.x - 2.4 * s, bl.y - 0.8 * s, pr);
          if (bl.variant === 0) {
            blossomPetalAD += petalsSub;
          } else {
            blossomPetalBD += petalsSub;
          }
          blossomCenterD += buildCircleSubpath(bl.x, bl.y, 1.25 * s);
        }
      }
    }

    if (summerWeight > 0.06) {
      for (const fr of treeGeometry.fruits) {
        const radius = fr.r * (0.4 + 0.6 * summerWeight);
        fruitStemsD += `M${px(fr.x)} ${px(fr.y - radius - 2.2)}L${px(fr.x)} ${px(
          fr.y - radius + 0.4
        )}`;
        if (fr.warmVariant) {
          fruitWarmD += buildCircleSubpath(fr.x, fr.y, radius);
        } else {
          fruitRedD += buildCircleSubpath(fr.x, fr.y, radius);
        }
        fruitShineD += buildCircleSubpath(
          fr.x - radius * 0.3,
          fr.y - radius * 0.3,
          radius * 0.28
        );
      }
    }

    return {
      rootsFillD,
      rootHighlightD,
      midBranchesFillD,
      twigTaperedFillD,
      fineTwigsStrokeD,
      snowThickD,
      snowThinD,
      tendrilsD,
      leafTonesD,
      snowBudsD,
      blossomPetalAD,
      blossomPetalBD,
      blossomCenterD,
      fruitStemsD,
      fruitRedD,
      fruitWarmD,
      fruitShineD,
    };
  }, [
    treeGeometry,
    effectiveWither,
    winterWeight,
    winterKeptScale,
    winterShedScale,
    springWeight,
    summerWeight,
  ]);

  const activeLeafFills = useMemo(() => {
    if (!isPulsing) return palette.leafTones;
    return [
      lerpHexColor(palette.leafTones[0], '#fef3c7', 0.16),
      lerpHexColor(palette.leafTones[1], '#fef3c7', 0.16),
      lerpHexColor(palette.leafTones[2], '#fef3c7', 0.16),
      lerpHexColor(palette.leafTones[3], '#fef3c7', 0.16),
    ] as [string, string, string, string];
  }, [isPulsing, palette.leafTones]);

  const { locale, t } = useI18n();

  return (
    <div className="relative h-[272px] sm:h-[304px] flex items-center justify-center overflow-hidden">
      {/* Indicador flotante limpio de XP recibida */}
      {isPulsing && lastXpGain > 0 && (
        <div
          key={`gain-${activePulseKey}`}
          className="absolute top-2 right-1 z-10 font-mono text-xs font-bold text-accent tabular-nums pointer-events-none animate-xp-counter-pop"
        >
          +{lastXpGain.toLocaleString(locale)} {t.profile_xp_unit}
        </div>
      )}

      <svg
        viewBox="0 0 1440 1136"
        shapeRendering="geometricPrecision"
        className="w-full h-full select-none tree-hd-svg"
        role="img"
        aria-label={`${t.profile_level_prefix} ${level}`}
      >
        <defs>
          <radialGradient
            id={stageGlowId}
            gradientUnits="userSpaceOnUse"
            cx={S(180)}
            cy={S(138)}
            r={S(105 + m50 * 22 + m100 * 22)}
          >
            <stop
              offset="0%"
              stopColor="#fde68a"
              stopOpacity={(0.02 + m50 * 0.015 + m100 * 0.02) * (1 - effectiveWither * 0.78)}
            />
            <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
          </radialGradient>

          <radialGradient
            id={burstGlowId}
            gradientUnits="userSpaceOnUse"
            cx={S(180)}
            cy={S(134)}
            r={S(118)}
          >
            <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.22" />
            <stop offset="55%" stopColor="#fde68a" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
          </radialGradient>
        </defs>

        {isDarkMode && (
          <circle
            cx={S(180)}
            cy={S(138)}
            r={S(105 + m50 * 22 + m100 * 22)}
            fill={`url(#${stageGlowId})`}
          />
        )}

        {isDarkMode && isPulsing && (
          <circle
            key={`burst-${activePulseKey}`}
            cx={S(180)}
            cy={S(134)}
            r={S(116)}
            fill={`url(#${burstGlowId})`}
            className="animate-tree-glow-burst"
          />
        )}

        {/* Colina / suelo orgánico ligeramente asimétrico */}
        <path
          d={`M ${px(180 - moundWidth * 1.05)} ${px(242)} C ${px(
            180 - moundWidth * 0.46
          )} ${px(224 - m50 * 1.5 - m100 * 1.5)}, ${px(180 + moundWidth * 0.34)} ${px(
            227 - m50 * 1.2 - m100 * 1.2
          )}, ${px(180 + moundWidth * 0.96)} ${px(240)}`}
          fill="none"
          stroke={palette.groundTint}
          strokeWidth={S(1.8)}
          strokeLinecap="round"
        />
        <path
          d={`M ${px(180 - moundWidth * 0.72)} ${px(250)} C ${px(
            180 - moundWidth * 0.2
          )} ${px(240)}, ${px(180 + moundWidth * 0.28)} ${px(242)}, ${px(
            180 + moundWidth * 0.58
          )} ${px(248)}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={S(1)}
          strokeLinecap="round"
          className="text-subtle"
        />

        {winterWeight > 0.05 && (
          <path
            d={`M ${px(180 - moundWidth * 0.92)} ${px(240)} C ${px(
              180 - moundWidth * 0.42
            )} ${px(223 - m50 * 1.5 - m100 * 1.5)}, ${px(180 + moundWidth * 0.3)} ${px(
              226 - m50 * 1.2 - m100 * 1.2
            )}, ${px(180 + moundWidth * 0.84)} ${px(239)}`}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={S(2.6)}
            strokeLinecap="round"
            opacity={winterWeight * 0.78}
          />
        )}

        {autumnWeight > 0.08 && (
          <g opacity={autumnWeight * 0.85}>
            <GroundEllipse cx={136} cy={235} rx={3.3} ry={1.4} rot={-17} fill="#d97706" />
            <GroundEllipse cx={155} cy={238} rx={2.7} ry={1.2} rot={21} fill="#c2410c" />
            <GroundEllipse cx={163} cy={234} rx={2.5} ry={1.1} rot={-8} fill="#eab308" />
            <GroundEllipse cx={202} cy={236} rx={3.4} ry={1.4} rot={-22} fill="#eab308" />
            <GroundEllipse cx={224} cy={239} rx={2.8} ry={1.3} rot={14} fill="#ea580c" />
            {effectiveLevel >= 40 && (
              <>
                <GroundEllipse cx={118} cy={240} rx={3.1} ry={1.3} rot={11} fill="#b45309" />
                <GroundEllipse cx={241} cy={241} rx={3} ry={1.2} rot={-13} fill="#d97706" />
              </>
            )}
          </g>
        )}

        {/* Hojas secas caídas en el suelo cuando el árbol se marchita */}
        {effectiveWither > 0.16 && effectiveLevel >= 4 && (
          <g opacity={Math.min(0.92, ((effectiveWither - 0.16) / 0.84) * 0.92)}>
            <GroundEllipse cx={158} cy={236} rx={2.8} ry={1.1} rot={-14} fill="#85623a" />
            <GroundEllipse cx={170} cy={239} rx={2.4} ry={1.0} rot={18} fill="#6e4f2d" />
            <GroundEllipse cx={194} cy={237} rx={2.9} ry={1.1} rot={-21} fill="#9e7849" />
            <GroundEllipse cx={208} cy={240} rx={2.5} ry={1.0} rot={13} fill="#755533" />
            {effectiveLevel >= 22 && effectiveWither > 0.38 && (
              <>
                <GroundEllipse cx={138} cy={238} rx={3.1} ry={1.2} rot={9} fill="#755533" />
                <GroundEllipse cx={148} cy={241} rx={2.6} ry={1.0} rot={-24} fill="#916c41" />
                <GroundEllipse cx={221} cy={238} rx={3.0} ry={1.15} rot={16} fill="#85623a" />
                <GroundEllipse cx={233} cy={242} rx={2.7} ry={1.05} rot={-11} fill="#594127" />
              </>
            )}
            {effectiveLevel >= 45 && effectiveWither > 0.62 && (
              <>
                <GroundEllipse cx={121} cy={241} rx={3.0} ry={1.15} rot={-15} fill="#6e4f2d" />
                <GroundEllipse cx={183} cy={242} rx={2.6} ry={1.0} rot={7} fill="#85623a" />
                <GroundEllipse cx={246} cy={242} rx={2.9} ry={1.1} rot={-19} fill="#916c41" />
              </>
            )}
          </g>
        )}

        {springWeight > 0.08 && (
          <g opacity={springWeight * 0.8}>
            <GroundEllipse cx={143} cy={236} rx={2.4} ry={1.1} rot={-15} fill="#fbcfe8" />
            <GroundEllipse cx={162} cy={239} rx={2.1} ry={1} rot={19} fill="#f9a8d4" />
            <GroundEllipse cx={201} cy={237} rx={2.4} ry={1.1} rot={-18} fill="#fbcfe8" />
            <GroundEllipse cx={219} cy={240} rx={2} ry={1} rot={12} fill="#fdf2f8" />
          </g>
        )}

        {/* 1. TRONCO Y RAÍCES EN SILUETA CONTINUA */}
        {!treeGeometry.isSprout && (
          <g>
            {treeGeometry.trunkBodyPath && (
              <path d={treeGeometry.trunkBodyPath} fill={barkColors.trunkHex} />
            )}
            {batchedSvgPaths.rootsFillD && (
              <path d={batchedSvgPaths.rootsFillD} fill={barkColors.trunkHex} />
            )}
            {batchedSvgPaths.rootHighlightD && (
              <path
                d={batchedSvgPaths.rootHighlightD}
                fill="none"
                stroke={barkColors.highlightHex}
                strokeWidth={S(1.1)}
                strokeLinecap="round"
                opacity={0.42 * (1 - effectiveWither * 0.45)}
              />
            )}
            <path
              d={treeGeometry.trunkHighlightPath}
              fill="none"
              stroke={barkColors.highlightHex}
              strokeWidth={S(Math.max(1, treeGeometry.trunkBaseWidth * 0.14))}
              strokeLinecap="round"
              opacity={0.54 * (1 - effectiveWither * 0.45)}
            />
          </g>
        )}

        {treeGeometry.isSprout && (
          <path
            d={treeGeometry.sproutPath}
            fill="none"
            stroke={barkColors.trunkHex}
            strokeWidth={S(treeGeometry.sproutWidth)}
            strokeLinecap="round"
          />
        )}

        {/* 2. RAMAS Y COPA VECTORIALES DE ALTA DEFINICIÓN */}
        <g
          key={isPulsing ? `branches-rustle-${activePulseKey}` : 'branches-idle'}
          className={`tree-branches-origin ${isPulsing ? 'animate-branches-rustle' : ''}`}
        >
          {isDarkMode &&
            treeGeometry.clouds.map((c, idx) => (
              <circle
                key={`cloud-${idx}`}
                cx={px(c.cx)}
                cy={px(c.cy)}
                r={px(c.r * (1 - winterWeight * 0.35))}
                fill={palette.cloudColor}
                opacity={c.opacity * (1 - winterWeight * 0.45) * (1 - effectiveWither * 0.72)}
              />
            ))}

          {!treeGeometry.isSprout && (
            <>
              {batchedSvgPaths.midBranchesFillD && (
                <path d={batchedSvgPaths.midBranchesFillD} fill={barkColors.midBranchHex} />
              )}
              {batchedSvgPaths.twigTaperedFillD && (
                <path d={batchedSvgPaths.twigTaperedFillD} fill={barkColors.twigHex} />
              )}
              {batchedSvgPaths.fineTwigsStrokeD && (
                <path
                  d={batchedSvgPaths.fineTwigsStrokeD}
                  fill="none"
                  stroke={barkColors.twigHex}
                  strokeWidth={S(0.95)}
                  strokeLinecap="round"
                />
              )}
            </>
          )}

          {winterWeight > 0.06 && (
            <g opacity={winterWeight * 0.9} fill="none" stroke="#f1f5f9" strokeLinecap="round">
              {batchedSvgPaths.snowThickD && (
                <path d={batchedSvgPaths.snowThickD} strokeWidth={S(2.5)} />
              )}
              {batchedSvgPaths.snowThinD && (
                <path d={batchedSvgPaths.snowThinD} strokeWidth={S(1.5)} />
              )}
            </g>
          )}

          {batchedSvgPaths.tendrilsD && (
            <path
              d={batchedSvgPaths.tendrilsD}
              fill="none"
              stroke={barkColors.midBranchHex}
              strokeWidth={S(0.9)}
              strokeLinecap="round"
              opacity={0.35 + m100 * 0.35}
            />
          )}

          <g className={`tree-crown-origin ${isPulsing ? 'animate-canopy-flutter' : ''}`}>
            {([0, 1, 2, 3] as const).map((toneIdx) =>
              batchedSvgPaths.leafTonesD[toneIdx] ? (
                <path
                  key={`lft-${toneIdx}`}
                  d={batchedSvgPaths.leafTonesD[toneIdx]}
                  fill={activeLeafFills[toneIdx]}
                  opacity={0.95}
                />
              ) : null
            )}

            {winterWeight > 0.12 && batchedSvgPaths.snowBudsD && (
              <path
                d={batchedSvgPaths.snowBudsD}
                fill="#f8fafc"
                opacity={winterWeight * 0.88}
              />
            )}

            {springWeight > 0.06 && (
              <g opacity={Math.min(1, springWeight * 1.15)}>
                {batchedSvgPaths.blossomPetalAD && (
                  <path d={batchedSvgPaths.blossomPetalAD} fill="#fbcfe8" />
                )}
                {batchedSvgPaths.blossomPetalBD && (
                  <path d={batchedSvgPaths.blossomPetalBD} fill="#f9a8d4" />
                )}
                {batchedSvgPaths.blossomCenterD && (
                  <path d={batchedSvgPaths.blossomCenterD} fill="#fbbf24" />
                )}
              </g>
            )}

            {summerWeight > 0.06 && (
              <g opacity={Math.min(1, summerWeight * 1.15)}>
                {batchedSvgPaths.fruitStemsD && (
                  <path
                    d={batchedSvgPaths.fruitStemsD}
                    fill="none"
                    stroke={barkColors.twigHex}
                    strokeWidth={S(0.8)}
                    strokeLinecap="round"
                  />
                )}
                {batchedSvgPaths.fruitRedD && (
                  <path d={batchedSvgPaths.fruitRedD} fill="#dc2626" />
                )}
                {batchedSvgPaths.fruitWarmD && (
                  <path d={batchedSvgPaths.fruitWarmD} fill="#ea580c" />
                )}
                {batchedSvgPaths.fruitShineD && (
                  <path d={batchedSvgPaths.fruitShineD} fill="#fecdd3" opacity={0.75} />
                )}
              </g>
            )}
          </g>
        </g>

        {(winterWeight > 0.25 || (m100 > 0.45 && effectiveWither < 0.4)) && (
          <g
            opacity={
              winterWeight > 0.25
                ? winterWeight * 0.65
                : (m100 - 0.45) * 0.55 * (1 - effectiveWither * 2.5)
            }
          >
            <circle
              cx={S(104)}
              cy={S(116)}
              r={S(1.4)}
              fill={winterWeight > 0.25 ? '#f1f5f9' : '#fde68a'}
              className="animate-ambient-mote-1"
            />
            <circle
              cx={S(256)}
              cy={S(112)}
              r={S(1.3)}
              fill={winterWeight > 0.25 ? '#e2e8f0' : '#fcd34d'}
              className="animate-ambient-mote-2"
            />
            <circle
              cx={S(128)}
              cy={S(70)}
              r={S(1.2)}
              fill={winterWeight > 0.25 ? '#f8fafc' : '#fef3c7'}
              className="animate-ambient-mote-3"
            />
            <circle
              cx={S(234)}
              cy={S(74)}
              r={S(1.35)}
              fill={winterWeight > 0.25 ? '#f1f5f9' : '#fde68a'}
              className="animate-ambient-mote-4"
            />
          </g>
        )}

        {isPulsing && (
          <g key={`particles-${activePulseKey}`}>
            <circle cx={S(154)} cy={S(164)} r={S(1.6)} fill="#fef3c7" className="animate-xp-particle-1" />
            <circle cx={S(206)} cy={S(160)} r={S(1.7)} fill="#fde68a" className="animate-xp-particle-2" />
            <circle cx={S(180)} cy={S(136)} r={S(1.8)} fill="#fef3c7" className="animate-xp-particle-3" />
            <circle cx={S(136)} cy={S(142)} r={S(1.4)} fill="#fde68a" className="animate-xp-particle-4" />
            <circle cx={S(224)} cy={S(140)} r={S(1.5)} fill="#fef3c7" className="animate-xp-particle-5" />
            <circle cx={S(170)} cy={S(112)} r={S(1.5)} fill="#fde68a" className="animate-xp-particle-6" />
          </g>
        )}
      </svg>
    </div>
  );
});
