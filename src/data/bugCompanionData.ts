/**
 * Catálogo de diálogos del panel luminoso de metro y textos de desbloqueo de Bug (mascota 8-bits).
 */

import { UiTextKey, UiTextsMap } from '../i18n/translations';
import { AppLanguage, BugUnlockMilestone } from '../types';

export type BugDialogueCategory = 'streak' | 'inactive' | 'reaction';

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

export function pickBugPhrase(
  category: BugDialogueCategory,
  uiTexts: UiTextsMap,
  previousText?: string | null
): string {
  const keys = BUG_PHRASE_KEYS[category];
  const pool = keys.map((key) => uiTexts[key]).filter((item) => item.trim().length > 0);
  if (pool.length <= 1) return pool[0] || '';

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
          'Meet Bug, your new 8-bit mascot. It will keep you company across the app (you can hide it in Settings).',
      };
    }
    return {
      kickerLeft: 'NIVEL 3',
      kickerRight: 'ANOMALÍA DETECTADA',
      title: '¡SE HA ENCONTRADO UN BUG!',
      description:
        'Es Bug, tu nueva mascota 8-bits. Te acompañará por la interfaz (puedes ocultarlo desde Ajustes).',
    };
  }

  if (milestone === 'level5') {
    if (language === 'en') {
      return {
        kickerLeft: 'LEVEL 5',
        kickerRight: 'MASCOT BOND',
        title: 'YOU CAN NOW PET BUG!',
        description:
          'Double-tap Bug on any screen to pet it and spark a happy 8-bit reaction.',
      };
    }
    return {
      kickerLeft: 'NIVEL 5',
      kickerRight: 'AFECTO DESBLOQUEADO',
      title: '¡YA PUEDES ACARICIAR A BUG!',
      description:
        'Haz doble toque sobre Bug en cualquier pantalla para acariciarlo y ver su reacción.',
    };
  }

  if (language === 'en') {
    return {
      kickerLeft: 'LEVEL 50',
      kickerRight: 'MASCOT UPGRADE',
      title: 'AIR HOCKEY PHYSICS UNLOCKED',
      description:
        'Long-press Bug to drag and launch it bouncing cleanly off the walls across the screen.',
    };
  }

  return {
    kickerLeft: 'NIVEL 50',
    kickerRight: 'MEJORA DE BUG',
    title: 'LANZAMIENTO AIR HOCKEY',
    description:
      'Mantén pulsado a Bug para arrastrarlo y lanzarlo rebotando por las paredes de la pantalla.',
  };
}
