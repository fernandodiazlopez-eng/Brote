/**
 * Catálogo de diálogos del panel luminoso de metro, gorros 8-bits y textos de desbloqueo de Bug.
 */

import { UiTextKey, UiTextsMap } from '../i18n/translations';
import {
  AppLanguage,
  BugDialogueCategory,
  BugHatId,
  BugUnlockMilestone,
  BugWearableHatId,
  CustomBugPhrase,
  RgbColor,
} from '../types';

export type { BugDialogueCategory };

export interface BugHatMeta {
  id: BugWearableHatId;
  labelKey: UiTextKey;
  defaultColor: RgbColor;
  unlockLevel?: number;
  isSecret?: boolean;
  milestone: BugUnlockMilestone;
}

export const BUG_HATS_CATALOG: readonly BugHatMeta[] = [
  {
    id: 'headphones',
    labelKey: 'settings_bug_hat_headphones',
    defaultColor: { r: 0, g: 229, b: 255 },
    unlockLevel: 25,
    milestone: 'level25',
  },
  {
    id: 'bow',
    labelKey: 'settings_bug_hat_bow',
    defaultColor: { r: 255, g: 77, b: 141 },
    unlockLevel: 25,
    milestone: 'level25',
  },
  {
    id: 'plunger',
    labelKey: 'settings_bug_hat_plunger',
    defaultColor: { r: 235, g: 64, b: 52 },
    unlockLevel: 32,
    milestone: 'level32',
  },
  {
    id: 'robot_antenna',
    labelKey: 'settings_bug_hat_robot_antenna',
    defaultColor: { r: 0, g: 230, b: 118 },
    unlockLevel: 40,
    milestone: 'level40',
  },
  {
    id: 'cowboy',
    labelKey: 'settings_bug_hat_cowboy',
    defaultColor: { r: 217, g: 138, b: 43 },
    unlockLevel: 46,
    milestone: 'level46',
  },
  {
    id: 'pirate',
    labelKey: 'settings_bug_hat_pirate',
    defaultColor: { r: 230, g: 46, b: 68 },
    unlockLevel: 56,
    milestone: 'level56',
  },
  {
    id: 'horns',
    labelKey: 'settings_bug_hat_horns',
    defaultColor: { r: 255, g: 59, b: 48 },
    unlockLevel: 65,
    milestone: 'level65',
  },
  {
    id: 'halo',
    labelKey: 'settings_bug_hat_halo',
    defaultColor: { r: 255, g: 215, b: 0 },
    unlockLevel: 74,
    milestone: 'level74',
  },
  {
    id: 'wizard',
    labelKey: 'settings_bug_hat_wizard',
    defaultColor: { r: 157, g: 78, b: 221 },
    unlockLevel: 82,
    milestone: 'level82',
  },
  {
    id: 'crown',
    labelKey: 'settings_bug_hat_crown',
    defaultColor: { r: 255, g: 204, b: 0 },
    isSecret: true,
    milestone: 'secret_crown',
  },
  {
    id: 'scouter',
    labelKey: 'settings_bug_hat_scouter',
    defaultColor: { r: 0, g: 255, b: 136 },
    isSecret: true,
    milestone: 'secret_scouter',
  },
];

export const ALL_WEARABLE_HAT_IDS: readonly BugWearableHatId[] = BUG_HATS_CATALOG.map(
  (item) => item.id
);

const WEARABLE_HAT_SET = new Set<string>(ALL_WEARABLE_HAT_IDS);

export function isValidBugWearableHatId(raw: unknown): raw is BugWearableHatId {
  return typeof raw === 'string' && WEARABLE_HAT_SET.has(raw);
}

export function isValidBugHatId(raw: unknown): raw is BugHatId {
  return raw === 'none' || isValidBugWearableHatId(raw);
}

export const DEFAULT_BUG_HAT_COLORS: Record<BugWearableHatId, RgbColor> = {
  headphones: { r: 0, g: 229, b: 255 },
  bow: { r: 255, g: 77, b: 141 },
  plunger: { r: 235, g: 64, b: 52 },
  robot_antenna: { r: 0, g: 230, b: 118 },
  cowboy: { r: 217, g: 138, b: 43 },
  pirate: { r: 230, g: 46, b: 68 },
  horns: { r: 255, g: 59, b: 48 },
  halo: { r: 255, g: 215, b: 0 },
  wizard: { r: 157, g: 78, b: 221 },
  crown: { r: 255, g: 204, b: 0 },
  scouter: { r: 0, g: 255, b: 136 },
};

export function getResolvedBugHatColor(
  hat: BugHatId,
  hatColors?: Partial<Record<BugWearableHatId, RgbColor>>
): RgbColor {
  if (hat === 'none') {
    return DEFAULT_BUG_HAT_COLORS.headphones;
  }
  const fallback = DEFAULT_BUG_HAT_COLORS[hat] ?? DEFAULT_BUG_HAT_COLORS.headphones;
  return sanitizeRgbColor(hatColors?.[hat], fallback);
}

export function clampRgbByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function sanitizeRgbColor(raw: unknown, fallback: RgbColor): RgbColor {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const rec = raw as Partial<RgbColor>;
  if (
    typeof rec.r !== 'number' ||
    typeof rec.g !== 'number' ||
    typeof rec.b !== 'number' ||
    !Number.isFinite(rec.r) ||
    !Number.isFinite(rec.g) ||
    !Number.isFinite(rec.b)
  ) {
    return { ...fallback };
  }
  return {
    r: clampRgbByte(rec.r),
    g: clampRgbByte(rec.g),
    b: clampRgbByte(rec.b),
  };
}

export function formatRgbCode(color: RgbColor): string {
  return `${clampRgbByte(color.r)}, ${clampRgbByte(color.g)}, ${clampRgbByte(color.b)}`;
}

export function rgbColorToHex(color: RgbColor): string {
  return `#${[clampRgbByte(color.r), clampRgbByte(color.g), clampRgbByte(color.b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function hexToRgbColor(rawHex: string): RgbColor | null {
  const cleaned = rawHex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const [r, g, b] = cleaned.split('');
    return {
      r: Number.parseInt(`${r}${r}`, 16),
      g: Number.parseInt(`${g}${g}`, 16),
      b: Number.parseInt(`${b}${b}`, 16),
    };
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return {
      r: Number.parseInt(cleaned.slice(0, 2), 16),
      g: Number.parseInt(cleaned.slice(2, 4), 16),
      b: Number.parseInt(cleaned.slice(4, 6), 16),
    };
  }
  return null;
}

/**
 * Interpreta códigos RGB como "255, 77, 141", "rgb(255, 77, 141)" o "255 77 141".
 */
export function parseRgbCodeInput(raw: string): RgbColor | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/^rgba?\s*\(/i, '').replace(/\)\s*$/, '').trim();
  const parts = cleaned.split(/[\s,;:/]+/).filter(Boolean);
  if (parts.length !== 3) return null;

  const nums = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return NaN;
    return Number.parseInt(part, 10);
  });

  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return null;
  }

  return {
    r: nums[0],
    g: nums[1],
    b: nums[2],
  };
}

/**
 * Interpreta indistintamente códigos HEX (#RRGGBB / RRGGBB) o RGB (255, 77, 141).
 */
export function parseAnyColorCodeInput(raw: string): RgbColor | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#') || /^[0-9a-fA-F]{6}$/.test(trimmed) || /^[0-9a-fA-F]{3}$/.test(trimmed)) {
    const asHex = hexToRgbColor(trimmed);
    if (asHex) return asHex;
  }
  return parseRgbCodeInput(trimmed) || hexToRgbColor(trimmed);
}

export interface HsvColor {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

export function rgbToHsv(color: RgbColor): HsvColor {
  const r = clampRgbByte(color.r) / 255;
  const g = clampRgbByte(color.g) / 255;
  const b = clampRgbByte(color.b) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta > 0.00001) {
    if (max === r) {
      h = 60 * (((g - b) / delta) % 6);
    } else if (max === g) {
      h = 60 * ((b - r) / delta + 2);
    } else {
      h = 60 * ((r - g) / delta + 4);
    }
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

export function hsvToRgb(h: number, s: number, v: number): RgbColor {
  const safeH = ((Number.isFinite(h) ? h : 0) % 360 + 360) % 360;
  const safeS = Math.max(0, Math.min(1, Number.isFinite(s) ? s : 0));
  const safeV = Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

  const c = safeV * safeS;
  const x = c * (1 - Math.abs(((safeH / 60) % 2) - 1));
  const m = safeV - c;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (safeH < 60) {
    r1 = c;
    g1 = x;
  } else if (safeH < 120) {
    r1 = x;
    g1 = c;
  } else if (safeH < 180) {
    g1 = c;
    b1 = x;
  } else if (safeH < 240) {
    g1 = x;
    b1 = c;
  } else if (safeH < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: clampRgbByte((r1 + m) * 255),
    g: clampRgbByte((g1 + m) * 255),
    b: clampRgbByte((b1 + m) * 255),
  };
}

export const BUG_PHRASE_KEYS: Record<BugDialogueCategory, readonly UiTextKey[]> = {
  streak: [
    'bug_streak_1',
    'bug_streak_2',
    'bug_streak_3',
    'bug_streak_4',
    'bug_streak_5',
    'bug_streak_6',
  ],
  inactive: [
    'bug_inactive_1',
    'bug_inactive_2',
    'bug_inactive_3',
    'bug_inactive_4',
    'bug_inactive_5',
  ],
  reaction: [
    'bug_reaction_1',
    'bug_reaction_2',
    'bug_reaction_3',
    'bug_reaction_4',
    'bug_reaction_5',
    'bug_reaction_6',
    'bug_reaction_7',
    'bug_reaction_8',
    'bug_reaction_9',
  ],
};

const ALL_BUG_DEFAULT_KEYS_SET = new Set<string>([
  ...BUG_PHRASE_KEYS.streak,
  ...BUG_PHRASE_KEYS.inactive,
  ...BUG_PHRASE_KEYS.reaction,
]);

export function isBugDefaultPhraseKey(key: string): key is UiTextKey {
  return ALL_BUG_DEFAULT_KEYS_SET.has(key);
}

export function getBugCategoryForDefaultKey(key: UiTextKey): BugDialogueCategory | null {
  if ((BUG_PHRASE_KEYS.streak as readonly string[]).includes(key)) return 'streak';
  if ((BUG_PHRASE_KEYS.inactive as readonly string[]).includes(key)) return 'inactive';
  if ((BUG_PHRASE_KEYS.reaction as readonly string[]).includes(key)) return 'reaction';
  return null;
}

export function pickBugPhrase(
  category: BugDialogueCategory,
  uiTexts: UiTextsMap,
  previousText?: string | null,
  deletedKeys?: readonly string[],
  customPhrases?: readonly CustomBugPhrase[]
): string {
  const deletedSet = deletedKeys && deletedKeys.length > 0 ? new Set(deletedKeys) : null;
  const defaultPool = BUG_PHRASE_KEYS[category]
    .filter((key) => !deletedSet || !deletedSet.has(key))
    .map((key) => uiTexts[key])
    .filter((item) => item.trim().length > 0);

  const customPool = (customPhrases || [])
    .filter((item) => item.category === category && item.text.trim().length > 0)
    .map((item) => item.text.trim());

  const pool = [...defaultPool, ...customPool];
  if (pool.length === 0) return '';
  if (pool.length === 1) return pool[0];

  const candidates = previousText ? pool.filter((item) => item !== previousText) : pool;
  const source = candidates.length > 0 ? candidates : pool;
  const idx = Math.floor(Math.random() * source.length);
  return source[idx] ?? pool[0];
}

export interface BugMilestoneCardCopy {
  kickerLeft: string;
  kickerRight: string;
  title: string;
  description: string;
}

export function getMilestonePreviewConfig(milestone: BugUnlockMilestone): {
  hat: BugHatId;
  isGrown?: boolean;
  isSuperSaiyan?: boolean;
} {
  switch (milestone) {
    case 'level25':
      return { hat: 'headphones' };
    case 'level32':
      return { hat: 'plunger' };
    case 'level40':
      return { hat: 'robot_antenna' };
    case 'level46':
      return { hat: 'cowboy' };
    case 'level50':
      return { hat: 'none', isGrown: true };
    case 'level56':
      return { hat: 'pirate', isGrown: true };
    case 'level65':
      return { hat: 'horns', isGrown: true };
    case 'level74':
      return { hat: 'halo', isGrown: true };
    case 'level82':
      return { hat: 'wizard', isGrown: true };
    case 'level90':
      return { hat: 'none', isGrown: true, isSuperSaiyan: true };
    case 'secret_crown':
      return { hat: 'crown' };
    case 'secret_scouter':
      return { hat: 'scouter' };
    default:
      return { hat: 'none' };
  }
}

export function getBugMilestoneCopy(
  milestone: BugUnlockMilestone,
  language: AppLanguage
): BugMilestoneCardCopy {
  if (milestone === 'level3') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 3',
        kickerRight: 'BUG DETECTED',
        title: 'A BUG WAS FOUND!',
        description:
          'Meet Bug, your new 8-bit mascot. It will keep you company across the app (you can customize it in Settings).',
      };
    }
    return {
      kickerLeft: 'NIVEL 3',
      kickerRight: 'ANOMALÍA DETECTADA',
      title: '¡SE HA ENCONTRADO UN BUG!',
      description:
        'Es Bug, tu nueva mascota 8-bits. Te acompañará por la interfaz (puedes personalizarlo desde Ajustes).',
    };
  }

  if (milestone === 'level4') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 4',
        kickerRight: 'MASCOT BOND',
        title: 'YOU CAN NOW PET BUG!',
        description:
          'Double-tap Bug on any screen to pet it and spark a happy 8-bit reaction.',
      };
    }
    return {
      kickerLeft: 'NIVEL 4',
      kickerRight: 'AFECTO DESBLOQUEADO',
      title: '¡YA PUEDES ACARICIAR A BUG!',
      description:
        'Haz doble toque sobre Bug en cualquier pantalla para acariciarlo y ver su reacción.',
    };
  }

  if (milestone === 'level25') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 25',
        kickerRight: 'CUSTOMIZATION',
        title: 'BUG HATS UNLOCKED!',
        description:
          'Music headphones and bow unlocked with custom color selector in Settings → Customize Bug.',
      };
    }
    return {
      kickerLeft: 'NIVEL 25',
      kickerRight: 'PERSONALIZACIÓN',
      title: '¡GORROS DE BUG DESBLOQUEADOS!',
      description:
        'Has desbloqueado los cascos de música y el lacito con selector de color en Ajustes → Personalizar Bug.',
    };
  }

  if (milestone === 'level32') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 32',
        kickerRight: 'NEW HAT',
        title: 'PLUNGER UNLOCKED!',
        description: 'Equip and recolor the 8-bit Plunger hat in Settings → Customize Bug.',
      };
    }
    return {
      kickerLeft: 'NIVEL 32',
      kickerRight: 'NUEVO GORRO',
      title: '¡DESATASCADOR DESBLOQUEADO!',
      description:
        'Ya puedes equiparle y cambiar el color al Desatascador 8-bits en Ajustes → Personalizar Bug.',
    };
  }

  if (milestone === 'level40') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 40',
        kickerRight: 'NEW HAT',
        title: 'ROBOT ANTENNA UNLOCKED!',
        description: 'Equip and recolor the 8-bit Robot Antenna in Settings → Customize Bug.',
      };
    }
    return {
      kickerLeft: 'NIVEL 40',
      kickerRight: 'NUEVO GORRO',
      title: '¡ANTENA ROBOT DESBLOQUEADA!',
      description:
        'Equipa la Antena Robot 8-bits y ajusta su luz de color en Ajustes → Personalizar Bug.',
    };
  }

  if (milestone === 'level46') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 46',
        kickerRight: 'NEW HAT',
        title: 'COWBOY HAT UNLOCKED!',
        description: 'Equip and recolor the 8-bit Cowboy Hat in Settings → Customize Bug.',
      };
    }
    return {
      kickerLeft: 'NIVEL 46',
      kickerRight: 'NUEVO GORRO',
      title: '¡SOMBRERO VAQUERO DESBLOQUEADO!',
      description:
        'Ya tienes disponible el Sombrero Vaquero 8-bits en Ajustes → Personalizar Bug.',
    };
  }

  if (milestone === 'level50') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 50',
        kickerRight: 'EVOLUTION',
        title: 'BUG GREW A LITTLE BIT!',
        description:
          'Halfway to Level 100! Bug has grown slightly stronger alongside your training.',
      };
    }
    return {
      kickerLeft: 'NIVEL 50',
      kickerRight: 'EVOLUCIÓN',
      title: '¡BUG HA CRECIDO UN POQUITO!',
      description:
        '¡Mitad del camino al Nivel 100! Bug ha crecido ligeramente gracias a tu constancia.',
    };
  }

  if (milestone === 'level56') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 56',
        kickerRight: 'NEW HAT',
        title: 'PIRATE HAT UNLOCKED!',
        description: 'Equip and customize the 8-bit Pirate Hat in Settings → Customize Bug.',
      };
    }
    return {
      kickerLeft: 'NIVEL 56',
      kickerRight: 'NUEVO GORRO',
      title: '¡SOMBRERO PIRATA DESBLOQUEADO!',
      description:
        'Equipa el Sombrero Pirata 8-bits y personaliza su color en Ajustes → Personalizar Bug.',
    };
  }

  if (milestone === 'level65') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 65',
        kickerRight: 'NEW HAT',
        title: 'HORNS UNLOCKED!',
        description: 'Equip and customize the 8-bit Horns in Settings → Customize Bug.',
      };
    }
    return {
      kickerLeft: 'NIVEL 65',
      kickerRight: 'NUEVO GORRO',
      title: '¡CUERNOS DESBLOQUEADOS!',
      description:
        'Ya puedes equiparle los Cuernos 8-bits y elegir su color en Ajustes → Personalizar Bug.',
    };
  }

  if (milestone === 'level74') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 74',
        kickerRight: 'NEW HAT',
        title: 'HALO UNLOCKED!',
        description: 'Equip and customize the floating 8-bit Halo in Settings → Customize Bug.',
      };
    }
    return {
      kickerLeft: 'NIVEL 74',
      kickerRight: 'NUEVO GORRO',
      title: '¡AUREOLA DESBLOQUEADA!',
      description:
        'Equipa la Aureola flotante 8-bits y personaliza su brillo en Ajustes → Personalizar Bug.',
    };
  }

  if (milestone === 'level82') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 82',
        kickerRight: 'NEW HAT',
        title: 'WIZARD HAT UNLOCKED!',
        description: 'Equip and recolor the 8-bit Wizard Hat in Settings → Customize Bug.',
      };
    }
    return {
      kickerLeft: 'NIVEL 82',
      kickerRight: 'NUEVO GORRO',
      title: '¡SOMBRERO DE MAGO DESBLOQUEADO!',
      description:
        'Ya puedes equipar el Sombrero de Mago 8-bits en Ajustes → Personalizar Bug.',
    };
  }

  if (milestone === 'level90') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 90',
        kickerRight: 'LEGENDARY KI',
        title: 'SUPER SAIYAN BUG UNLOCKED!',
        description:
          'Double-tap Bug to pet it and unleash its blazing golden Super Saiyan transformation!',
      };
    }
    return {
      kickerLeft: 'NIVEL 90',
      kickerRight: 'PODER LEGENDARIO',
      title: '¡BUG SUPER SAIYAJIN DESBLOQUEADO!',
      description:
        'Acaricia a Bug con doble toque para desatar su transformación dorada de Super Saiyajin.',
    };
  }

  if (milestone === 'secret_crown') {
    if (language === 'en') {
      return {
        kickerLeft: 'SECRET 1/2',
        kickerRight: 'RICOCHET KING',
        title: 'SECRET CROWN UNLOCKED!',
        description:
          '6+ wall bounces in a single throw! Equip the Royal Crown in Settings → Customize Bug.',
      };
    }
    return {
      kickerLeft: 'SECRETO 1/2',
      kickerRight: 'REY DEL REBOTE',
      title: '¡CORONA SECRETA DESBLOQUEADA!',
      description:
        '¡6 rebotes en un mismo lanzamiento! Equipa la Corona Imperial en Ajustes → Personalizar Bug.',
    };
  }

  if (milestone === 'secret_scouter') {
    if (language === 'en') {
      return {
        kickerLeft: 'SECRET 2/2',
        kickerRight: 'HIDDEN EASTER EGG',
        title: 'SECRET SCOUTER UNLOCKED!',
        description:
          'Hidden anomaly discovered! Equip and recolor the 8-bit Scouter Visor in Customize Bug.',
      };
    }
    return {
      kickerLeft: 'SECRETO 2/2',
      kickerRight: 'EASTER EGG OCULTO',
      title: '¡VISOR SCOUTER DESBLOQUEADO!',
      description:
        '¡Has descubierto un secreto oculto! Equipa el Visor Scouter 8-bits en Personalizar Bug.',
    };
  }

  if (language === 'en') {
    return {
      kickerLeft: 'LEVEL 5',
      kickerRight: 'MASCOT UPGRADE',
      title: 'YOU CAN NOW PLAY WITH BUG!',
      description:
        'Long-press Bug to grab and launch it bouncing cleanly off the walls across the screen.',
    };
  }

  return {
    kickerLeft: 'NIVEL 5',
    kickerRight: 'MEJORA DE BUG',
    title: '¡YA PUEDES JUGAR CON BUG!',
    description:
      'Mantén pulsado a Bug para cogerlo y lanzarlo rebotando por las paredes de la pantalla.',
  };
}
