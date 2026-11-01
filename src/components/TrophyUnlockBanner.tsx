/**
 * Notificación emergente superior al desbloquear un nuevo trofeo.
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
import { TrophyCardSparkles, TrophyEmblem } from './TrophyEmblem';

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
      className={`fixed safe-top-banner left-4 right-4 sm:left-auto sm:right-6 sm:w-[392px] z-50 rounded-xl ${tierStyle.cardSurfaceClass} backdrop-blur-md border ${tierStyle.cardBorderClass} p-3.5 shadow-2xl flex items-center gap-3.5 cursor-pointer select-none overflow-hidden animate-trophy-toast`}
    >
      <TrophyCardSparkles tier={trophy.tier} />

      {tierStyle.sheenBarClass && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 w-24 ${tierStyle.sheenBarClass} animate-trophy-sheen`}
        />
      )}

      <TrophyEmblem tier={trophy.tier} size="lg" animatePop />

      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] font-mono">
          <span className="font-bold text-fg">{tierLabel}</span>
          <span aria-hidden="true" className="text-fg-muted">
            ·
          </span>
          <span className="text-fg-muted">{unlockedBannerText}</span>
        </div>
        <p className="text-sm font-bold text-fg truncate mt-0.5">{localizedTrophy.title}</p>
        <p className="text-[11px] text-fg-secondary leading-snug line-clamp-2 mt-0.5">
          {localizedTrophy.description}
        </p>
      </div>
    </div>
  );
};
