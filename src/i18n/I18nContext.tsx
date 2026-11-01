/**
 * Contexto React de idioma y textos personalizados de la interfaz.
 * Mantiene referencias memorizadas para preservar el rendimiento de React.memo.
 */

import React, { createContext, useContext } from 'react';
import { AppLanguage, RoutineCategory } from '../types';
import {
  DEFAULT_UI_TEXTS,
  getLocalizedCategoryLabel,
  UiTextKey,
  UiTextsMap,
} from './translations';

export interface I18nContextValue {
  language: AppLanguage;
  locale: string;
  t: UiTextsMap;
  defaultT: UiTextsMap;
  customForLang: Partial<Record<UiTextKey, string>>;
  formatCategory: (category: RoutineCategory) => string;
  onChangeLanguage: (language: AppLanguage) => void;
  onUpdateCustomText: (key: UiTextKey, value: string) => void;
  onResetCustomText: (key: UiTextKey) => void;
  onResetAllCustomTexts: () => void;
}

const FALLBACK_CONTEXT: I18nContextValue = {
  language: 'es',
  locale: 'es-ES',
  t: DEFAULT_UI_TEXTS.es,
  defaultT: DEFAULT_UI_TEXTS.es,
  customForLang: {},
  formatCategory: (category) => getLocalizedCategoryLabel(category, DEFAULT_UI_TEXTS.es),
  onChangeLanguage: () => {},
  onUpdateCustomText: () => {},
  onResetCustomText: () => {},
  onResetAllCustomTexts: () => {},
};

export const I18nContext = createContext<I18nContextValue>(FALLBACK_CONTEXT);

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
