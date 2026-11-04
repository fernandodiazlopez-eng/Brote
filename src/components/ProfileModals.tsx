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
  Lock,
  MessageSquare,
  Moon,
  Music,
  Palette,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Smartphone,
  Sun,
  Trash2,
  Type,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import {
  clampRgbByte,
  DEFAULT_BUG_HAT_COLORS,
  formatRgbCode,
  isBugDefaultPhraseKey,
  parseRgbCodeInput,
  sanitizeRgbColor,
} from '../data/bugCompanionData';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useI18n } from '../i18n/I18nContext';
import { UI_TEXT_SECTIONS, UiTextFieldMeta, UiTextKey } from '../i18n/translations';
import {
  AccentPaletteId,
  BugDialogueCategory,
  BugHatId,
  BugMusicMode,
  CustomBugPhrase,
  RgbColor,
  ThemeMode,
  XpFormulas,
} from '../types';
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
  deleteLabel?: string;
  onUpdate: (key: UiTextKey, value: string) => void;
  onReset: (key: UiTextKey) => void;
  onDelete?: (key: UiTextKey) => void;
}

const CustomTextFieldRow: React.FC<CustomTextFieldRowProps> = React.memo(({
  field,
  label,
  defaultValue,
  customValue,
  resetLabel,
  deleteLabel,
  onUpdate,
  onReset,
  onDelete,
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

        <div className="flex items-center gap-1.5 shrink-0">
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
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(field.key)}
              aria-label={`${deleteLabel || 'Eliminar'}: ${label}`}
              className="btn-quiet min-h-[28px] min-w-[28px] flex items-center justify-center shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
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

interface CustomBugPhraseRowProps {
  phrase: CustomBugPhrase;
  categoryLabel: string;
  customTagLabel: string;
  deleteLabel: string;
  onUpdate: (id: string, nextText: string) => void;
  onDelete: (id: string) => void;
}

const CustomBugPhraseRow: React.FC<CustomBugPhraseRowProps> = React.memo(({
  phrase,
  categoryLabel,
  customTagLabel,
  deleteLabel,
  onUpdate,
  onDelete,
}) => {
  const [draft, setDraft] = useState(phrase.text);

  useEffect(() => {
    setDraft(phrase.text);
  }, [phrase.text]);

  return (
    <div className="py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`custom-bug-phrase-${phrase.id}`}
          className="text-xs font-semibold text-fg truncate"
        >
          {customTagLabel} · <span className="text-accent">{categoryLabel}</span>
        </label>

        <button
          type="button"
          onClick={() => onDelete(phrase.id)}
          aria-label={`${deleteLabel}: ${phrase.text}`}
          className="btn-quiet min-h-[28px] min-w-[28px] flex items-center justify-center shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <input
        id={`custom-bug-phrase-${phrase.id}`}
        type="text"
        value={draft}
        onChange={(e) => {
          const val = e.target.value;
          setDraft(val);
          if (val.trim() !== '') {
            onUpdate(phrase.id, val);
          }
        }}
        onBlur={() => {
          if (draft.trim() === '') {
            setDraft(phrase.text);
          }
        }}
        className="input-field w-full min-h-[38px] px-3 py-1.5 text-xs border-accent"
      />
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
  isBugCustomizationUnlocked?: boolean;
  hideBug?: boolean;
  onChangeHideBug?: (hide: boolean) => void;
  muteBugText?: boolean;
  onChangeMuteBugText?: (mute: boolean) => void;
  muteBugBounceSound?: boolean;
  onChangeMuteBugBounceSound?: (mute: boolean) => void;
  bugMusicMode?: BugMusicMode;
  onChangeBugMusicMode?: (mode: BugMusicMode) => void;
  bugSelectedHat?: BugHatId;
  onChangeBugSelectedHat?: (hat: BugHatId) => void;
  bugHatColors?: Partial<Record<Exclude<BugHatId, 'none'>, RgbColor>>;
  onChangeBugHatColor?: (hat: Exclude<BugHatId, 'none'>, color: RgbColor) => void;
  deletedBugPhraseKeys?: string[];
  customBugPhrases?: CustomBugPhrase[];
  onAddCustomBugPhrase?: (category: BugDialogueCategory, text: string) => void;
  onUpdateCustomBugPhrase?: (id: string, text: string) => void;
  onDeleteCustomBugPhrase?: (id: string) => void;
  onDeleteDefaultBugPhrase?: (key: UiTextKey) => void;
  onRestoreDeletedBugPhrases?: () => void;
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
  isBugCustomizationUnlocked = false,
  hideBug = false,
  onChangeHideBug,
  muteBugText = false,
  onChangeMuteBugText,
  muteBugBounceSound = false,
  onChangeMuteBugBounceSound,
  bugMusicMode = 'auto',
  onChangeBugMusicMode,
  bugSelectedHat = 'none',
  onChangeBugSelectedHat,
  bugHatColors,
  onChangeBugHatColor,
  deletedBugPhraseKeys = [],
  customBugPhrases = [],
  onAddCustomBugPhrase,
  onUpdateCustomBugPhrase,
  onDeleteCustomBugPhrase,
  onDeleteDefaultBugPhrase,
  onRestoreDeletedBugPhrases,
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

  const [settingsSection, setSettingsSection] = useState<'main' | 'bug' | 'advanced' | 'texts'>(
    'main'
  );
  const [textSearchQuery, setTextSearchQuery] = useState('');
  const [bugPhraseSearchQuery, setBugPhraseSearchQuery] = useState('');
  const [newBugPhraseCategory, setNewBugPhraseCategory] = useState<BugDialogueCategory>('streak');
  const [newBugPhraseDraft, setNewBugPhraseDraft] = useState('');
  const [backupFeedback, setBackupFeedback] = useState<'success' | 'error' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const colorPickerInputRef = useRef<HTMLInputElement | null>(null);

  const [draftCustomHex, setDraftCustomHex] = useState<string>(() =>
    (customAccentHex || '#c8ff00').toUpperCase()
  );
  const [showCustomHexError, setShowCustomHexError] = useState(false);

  const resolvedHeadphonesColor = useMemo(
    () => sanitizeRgbColor(bugHatColors?.headphones, DEFAULT_BUG_HAT_COLORS.headphones),
    [bugHatColors?.headphones]
  );
  const resolvedBowColor = useMemo(
    () => sanitizeRgbColor(bugHatColors?.bow, DEFAULT_BUG_HAT_COLORS.bow),
    [bugHatColors?.bow]
  );

  const editableHatId: Exclude<BugHatId, 'none'> | null =
    isBugCustomizationUnlocked && (bugSelectedHat === 'headphones' || bugSelectedHat === 'bow')
      ? bugSelectedHat
      : null;

  const activeEditableHatRgb =
    editableHatId === 'bow' ? resolvedBowColor : resolvedHeadphonesColor;

  const [rgbCodeDraft, setRgbCodeDraft] = useState<string>(() =>
    formatRgbCode(activeEditableHatRgb)
  );
  const [showRgbError, setShowRgbError] = useState<boolean>(false);

  useEffect(() => {
    setRgbCodeDraft(formatRgbCode(activeEditableHatRgb));
    setShowRgbError(false);
  }, [editableHatId, activeEditableHatRgb.r, activeEditableHatRgb.g, activeEditableHatRgb.b]);

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
      setBugPhraseSearchQuery('');
      setNewBugPhraseDraft('');
      setShowIOSInstallGuide(false);
      setBackupFeedback(null);
      setShowCustomHexError(false);
      setShowRgbError(false);
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
      } else if (settingsSection === 'advanced' || settingsSection === 'bug') {
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

  const deletedBugKeysSet = useMemo(
    () => new Set<string>(deletedBugPhraseKeys),
    [deletedBugPhraseKeys]
  );

  const filteredCustomBugPhrases = useMemo(() => {
    const q = bugPhraseSearchQuery.trim().toLowerCase();
    if (!q) return customBugPhrases;
    return customBugPhrases.filter((p) => p.text.toLowerCase().includes(q));
  }, [customBugPhrases, bugPhraseSearchQuery]);

  const bugDefaultPhraseFields = useMemo(() => {
    const bugSection = UI_TEXT_SECTIONS.find((section) => section.id === 'bug_phrases');
    if (!bugSection) return [];
    const activeFields = bugSection.fields.filter((f) => !deletedBugKeysSet.has(f.key));
    const q = bugPhraseSearchQuery.trim().toLowerCase();
    if (!q) return activeFields;
    return activeFields.filter((field) => {
      const metaLabel = language === 'en' ? field.labelEn : field.labelEs;
      const currentText = t[field.key];
      const defaultText = defaultT[field.key];
      return (
        metaLabel.toLowerCase().includes(q) ||
        currentText.toLowerCase().includes(q) ||
        defaultText.toLowerCase().includes(q)
      );
    });
  }, [deletedBugKeysSet, bugPhraseSearchQuery, language, t, defaultT]);

  const filteredTextSections = useMemo(() => {
    const baseSections = UI_TEXT_SECTIONS.filter((section) => section.id !== 'bug_phrases').map(
      (section) =>
        !isBugUnlocked && section.id === 'settings'
          ? {
              ...section,
              fields: section.fields.filter((f) => !f.key.startsWith('settings_bug_')),
            }
          : section
    );

    const normalizedQuery = textSearchQuery.trim().toLowerCase();
    if (!normalizedQuery) return baseSections;

    return baseSections
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
      : settingsSection === 'bug'
      ? t.settings_bug_label
      : settingsSection === 'advanced'
      ? t.settings_advanced_btn
      : t.advanced_texts_heading;

  const equippedPreviewHat: BugHatId = isBugCustomizationUnlocked ? bugSelectedHat : 'none';
  const equippedPreviewHatColor: RgbColor =
    equippedPreviewHat === 'bow' ? resolvedBowColor : resolvedHeadphonesColor;

  const handleApplyRgbDraft = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editableHatId || !onChangeBugHatColor) return;
    const parsed = parseRgbCodeInput(rgbCodeDraft);
    if (!parsed) {
      setShowRgbError(true);
      return;
    }
    setShowRgbError(false);
    setRgbCodeDraft(formatRgbCode(parsed));
    onChangeBugHatColor(editableHatId, parsed);
  };

  const handleUpdateRgbChannel = (channel: 'r' | 'g' | 'b', rawVal: string) => {
    if (!editableHatId || !onChangeBugHatColor) return;
    const digits = rawVal.replace(/\D/g, '').slice(0, 3);
    const numeric = digits === '' ? 0 : clampRgbByte(Number.parseInt(digits, 10));
    const nextColor: RgbColor = {
      ...activeEditableHatRgb,
      [channel]: numeric,
    };
    setShowRgbError(false);
    setRgbCodeDraft(formatRgbCode(nextColor));
    onChangeBugHatColor(editableHatId, nextColor);
  };

  const getBugCategoryLabel = (cat: BugDialogueCategory) =>
    cat === 'streak'
      ? t.settings_bug_cat_streak
      : cat === 'inactive'
      ? t.settings_bug_cat_inactive
      : t.settings_bug_cat_reaction;

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

            {/* Acceso directo a Personalizar Bug (aparece tras desbloquear a Bug en Nivel 3) */}
            {isBugUnlocked && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setSettingsSection('bug')}
                  className="btn-secondary w-full min-h-[48px] px-3.5 py-2.5 flex items-center justify-between gap-3 text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <svg
                      viewBox="-2 -6 20 20"
                      className="w-6 h-6 shrink-0 overflow-visible"
                      shapeRendering="crispEdges"
                      aria-hidden="true"
                    >
                      <BugPixelGraphic
                        expression="happy"
                        hat={equippedPreviewHat}
                        hatColor={equippedPreviewHatColor}
                      />
                    </svg>
                    <span className="text-sm font-semibold text-fg truncate">
                      {t.settings_bug_label}
                    </span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-fg-muted shrink-0" />
                </button>
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

        {/* SUB-PANTALLA: PERSONALIZAR BUG (VISIBILIDAD, MÚSICA, GORROS RGB Y FRASES) */}
        {settingsSection === 'bug' && isBugUnlocked && (
          <div className="pt-4 space-y-5 overflow-y-auto pr-0.5">
            {/* Vista previa en vivo de Bug 8-bits */}
            <div className="trophy-oled-window rounded-[4px] border border-subtle py-4 px-4 flex items-center justify-center">
              <svg
                viewBox="-6 -12 28 28"
                className={`w-16 h-16 overflow-visible ${
                  bugMusicMode === 'on' ? 'animate-bug-music-dance' : ''
                }`}
                shapeRendering="crispEdges"
                aria-hidden="true"
              >
                <BugPixelGraphic
                  expression="happy"
                  hat={equippedPreviewHat}
                  hatColor={equippedPreviewHatColor}
                  showMusicNotes={bugMusicMode === 'on'}
                />
              </svg>
            </div>

            {/* Controles generales de Bug */}
            <div className="space-y-3">
              {onChangeHideBug && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-fg">{t.settings_bug_visibility_label}</p>
                  <div
                    role="group"
                    aria-label={t.settings_bug_visibility_label}
                    className="seg-group grid grid-cols-2 gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => onChangeHideBug(false)}
                      aria-pressed={!hideBug}
                      className={`seg-btn min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                        !hideBug ? 'seg-btn-active' : ''
                      }`}
                    >
                      {t.settings_bug_show}
                    </button>

                    <button
                      type="button"
                      onClick={() => onChangeHideBug(true)}
                      aria-pressed={hideBug}
                      className={`seg-btn min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                        hideBug ? 'seg-btn-active' : ''
                      }`}
                    >
                      {t.settings_bug_hide}
                    </button>
                  </div>
                </div>
              )}

              {onChangeMuteBugText && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-fg">
                    <MessageSquare className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="font-semibold">{t.settings_bug_text_label}</span>
                  </div>
                  <div
                    role="group"
                    aria-label={t.settings_bug_text_label}
                    className="seg-group grid grid-cols-2 gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => onChangeMuteBugText(false)}
                      aria-pressed={!muteBugText}
                      className={`seg-btn min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                        !muteBugText ? 'seg-btn-active' : ''
                      }`}
                    >
                      {t.settings_bug_unmuted}
                    </button>

                    <button
                      type="button"
                      onClick={() => onChangeMuteBugText(true)}
                      aria-pressed={muteBugText}
                      className={`seg-btn min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                        muteBugText ? 'seg-btn-active' : ''
                      }`}
                    >
                      {t.settings_bug_muted}
                    </button>
                  </div>
                </div>
              )}

              {onChangeMuteBugBounceSound && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-fg">
                    <Volume2 className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="font-semibold">{t.settings_bug_bounce_sound_label}</span>
                  </div>
                  <div
                    role="group"
                    aria-label={t.settings_bug_bounce_sound_label}
                    className="seg-group grid grid-cols-2 gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => onChangeMuteBugBounceSound(false)}
                      aria-pressed={!muteBugBounceSound}
                      className={`seg-btn min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                        !muteBugBounceSound ? 'seg-btn-active' : ''
                      }`}
                    >
                      {t.settings_bug_unmuted}
                    </button>

                    <button
                      type="button"
                      onClick={() => onChangeMuteBugBounceSound(true)}
                      aria-pressed={muteBugBounceSound}
                      className={`seg-btn min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                        muteBugBounceSound ? 'seg-btn-active' : ''
                      }`}
                    >
                      {t.settings_bug_muted}
                    </button>
                  </div>
                </div>
              )}

              {onChangeBugMusicMode && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs text-fg">
                    <Music className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="font-semibold">{t.settings_bug_music_label}</span>
                  </div>
                  <div
                    role="group"
                    aria-label={t.settings_bug_music_label}
                    className="seg-group grid grid-cols-3 gap-1"
                  >
                    {(
                      [
                        { id: 'auto', label: t.settings_bug_music_auto },
                        { id: 'on', label: t.settings_bug_music_on },
                        { id: 'off', label: t.settings_bug_music_off },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChangeBugMusicMode(opt.id)}
                        aria-pressed={bugMusicMode === opt.id}
                        className={`seg-btn min-h-[38px] px-2.5 py-1.5 text-xs flex items-center justify-center whitespace-nowrap ${
                          bugMusicMode === opt.id ? 'seg-btn-active' : ''
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Gorros 8-bits y código RGB (desbloqueados al Nivel 25) + futuros sombreros ocultos */}
            <div className="pt-4 border-t border-subtle space-y-3">
              <p className="font-display text-xs font-semibold uppercase tracking-wider text-accent">
                {t.settings_bug_hats_heading}
              </p>

              {!isBugCustomizationUnlocked ? (
                <div className="rounded-[4px] bg-canvas border border-subtle p-3.5 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Lock className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                    <p className="text-xs text-fg-secondary leading-relaxed">
                      {t.settings_bug_hats_locked_desc}
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((slotIdx) => (
                      <div
                        key={`locked-hat-${slotIdx}`}
                        aria-hidden="true"
                        className="rounded-[4px] bg-surface/60 border border-dashed border-subtle py-2.5 px-2 flex flex-col items-center justify-center gap-1 select-none opacity-75"
                      >
                        <div className="w-9 h-7 rounded-[3px] trophy-oled-window border border-subtle flex items-center justify-center">
                          <span className="font-mono text-xs font-bold text-fg-muted">?</span>
                        </div>
                        <span className="font-mono text-[11px] font-bold text-fg-muted">
                          {t.settings_bug_hat_mystery_title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        {
                          id: 'none' as const,
                          label: t.settings_bug_hat_none,
                          color: undefined,
                        },
                        {
                          id: 'headphones' as const,
                          label: t.settings_bug_hat_headphones,
                          color: resolvedHeadphonesColor,
                        },
                        {
                          id: 'bow' as const,
                          label: t.settings_bug_hat_bow,
                          color: resolvedBowColor,
                        },
                      ] as const
                    ).map((hatItem) => {
                      const isSelected = bugSelectedHat === hatItem.id;
                      return (
                        <button
                          key={hatItem.id}
                          type="button"
                          onClick={() => onChangeBugSelectedHat?.(hatItem.id)}
                          aria-pressed={isSelected}
                          className={`min-h-[82px] p-2 rounded-[4px] border flex flex-col items-center justify-center gap-1.5 text-center transition cursor-pointer ${
                            isSelected
                              ? 'bg-accent-soft border-accent-fill text-fg font-semibold'
                              : 'bg-canvas border-subtle text-fg-secondary hover:bg-elevated'
                          }`}
                        >
                          <svg
                            viewBox="-2 -6 20 20"
                            className="w-8 h-8 shrink-0 overflow-visible"
                            shapeRendering="crispEdges"
                            aria-hidden="true"
                          >
                            <BugPixelGraphic
                              expression={isSelected ? 'happy' : 'neutral'}
                              hat={hatItem.id}
                              hatColor={hatItem.color}
                            />
                          </svg>
                          <span className="text-[11px] leading-tight line-clamp-2">
                            {hatItem.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selector de color por código RGB para el gorro activo */}
                  {editableHatId && onChangeBugHatColor && (
                    <div className="rounded-[4px] bg-canvas border border-subtle p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="bug-hat-rgb-code"
                          className="text-xs font-semibold text-fg"
                        >
                          {t.settings_bug_rgb_label}
                        </label>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <svg
                            viewBox="0 0 16 16"
                            className="w-4 h-4 rounded-[2px] border border-subtle shrink-0"
                            aria-hidden="true"
                          >
                            <rect
                              width={16}
                              height={16}
                              fill={`rgb(${activeEditableHatRgb.r}, ${activeEditableHatRgb.g}, ${activeEditableHatRgb.b})`}
                            />
                          </svg>
                          <span className="font-mono text-[11px] text-fg-muted tabular-nums">
                            rgb({formatRgbCode(activeEditableHatRgb)})
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {(['r', 'g', 'b'] as const).map((channel) => (
                          <div key={channel} className="relative">
                            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold uppercase text-fg-muted">
                              {channel}
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={String(activeEditableHatRgb[channel])}
                              onChange={(e) => handleUpdateRgbChannel(channel, e.target.value)}
                              aria-label={`${channel.toUpperCase()} (0-255)`}
                              className="input-field w-full min-h-[38px] pl-6 pr-2 py-1 text-xs font-mono text-right tabular-nums"
                            />
                          </div>
                        ))}
                      </div>

                      <form onSubmit={handleApplyRgbDraft} className="flex items-center gap-2">
                        <input
                          id="bug-hat-rgb-code"
                          type="text"
                          spellCheck={false}
                          autoComplete="off"
                          value={rgbCodeDraft}
                          onChange={(e) => {
                            setRgbCodeDraft(e.target.value);
                            if (showRgbError && parseRgbCodeInput(e.target.value)) {
                              setShowRgbError(false);
                            }
                          }}
                          placeholder={t.settings_bug_rgb_placeholder}
                          className={`input-field flex-1 min-w-0 min-h-[38px] px-3 py-1.5 font-mono text-xs tabular-nums ${
                            showRgbError ? 'ring-1 ring-red-400/70' : ''
                          }`}
                        />
                        <button
                          type="submit"
                          className="btn-primary min-h-[38px] px-3 py-1.5 text-xs whitespace-nowrap shrink-0"
                        >
                          {t.settings_bug_rgb_apply_btn}
                        </button>
                      </form>

                      {showRgbError && (
                        <p role="alert" className="text-[11px] font-medium text-red-400">
                          {t.settings_bug_rgb_error}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Futuros sombreros ocultos (sin revelar siluetas) */}
                  <div className="grid grid-cols-3 gap-2 pt-0.5">
                    {[0, 1, 2].map((mysteryIdx) => (
                      <div
                        key={`mystery-hat-${mysteryIdx}`}
                        aria-label={`${t.settings_bug_hat_mystery_title} · ${t.settings_bug_hat_mystery_sub}`}
                        className="min-h-[74px] p-2 rounded-[4px] bg-canvas/55 border border-dashed border-subtle flex flex-col items-center justify-center gap-1 text-center select-none opacity-80"
                      >
                        <div className="w-9 h-7 rounded-[3px] trophy-oled-window border border-subtle flex items-center justify-center">
                          <svg
                            viewBox="0 0 8 10"
                            className="w-2.5 h-3"
                            shapeRendering="crispEdges"
                            aria-hidden="true"
                          >
                            <path
                              d="M2 1h4v1H2zM1 2h1v1H1zM6 2h1v2H6zM4 4h2v1H4zM3 5h1v2H3zM3 8h1v1H3z"
                              fill="var(--app-fg-muted)"
                            />
                          </svg>
                        </div>
                        <span className="font-mono text-[11px] font-bold text-fg-muted leading-none">
                          {t.settings_bug_hat_mystery_title}
                        </span>
                        <span className="text-[10px] text-fg-muted leading-none truncate max-w-full">
                          {t.settings_bug_hat_mystery_sub}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Frases de Bug: crear, editar, eliminar y restaurar */}
            <div className="pt-4 border-t border-subtle space-y-3">
              <p className="font-display text-xs font-semibold uppercase tracking-wider text-accent">
                {t.settings_bug_phrases_heading}
              </p>

              {onAddCustomBugPhrase && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const trimmed = newBugPhraseDraft.trim();
                    if (!trimmed) return;
                    onAddCustomBugPhrase(newBugPhraseCategory, trimmed);
                    setNewBugPhraseDraft('');
                  }}
                  className="rounded-[4px] bg-canvas border border-subtle p-3 space-y-2"
                >
                  <p className="text-xs font-semibold text-fg">{t.settings_bug_new_phrase_label}</p>
                  <div
                    role="group"
                    aria-label={t.settings_bug_new_phrase_label}
                    className="seg-group grid grid-cols-3 gap-1"
                  >
                    {(['streak', 'inactive', 'reaction'] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setNewBugPhraseCategory(cat)}
                        aria-pressed={newBugPhraseCategory === cat}
                        className={`seg-btn min-h-[34px] px-2 py-1 text-[11px] flex items-center justify-center truncate ${
                          newBugPhraseCategory === cat ? 'seg-btn-active' : ''
                        }`}
                      >
                        {getBugCategoryLabel(cat)}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newBugPhraseDraft}
                      onChange={(e) => setNewBugPhraseDraft(e.target.value)}
                      maxLength={180}
                      placeholder={t.settings_bug_new_phrase_placeholder}
                      aria-label={t.settings_bug_new_phrase_placeholder}
                      className="input-field flex-1 min-w-0 min-h-[38px] px-3 py-1.5 text-xs placeholder:text-fg-muted"
                    />
                    <button
                      type="submit"
                      disabled={!newBugPhraseDraft.trim()}
                      className={`min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center gap-1 whitespace-nowrap shrink-0 ${
                        newBugPhraseDraft.trim()
                          ? 'btn-primary'
                          : 'btn-secondary opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>{t.settings_bug_add_phrase_btn}</span>
                    </button>
                  </div>
                </form>
              )}

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={bugPhraseSearchQuery}
                  onChange={(e) => setBugPhraseSearchQuery(e.target.value)}
                  placeholder={t.advanced_texts_search_placeholder}
                  aria-label={t.advanced_texts_search_placeholder}
                  className="input-field w-full min-h-[38px] pl-8 pr-8 py-1.5 text-xs placeholder:text-fg-muted"
                />
                {bugPhraseSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setBugPhraseSearchQuery('')}
                    aria-label={t.common_close}
                    className="btn-quiet absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[28px] min-w-[28px] flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="divide-y divide-subtle">
                {onUpdateCustomBugPhrase &&
                  onDeleteCustomBugPhrase &&
                  filteredCustomBugPhrases.map((phrase) => (
                    <CustomBugPhraseRow
                      key={phrase.id}
                      phrase={phrase}
                      categoryLabel={getBugCategoryLabel(phrase.category)}
                      customTagLabel={t.settings_bug_custom_phrase_label}
                      deleteLabel={t.common_delete}
                      onUpdate={onUpdateCustomBugPhrase}
                      onDelete={onDeleteCustomBugPhrase}
                    />
                  ))}

                {bugDefaultPhraseFields.map((field) => {
                  const canDeleteDefault =
                    Boolean(onDeleteDefaultBugPhrase) && isBugDefaultPhraseKey(field.key);
                  return (
                    <CustomTextFieldRow
                      key={`bug-${language}-${field.key}`}
                      field={field}
                      label={language === 'en' ? field.labelEn : field.labelEs}
                      defaultValue={defaultT[field.key]}
                      customValue={customForLang[field.key]}
                      resetLabel={t.advanced_texts_reset_one_btn}
                      deleteLabel={t.common_delete}
                      onUpdate={onUpdateCustomText}
                      onReset={onResetCustomText}
                      onDelete={canDeleteDefault ? onDeleteDefaultBugPhrase : undefined}
                    />
                  );
                })}
              </div>

              {filteredCustomBugPhrases.length === 0 && bugDefaultPhraseFields.length === 0 && (
                <p className="py-4 text-center text-xs text-fg-muted">
                  {t.advanced_texts_no_results}
                </p>
              )}

              {onRestoreDeletedBugPhrases && deletedBugPhraseKeys.length > 0 && (
                <button
                  type="button"
                  onClick={onRestoreDeletedBugPhrases}
                  className="btn-secondary w-full min-h-[38px] px-3 py-1.5 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-accent shrink-0" />
                  <span>
                    {t.settings_bug_restore_deleted_btn} ({deletedBugPhraseKeys.length})
                  </span>
                </button>
              )}
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
