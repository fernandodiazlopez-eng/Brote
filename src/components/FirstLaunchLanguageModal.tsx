/**
 * Modal de bienvenida que se muestra única y exclusivamente la primera vez
 * que se abre la aplicación recién instalada: «English or Spanish?».
 */

import React from 'react';
import { AppLanguage, ThemeMode } from '../types';
import { BroteLogo } from './BroteLogo';

interface FirstLaunchLanguageModalProps {
  isOpen: boolean;
  themeMode: ThemeMode;
  onSelectLanguage: (language: AppLanguage) => void;
}

export const FirstLaunchLanguageModal: React.FC<FirstLaunchLanguageModalProps> = ({
  isOpen,
  themeMode,
  onSelectLanguage,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-md p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-launch-lang-heading"
    >
      <div className="w-full max-w-sm modal-sheet rounded-2xl p-6 sm:p-7 text-center space-y-6">
        <BroteLogo
          themeMode={themeMode}
          className="w-14 h-14 mx-auto shadow-md"
        />

        <h2
          id="first-launch-lang-heading"
          className="font-display text-xl sm:text-2xl font-bold text-fg tracking-tight"
        >
          English or Spanish?
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onSelectLanguage('en')}
            className="btn-primary min-h-[50px] px-4 py-2.5 text-sm font-semibold whitespace-nowrap"
          >
            English
          </button>

          <button
            type="button"
            onClick={() => onSelectLanguage('es')}
            className="btn-primary min-h-[50px] px-4 py-2.5 text-sm font-semibold whitespace-nowrap"
          >
            Español
          </button>
        </div>
      </div>
    </div>
  );
};
