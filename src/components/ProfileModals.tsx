/**
 * Ventanas modales de Perfil:
 * 1) Información detallada del sistema de puntos, descanso y memoria muscular.
 * 2) Ajustes (Idioma ES/EN, Modo Claro/Oscuro, 6 Paletas de color e Instalación PWA)
 *    + Ajustes Avanzados (Fórmulas de XP, Editor individual de todos los textos de la app
 *      excluyendo los logros para evitar spoilers, y Copias de Seguridad JSON).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BellRing,
  Check,
  ChevronRight,
  Compass,
  Download,
  Globe,
  Moon,
  Palette,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useI18n } from '../i18n/I18nContext';
import { UI_TEXT_SECTIONS, UiTextFieldMeta, UiTextKey } from '../i18n/translations';
import { AccentPaletteId, ThemeMode, XpFormulas } from '../types';
import { requestTimerNotificationPermission } from '../utils/audioEffects';
import {
  normalizeHexColor,
  setCustomDraftSwatchProperty,
} from '../utils/localStorageState';
import { requestMotionSensorPermission } from '../utils/mobileHealthSync';
import {
  areDefaultXpFormulas,
  getDefaultXpFormulas,
  isDefaultCardioFormula,
  isDefaultHybridFormula,
  isDefaultStepsFormula,
  isDefaultStrengthFormula,
  localizeXpFormulasIfDefault,
} from '../utils/progressionRules';
import { validateXpFormula } from '../utils/xpFormulaParser';
import { BugPixelGraphic } from './BugCompanion';

interface PointsSystemInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenTutorial?: () => void;
}

export const PointsSystemInfoModal: React.FC<PointsSystemInfoModalProps> = ({
  isOpen,
  onClose,
  onOpenTutorial,
}) => {
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const paragraphs = [t.info_p1, t.info_p2, t.info_p3, t.info_p4];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="points-info-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto modal-sheet sheet-panel rounded-md p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-subtle">
          <h3
            id="points-info-heading"
            className="text-base font-bold uppercase tracking-wide text-fg truncate"
          >
            {t.info_title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common_close}
            className="btn-quiet min-h-[38px] min-w-[38px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="pt-4 space-y-3.5 text-xs sm:text-sm leading-relaxed text-fg-secondary">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>

        {onOpenTutorial && (
          <div className="mt-5 pt-4 border-t border-subtle">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenTutorial();
              }}
              className="btn-secondary w-full min-h-[42px] px-3.5 py-2 text-xs flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Compass className="w-4 h-4 text-accent shrink-0" />
              <span>{t.tutorial_open_btn}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface CustomTextFieldRowProps {
  field: UiTextFieldMeta;
  label: string;
  defaultValue: string;
  customValue: string | undefined;
  resetLabel: string;
  onUpdate: (key: UiTextKey, value: string) => void;
  onReset: (key: UiTextKey) => void;
}

const CustomTextFieldRow: React.FC<CustomTextFieldRowProps> = React.memo(({
  field,
  label,
  defaultValue,
  customValue,
  resetLabel,
  onUpdate,
  onReset,
}) => {
  const effectiveExternal = customValue !== undefined ? customValue : defaultValue;
  const [draft, setDraft] = useState<string>(effectiveExternal);

  useEffect(() => {
    setDraft(customValue !== undefined ? customValue : defaultValue);
  }, [customValue, defaultValue]);

  const isModified = customValue !== undefined && customValue !== defaultValue;

  const handleChange = (nextVal: string) => {
    setDraft(nextVal);
    if (nextVal.trim() === '') {
      return;
    }
    if (nextVal === defaultValue) {
      onReset(field.key);
    } else {
      onUpdate(field.key, nextVal);
    }
  };

  const handleBlur = () => {
    if (draft.trim() === '' || draft === defaultValue) {
      setDraft(defaultValue);
      onReset(field.key);
    }
  };

  return (
    <div className="py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`custom-txt-${field.key}`}
          className="text-xs font-semibold text-fg truncate"
        >
          {label}
        </label>

        {isModified && (
          <button
            type="button"
            onClick={() => {
              setDraft(defaultValue);
              onReset(field.key);
            }}
            aria-label={`${resetLabel}: ${label}`}
            className="btn-secondary min-h-[28px] px-2 py-0.5 text-[11px] flex items-center gap-1 shrink-0 whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3 text-accent shrink-0" />
            <span>{resetLabel}</span>
          </button>
        )}
      </div>

      {field.multiline ? (
        <textarea
          id={`custom-txt-${field.key}`}
          rows={4}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={defaultValue}
          className={`input-field w-full px-3 py-2 text-xs leading-relaxed resize-y ${
            isModified ? 'border-accent' : ''
          }`}
        />
      ) : (
        <input
          id={`custom-txt-${field.key}`}
          type="text"
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={defaultValue}
          className={`input-field w-full min-h-[38px] px-3 py-1.5 text-xs ${
            isModified ? 'border-accent' : ''
          }`}
        />
      )}
    </div>
  );
});

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  themeMode: ThemeMode;
  onChangeThemeMode: (mode: ThemeMode) => void;
  accentPalette: AccentPaletteId;
  onChangeAccentPalette: (palette: AccentPaletteId) => void;
  customAccentHex?: string;
  onApplyCustomAccentHex: (hex: string) => void;
  xpFormulas: XpFormulas;
  onUpdateXpFormulas: (nextFormulas: XpFormulas) => void;
  onExportBackup: () => void;
  onImportBackupJson: (rawText: string) => boolean;
  isBugUnlocked?: boolean;
  hideBug?: boolean;
  onChangeHideBug?: (hide: boolean) => void;
  onOpenTutorial?: () => void;
  timerNotificationsEnabled?: boolean;
  onChangeTimerNotifications?: (enabled: boolean) => void;
  motionStepsEnabled?: boolean;
  onChangeMotionSteps?: (enabled: boolean) => void;
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
  isOpen,
  onClose,
  themeMode,
  onChangeThemeMode,
  accentPalette,
  onChangeAccentPalette,
  customAccentHex,
  onApplyCustomAccentHex,
  xpFormulas,
  onUpdateXpFormulas,
  onExportBackup,
  onImportBackupJson,
  isBugUnlocked = false,
  hideBug = false,
  onChangeHideBug,
  onOpenTutorial,
  timerNotificationsEnabled = false,
  onChangeTimerNotifications,
  motionStepsEnabled = false,
  onChangeMotionSteps,
}) => {
  const {
    language,
    locale,
    t,
    defaultT,
    customForLang,
    onChangeLanguage,
    onUpdateCustomText,
    onResetCustomText,
    onResetAllCustomTexts,
  } = useI18n();

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSInstallGuide, setShowIOSInstallGuide] = useState(false);

  const [settingsSection, setSettingsSection] = useState<'main' | 'advanced' | 'texts'>('main');
  const [textSearchQuery, setTextSearchQuery] = useState('');
  const [backupFeedback, setBackupFeedback] = useState<'success' | 'error' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const colorPickerInputRef = useRef<HTMLInputElement | null>(null);

  const [draftCustomHex, setDraftCustomHex] = useState<string>(() =>
    (customAccentHex || '#c8ff00').toUpperCase()
  );
  const [showCustomHexError, setShowCustomHexError] = useState(false);

  const localizedExternalFormulas = useMemo(
    () => localizeXpFormulasIfDefault(xpFormulas, language),
    [xpFormulas, language]
  );

  const [draftStepsFormula, setDraftStepsFormula] = useState(
    localizedExternalFormulas.stepsFormula
  );
  const [draftStrengthFormula, setDraftStrengthFormula] = useState(
    localizedExternalFormulas.strengthFormula
  );
  const [draftCardioFormula, setDraftCardioFormula] = useState(
    localizedExternalFormulas.cardioFormula
  );
  const [draftHybridFormula, setDraftHybridFormula] = useState(
    localizedExternalFormulas.hybridFormula
  );

  useEffect(() => {
    if (isOpen) {
      setSettingsSection('main');
      setTextSearchQuery('');
      setShowIOSInstallGuide(false);
      setBackupFeedback(null);
      setShowCustomHexError(false);
      setDraftCustomHex((customAccentHex || '#c8ff00').toUpperCase());
    }
  }, [isOpen, customAccentHex]);

  useEffect(() => {
    const validDraft = normalizeHexColor(draftCustomHex);
    setCustomDraftSwatchProperty(validDraft || customAccentHex || '#c8ff00');
  }, [draftCustomHex, customAccentHex]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (settingsSection === 'texts') {
        setSettingsSection('advanced');
      } else if (settingsSection === 'advanced') {
        setSettingsSection('main');
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, settingsSection, onClose]);

  useEffect(() => {
    setDraftStepsFormula(localizedExternalFormulas.stepsFormula);
    setDraftStrengthFormula(localizedExternalFormulas.strengthFormula);
    setDraftCardioFormula(localizedExternalFormulas.cardioFormula);
    setDraftHybridFormula(localizedExternalFormulas.hybridFormula);
  }, [localizedExternalFormulas]);

  const stepsValidation = useMemo(
    () => validateXpFormula(draftStepsFormula, 'pasos', language),
    [draftStepsFormula, language]
  );
  const strengthValidation = useMemo(
    () => validateXpFormula(draftStrengthFormula, 'minutos', language),
    [draftStrengthFormula, language]
  );
  const cardioValidation = useMemo(
    () => validateXpFormula(draftCardioFormula, 'minutos', language),
    [draftCardioFormula, language]
  );
  const hybridValidation = useMemo(
    () => validateXpFormula(draftHybridFormula, 'minutos', language),
    [draftHybridFormula, language]
  );

  const modifiedCustomTextsCount = useMemo(
    () =>
      Object.entries(customForLang).filter(
        ([k, v]) =>
          typeof v === 'string' &&
          v.trim() !== '' &&
          v !== defaultT[k as UiTextKey]
      ).length,
    [customForLang, defaultT]
  );

  const filteredTextSections = useMemo(() => {
    const visibleSections = isBugUnlocked
      ? UI_TEXT_SECTIONS
      : UI_TEXT_SECTIONS.filter((section) => section.id !== 'bug_phrases').map((section) =>
          section.id === 'settings'
            ? {
                ...section,
                fields: section.fields.filter((f) => !f.key.startsWith('settings_bug_')),
              }
            : section
        );

    const normalizedQuery = textSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) return visibleSections;

    return visibleSections
      .map((section) => {
        const matchingFields = section.fields.filter((field) => {
          const metaLabel = language === 'en' ? field.labelEn : field.labelEs;
          const currentText = t[field.key];
          const defaultText = defaultT[field.key];
          return (
            metaLabel.toLowerCase().includes(normalizedQuery) ||
            currentText.toLowerCase().includes(normalizedQuery) ||
            defaultText.toLowerCase().includes(normalizedQuery)
          );
        });
        return {
          ...section,
          fields: matchingFields,
        };
      })
      .filter((section) => section.fields.length > 0);
  }, [isBugUnlocked, textSearchQuery, language, t, defaultT]);

  if (!isOpen) return null;

  const monochromeLabel = themeMode === 'light' ? t.palette_negro : t.palette_blanco;

  const normalizedCustomSaved = normalizeHexColor(customAccentHex);
  const normalizedDraftCustomHex = normalizeHexColor(draftCustomHex);
  const isCustomHexAlreadyActive =
    accentPalette === 'custom' &&
    Boolean(normalizedCustomSaved) &&
    normalizedDraftCustomHex === normalizedCustomSaved;

  const accentPaletteOptions: {
    id: AccentPaletteId;
    label: string;
    swatchClass: string;
    fullSpan?: boolean;
  }[] = [
    { id: 'lima', label: t.palette_lima, swatchClass: 'palette-dot-lima' },
    { id: 'ambar', label: t.palette_ambar, swatchClass: 'palette-dot-ambar' },
    { id: 'coral', label: t.palette_coral, swatchClass: 'palette-dot-coral' },
    { id: 'monocromo', label: monochromeLabel, swatchClass: 'palette-dot-monocromo' },
    { id: 'frambuesa', label: t.palette_frambuesa, swatchClass: 'palette-dot-frambuesa' },
    { id: 'oceano', label: t.palette_oceano, swatchClass: 'palette-dot-oceano' },
    { id: 'amatista', label: t.palette_amatista, swatchClass: 'palette-dot-amatista' },
    { id: 'esmeralda', label: t.palette_esmeralda, swatchClass: 'palette-dot-esmeralda' },
    ...(normalizedCustomSaved
      ? [
          {
            id: 'custom' as const,
            label: `${t.palette_custom} (${normalizedCustomSaved.toUpperCase()})`,
            swatchClass: 'palette-dot-custom',
            fullSpan: true,
          },
        ]
      : []),
  ];

  const handleCustomHexInputChange = (rawVal: string) => {
    const cleaned = rawVal.replace(/[^#0-9a-fA-F]/g, '').slice(0, 7).toUpperCase();
    setDraftCustomHex(cleaned);
    if (showCustomHexError && normalizeHexColor(cleaned)) {
      setShowCustomHexError(false);
    }
  };

  const handleSubmitCustomHex = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const valid = normalizeHexColor(draftCustomHex);
    if (!valid) {
      setShowCustomHexError(true);
      return;
    }
    setShowCustomHexError(false);
    setDraftCustomHex(valid.toUpperCase());
    onApplyCustomAccentHex(valid);
  };

  const hasCustomFormulas =
    !areDefaultXpFormulas(xpFormulas) ||
    !isDefaultStepsFormula(draftStepsFormula) ||
    !isDefaultStrengthFormula(draftStrengthFormula) ||
    !isDefaultCardioFormula(draftCardioFormula) ||
    !isDefaultHybridFormula(draftHybridFormula);

  const handleStepsFormulaChange = (value: string) => {
    setDraftStepsFormula(value);
    if (validateXpFormula(value, 'pasos', language).valid) {
      onUpdateXpFormulas({ ...xpFormulas, stepsFormula: value.trim() });
    }
  };

  const handleStrengthFormulaChange = (value: string) => {
    setDraftStrengthFormula(value);
    if (validateXpFormula(value, 'minutos', language).valid) {
      onUpdateXpFormulas({ ...xpFormulas, strengthFormula: value.trim() });
    }
  };

  const handleCardioFormulaChange = (value: string) => {
    setDraftCardioFormula(value);
    if (validateXpFormula(value, 'minutos', language).valid) {
      onUpdateXpFormulas({ ...xpFormulas, cardioFormula: value.trim() });
    }
  };

  const handleHybridFormulaChange = (value: string) => {
    setDraftHybridFormula(value);
    if (validateXpFormula(value, 'minutos', language).valid) {
      onUpdateXpFormulas({ ...xpFormulas, hybridFormula: value.trim() });
    }
  };

  const handleResetDefaultFormulas = () => {
    const defaultsForLang = getDefaultXpFormulas(language);
    setDraftStepsFormula(defaultsForLang.stepsFormula);
    setDraftStrengthFormula(defaultsForLang.strengthFormula);
    setDraftCardioFormula(defaultsForLang.cardioFormula);
    setDraftHybridFormula(defaultsForLang.hybridFormula);
    onUpdateXpFormulas(defaultsForLang);
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const ok = onImportBackupJson(content);
      setBackupFeedback(ok ? 'success' : 'error');
    };
    reader.onerror = () => {
      setBackupFeedback('error');
    };
    reader.readAsText(file);
  };

  const stepsVarHint = language === 'en' ? 'steps' : 'pasos';
  const minutesVarHint = language === 'en' ? 'minutes' : 'minutos';
  const sampleTenThousand = (10_000).toLocaleString(locale);

  const modalTitle =
    settingsSection === 'main'
      ? t.settings_title
      : settingsSection === 'advanced'
      ? t.settings_advanced_btn
      : t.advanced_texts_heading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-heading"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md max-h-[85vh] flex flex-col modal-sheet sheet-panel rounded-md p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-subtle shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {settingsSection !== 'main' && (
              <button
                type="button"
                onClick={() =>
                  setSettingsSection(settingsSection === 'texts' ? 'advanced' : 'main')
                }
                aria-label={t.common_back}
                className="btn-secondary min-h-[34px] min-w-[34px] flex items-center justify-center shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h3
              id="settings-modal-heading"
              className="text-base font-bold uppercase tracking-wide text-fg truncate"
            >
              {modalTitle}
            </h3>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span className="font-display text-xs font-bold uppercase tracking-[0.18em] text-accent select-none">
              Upgrade
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.common_close}
              className="btn-quiet min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SECCIÓN PRINCIPAL DE AJUSTES */}
        {settingsSection === 'main' && (
          <div className="pt-4 space-y-5 overflow-y-auto pr-0.5">
            {/* Selector de Idioma: Español / Inglés */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                <p className="font-display text-xs font-semibold uppercase tracking-wider text-fg-secondary">
                  {t.settings_language_label}
                </p>
              </div>
              <div
                role="group"
                aria-label={t.settings_language_label}
                className="seg-group grid grid-cols-2 gap-1"
              >
                <button
                  type="button"
                  onClick={() => onChangeLanguage('es')}
                  aria-pressed={language === 'es'}
                  className={`seg-btn min-h-[40px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                    language === 'es' ? 'seg-btn-active' : ''
                  }`}
                >
                  {t.settings_lang_es}
                </button>

                <button
                  type="button"
                  onClick={() => onChangeLanguage('en')}
                  aria-pressed={language === 'en'}
                  className={`seg-btn min-h-[40px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                    language === 'en' ? 'seg-btn-active' : ''
                  }`}
                >
                  {t.settings_lang_en}
                </button>
              </div>
            </div>

            {/* Tema Claro / Oscuro */}
            <div className="space-y-2">
              <p className="font-display text-xs font-semibold uppercase tracking-wider text-fg-secondary">
                {t.settings_style_label}
              </p>
              <div
                role="group"
                aria-label={t.settings_style_label}
                className="seg-group grid grid-cols-2 gap-1"
              >
                <button
                  type="button"
                  onClick={() => onChangeThemeMode('light')}
                  aria-pressed={themeMode === 'light'}
                  className={`seg-btn min-h-[40px] px-3 py-1.5 text-xs flex items-center justify-center gap-2 whitespace-nowrap ${
                    themeMode === 'light' ? 'seg-btn-active' : ''
                  }`}
                >
                  <Sun className="w-4 h-4 shrink-0" />
                  <span>{t.settings_theme_light}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onChangeThemeMode('dark')}
                  aria-pressed={themeMode === 'dark'}
                  className={`seg-btn min-h-[40px] px-3 py-1.5 text-xs flex items-center justify-center gap-2 whitespace-nowrap ${
                    themeMode === 'dark' ? 'seg-btn-active' : ''
                  }`}
                >
                  <Moon className="w-4 h-4 shrink-0" />
                  <span>{t.settings_theme_dark}</span>
                </button>
              </div>
            </div>

            {/* Selector de paleta */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                <p className="font-display text-xs font-semibold uppercase tracking-wider text-fg-secondary">
                  {t.settings_palette_label}
                </p>
              </div>

              <div
                role="group"
                aria-label={t.settings_palette_label}
                className="grid grid-cols-2 gap-2"
              >
                {accentPaletteOptions.map((option) => {
                  const isSelected = accentPalette === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onChangeAccentPalette(option.id)}
                      aria-pressed={isSelected}
                      className={`min-h-[42px] px-3 py-2 rounded-[4px] border flex items-center justify-between gap-2 text-left transition cursor-pointer ${
                        option.fullSpan ? 'col-span-2' : ''
                      } ${
                        isSelected
                          ? 'bg-accent-soft border-accent-fill text-fg font-semibold'
                          : 'bg-canvas border-subtle text-fg-secondary'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          aria-hidden="true"
                          className={`w-3 h-3 rounded-[2px] shrink-0 ${option.swatchClass}`}
                        />
                        <span className="font-display text-xs truncate">{option.label}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Visibilidad de Bug (aparece en Ajustes únicamente tras desbloquearlo en Nivel 3) */}
            {isBugUnlocked && onChangeHideBug && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <svg
                    viewBox="0 0 16 14"
                    className="w-3.5 h-3 shrink-0"
                    shapeRendering="crispEdges"
                    aria-hidden="true"
                  >
                    <BugPixelGraphic expression="neutral" />
                  </svg>
                  <p className="font-display text-xs font-semibold uppercase tracking-wider text-fg-secondary">
                    {t.settings_bug_label}
                  </p>
                </div>

                <div
                  role="group"
                  aria-label={t.settings_bug_label}
                  className="seg-group grid grid-cols-2 gap-1"
                >
                  <button
                    type="button"
                    onClick={() => onChangeHideBug(false)}
                    aria-pressed={!hideBug}
                    className={`seg-btn min-h-[40px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                      !hideBug ? 'seg-btn-active' : ''
                    }`}
                  >
                    {t.settings_bug_show}
                  </button>

                  <button
                    type="button"
                    onClick={() => onChangeHideBug(true)}
                    aria-pressed={hideBug}
                    className={`seg-btn min-h-[40px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                      hideBug ? 'seg-btn-active' : ''
                    }`}
                  >
                    {t.settings_bug_hide}
                  </button>
                </div>
              </div>
            )}

            {/* Instalación directa de PWA en móvil/escritorio (se oculta sola si ya está instalada) */}
            {!isInstalled && (isInstallable || isIOS) && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                  <p className="font-display text-xs font-semibold uppercase tracking-wider text-fg-secondary">
                    {t.settings_install_label}
                  </p>
                </div>

                {isInstallable ? (
                  <button
                    type="button"
                    onClick={() => {
                      void install();
                    }}
                    className="btn-primary w-full min-h-[42px] px-3.5 py-2 text-xs flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span>{t.settings_install_btn}</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowIOSInstallGuide((prev) => !prev)}
                      aria-expanded={showIOSInstallGuide}
                      className="btn-secondary w-full min-h-[42px] px-3.5 py-2 text-xs flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span>{t.settings_install_btn}</span>
                    </button>

                    {showIOSInstallGuide && (
                      <div className="rounded-[4px] bg-canvas border border-subtle p-3 space-y-1 text-xs text-fg-secondary">
                        <p className="font-semibold text-fg">{t.settings_ios_install_title}</p>
                        <p>{t.settings_ios_install_step1}</p>
                        <p>{t.settings_ios_install_step2}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Permisos opcionales del móvil (alarma y actividad física / podómetro) */}
            {(onChangeTimerNotifications || onChangeMotionSteps) && (
              <div className="pt-3 border-t border-subtle space-y-3">
                <p className="font-display text-xs font-semibold uppercase tracking-wider text-fg-secondary">
                  {t.settings_mobile_heading}
                </p>

                {onChangeTimerNotifications && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-fg">
                      <BellRing className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="font-semibold">{t.settings_timer_notif_label}</span>
                    </div>
                    <div
                      role="group"
                      aria-label={t.settings_timer_notif_label}
                      className="seg-group grid grid-cols-2 gap-1"
                    >
                      <button
                        type="button"
                        aria-pressed={timerNotificationsEnabled}
                        onClick={() => {
                          void requestTimerNotificationPermission().then((res) => {
                            onChangeTimerNotifications(res === 'granted');
                          });
                        }}
                        className={`seg-btn min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                          timerNotificationsEnabled ? 'seg-btn-active' : ''
                        }`}
                      >
                        {t.settings_toggle_on}
                      </button>
                      <button
                        type="button"
                        aria-pressed={!timerNotificationsEnabled}
                        onClick={() => onChangeTimerNotifications(false)}
                        className={`seg-btn min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                          !timerNotificationsEnabled ? 'seg-btn-active' : ''
                        }`}
                      >
                        {t.settings_toggle_off}
                      </button>
                    </div>
                  </div>
                )}

                {onChangeMotionSteps && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-fg">
                      <Activity className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="font-semibold">{t.settings_motion_steps_label}</span>
                    </div>
                    <div
                      role="group"
                      aria-label={t.settings_motion_steps_label}
                      className="seg-group grid grid-cols-2 gap-1"
                    >
                      <button
                        type="button"
                        aria-pressed={motionStepsEnabled}
                        onClick={() => {
                          void requestMotionSensorPermission().then((res) => {
                            onChangeMotionSteps(res === 'granted');
                          });
                        }}
                        className={`seg-btn min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                          motionStepsEnabled ? 'seg-btn-active' : ''
                        }`}
                      >
                        {t.settings_toggle_on}
                      </button>
                      <button
                        type="button"
                        aria-pressed={!motionStepsEnabled}
                        onClick={() => onChangeMotionSteps(false)}
                        className={`seg-btn min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                          !motionStepsEnabled ? 'seg-btn-active' : ''
                        }`}
                      >
                        {t.settings_toggle_off}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tutorial interactivo + Acceso a Ajustes Avanzados */}
            <div className="pt-3 border-t border-subtle space-y-2.5">
              {onOpenTutorial && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenTutorial();
                  }}
                  className="btn-secondary w-full min-h-[44px] px-3.5 py-2 flex items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Compass className="w-4 h-4 text-accent shrink-0" />
                    <span className="text-sm font-semibold text-fg truncate">
                      {t.tutorial_open_btn}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-fg-muted shrink-0" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setBackupFeedback(null);
                  setSettingsSection('advanced');
                }}
                className="btn-secondary w-full min-h-[46px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <SlidersHorizontal className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-sm font-semibold text-fg truncate">
                    {t.settings_advanced_btn}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-fg-muted shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* SECCIÓN DE AJUSTES AVANZADOS: COLOR POR CÓDIGO HEX + FÓRMULAS + TEXTOS + COPIA */}
        {settingsSection === 'advanced' && (
          <div className="pt-4 space-y-5 overflow-y-auto pr-0.5">
            {/* Color personalizado por código HEX */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-accent shrink-0" />
                <label
                  htmlFor="custom-hex-color-input"
                  className="font-display text-xs font-semibold uppercase tracking-wider text-fg-secondary"
                >
                  {t.advanced_custom_color_heading}
                </label>
              </div>

              <form onSubmit={handleSubmitCustomHex} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => colorPickerInputRef.current?.click()}
                  aria-label={t.advanced_custom_color_heading}
                  className="btn-secondary min-h-[42px] w-[42px] flex items-center justify-center shrink-0"
                >
                  <span
                    aria-hidden="true"
                    className="w-5 h-5 rounded-[2px] palette-dot-custom-draft"
                  />
                </button>
                <input
                  ref={colorPickerInputRef}
                  type="color"
                  tabIndex={-1}
                  aria-hidden="true"
                  value={normalizedDraftCustomHex || normalizedCustomSaved || '#c8ff00'}
                  onChange={(e) => {
                    const picked = normalizeHexColor(e.target.value);
                    if (picked) {
                      setShowCustomHexError(false);
                      setDraftCustomHex(picked.toUpperCase());
                      onApplyCustomAccentHex(picked);
                    }
                  }}
                  className="sr-only"
                />

                <input
                  id="custom-hex-color-input"
                  type="text"
                  spellCheck={false}
                  autoCapitalize="characters"
                  autoComplete="off"
                  value={draftCustomHex}
                  onChange={(e) => handleCustomHexInputChange(e.target.value)}
                  placeholder={t.advanced_custom_color_placeholder}
                  className={`input-field flex-1 min-w-0 min-h-[42px] px-3 py-2 font-mono text-xs uppercase tracking-wider ${
                    showCustomHexError ? 'ring-1 ring-red-400/70' : ''
                  }`}
                />

                <button
                  type="submit"
                  className={`min-h-[42px] px-3.5 py-2 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                    isCustomHexAlreadyActive ? 'btn-secondary text-accent' : 'btn-primary'
                  }`}
                >
                  {isCustomHexAlreadyActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                  <span>
                    {isCustomHexAlreadyActive
                      ? t.advanced_custom_color_active_btn
                      : t.advanced_custom_color_apply_btn}
                  </span>
                </button>
              </form>

              {showCustomHexError && (
                <p role="alert" className="text-[11px] font-medium text-red-400">
                  {t.advanced_custom_color_error}
                </p>
              )}
            </div>

            <div className="pt-4 border-t border-subtle space-y-3.5">
              <p className="font-display text-xs font-semibold uppercase tracking-wider text-fg-secondary">
                {t.advanced_formulas_heading}
              </p>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <label htmlFor="formula-steps" className="font-semibold text-fg">
                    {t.steps_title} (<span className="font-mono text-accent">{stepsVarHint}</span>)
                  </label>
                  <span className="font-mono tabular-nums text-[11px] text-fg-muted">
                    {stepsValidation.valid
                      ? `${sampleTenThousand} → +${stepsValidation.sampleXp} ${t.profile_xp_unit}`
                      : stepsValidation.error}
                  </span>
                </div>
                <input
                  id="formula-steps"
                  type="text"
                  spellCheck={false}
                  value={draftStepsFormula}
                  onChange={(e) => handleStepsFormulaChange(e.target.value)}
                  className={`input-field w-full min-h-[42px] px-3 py-2 font-mono text-xs ${
                    stepsValidation.valid ? '' : 'ring-1 ring-red-400/70'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <label htmlFor="formula-strength" className="font-semibold text-fg">
                    {t.category_strength} (
                    <span className="font-mono text-accent">{minutesVarHint}</span>)
                  </label>
                  <span className="font-mono tabular-nums text-[11px] text-fg-muted">
                    {strengthValidation.valid
                      ? `45 ${t.training_min_short} → +${strengthValidation.sampleXp} ${t.profile_xp_unit}`
                      : strengthValidation.error}
                  </span>
                </div>
                <input
                  id="formula-strength"
                  type="text"
                  spellCheck={false}
                  value={draftStrengthFormula}
                  onChange={(e) => handleStrengthFormulaChange(e.target.value)}
                  className={`input-field w-full min-h-[42px] px-3 py-2 font-mono text-xs ${
                    strengthValidation.valid ? '' : 'ring-1 ring-red-400/70'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <label htmlFor="formula-hybrid" className="font-semibold text-fg">
                    {t.category_hybrid} (
                    <span className="font-mono text-accent">{minutesVarHint}</span>)
                  </label>
                  <span className="font-mono tabular-nums text-[11px] text-fg-muted">
                    {hybridValidation.valid
                      ? `45 ${t.training_min_short} → +${hybridValidation.sampleXp} ${t.profile_xp_unit}`
                      : hybridValidation.error}
                  </span>
                </div>
                <input
                  id="formula-hybrid"
                  type="text"
                  spellCheck={false}
                  value={draftHybridFormula}
                  onChange={(e) => handleHybridFormulaChange(e.target.value)}
                  className={`input-field w-full min-h-[42px] px-3 py-2 font-mono text-xs ${
                    hybridValidation.valid ? '' : 'ring-1 ring-red-400/70'
                  }`}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <label htmlFor="formula-cardio" className="font-semibold text-fg">
                    {t.category_cardio} (
                    <span className="font-mono text-accent">{minutesVarHint}</span>)
                  </label>
                  <span className="font-mono tabular-nums text-[11px] text-fg-muted">
                    {cardioValidation.valid
                      ? `45 ${t.training_min_short} → +${cardioValidation.sampleXp} ${t.profile_xp_unit}`
                      : cardioValidation.error}
                  </span>
                </div>
                <input
                  id="formula-cardio"
                  type="text"
                  spellCheck={false}
                  value={draftCardioFormula}
                  onChange={(e) => handleCardioFormulaChange(e.target.value)}
                  className={`input-field w-full min-h-[42px] px-3 py-2 font-mono text-xs ${
                    cardioValidation.valid ? '' : 'ring-1 ring-red-400/70'
                  }`}
                />
              </div>

              {hasCustomFormulas && (
                <button
                  type="button"
                  onClick={handleResetDefaultFormulas}
                  className="btn-primary w-full min-h-[42px] px-4 py-2 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.advanced_reset_formulas_btn}</span>
                </button>
              )}
            </div>

            {/* Editor de todos los textos de la app (excepto logros) */}
            <div className="pt-4 border-t border-subtle space-y-2.5">
              <div>
                <p className="font-display text-xs font-semibold uppercase tracking-wider text-fg">
                  {t.advanced_texts_heading}
                </p>
                <p className="text-[11px] text-fg-muted mt-0.5">{t.advanced_texts_subtitle}</p>
              </div>

              <button
                type="button"
                onClick={() => setSettingsSection('texts')}
                className="btn-secondary w-full min-h-[46px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Type className="w-4 h-4 text-accent shrink-0" />
                  <span className="text-sm font-semibold text-fg truncate">
                    {t.advanced_texts_edit_btn}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {modifiedCustomTextsCount > 0 && (
                    <span className="font-mono text-xs font-bold text-accent tabular-nums">
                      {modifiedCustomTextsCount}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-fg-muted" />
                </div>
              </button>
            </div>

            {/* Copia de seguridad local (Exportar / Importar JSON) */}
            <div className="pt-4 border-t border-subtle space-y-2.5">
              <div>
                <p className="font-display text-xs font-semibold uppercase tracking-wider text-fg">
                  {t.advanced_backup_heading}
                </p>
                <p className="text-[11px] text-fg-muted mt-0.5">{t.advanced_backup_subtitle}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBackupFeedback(null);
                    onExportBackup();
                  }}
                  className="btn-secondary min-h-[42px] px-3 py-2 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>{t.advanced_backup_export_btn}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBackupFeedback(null);
                    fileInputRef.current?.click();
                  }}
                  className="btn-secondary min-h-[42px] px-3 py-2 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>{t.advanced_backup_import_btn}</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportFileChange}
                  className="hidden"
                />
              </div>

              {backupFeedback && (
                <p
                  role="status"
                  className={`text-xs font-medium ${
                    backupFeedback === 'success' ? 'text-accent' : 'text-red-400'
                  }`}
                >
                  {backupFeedback === 'success'
                    ? t.advanced_backup_success
                    : t.advanced_backup_error}
                </p>
              )}
            </div>
          </div>
        )}

        {/* SUB-PANTALLA: CAMBIAR UNO POR UNO TODOS LOS TEXTOS DE LA APP */}
        {settingsSection === 'texts' && (
          <div className="pt-3 flex-1 min-h-0 flex flex-col gap-3">
            <div className="space-y-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={textSearchQuery}
                  onChange={(e) => setTextSearchQuery(e.target.value)}
                  placeholder={t.advanced_texts_search_placeholder}
                  aria-label={t.advanced_texts_search_placeholder}
                  className="input-field w-full min-h-[40px] pl-8 pr-8 py-1.5 text-xs placeholder:text-fg-muted"
                />
                {textSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setTextSearchQuery('')}
                    aria-label={t.common_close}
                    className="btn-quiet absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[28px] min-w-[28px] flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {modifiedCustomTextsCount > 0 && (
                <button
                  type="button"
                  onClick={onResetAllCustomTexts}
                  className="btn-primary w-full min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {t.advanced_texts_reset_all_btn} ({modifiedCustomTextsCount})
                  </span>
                </button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5">
              {filteredTextSections.length === 0 ? (
                <p className="py-8 text-center text-xs text-fg-muted">
                  {t.advanced_texts_no_results}
                </p>
              ) : (
                filteredTextSections.map((section) => {
                  const sectionHeading =
                    language === 'en' ? section.titleEn : section.titleEs;
                  return (
                    <div key={section.id} className="space-y-1">
                      <h4 className="font-display text-xs font-bold uppercase tracking-wider text-accent pb-1 border-b border-subtle">
                        {sectionHeading}
                      </h4>
                      <div className="divide-y divide-subtle">
                        {section.fields.map((field) => (
                          <CustomTextFieldRow
                            key={`${language}-${field.key}`}
                            field={field}
                            label={language === 'en' ? field.labelEn : field.labelEs}
                            defaultValue={defaultT[field.key]}
                            customValue={customForLang[field.key]}
                            resetLabel={t.advanced_texts_reset_one_btn}
                            onUpdate={onUpdateCustomText}
                            onReset={onResetCustomText}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
