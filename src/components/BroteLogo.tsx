/**
 * Icono oficial de Brote:
 * - Modo oscuro (#000000): brote y suelo simple en neón verde suave.
 * - Modo claro (#FFFFFF): ilustración botánica dibujada con suelo simple (sin neón).
 */

import React from 'react';
import { ThemeMode } from '../types';

interface BroteLogoProps {
  themeMode: ThemeMode;
  className?: string;
}

export const BroteLogo: React.FC<BroteLogoProps> = React.memo(({
  themeMode,
  className = 'w-10 h-10',
}) => {
  const iconSrc = themeMode === 'light' ? '/icon-light.svg' : '/icon-dark.svg';

  return (
    <img
      src={iconSrc}
      alt="Brote"
      referrerPolicy="no-referrer"
      draggable={false}
      className={`select-none shrink-0 rounded-[22%] ${className}`}
    />
  );
});
