/**
 * Notificación emergente superior estilo Nothing OS × Cyberpunk al desbloquear un nuevo trofeo.
 */

import React from 'react';
import {
  getLocalizedTrophy,
  getTrophyTierLabel,
  getTrophyUnlockedBannerText,
  TROPHY_TIER_STYLES,
} from '../data/trophiesCatalog';
import { useI18n } from '../i18n/I18nContext';
import { Trophy } from '../types';
import { TrophyCardSheen, TrophyEmblem, TrophyTierRankLeds } from './TrophyEmblem';

interface TrophyUnlockBannerProps {
  trophy: Trophy;
  onDismiss: () => void;
}

export const TrophyUnlockBanner: React.FC<TrophyUnlockBannerProps> = ({
  trophy,
  onDismiss,
}) => {
  const { language } = useI18n();
  const tierStyle = TROPHY_TIER_STYLES[trophy.tier];
  const localizedTrophy = getLocalizedTrophy(trophy, language);
  const tierLabel = getTrophyTierLabel(trophy.tier, language);
  const unlockedBannerText = getTrophyUnlockedBannerText(language);

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onDismiss}
      className={`fixed safe-top-banner left-4 right-4 sm:left-auto sm:right-6 sm:w-[404px] z-50 modal-sheet sheet-panel ndot-surface rounded-[5px] border ${tierStyle.cardBorderClass} p-3.5 flex items-center gap-3.5 cursor-pointer select-none overflow-hidden animate-trophy-toast`}
    >
      {tierStyle.topAccentLineClass && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 h-[1.5px] ${tierStyle.topAccentLineClass}`}
        />
      )}

      <TrophyCardSheen tier={trophy.tier} />

      <TrophyEmblem tier={trophy.tier} size="lg" animatePop />

      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <TrophyTierRankLeds tier={trophy.tier} />
          <span className={`font-bold uppercase tracking-wider shrink-0 ${tierStyle.iconTextClass}`}>
            {tierLabel}
          </span>
          <span aria-hidden="true" className="text-fg-muted">
            ·
          </span>
          <span className="text-fg-muted uppercase tracking-wider truncate">
            {unlockedBannerText}
          </span>
        </div>
        <p className="font-display text-sm font-bold uppercase tracking-wide text-fg truncate mt-1">
          {localizedTrophy.title}
        </p>
        <p className="text-xs text-fg-secondary leading-snug line-clamp-2 mt-0.5">
          {localizedTrophy.description}
        </p>
      </div>
    </div>
  );
};
