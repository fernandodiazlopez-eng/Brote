/**
 * Catálogo de diálogos del panel luminoso de metro y textos de desbloqueo de Bug (mascota 8-bits).
 */

import { UiTextKey, UiTextsMap } from '../i18n/translations';
import {
  AppLanguage,
  BugDialogueCategory,
  BugHatId,
  BugUnlockMilestone,
  CustomBugPhrase,
  RgbColor,
} from '../types';

export type { BugDialogueCategory };

export const DEFAULT_BUG_HAT_COLORS: Record<Exclude<BugHatId, 'none'>, RgbColor> = {
  headphones: { r: 0, g: 229, b: 255 },
  bow: { r: 255, g: 77, b: 141 },
};

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
          'Music headphones and bow unlocked with custom RGB color codes in Settings → Customize Bug.',
      };
    }
    return {
      kickerLeft: 'NIVEL 25',
      kickerRight: 'PERSONALIZACIÓN',
      title: '¡GORROS DE BUG DESBLOQUEADOS!',
      description:
        'Has desbloqueado los cascos de música y el lacito con color RGB configurable en Ajustes → Personalizar Bug.',
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
