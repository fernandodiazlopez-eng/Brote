/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Upgrade — Coordinador principal de la aplicación:
 * - Sincroniza el calendario local real y reconcilia niveles/inactividad cada medianoche.
 * - Calcula en tiempo real XP, nivel actual y memoria muscular (máx. -15 niveles).
 * - Mantiene y persiste la sesión activa de entrenamiento, el cronómetro y el temporizador al cambiar de app.
 * - Gestiona Wake Lock de pantalla, alertas sonoras compatibles con música y desbloqueo de trofeos.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BellRing,
  Dumbbell,
  Pause,
  Play,
  RotateCcw,
  Square,
  User,
} from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import {
  BugGlobalMood,
  BugReactionContext,
  BugReactionContextValue,
  BugSubwayMarquee,
  BugUnlockBanner,
} from './components/BugCompanion';
import { DevicePermissionsModal } from './components/DevicePermissionsModal';
import { FirstLaunchLanguageModal } from './components/FirstLaunchLanguageModal';
import { OnboardingTutorial } from './components/OnboardingTutorial';
import { ProfileView } from './components/ProfileView';
import { StatsView } from './components/StatsView';
import { TrainingView } from './components/TrainingView';
import { TrophyUnlockBanner } from './components/TrophyUnlockBanner';
import {
  BUG_HATS_CATALOG,
  BugDialogueCategory,
  DEFAULT_BUG_HAT_COLORS,
  getResolvedBugHatColor,
  pickBugPhrase,
  sanitizeRgbColor,
} from './data/bugCompanionData';
import { findNewlyUnlockedTrophies } from './data/trophiesCatalog';
import { useMobileStepSensor } from './hooks/useMobileStepSensor';
import { I18nContext, I18nContextValue } from './i18n/I18nContext';
import {
  DEFAULT_UI_TEXTS,
  getLocalizedCategoryLabel,
  resolveUiTexts,
  UiTextKey,
} from './i18n/translations';
import {
  AccentPaletteId,
  ActiveWorkoutSessionState,
  AppLanguage,
  AppPersistentState,
  AppTab,
  BugHatId,
  BugMusicMode,
  BugUnlockMilestone,
  BugWearableHatId,
  CompletedWorkout,
  CustomBugPhrase,
  DailyActivityRecord,
  ExerciseDropsetSessionState,
  MuscleGroupId,
  RgbColor,
  Routine,
  RoutineCategory,
  ThemeMode,
  Trophy,
  WorkoutClockMode,
  XpFormulas,
} from './types';
import {
  armCountdownBackgroundAudio,
  disarmCountdownBackgroundAudio,
  playBugUnlockSound,
  playTrophyUnlockSound,
  resumeAlarmAudioIfNeeded,
  startTimerAlarm,
  stopTimerAlarm,
} from './utils/audioEffects';
import { addDaysToIso, getDailyRecord, getTodayDateIso } from './utils/calendarDates';
import { createBackgroundClockTicker } from './utils/countdownWorker';
import {
  APP_STATE_STORAGE_KEY,
  applyThemeToDocument,
  HydratedWorkoutSession,
  loadAppStateFromStorage,
  loadWorkoutSessionFromStorage,
  MAX_STOPWATCH_MS,
  normalizeHexColor,
  parseAppStateBackup,
  reconcileDaysUntilToday,
  serializeAppStateBackup,
  WORKOUT_SESSION_STORAGE_KEY,
} from './utils/localStorageState';
import {
  calculateDailyTotalXp,
  calculateLevelFromXp,
  calculateRoutineBaseXp,
  getMinXpForLevel,
  localizeXpFormulasIfDefault,
  MAX_LEVEL,
  MAX_TOTAL_XP,
  previewNextWorkoutMarginalXp,
  recalculateDailyWorkoutsMarginalXp,
} from './utils/progressionRules';
import {
  categorySupportsMuscles,
  extractMuscleGroupsFromExercises,
} from './utils/muscleRecovery';

const EMPTY_CUSTOM_MAP: Partial<Record<UiTextKey, string>> = {};

function formatCompactClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Horario nocturno de sueño de Bug: desde las 22:00 hasta las 06:00 de la mañana. */
function checkIsBugSleepHours(): boolean {
  const hour = new Date().getHours();
  return hour >= 22 || hour < 6;
}

export default function App() {
  const [todayIso, setTodayIso] = useState<string>(() => getTodayDateIso());
  const [appState, setAppState] = useState<AppPersistentState>(loadAppStateFromStorage);
  const latestAppStateRef = useRef<AppPersistentState>(appState);
  latestAppStateRef.current = appState;
  const [selectedDateIso, setSelectedDateIso] = useState<string>(() => getTodayDateIso());

  // Hidratar la sesión activa una única vez al arrancar
  const hydratedSessionRef = useRef<HydratedWorkoutSession | null>(null);
  if (hydratedSessionRef.current === null) {
    hydratedSessionRef.current = loadWorkoutSessionFromStorage(appState.routines);
  }
  const initialSession = hydratedSessionRef.current;

  const [activeTab, setActiveTab] = useState<AppTab>(initialSession.activeTab);
  const [manualTutorialOpen, setManualTutorialOpen] = useState<boolean>(false);
  const isTutorialOpen =
    manualTutorialOpen ||
    (appState.hasSelectedInitialLanguage && !appState.hasCompletedTutorial);
  const isPermissionsModalOpen =
    appState.hasSelectedInitialLanguage &&
    Boolean(appState.hasCompletedTutorial) &&
    !manualTutorialOpen &&
    !appState.hasPromptedDevicePermissions;

  const [trophyQueue, setTrophyQueue] = useState<Trophy[]>([]);
  const [bugMilestoneQueue, setBugMilestoneQueue] = useState<BugUnlockMilestone[]>([]);
  const currentTrophyBanner =
    !isTutorialOpen && !isPermissionsModalOpen ? trophyQueue[0] || null : null;
  const currentBugBanner =
    !isTutorialOpen && !isPermissionsModalOpen && !currentTrophyBanner
      ? bugMilestoneQueue[0] || null
      : null;

  // Estado reactivo de Bug (mascota 8-bits) y su carrusel luminoso de metro
  const [bugMood, setBugMood] = useState<BugGlobalMood>('none');
  const [bugMarquee, setBugMarquee] = useState<{
    id: number;
    text: string;
    isSecret?: boolean;
  } | null>(null);
  const [trophyCelebrateToken, setTrophyCelebrateToken] = useState<number>(0);
  const [scrollTopHopToken, setScrollTopHopToken] = useState<number>(0);
  const [fastScrollUpToken, setFastScrollUpToken] = useState<number>(0);
  const [tabTeleportToken, setTabTeleportToken] = useState<number>(0);
  const [isSleepHours, setIsSleepHours] = useState<boolean>(checkIsBugSleepHours);
  const bugMoodTimersRef = useRef<number[]>([]);
  const lastBugPhraseRef = useRef<string | null>(null);
  const nextBugMsgIdRef = useRef<number>(0);
  const didTriggerOpenGreetingRef = useRef<boolean>(false);

  // --- 1. Sincronización de fecha real al volver del segundo plano o pasar medianoche ---
  useEffect(() => {
    const syncCalendarAndVisibility = () => {
      if (typeof document !== 'undefined') {
        document.documentElement.dataset.appHidden =
          document.visibilityState === 'hidden' ? 'true' : 'false';
        if (document.visibilityState === 'hidden') return;
      }

      setIsSleepHours(checkIsBugSleepHours());

      const realToday = getTodayDateIso();
      setTodayIso((prevToday) => {
        if (prevToday !== realToday) {
          setSelectedDateIso((prevSelected) =>
            prevSelected === prevToday ? realToday : prevSelected
          );
          return realToday;
        }
        return prevToday;
      });

      setAppState((prev) =>
        prev.lastProcessedDateIso < realToday ? reconcileDaysUntilToday(prev, realToday) : prev
      );
      resumeAlarmAudioIfNeeded();
    };

    syncCalendarAndVisibility();
    const intervalId = window.setInterval(syncCalendarAndVisibility, 30_000);
    document.addEventListener('visibilitychange', syncCalendarAndVisibility);
    window.addEventListener('pageshow', syncCalendarAndVisibility);
    window.addEventListener('focus', syncCalendarAndVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', syncCalendarAndVisibility);
      window.removeEventListener('pageshow', syncCalendarAndVisibility);
      window.removeEventListener('focus', syncCalendarAndVisibility);
    };
  }, []);

  // --- 2. Cálculo en vivo de XP y Nivel (memorizado para no recalcular en cada tick del reloj) ---
  const todayRecord = useMemo(
    () => getDailyRecord(appState.daysByIso, todayIso),
    [appState.daysByIso, todayIso]
  );
  const todayEarnedXp = useMemo(
    () => calculateDailyTotalXp(todayRecord, appState.xpFormulas),
    [todayRecord, appState.xpFormulas]
  );
  const totalXp = Math.min(MAX_TOTAL_XP, appState.settledTotalXp + todayEarnedXp);
  const currentLevel = calculateLevelFromXp(totalXp);
  const peakLevel = Math.max(appState.settledPeakLevel, currentLevel);

  const levelMinXp = getMinXpForLevel(currentLevel);
  const nextLevelXp =
    currentLevel >= MAX_LEVEL ? MAX_TOTAL_XP : getMinXpForLevel(currentLevel + 1);

  const isBugUnlocked =
    Boolean(appState.bugUnlockedAtIso) || currentLevel >= 3 || peakLevel >= 3;
  const isBugPetUnlocked =
    Boolean(appState.bugPetUnlockedAtIso) || currentLevel >= 4 || peakLevel >= 4;
  const isBugHockeyUnlocked =
    Boolean(appState.bugHockeyUnlockedAtIso) || currentLevel >= 5 || peakLevel >= 5;
  const isBugCustomizationUnlocked =
    Boolean(appState.bugCustomizationUnlockedAtIso) ||
    currentLevel >= 25 ||
    peakLevel >= 25 ||
    Boolean(appState.bugSecretCrownUnlockedAtIso) ||
    Boolean(appState.bugSecretScouterUnlockedAtIso);
  const isBugGrown =
    Boolean(appState.bugGrownUnlockedAtIso) || currentLevel >= 50 || peakLevel >= 50;
  const isBugSuperSaiyanUnlocked =
    Boolean(appState.bugSuperSaiyanUnlockedAtIso) || currentLevel >= 90 || peakLevel >= 90;
  const hideBug = Boolean(appState.hideBug);
  const showBug = isBugUnlocked && !hideBug;

  const [isNativeMusicPlaying, setIsNativeMusicPlaying] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Barrera de seguridad: Solo activar listeners y polling si estamos dentro de Capacitor / Android nativo
    const win = window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
      AndroidBridge?: { isMusicPlaying?: () => boolean };
      onNativeMusicPlaybackChanged?: (isPlaying: boolean) => void;
    };

    const isNativeAndroid = Boolean(
      win.AndroidBridge ||
      win.Capacitor?.isNativePlatform?.() ||
      win.Capacitor?.getPlatform?.() === 'android'
    );

    // En navegador web estándar, mantener compatibilidad total sin activar polling nativo
    if (!isNativeAndroid) {
      return;
    }

    const handleNativeMusic = (e: Event) => {
      try {
        const customEvent = e as CustomEvent<{ isPlaying?: boolean }>;
        if (typeof customEvent.detail?.isPlaying === 'boolean') {
          setIsNativeMusicPlaying(customEvent.detail.isPlaying);
        }
      } catch {
        // Ignorar
      }
    };

    window.addEventListener('nativeMusicPlayback', handleNativeMusic);
    win.onNativeMusicPlaybackChanged = (isPlaying: boolean) => {
      try {
        setIsNativeMusicPlaying(Boolean(isPlaying));
      } catch {
        // Ignorar
      }
    };

    const checkMusicState = () => {
      try {
        if (win.AndroidBridge && typeof win.AndroidBridge.isMusicPlaying === 'function') {
          const playing = Boolean(win.AndroidBridge.isMusicPlaying());
          setIsNativeMusicPlaying((prev) => (prev !== playing ? playing : prev));
        }
      } catch {
        // Ignorar si el puente lanza alguna excepción
      }
    };

    checkMusicState();
    const pollInterval = window.setInterval(checkMusicState, 1200);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkMusicState();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('nativeMusicPlayback', handleNativeMusic);
      delete win.onNativeMusicPlaybackChanged;
    };
  }, []);

  const bugMusicMode: BugMusicMode =
    appState.bugMusicMode === 'on' || isNativeMusicPlaying ? 'on' : 'off';

  const bugUnlockedHats = useMemo<BugWearableHatId[]>(() => {
    const unlocked = new Set<BugWearableHatId>(appState.bugUnlockedHats ?? []);
    const hasLvl25Hats =
      Boolean(appState.bugCustomizationUnlockedAtIso) || currentLevel >= 25 || peakLevel >= 25;
    for (const hatMeta of BUG_HATS_CATALOG) {
      if (hatMeta.isSecret) continue;
      if (hatMeta.unlockLevel === 25 && hasLvl25Hats) {
        unlocked.add(hatMeta.id);
      } else if (
        hatMeta.unlockLevel !== undefined &&
        (currentLevel >= hatMeta.unlockLevel || peakLevel >= hatMeta.unlockLevel)
      ) {
        unlocked.add(hatMeta.id);
      }
    }
    if (appState.bugSecretCrownUnlockedAtIso) {
      unlocked.add('crown');
    }
    if (appState.bugSecretScouterUnlockedAtIso) {
      unlocked.add('scouter');
    }
    return Array.from(unlocked);
  }, [
    appState.bugUnlockedHats,
    appState.bugCustomizationUnlockedAtIso,
    appState.bugSecretCrownUnlockedAtIso,
    appState.bugSecretScouterUnlockedAtIso,
    currentLevel,
    peakLevel,
  ]);

  const equippedHat: BugHatId = useMemo(() => {
    if (!isBugCustomizationUnlocked) return 'none';
    const selected = appState.bugSelectedHat ?? 'none';
    if (selected === 'none') return 'none';
    return bugUnlockedHats.includes(selected) ? selected : 'none';
  }, [isBugCustomizationUnlocked, appState.bugSelectedHat, bugUnlockedHats]);

  const equippedHatColor = useMemo<RgbColor>(() => {
    if (equippedHat === 'none') {
      return DEFAULT_BUG_HAT_COLORS.headphones;
    }
    return getResolvedBugHatColor(equippedHat, appState.bugHatColors);
  }, [equippedHat, appState.bugHatColors]);

  const wasBugUnlockedOnMountRef = useRef<boolean | null>(null);
  if (wasBugUnlockedOnMountRef.current === null) {
    wasBugUnlockedOnMountRef.current = isBugUnlocked;
  }

  const clearBugMoodTimers = useCallback(() => {
    bugMoodTimersRef.current.forEach((id) => window.clearTimeout(id));
    bugMoodTimersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearBugMoodTimers();
    };
  }, [clearBugMoodTimers]);

  const showBugMarqueePhrase = useCallback(
    (category: BugDialogueCategory, lang: AppLanguage) => {
      const snap = latestAppStateRef.current;
      if (snap.muteBugText) return;
      const customForLang = snap.customTexts[lang] as
        | Partial<Record<UiTextKey, string>>
        | undefined;
      const resolvedTexts = resolveUiTexts(lang, customForLang);
      const deletedKeys = snap.deletedBugPhraseKeys?.[lang];
      const customPhrases = snap.customBugPhrases?.[lang];
      const phrase = pickBugPhrase(
        category,
        resolvedTexts,
        lastBugPhraseRef.current,
        deletedKeys,
        customPhrases
      );
      if (!phrase) return;
      lastBugPhraseRef.current = phrase;
      nextBugMsgIdRef.current += 1;
      setBugMarquee({ id: nextBugMsgIdRef.current, text: phrase });
    },
    []
  );

  const triggerBugQuickReaction = useCallback(
    (lang: AppLanguage) => {
      if (checkIsBugSleepHours()) return;
      clearBugMoodTimers();
      setBugMood('happy');
      const calmId = window.setTimeout(() => {
        setBugMood('none');
      }, 2400);
      bugMoodTimersRef.current.push(calmId);
      showBugMarqueePhrase('reaction', lang);
    },
    [clearBugMoodTimers, showBugMarqueePhrase]
  );

  const handleCompleteBugMarquee = useCallback((completedId: number) => {
    setBugMarquee((prev) => (prev && prev.id === completedId ? null : prev));
  }, []);

  // --- 3. Pulso único de XP en Perfil (sin repeticiones al cambiar de pestaña) ---
  const lastDisplayedXpRef = useRef<number>(totalXp);
  const nextPulseIdRef = useRef<number>(0);
  const [xpPulseToken, setXpPulseToken] = useState<number>(0);
  const [lastXpGain, setLastXpGain] = useState<number>(0);
  const [isLevel100FinaleOpen, setIsLevel100FinaleOpen] = useState<boolean>(false);
  const [isPocketModeActive, setIsPocketModeActive] = useState<boolean>(false);

  const handleSelectTab = useCallback(
    (nextTab: AppTab) => {
      if (isLevel100FinaleOpen) return;
      if (nextTab !== AppTab.PROFILE) {
        setXpPulseToken(0);
      }
      setActiveTab((prevTab) => {
        if (prevTab !== nextTab) {
          setTabTeleportToken((n) => n + 1);
        }
        return nextTab;
      });
    },
    [isLevel100FinaleOpen]
  );

  const handleCompleteLevel100Finale = useCallback(() => {
    const realToday = getTodayDateIso();
    setIsLevel100FinaleOpen(false);
    setAppState((prev) => {
      if (prev.bugLevel100FinaleSeenAtIso) return prev;
      const updated: AppPersistentState = {
        ...prev,
        bugLevel100FinaleSeenAtIso: realToday,
      };
      try {
        window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignorar límites de almacenamiento
      }
      return updated;
    });
  }, []);

  const handleTriggerSecretBugMessage = useCallback(() => {
    nextBugMsgIdRef.current += 1;
    setBugMarquee({ id: nextBugMsgIdRef.current, text: 'FD 26', isSecret: true });
    setScrollTopHopToken((n) => n + 1);
    if (!checkIsBugSleepHours()) {
      clearBugMoodTimers();
      setBugMood('happy');
      const calmId = window.setTimeout(() => {
        setBugMood('none');
      }, 2400);
      bugMoodTimersRef.current.push(calmId);
    }
  }, [clearBugMoodTimers]);

  useEffect(() => {
    if (totalXp < lastDisplayedXpRef.current) {
      lastDisplayedXpRef.current = totalXp;
      return;
    }
    if (activeTab !== AppTab.PROFILE) {
      setXpPulseToken(0);
      return;
    }

    const gainedXp = totalXp - lastDisplayedXpRef.current;
    if (gainedXp <= 0) return;

    lastDisplayedXpRef.current = totalXp;
    nextPulseIdRef.current += 1;
    const pulseId = nextPulseIdRef.current;
    setLastXpGain(gainedXp);
    setXpPulseToken(pulseId);

    const clearTimer = window.setTimeout(() => {
      setXpPulseToken((prev) => (prev === pulseId ? 0 : prev));
    }, 1450);

    return () => window.clearTimeout(clearTimer);
  }, [totalXp, activeTab]);

  // --- 4. Evaluación y cola de notificaciones de Trofeos ---
  useEffect(() => {
    const newlyUnlocked = findNewlyUnlockedTrophies({
      todayIso,
      totalXp,
      currentLevel,
      peakLevel,
      settledInactiveDays: appState.settledInactiveDays,
      daysByIso: appState.daysByIso,
      scheduleChangesByDateIso: appState.scheduleChangesByDateIso,
      xpFormulas: appState.xpFormulas,
      alreadyUnlocked: appState.unlockedTrophies,
    });

    if (newlyUnlocked.length === 0) return;

    const unlockedDatesPatch: Record<string, string> = {};
    for (const trophy of newlyUnlocked) {
      unlockedDatesPatch[trophy.id] = todayIso;
    }

    setAppState((prev) => ({
      ...prev,
      unlockedTrophies: {
        ...prev.unlockedTrophies,
        ...unlockedDatesPatch,
      },
    }));

    setTrophyQueue((prevQueue) => {
      const queuedIds = new Set(prevQueue.map((item) => item.id));
      const toEnqueue = newlyUnlocked.filter((t) => !queuedIds.has(t.id));
      return [...prevQueue, ...toEnqueue];
    });
  }, [
    todayIso,
    totalXp,
    currentLevel,
    peakLevel,
    appState.settledInactiveDays,
    appState.daysByIso,
    appState.scheduleChangesByDateIso,
    appState.xpFormulas,
    appState.unlockedTrophies,
  ]);

  useEffect(() => {
    if (!currentTrophyBanner) return;
    playTrophyUnlockSound(currentTrophyBanner.tier);
    setTrophyCelebrateToken((n) => n + 1);

    const timerId = window.setTimeout(() => {
      setTrophyQueue((prev) => prev.slice(1));
    }, 4200);
    return () => window.clearTimeout(timerId);
  }, [currentTrophyBanner]);

  const handleDismissTrophyBanner = useCallback(() => {
    setTrophyQueue((prev) => prev.slice(1));
  }, []);

  // --- 4B. Desbloqueos progresivos de Bug (Niveles 3..90, gorros repartidos y secretos) ---
  useEffect(() => {
    if (!appState.hasSelectedInitialLanguage) return;

    const reachedLvl = (lvl: number) => currentLevel >= lvl || peakLevel >= lvl;
    const savedHats = new Set<BugWearableHatId>(appState.bugUnlockedHats ?? []);

    const needLvl3 = reachedLvl(3) && !appState.bugUnlockedAtIso;
    const needLvl4 = reachedLvl(4) && !appState.bugPetUnlockedAtIso;
    const needLvl5 = reachedLvl(5) && !appState.bugHockeyUnlockedAtIso;
    const needLvl25 = reachedLvl(25) && !appState.bugCustomizationUnlockedAtIso;
    const needLvl32 = reachedLvl(32) && !savedHats.has('plunger');
    const needLvl40 = reachedLvl(40) && !savedHats.has('robot_antenna');
    const needLvl46 = reachedLvl(46) && !savedHats.has('cowboy');
    const needLvl50 = reachedLvl(50) && !appState.bugGrownUnlockedAtIso;
    const needLvl56 = reachedLvl(56) && !savedHats.has('pirate');
    const needLvl65 = reachedLvl(65) && !savedHats.has('horns');
    const needLvl74 = reachedLvl(74) && !savedHats.has('halo');
    const needLvl82 = reachedLvl(82) && !savedHats.has('wizard');
    const needLvl90 = reachedLvl(90) && !appState.bugSuperSaiyanUnlockedAtIso;

    const needBase25Hats =
      reachedLvl(25) && (!savedHats.has('headphones') || !savedHats.has('bow'));

    if (
      !needLvl3 &&
      !needLvl4 &&
      !needLvl5 &&
      !needLvl25 &&
      !needBase25Hats &&
      !needLvl32 &&
      !needLvl40 &&
      !needLvl46 &&
      !needLvl50 &&
      !needLvl56 &&
      !needLvl65 &&
      !needLvl74 &&
      !needLvl82 &&
      !needLvl90
    ) {
      return;
    }

    setAppState((prev) => {
      const nextHatsSet = new Set<BugWearableHatId>(prev.bugUnlockedHats ?? []);
      if (reachedLvl(25)) {
        nextHatsSet.add('headphones');
        nextHatsSet.add('bow');
      }
      if (reachedLvl(32)) nextHatsSet.add('plunger');
      if (reachedLvl(40)) nextHatsSet.add('robot_antenna');
      if (reachedLvl(46)) nextHatsSet.add('cowboy');
      if (reachedLvl(56)) nextHatsSet.add('pirate');
      if (reachedLvl(65)) nextHatsSet.add('horns');
      if (reachedLvl(74)) nextHatsSet.add('halo');
      if (reachedLvl(82)) nextHatsSet.add('wizard');

      return {
        ...prev,
        ...(needLvl3 && !prev.bugUnlockedAtIso ? { bugUnlockedAtIso: todayIso } : {}),
        ...(needLvl4 && !prev.bugPetUnlockedAtIso ? { bugPetUnlockedAtIso: todayIso } : {}),
        ...(needLvl5 && !prev.bugHockeyUnlockedAtIso
          ? { bugHockeyUnlockedAtIso: todayIso }
          : {}),
        ...(needLvl25 && !prev.bugCustomizationUnlockedAtIso
          ? { bugCustomizationUnlockedAtIso: todayIso }
          : {}),
        ...(needLvl50 && !prev.bugGrownUnlockedAtIso
          ? { bugGrownUnlockedAtIso: todayIso }
          : {}),
        ...(needLvl90 && !prev.bugSuperSaiyanUnlockedAtIso
          ? { bugSuperSaiyanUnlockedAtIso: todayIso }
          : {}),
        ...(nextHatsSet.size > 0 ? { bugUnlockedHats: Array.from(nextHatsSet) } : {}),
      };
    });

    setBugMilestoneQueue((prev) => {
      const next = [...prev];
      const pushUnique = (m: BugUnlockMilestone) => {
        if (!next.includes(m)) next.push(m);
      };
      if (needLvl3) pushUnique('level3');
      if (needLvl4) pushUnique('level4');
      if (needLvl5) pushUnique('level5');
      if (needLvl25) pushUnique('level25');
      if (needLvl32) pushUnique('level32');
      if (needLvl40) pushUnique('level40');
      if (needLvl46) pushUnique('level46');
      if (needLvl50) pushUnique('level50');
      if (needLvl56) pushUnique('level56');
      if (needLvl65) pushUnique('level65');
      if (needLvl74) pushUnique('level74');
      if (needLvl82) pushUnique('level82');
      if (needLvl90) pushUnique('level90');
      return next;
    });
  }, [
    appState.hasSelectedInitialLanguage,
    appState.bugUnlockedAtIso,
    appState.bugPetUnlockedAtIso,
    appState.bugHockeyUnlockedAtIso,
    appState.bugCustomizationUnlockedAtIso,
    appState.bugGrownUnlockedAtIso,
    appState.bugSuperSaiyanUnlockedAtIso,
    appState.bugUnlockedHats,
    currentLevel,
    peakLevel,
    todayIso,
  ]);

  useEffect(() => {
    if (!currentBugBanner) return;
    playBugUnlockSound(currentBugBanner !== 'level3' && currentBugBanner !== 'level4');
    setTrophyCelebrateToken((n) => n + 1);

    const timerId = window.setTimeout(() => {
      setBugMilestoneQueue((prev) => prev.slice(1));
    }, 6200);
    return () => window.clearTimeout(timerId);
  }, [currentBugBanner]);

  const handleDismissBugBanner = useCallback(() => {
    setBugMilestoneQueue((prev) => prev.slice(1));
  }, []);

  const handleUnlockSecretCrown = useCallback(() => {
    const snap = latestAppStateRef.current;
    if (snap.bugSecretCrownUnlockedAtIso) return;
    const realToday = getTodayDateIso();
    setAppState((prev) => {
      if (prev.bugSecretCrownUnlockedAtIso) return prev;
      const nextHats = new Set<BugWearableHatId>(prev.bugUnlockedHats ?? []);
      nextHats.add('crown');
      return {
        ...prev,
        bugSecretCrownUnlockedAtIso: realToday,
        bugUnlockedHats: Array.from(nextHats),
      };
    });
    setBugMilestoneQueue((prev) => (prev.includes('secret_crown') ? prev : [...prev, 'secret_crown']));
  }, []);

  const handleUnlockSecretScouter = useCallback(() => {
    const snap = latestAppStateRef.current;
    if (snap.bugSecretScouterUnlockedAtIso) return;
    const realToday = getTodayDateIso();
    setAppState((prev) => {
      if (prev.bugSecretScouterUnlockedAtIso) return prev;
      const nextHats = new Set<BugWearableHatId>(prev.bugUnlockedHats ?? []);
      nextHats.add('scouter');
      return {
        ...prev,
        bugSecretScouterUnlockedAtIso: realToday,
        bugUnlockedHats: Array.from(nextHats),
      };
    });
    setBugMilestoneQueue((prev) =>
      prev.includes('secret_scouter') ? prev : [...prev, 'secret_scouter']
    );
  }, []);

  useEffect(() => {
    if (!appState.hasSelectedInitialLanguage) return;
    if (didTriggerOpenGreetingRef.current) return;
    didTriggerOpenGreetingRef.current = true;

    if (!wasBugUnlockedOnMountRef.current || appState.hideBug) return;
    if (checkIsBugSleepHours()) return;

    const isAfterMultiDayInactivity =
      appState.settledInactiveDays >= 2 &&
      todayRecord.completedWorkouts.length === 0 &&
      todayRecord.steps === 0;

    if (isAfterMultiDayInactivity) {
      // B. Tras inactividad de varios días: pasa de ojos tristes a arcos felices al detectar al usuario
      clearBugMoodTimers();
      setBugMood('sad');
      const happyTimer = window.setTimeout(() => {
        setBugMood('happy');
      }, 950);
      const resetTimer = window.setTimeout(() => {
        setBugMood('none');
      }, 3800);
      bugMoodTimersRef.current.push(happyTimer, resetTimer);
      showBugMarqueePhrase('inactive', appState.language);
    } else {
      // A. Racha o constancia al abrir la app
      showBugMarqueePhrase('streak', appState.language);
    }
  }, [
    appState.hasSelectedInitialLanguage,
    appState.hideBug,
    appState.settledInactiveDays,
    appState.language,
    todayRecord.completedWorkouts.length,
    todayRecord.steps,
    clearBugMoodTimers,
    showBugMarqueePhrase,
  ]);

  // --- 5. Estado de Sesión de Entrenamiento Activa y Relojes ---
  const [sessionRoutineId, setSessionRoutineId] = useState<string | null>(
    initialSession.sessionRoutineId
  );
  const [isSessionViewOpen, setIsSessionViewOpen] = useState<boolean>(
    initialSession.isSessionViewOpen
  );
  const [sessionOriginTab, setSessionOriginTab] = useState<AppTab>(
    initialSession.sessionOriginTab
  );
  const [checkedExercises, setCheckedExercises] = useState<Record<string, boolean>>(
    initialSession.checkedExercises
  );
  const [dropsetByExercise, setDropsetByExercise] = useState<
    Record<string, ExerciseDropsetSessionState>
  >(() => initialSession.dropsetByExercise ?? {});
  const [repCounter, setRepCounter] = useState<number>(initialSession.repCounter);

  const [clockMode, setClockMode] = useState<WorkoutClockMode>(initialSession.clockMode);
  const [stopwatchAccumMs, setStopwatchAccumMs] = useState<number>(
    initialSession.stopwatchAccumMs
  );
  const [stopwatchStartMs, setStopwatchStartMs] = useState<number | null>(
    initialSession.stopwatchStartMs
  );

  const [countdownTargetSec, setCountdownTargetSec] = useState<number>(
    initialSession.countdownTargetSec
  );
  const [countdownRemMs, setCountdownRemMs] = useState<number>(initialSession.countdownRemMs);
  const [countdownEndMs, setCountdownEndMs] = useState<number | null>(
    initialSession.countdownEndMs
  );

  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [isAlarmRinging, setIsAlarmRinging] = useState<boolean>(
    initialSession.shouldRingAlarmOnMount
  );
  const [isDocumentVisible, setIsDocumentVisible] = useState<boolean>(() =>
    typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
  );

  // --- 4C. Escena final de Nivel 100: después de todos los logros/banners, fuerza Perfil y hace zoom a Bug ---
  useEffect(() => {
    if (!appState.hasSelectedInitialLanguage) return;
    if (appState.bugLevel100FinaleSeenAtIso) return;
    if (isLevel100FinaleOpen) return;
    if (currentLevel < MAX_LEVEL && peakLevel < MAX_LEVEL) return;
    if (
      isTutorialOpen ||
      isPermissionsModalOpen ||
      isAlarmRinging ||
      !isDocumentVisible ||
      isPocketModeActive ||
      trophyQueue.length > 0 ||
      bugMilestoneQueue.length > 0
    ) {
      return;
    }

    // Esperar 1.15s para garantizar que cualquier logro de Nivel 100 recién evaluado haya entrado y terminado
    const timerId = window.setTimeout(() => {
      setIsSessionViewOpen(false);
      setActiveTab(AppTab.PROFILE);
      setBugMarquee(null);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setIsLevel100FinaleOpen(true);
    }, 1150);

    return () => window.clearTimeout(timerId);
  }, [
    appState.hasSelectedInitialLanguage,
    appState.bugLevel100FinaleSeenAtIso,
    isLevel100FinaleOpen,
    currentLevel,
    peakLevel,
    isTutorialOpen,
    isPermissionsModalOpen,
    isAlarmRinging,
    isDocumentVisible,
    isPocketModeActive,
    trophyQueue.length,
    bugMilestoneQueue.length,
  ]);

  useEffect(() => {
    registerSW({ immediate: true });
  }, []);

  // Bloqueo global contra selección/copiado accidental de textos al mantener pulsado en móvil (excepto en inputs)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(target.closest('input, textarea, [contenteditable="true"]'));
    };

    const preventNonInputSelect = (e: Event) => {
      if (!isEditableTarget(e.target)) {
        e.preventDefault();
      }
    };

    document.addEventListener('selectstart', preventNonInputSelect);
    document.addEventListener('contextmenu', preventNonInputSelect);
    return () => {
      document.removeEventListener('selectstart', preventNonInputSelect);
      document.removeEventListener('contextmenu', preventNonInputSelect);
    };
  }, []);

  // Saltito de Bug al subir hasta el tope + detección de subida rápida de pantalla (para despertarlo confundido de noche)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let hadScrolledDown = window.scrollY > 24;
    let lastHopAtMs = 0;
    let lastFastScrollAtMs = 0;
    let lastScrollY = window.scrollY;
    let lastScrollPerf = performance.now();
    let upwardBurstPx = 0;
    let upwardBurstStartPerf = 0;

    let pullStartY: number | null = null;
    let pullTriggered = false;
    let swipeStartY: number | null = null;
    let swipeStartPerf = 0;
    let swipeFastTriggered = false;

    const triggerTopHop = () => {
      const now = Date.now();
      if (now - lastHopAtMs < 650) return;
      lastHopAtMs = now;
      setScrollTopHopToken((n) => n + 1);
    };

    const triggerFastScrollUp = () => {
      const now = Date.now();
      if (now - lastFastScrollAtMs < 900) return;
      lastFastScrollAtMs = now;
      setFastScrollUpToken((n) => n + 1);
    };

    const handleScroll = () => {
      const y = window.scrollY;
      const nowPerf = performance.now();
      const deltaUp = lastScrollY - y;

      if (deltaUp > 0) {
        if (nowPerf - lastScrollPerf > 180 || upwardBurstPx === 0) {
          upwardBurstPx = deltaUp;
          upwardBurstStartPerf = nowPerf;
        } else {
          upwardBurstPx += deltaUp;
        }
        if (upwardBurstPx >= 52 && nowPerf - upwardBurstStartPerf <= 260) {
          upwardBurstPx = 0;
          triggerFastScrollUp();
        }
      } else if (deltaUp < 0) {
        upwardBurstPx = 0;
      }

      lastScrollY = y;
      lastScrollPerf = nowPerf;

      if (y > 24) {
        hadScrolledDown = true;
      } else if (y <= 2 && hadScrolledDown) {
        hadScrolledDown = false;
        triggerTopHop();
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        swipeStartY = e.touches[0].clientY;
        swipeStartPerf = performance.now();
        swipeFastTriggered = false;
        if (window.scrollY <= 2) {
          pullStartY = e.touches[0].clientY;
          pullTriggered = false;
        } else {
          pullStartY = null;
          pullTriggered = false;
        }
      } else {
        pullStartY = null;
        pullTriggered = false;
        swipeStartY = null;
        swipeFastTriggered = false;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const curY = e.touches[0].clientY;

      if (swipeStartY !== null && !swipeFastTriggered) {
        const elapsed = performance.now() - swipeStartPerf;
        const dySwipe = curY - swipeStartY;
        if (Math.abs(dySwipe) >= 64 && elapsed <= 190) {
          swipeFastTriggered = true;
          triggerFastScrollUp();
        }
      }

      if (pullStartY === null || pullTriggered) return;
      if (window.scrollY > 4) {
        pullStartY = null;
        return;
      }
      const dy = curY - pullStartY;
      if (dy >= 34) {
        pullTriggered = true;
        triggerTopHop();
      }
    };

    const clearPull = () => {
      pullStartY = null;
      pullTriggered = false;
      swipeStartY = null;
      swipeFastTriggered = false;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', clearPull, { passive: true });
    window.addEventListener('touchcancel', clearPull, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', clearPull);
      window.removeEventListener('touchcancel', clearPull);
    };
  }, []);

  useEffect(() => {
    applyThemeToDocument(
      appState.themeMode,
      appState.accentPalette,
      appState.language,
      appState.customAccentHex
    );
  }, [
    appState.themeMode,
    appState.accentPalette,
    appState.language,
    appState.customAccentHex,
  ]);

  const activeCustomForLang =
    (appState.customTexts[appState.language] as Partial<Record<UiTextKey, string>> | undefined) ||
    EMPTY_CUSTOM_MAP;

  const uiTexts = useMemo(
    () => resolveUiTexts(appState.language, activeCustomForLang),
    [appState.language, activeCustomForLang]
  );

  const alarmCopyRef = useRef({
    title: uiTexts.alarm_finished_title,
    tapToStop: uiTexts.alarm_notif_tap_to_stop,
    restDone: uiTexts.alarm_notif_rest_done,
    stopBtn: uiTexts.alarm_stop_btn,
  });
  alarmCopyRef.current = {
    title: uiTexts.alarm_finished_title,
    tapToStop: uiTexts.alarm_notif_tap_to_stop,
    restDone: uiTexts.alarm_notif_rest_done,
    stopBtn: uiTexts.alarm_stop_btn,
  };

  const activeSessionRoutine = useMemo(
    () =>
      sessionRoutineId ? appState.routines.find((r) => r.id === sessionRoutineId) || null : null,
    [sessionRoutineId, appState.routines]
  );

  const activeSessionCheckedMuscles = useMemo<MuscleGroupId[]>(() => {
    if (!activeSessionRoutine || !categorySupportsMuscles(activeSessionRoutine.category)) {
      return [];
    }
    const completedExercises = activeSessionRoutine.exercises.filter((ex) =>
      Boolean(checkedExercises[ex.id])
    );
    return extractMuscleGroupsFromExercises(completedExercises) ?? [];
  }, [activeSessionRoutine, checkedExercises]);

  const didTriggerHydratedAlarmRef = useRef(false);
  useEffect(() => {
    if (didTriggerHydratedAlarmRef.current) return;
    didTriggerHydratedAlarmRef.current = true;
    if (initialSession.shouldRingAlarmOnMount) {
      startTimerAlarm(
        activeSessionRoutine?.title,
        alarmCopyRef.current,
        Boolean(latestAppStateRef.current.timerNotificationsEnabled)
      );
    } else if (initialSession.countdownEndMs !== null) {
      const remMs = initialSession.countdownEndMs - Date.now();
      if (remMs > 0) {
        armCountdownBackgroundAudio(
          remMs,
          activeSessionRoutine?.title,
          alarmCopyRef.current,
          Boolean(latestAppStateRef.current.timerNotificationsEnabled)
        );
      }
    }
  }, [
    activeSessionRoutine?.title,
    initialSession.shouldRingAlarmOnMount,
    initialSession.countdownEndMs,
  ]);

  // --- 6. Guardado automático + guardado inmediato al salir o bloquear pantalla ---
  const sessionSnapshot: ActiveWorkoutSessionState = {
    activeTab,
    sessionRoutineId,
    isSessionViewOpen,
    sessionOriginTab,
    checkedExercises,
    dropsetByExercise,
    repCounter,
    clockMode,
    stopwatchAccumMs,
    stopwatchStartMs,
    countdownTargetSec,
    countdownRemMs,
    countdownEndMs,
  };

  const latestSessionRef = useRef<ActiveWorkoutSessionState>(sessionSnapshot);
  latestSessionRef.current = sessionSnapshot;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(appState));
      } catch {
        // Ignorar límites de almacenamiento
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [appState]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          WORKOUT_SESSION_STORAGE_KEY,
          JSON.stringify(latestSessionRef.current)
        );
      } catch {
        // Ignorar límites de almacenamiento
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    sessionRoutineId,
    isSessionViewOpen,
    sessionOriginTab,
    checkedExercises,
    dropsetByExercise,
    repCounter,
    clockMode,
    stopwatchAccumMs,
    stopwatchStartMs,
    countdownTargetSec,
    countdownRemMs,
    countdownEndMs,
  ]);

  useEffect(() => {
    const flushAllToStorage = () => {
      try {
        window.localStorage.setItem(
          APP_STATE_STORAGE_KEY,
          JSON.stringify(latestAppStateRef.current)
        );
        window.localStorage.setItem(
          WORKOUT_SESSION_STORAGE_KEY,
          JSON.stringify(latestSessionRef.current)
        );
      } catch {
        // Ignorar límites de almacenamiento
      }
    };

    const handleVisibilityChange = () => {
      const visible = document.visibilityState !== 'hidden';
      setIsDocumentVisible(visible);
      if (!visible) {
        flushAllToStorage();
      } else {
        setNowTick(Date.now());
      }
    };

    window.addEventListener('pagehide', flushAllToStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushAllToStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // --- 7. Relojes en segundo plano + Wake Lock de pantalla durante la sesión ---
  const isStopwatchRunning = stopwatchStartMs !== null;
  const isCountdownRunning = countdownEndMs !== null;
  const isDisplayedClockRunning =
    clockMode === WorkoutClockMode.STOPWATCH ? isStopwatchRunning : isCountdownRunning;
  const isAnyClockRunning = isStopwatchRunning || isCountdownRunning;

  const isWorkoutScreenVisible =
    activeTab === AppTab.TRAINING && isSessionViewOpen && activeSessionRoutine !== null;

  useEffect(() => {
    const shouldKeepScreenOn =
      isDocumentVisible &&
      (isWorkoutScreenVisible ||
        isAlarmRinging ||
        (Boolean(appState.motionStepsEnabled) && activeTab === AppTab.PROFILE));
    if (!shouldKeepScreenOn) return;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let cancelled = false;
    let wakeLockSentinel: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        wakeLockSentinel = lock;
      } catch {
        // Ignorar si el navegador o ahorro de batería bloquea Wake Lock
      }
    };

    void requestWakeLock();

    return () => {
      cancelled = true;
      if (wakeLockSentinel) {
        void wakeLockSentinel.release().catch(() => {});
        wakeLockSentinel = null;
      }
    };
  }, [
    isDocumentVisible,
    isWorkoutScreenVisible,
    isAlarmRinging,
    appState.motionStepsEnabled,
    activeTab,
  ]);

  useEffect(() => {
    if (!isStopwatchRunning && !isCountdownRunning) return;

    const syncRunningClocks = () => {
      const now = Date.now();

      if (countdownEndMs !== null && now >= countdownEndMs) {
        setNowTick(now);
        setCountdownEndMs(null);
        setCountdownRemMs(0);
        setIsAlarmRinging(true);
        startTimerAlarm(
          activeSessionRoutine?.title,
          alarmCopyRef.current,
          Boolean(latestAppStateRef.current.timerNotificationsEnabled)
        );
        return;
      }

      if (
        stopwatchStartMs !== null &&
        stopwatchAccumMs + Math.max(0, now - stopwatchStartMs) >= MAX_STOPWATCH_MS
      ) {
        setNowTick(now);
        setStopwatchAccumMs(MAX_STOPWATCH_MS);
        setStopwatchStartMs(null);
        return;
      }

      setNowTick((prevTick) => {
        const prevSwSec =
          stopwatchStartMs !== null
            ? Math.floor((stopwatchAccumMs + Math.max(0, prevTick - stopwatchStartMs)) / 1000)
            : -1;
        const nextSwSec =
          stopwatchStartMs !== null
            ? Math.floor((stopwatchAccumMs + Math.max(0, now - stopwatchStartMs)) / 1000)
            : -1;

        const prevCdSec =
          countdownEndMs !== null
            ? Math.ceil(Math.max(0, countdownEndMs - prevTick) / 1000)
            : -1;
        const nextCdSec =
          countdownEndMs !== null ? Math.ceil(Math.max(0, countdownEndMs - now) / 1000) : -1;

        if (prevSwSec === nextSwSec && prevCdSec === nextCdSec) {
          return prevTick;
        }
        return now;
      });
    };

    syncRunningClocks();

    // Web Worker dedicado que no sufre congelación al salir a otra app con la sesión abierta
    const workerTicker = createBackgroundClockTicker(syncRunningClocks);
    workerTicker.start(250);

    let exactFinishTimeoutId: number | null = null;
    if (countdownEndMs !== null) {
      const msUntilEnd = Math.max(40, countdownEndMs - Date.now());
      exactFinishTimeoutId = window.setTimeout(syncRunningClocks, msUntilEnd);
    }

    window.addEventListener('pageshow', syncRunningClocks);
    window.addEventListener('focus', syncRunningClocks);

    return () => {
      workerTicker.dispose();
      if (exactFinishTimeoutId !== null) window.clearTimeout(exactFinishTimeoutId);
      window.removeEventListener('pageshow', syncRunningClocks);
      window.removeEventListener('focus', syncRunningClocks);
    };
  }, [
    isStopwatchRunning,
    isCountdownRunning,
    isDocumentVisible,
    stopwatchStartMs,
    stopwatchAccumMs,
    countdownEndMs,
    activeSessionRoutine?.title,
  ]);

  useEffect(() => {
    return () => {
      stopTimerAlarm();
    };
  }, []);

  const liveStopwatchSec = Math.floor(
    (stopwatchAccumMs + (stopwatchStartMs !== null ? Math.max(0, nowTick - stopwatchStartMs) : 0)) /
      1000
  );
  const liveCountdownSec =
    countdownEndMs !== null
      ? Math.ceil(Math.max(0, countdownEndMs - nowTick) / 1000)
      : Math.ceil(countdownRemMs / 1000);

  const displayedSeconds =
    clockMode === WorkoutClockMode.STOPWATCH ? liveStopwatchSec : liveCountdownSec;

  const liveStopwatchMinutes = Math.floor(liveStopwatchSec / 60);
  const sessionFullXp = useMemo(() => {
    if (!activeSessionRoutine) return 0;
    const effectiveDuration = Math.max(activeSessionRoutine.durationMin, liveStopwatchMinutes);
    return previewNextWorkoutMarginalXp(
      todayRecord.completedWorkouts,
      activeSessionRoutine.category,
      effectiveDuration,
      appState.xpFormulas
    );
  }, [
    activeSessionRoutine,
    liveStopwatchMinutes,
    todayRecord.completedWorkouts,
    appState.xpFormulas,
  ]);

  // --- 8. Acciones de Reloj, Sesión, Rutinas, Agenda y Ajustes ---
  const handleStopAlarm = useCallback(() => {
    stopTimerAlarm();
    setIsAlarmRinging(false);
    setCountdownEndMs(null);
    setCountdownRemMs(countdownTargetSec * 1000);
  }, [countdownTargetSec]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'STOP_TIMER_ALARM_FROM_SW') {
        handleStopAlarm();
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage);
    };
  }, [handleStopAlarm]);

  const handleSnoozeOneMinute = useCallback(() => {
    stopTimerAlarm();
    setIsAlarmRinging(false);
    const now = Date.now();
    const snoozeMs = 60 * 1000;
    armCountdownBackgroundAudio(
      snoozeMs,
      activeSessionRoutine?.title,
      alarmCopyRef.current,
      Boolean(latestAppStateRef.current.timerNotificationsEnabled)
    );
    setNowTick(now);
    setClockMode(WorkoutClockMode.COUNTDOWN);
    setCountdownRemMs(snoozeMs);
    setCountdownEndMs(now + snoozeMs);
  }, [activeSessionRoutine?.title]);

  const handleRepeatCountdown = useCallback(() => {
    stopTimerAlarm();
    setIsAlarmRinging(false);
    const now = Date.now();
    const targetMs = countdownTargetSec * 1000;
    armCountdownBackgroundAudio(
      targetMs,
      activeSessionRoutine?.title,
      alarmCopyRef.current,
      Boolean(latestAppStateRef.current.timerNotificationsEnabled)
    );
    setNowTick(now);
    setClockMode(WorkoutClockMode.COUNTDOWN);
    setCountdownRemMs(targetMs);
    setCountdownEndMs(now + targetMs);
  }, [countdownTargetSec, activeSessionRoutine?.title]);

  const handleToggleClockPlayPause = useCallback(() => {
    const now = Date.now();
    setNowTick(now);

    if (clockMode === WorkoutClockMode.STOPWATCH) {
      if (stopwatchStartMs !== null) {
        setStopwatchAccumMs((prev) =>
          Math.min(MAX_STOPWATCH_MS, prev + Math.max(0, now - stopwatchStartMs))
        );
        setStopwatchStartMs(null);
      } else {
        setStopwatchStartMs(now);
      }
      return;
    }

    if (isAlarmRinging) {
      stopTimerAlarm();
      setIsAlarmRinging(false);
    }
    if (countdownEndMs !== null) {
      disarmCountdownBackgroundAudio();
      setCountdownRemMs(Math.max(0, countdownEndMs - now));
      setCountdownEndMs(null);
    } else {
      const baseMs = countdownRemMs > 0 ? countdownRemMs : countdownTargetSec * 1000;
      armCountdownBackgroundAudio(
        baseMs,
        activeSessionRoutine?.title,
        alarmCopyRef.current,
        Boolean(latestAppStateRef.current.timerNotificationsEnabled)
      );
      setCountdownRemMs(baseMs);
      setCountdownEndMs(now + baseMs);
    }
  }, [
    clockMode,
    stopwatchStartMs,
    countdownEndMs,
    countdownRemMs,
    countdownTargetSec,
    isAlarmRinging,
    activeSessionRoutine?.title,
  ]);

  const handleResetClock = useCallback(() => {
    if (clockMode === WorkoutClockMode.STOPWATCH) {
      setStopwatchStartMs(null);
      setStopwatchAccumMs(0);
    } else {
      stopTimerAlarm();
      setIsAlarmRinging(false);
      setCountdownEndMs(null);
      setCountdownRemMs(countdownTargetSec * 1000);
    }
  }, [clockMode, countdownTargetSec]);

  const handleSetCountdownTargetSec = useCallback((seconds: number) => {
    const safeSec = Math.max(1, seconds);
    stopTimerAlarm();
    setIsAlarmRinging(false);
    setCountdownEndMs(null);
    setCountdownTargetSec(safeSec);
    setCountdownRemMs(safeSec * 1000);
  }, []);

  const openOrResumeRoutineSession = useCallback(
    (routineId: string, originTab: AppTab) => {
      setSessionOriginTab(originTab);
      if (sessionRoutineId !== routineId) {
        setSessionRoutineId(routineId);
        setCheckedExercises({});
        setDropsetByExercise({});
        setRepCounter(0);
        setStopwatchStartMs(null);
        setStopwatchAccumMs(0);
      }
      setIsSessionViewOpen(true);
      setXpPulseToken(0);
      setTabTeleportToken((n) => n + 1);
      setActiveTab(AppTab.TRAINING);
    },
    [sessionRoutineId]
  );

  const handleStartRoutineFromTraining = useCallback(
    (routineId: string) => openOrResumeRoutineSession(routineId, AppTab.TRAINING),
    [openOrResumeRoutineSession]
  );

  const handleStartRoutineFromProfile = useCallback(
    (routineId: string) => openOrResumeRoutineSession(routineId, AppTab.PROFILE),
    [openOrResumeRoutineSession]
  );

  const hasCheckedAnyExercise = useMemo(
    () => Object.values(checkedExercises).some(Boolean),
    [checkedExercises]
  );

  const hasDropsetActivity = useMemo(
    () => Object.keys(dropsetByExercise).length > 0,
    [dropsetByExercise]
  );

  const hasSessionProgress =
    isAnyClockRunning ||
    stopwatchAccumMs > 0 ||
    repCounter > 0 ||
    hasCheckedAnyExercise ||
    hasDropsetActivity ||
    countdownRemMs < countdownTargetSec * 1000;

  const handleExitSessionView = useCallback(() => {
    setIsSessionViewOpen(false);
    if (!hasSessionProgress) {
      setSessionRoutineId(null);
    }
    if (sessionOriginTab !== AppTab.PROFILE) {
      setXpPulseToken(0);
    }
    setTabTeleportToken((n) => n + 1);
    setActiveTab(sessionOriginTab);
  }, [hasSessionProgress, sessionOriginTab]);

  const handleToggleExerciseCheck = useCallback((exerciseId: string) => {
    setCheckedExercises((prev) => ({
      ...prev,
      [exerciseId]: !prev[exerciseId],
    }));
  }, []);

  const handleApplyDropsetWeight = useCallback(
    (exerciseId: string, baseWeightKg: number, nextWeightKg: number) => {
      const safeNext = Math.max(0.5, Math.min(2000, Math.round(nextWeightKg * 100) / 100));
      setDropsetByExercise((prev) => {
        const existing = prev[exerciseId];
        if (!existing && safeNext === baseWeightKg) {
          return prev;
        }
        const nextDrops = existing ? [...existing.drops, safeNext].slice(-12) : [safeNext];
        return {
          ...prev,
          [exerciseId]: {
            currentWeightKg: safeNext,
            drops: nextDrops,
          },
        };
      });
    },
    []
  );

  const handleResetDropsetWeight = useCallback((exerciseId: string) => {
    setDropsetByExercise((prev) => {
      if (!(exerciseId in prev)) return prev;
      const { [exerciseId]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const handleSetExerciseInitialWeight = useCallback(
    (routineId: string, exerciseId: string, weightKg: number) => {
      const safeWeight = Math.max(0.5, Math.min(2000, Math.round(weightKg * 100) / 100));
      setAppState((prev) => ({
        ...prev,
        routines: prev.routines.map((routine) => {
          if (routine.id !== routineId) return routine;
          return {
            ...routine,
            exercises: routine.exercises.map((ex) =>
              ex.id === exerciseId ? { ...ex, weightKg: safeWeight, isDropset: true } : ex
            ),
          };
        }),
      }));
    },
    []
  );

  const handleIncrementRepCounter = useCallback(() => {
    setRepCounter((prev) => {
      const next = prev >= 99 ? 0 : prev + 1;
      if (next === 77 && isBugUnlocked) {
        handleUnlockSecretScouter();
      }
      return next;
    });
  }, [isBugUnlocked, handleUnlockSecretScouter]);

  const handleResetRepCounter = useCallback(() => {
    setRepCounter(0);
  }, []);

  const handleChangeRepCounter = useCallback(
    (nextValue: number) => {
      const normalized = ((Math.round(nextValue) % 100) + 100) % 100;
      if (normalized === 77 && isBugUnlocked) {
        handleUnlockSecretScouter();
      }
      setRepCounter(normalized);
    },
    [isBugUnlocked, handleUnlockSecretScouter]
  );

  const handleCompleteWorkout = useCallback(() => {
    if (!activeSessionRoutine) return;

    const totalExercises = activeSessionRoutine.exercises.length;
    const completedExercises = activeSessionRoutine.exercises.filter((ex) =>
      Boolean(checkedExercises[ex.id])
    );
    if (totalExercises > 0 && completedExercises.length === 0) {
      return;
    }
    const completionRatio =
      totalExercises > 0 ? completedExercises.length / totalExercises : 1;

    stopTimerAlarm();
    setIsAlarmRinging(false);

    const now = Date.now();
    const realToday = getTodayDateIso();
    const elapsedStopwatchSec = Math.floor(
      (stopwatchAccumMs + (stopwatchStartMs !== null ? Math.max(0, now - stopwatchStartMs) : 0)) /
        1000
    );
    const stopwatchMinutes = Math.floor(elapsedStopwatchSec / 60);
    const effectiveDurationMin = Math.max(activeSessionRoutine.durationMin, stopwatchMinutes);

    const nowDate = new Date();
    const timeLabel = `${String(nowDate.getHours()).padStart(2, '0')}:${String(
      nowDate.getMinutes()
    ).padStart(2, '0')}`;

    setAppState((prev) => {
      const reconciled =
        prev.lastProcessedDateIso < realToday ? reconcileDaysUntilToday(prev, realToday) : prev;
      const existingToday = getDailyRecord(reconciled.daysByIso, realToday);

      const trainedMuscles = !categorySupportsMuscles(activeSessionRoutine.category)
        ? undefined
        : totalExercises > 0
        ? extractMuscleGroupsFromExercises(completedExercises) ?? []
        : activeSessionRoutine.muscleGroups ?? [];

      const completedStagesDistanceSum =
        totalExercises > 0
          ? Math.round(
              completedExercises.reduce((sum, ex) => sum + (ex.distanceKm ?? 0), 0) * 100
            ) / 100
          : 0;
      const workoutDistanceKm =
        completedStagesDistanceSum > 0
          ? completedStagesDistanceSum
          : activeSessionRoutine.distanceKm !== undefined
          ? Math.round(activeSessionRoutine.distanceKm * completionRatio * 100) / 100
          : undefined;

      const newWorkoutLog: CompletedWorkout = {
        id: `done-${Date.now()}`,
        routineId: activeSessionRoutine.id,
        title: activeSessionRoutine.title,
        category: activeSessionRoutine.category,
        durationMin: effectiveDurationMin,
        ...(workoutDistanceKm && workoutDistanceKm > 0
          ? { distanceKm: workoutDistanceKm }
          : {}),
        xpEarned: 0,
        timeLabel,
        completionRatio,
        ...(trainedMuscles !== undefined ? { muscleGroups: [...trainedMuscles] } : {}),
      };

      const updatedWorkouts = recalculateDailyWorkoutsMarginalXp(
        [newWorkoutLog, ...existingToday.completedWorkouts],
        reconciled.xpFormulas
      );

      return {
        ...reconciled,
        daysByIso: {
          ...reconciled.daysByIso,
          [realToday]: {
            ...existingToday,
            plannedRoutineIds: existingToday.plannedRoutineIds.filter(
              (id) => id !== activeSessionRoutine.id
            ),
            completedWorkouts: updatedWorkouts,
          },
        },
      };
    });

    setTodayIso(realToday);
    setStopwatchStartMs(null);
    setStopwatchAccumMs(0);
    setCountdownEndMs(null);
    setCountdownRemMs(countdownTargetSec * 1000);
    setCheckedExercises({});
    setDropsetByExercise({});
    setRepCounter(0);
    setSessionRoutineId(null);
    setIsSessionViewOpen(false);
    setActiveTab(sessionOriginTab);

    const snap = latestAppStateRef.current;
    const snapToday = getDailyRecord(snap.daysByIso, realToday);
    const estNextRoutineXp = Math.round(
      previewNextWorkoutMarginalXp(
        snapToday.completedWorkouts,
        activeSessionRoutine.category,
        effectiveDurationMin,
        snap.xpFormulas
      ) * completionRatio
    );
    const estNextTotalXp =
      snap.settledTotalXp +
      calculateDailyTotalXp(snapToday, snap.xpFormulas) +
      estNextRoutineXp;
    const willShowBug =
      !snap.hideBug &&
      (isBugUnlocked || estNextTotalXp >= getMinXpForLevel(3));

    if (willShowBug) {
      triggerBugQuickReaction(snap.language);
    }
  }, [
    activeSessionRoutine,
    checkedExercises,
    stopwatchAccumMs,
    stopwatchStartMs,
    countdownTargetSec,
    sessionOriginTab,
    isBugUnlocked,
    triggerBugQuickReaction,
  ]);

  const handleUpdateXpFormulas = useCallback((nextFormulas: XpFormulas) => {
    const realToday = getTodayDateIso();
    setAppState((prev) => {
      const updatedRoutines = prev.routines.map((r) => ({
        ...r,
        xpReward: calculateRoutineBaseXp(r.category, r.durationMin, nextFormulas),
      }));
      const updatedTrashed = prev.trashedRoutines.map((r) => ({
        ...r,
        xpReward: calculateRoutineBaseXp(r.category, r.durationMin, nextFormulas),
      }));

      const nextDaysByIso = { ...prev.daysByIso };
      const existingToday = nextDaysByIso[realToday];
      if (existingToday && existingToday.completedWorkouts.length > 0) {
        nextDaysByIso[realToday] = {
          ...existingToday,
          completedWorkouts: recalculateDailyWorkoutsMarginalXp(
            existingToday.completedWorkouts,
            nextFormulas
          ),
        };
      }

      return {
        ...prev,
        xpFormulas: nextFormulas,
        routines: updatedRoutines,
        trashedRoutines: updatedTrashed,
        daysByIso: nextDaysByIso,
      };
    });
  }, []);

  const handleDeleteCompletedWorkoutToday = useCallback((logId: string) => {
    const realToday = getTodayDateIso();
    setAppState((prev) => {
      const existingToday = getDailyRecord(prev.daysByIso, realToday);
      const remaining = existingToday.completedWorkouts.filter((w) => w.id !== logId);
      return {
        ...prev,
        daysByIso: {
          ...prev.daysByIso,
          [realToday]: {
            ...existingToday,
            completedWorkouts: recalculateDailyWorkoutsMarginalXp(remaining, prev.xpFormulas),
          },
        },
      };
    });
  }, []);

  const handleSaveRoutine = useCallback((routine: Routine, isNew: boolean) => {
    const realToday = getTodayDateIso();
    setAppState((prev) => {
      const isScheduledFutureOrToday =
        !isNew &&
        Object.entries(prev.daysByIso).some(
          ([iso, rec]) => iso >= realToday && rec.plannedRoutineIds.includes(routine.id)
        );

      const nextScheduleChanges = isScheduledFutureOrToday
        ? {
            ...prev.scheduleChangesByDateIso,
            [realToday]: (prev.scheduleChangesByDateIso[realToday] || 0) + 1,
          }
        : prev.scheduleChangesByDateIso;

      return {
        ...prev,
        scheduleChangesByDateIso: nextScheduleChanges,
        routines: isNew
          ? [routine, ...prev.routines]
          : prev.routines.map((r) => (r.id === routine.id ? routine : r)),
      };
    });
  }, []);

  const handleMoveRoutineToTrash = useCallback(
    (routineId: string) => {
      setAppState((prev) => {
        const target = prev.routines.find((r) => r.id === routineId);
        if (!target) return prev;
        return {
          ...prev,
          routines: prev.routines.filter((r) => r.id !== routineId),
          trashedRoutines: [
            { ...target, deletedAt: new Date().toISOString() },
            ...prev.trashedRoutines,
          ],
        };
      });

      if (sessionRoutineId === routineId) {
        stopTimerAlarm();
        setIsAlarmRinging(false);
        setStopwatchStartMs(null);
        setStopwatchAccumMs(0);
        setCountdownEndMs(null);
        setCheckedExercises({});
        setDropsetByExercise({});
        setRepCounter(0);
        setSessionRoutineId(null);
        setIsSessionViewOpen(false);
      }
    },
    [sessionRoutineId]
  );

  const handleRestoreRoutine = useCallback((routineId: string) => {
    setAppState((prev) => {
      const target = prev.trashedRoutines.find((r) => r.id === routineId);
      if (!target) return prev;
      const { deletedAt: _removed, ...restoredRoutine } = target;
      return {
        ...prev,
        routines: [restoredRoutine, ...prev.routines],
        trashedRoutines: prev.trashedRoutines.filter((r) => r.id !== routineId),
      };
    });
  }, []);

  const handlePermanentDeleteRoutine = useCallback((routineId: string) => {
    setAppState((prev) => {
      const nextDaysByIso: Record<string, DailyActivityRecord> = {};
      for (const [iso, rec] of Object.entries(prev.daysByIso)) {
        nextDaysByIso[iso] = {
          ...rec,
          plannedRoutineIds: rec.plannedRoutineIds.filter((id) => id !== routineId),
        };
      }
      return {
        ...prev,
        trashedRoutines: prev.trashedRoutines.filter((r) => r.id !== routineId),
        daysByIso: nextDaysByIso,
      };
    });
  }, []);

  const handleAssignRoutineToDate = useCallback((dateIso: string, routineId: string) => {
    const realToday = getTodayDateIso();
    if (dateIso < realToday) return;
    setAppState((prev) => {
      const dayRecord = getDailyRecord(prev.daysByIso, dateIso);
      if (dayRecord.plannedRoutineIds.includes(routineId)) return prev;
      return {
        ...prev,
        daysByIso: {
          ...prev.daysByIso,
          [dateIso]: {
            ...dayRecord,
            plannedRoutineIds: [...dayRecord.plannedRoutineIds, routineId],
          },
        },
      };
    });
  }, []);

  const handleRemoveScheduledRoutine = useCallback((dateIso: string, routineId: string) => {
    const realToday = getTodayDateIso();
    if (dateIso < realToday) return;
    setAppState((prev) => {
      const dayRecord = getDailyRecord(prev.daysByIso, dateIso);
      if (!dayRecord.plannedRoutineIds.includes(routineId)) return prev;
      return {
        ...prev,
        scheduleChangesByDateIso: {
          ...prev.scheduleChangesByDateIso,
          [realToday]: (prev.scheduleChangesByDateIso[realToday] || 0) + 1,
        },
        daysByIso: {
          ...prev.daysByIso,
          [dateIso]: {
            ...dayRecord,
            plannedRoutineIds: dayRecord.plannedRoutineIds.filter((id) => id !== routineId),
          },
        },
      };
    });
  }, []);

  const handleMoveScheduledRoutine = useCallback(
    (fromDateIso: string, toDateIso: string, routineId: string) => {
      const realToday = getTodayDateIso();
      if (fromDateIso === toDateIso || fromDateIso < realToday || toDateIso < realToday) {
        return;
      }
      setAppState((prev) => {
        const sourceDay = getDailyRecord(prev.daysByIso, fromDateIso);
        const destDay = getDailyRecord(prev.daysByIso, toDateIso);

        const nextSourceIds = sourceDay.plannedRoutineIds.filter((id) => id !== routineId);
        const nextDestIds = destDay.plannedRoutineIds.includes(routineId)
          ? destDay.plannedRoutineIds
          : [...destDay.plannedRoutineIds, routineId];

        return {
          ...prev,
          scheduleChangesByDateIso: {
            ...prev.scheduleChangesByDateIso,
            [realToday]: (prev.scheduleChangesByDateIso[realToday] || 0) + 1,
          },
          daysByIso: {
            ...prev.daysByIso,
            [fromDateIso]: { ...sourceDay, plannedRoutineIds: nextSourceIds },
            [toDateIso]: { ...destDay, plannedRoutineIds: nextDestIds },
          },
        };
      });
    },
    []
  );

  const handleCopyCompletedWorkoutToDate = useCallback(
    (workoutLog: CompletedWorkout, toDateIso: string) => {
      const realToday = getTodayDateIso();
      if (toDateIso < realToday) return;

      setAppState((prev) => {
        let targetRoutineId = workoutLog.routineId;
        let nextRoutines = prev.routines;
        let nextTrashed = prev.trashedRoutines;

        const existsInActive =
          targetRoutineId && nextRoutines.some((r) => r.id === targetRoutineId);

        if (!existsInActive) {
          const foundInTrash = targetRoutineId
            ? nextTrashed.find((r) => r.id === targetRoutineId)
            : undefined;

          if (foundInTrash) {
            const { deletedAt: _removed, ...restored } = foundInTrash;
            nextRoutines = [restored, ...nextRoutines];
            nextTrashed = nextTrashed.filter((r) => r.id !== foundInTrash.id);
            targetRoutineId = restored.id;
          } else {
            const recreatedId = `rt-${Date.now()}`;
            const recreatedRoutine: Routine = {
              id: recreatedId,
              title: workoutLog.title,
              category: workoutLog.category,
              durationMin: workoutLog.durationMin,
              ...(workoutLog.distanceKm !== undefined
                ? { distanceKm: workoutLog.distanceKm }
                : {}),
              xpReward: calculateRoutineBaseXp(
                workoutLog.category,
                workoutLog.durationMin,
                prev.xpFormulas
              ),
              exercises: [],
              ...(workoutLog.muscleGroups && workoutLog.muscleGroups.length > 0
                ? { muscleGroups: [...workoutLog.muscleGroups] }
                : {}),
            };
            nextRoutines = [recreatedRoutine, ...nextRoutines];
            targetRoutineId = recreatedId;
          }
        }

        if (!targetRoutineId) return prev;

        const destDay = getDailyRecord(prev.daysByIso, toDateIso);
        const nextDestIds = destDay.plannedRoutineIds.includes(targetRoutineId)
          ? destDay.plannedRoutineIds
          : [...destDay.plannedRoutineIds, targetRoutineId];

        return {
          ...prev,
          routines: nextRoutines,
          trashedRoutines: nextTrashed,
          daysByIso: {
            ...prev.daysByIso,
            [toDateIso]: { ...destDay, plannedRoutineIds: nextDestIds },
          },
        };
      });
    },
    []
  );

  const handleRepeatPreviousWeek = useCallback((targetWeekMondayIso: string) => {
    const realToday = getTodayDateIso();
    const prevWeekMondayIso = addDaysToIso(targetWeekMondayIso, -7);

    setAppState((prev) => {
      const activeIds = new Set(prev.routines.map((r) => r.id));
      const nextDaysByIso = { ...prev.daysByIso };

      for (let i = 0; i < 7; i += 1) {
        const sourceIso = addDaysToIso(prevWeekMondayIso, i);
        const targetIso = addDaysToIso(targetWeekMondayIso, i);
        if (targetIso < realToday) continue;

        const sourceDay = prev.daysByIso[sourceIso];
        if (!sourceDay) continue;

        const routineIdsToCopy: string[] = [];
        for (const workout of sourceDay.completedWorkouts) {
          if (
            workout.routineId &&
            activeIds.has(workout.routineId) &&
            !routineIdsToCopy.includes(workout.routineId)
          ) {
            routineIdsToCopy.push(workout.routineId);
          }
        }
        for (const plannedId of sourceDay.plannedRoutineIds) {
          if (activeIds.has(plannedId) && !routineIdsToCopy.includes(plannedId)) {
            routineIdsToCopy.push(plannedId);
          }
        }

        if (routineIdsToCopy.length === 0) continue;

        const existingTarget = getDailyRecord(nextDaysByIso, targetIso);
        const completedTodayIds = new Set(
          targetIso === realToday
            ? existingTarget.completedWorkouts
                .map((w) => w.routineId)
                .filter((id): id is string => Boolean(id))
            : []
        );

        const mergedPlanned = [...existingTarget.plannedRoutineIds];
        for (const id of routineIdsToCopy) {
          if (!mergedPlanned.includes(id) && !completedTodayIds.has(id)) {
            mergedPlanned.push(id);
          }
        }

        nextDaysByIso[targetIso] = {
          ...existingTarget,
          plannedRoutineIds: mergedPlanned,
        };
      }

      const nextDismissed = prev.dismissedRepeatWeeks.includes(targetWeekMondayIso)
        ? prev.dismissedRepeatWeeks
        : [...prev.dismissedRepeatWeeks, targetWeekMondayIso];

      return {
        ...prev,
        daysByIso: nextDaysByIso,
        dismissedRepeatWeeks: nextDismissed,
      };
    });
  }, []);

  const handleDismissRepeatWeek = useCallback((targetWeekMondayIso: string) => {
    setAppState((prev) => ({
      ...prev,
      dismissedRepeatWeeks: prev.dismissedRepeatWeeks.includes(targetWeekMondayIso)
        ? prev.dismissedRepeatWeeks
        : [...prev.dismissedRepeatWeeks, targetWeekMondayIso],
    }));
  }, []);

  const handleUpdateStepGoal = useCallback((newGoal: number) => {
    const safeGoal = Math.max(500, Math.min(200_000, newGoal));
    setAppState((prev) => ({ ...prev, stepGoal: safeGoal }));
  }, []);

  const handleChangeThemeMode = useCallback((themeMode: ThemeMode) => {
    setAppState((prev) => ({ ...prev, themeMode }));
  }, []);

  const handleChangeAccentPalette = useCallback((accentPalette: AccentPaletteId) => {
    setAppState((prev) => {
      if (accentPalette === 'custom' && !normalizeHexColor(prev.customAccentHex)) {
        return prev;
      }
      return { ...prev, accentPalette };
    });
  }, []);

  const handleApplyCustomAccentHex = useCallback((rawHex: string) => {
    const normalized = normalizeHexColor(rawHex);
    if (!normalized) return;
    setAppState((prev) => ({
      ...prev,
      accentPalette: 'custom',
      customAccentHex: normalized,
    }));
  }, []);

  const handleSelectInitialLanguage = useCallback((chosenLanguage: AppLanguage) => {
    setActiveTab(AppTab.PROFILE);
    setAppState((prev) => {
      const updatedState: AppPersistentState = {
        ...prev,
        language: chosenLanguage,
        hasSelectedInitialLanguage: true,
        xpFormulas: localizeXpFormulasIfDefault(prev.xpFormulas, chosenLanguage),
      };
      try {
        window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(updatedState));
      } catch {
        // Ignorar límites de almacenamiento
      }
      return updatedState;
    });
  }, []);

  const handleOpenTutorial = useCallback(() => {
    setSelectedDateIso(getTodayDateIso());
    setActiveTab(AppTab.PROFILE);
    setManualTutorialOpen(true);
  }, []);

  const handleCloseTutorial = useCallback(() => {
    setManualTutorialOpen(false);
    setActiveTab(AppTab.PROFILE);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setAppState((prev) => {
      if (prev.hasCompletedTutorial) return prev;
      const updatedState: AppPersistentState = {
        ...prev,
        hasCompletedTutorial: true,
      };
      try {
        window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(updatedState));
      } catch {
        // Ignorar límites de almacenamiento
      }
      return updatedState;
    });
  }, []);

  const handleChangeLanguage = useCallback((language: AppLanguage) => {
    setAppState((prev) => ({
      ...prev,
      language,
      hasSelectedInitialLanguage: true,
      xpFormulas: localizeXpFormulasIfDefault(prev.xpFormulas, language),
    }));
  }, []);

  const handleExportBackup = useCallback(() => {
    try {
      const jsonContent = serializeAppStateBackup(latestAppStateRef.current);
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `upgrade-backup-${getTodayDateIso()}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Ignorar restricciones de descarga
    }
  }, []);

  const handleImportBackupJson = useCallback((rawText: string): boolean => {
    const realToday = getTodayDateIso();
    const importedState = parseAppStateBackup(rawText, realToday);
    if (!importedState) return false;

    stopTimerAlarm();
    setIsAlarmRinging(false);
    setStopwatchStartMs(null);
    setStopwatchAccumMs(0);
    setCountdownEndMs(null);
    setCountdownRemMs(countdownTargetSec * 1000);
    setCheckedExercises({});
    setDropsetByExercise({});
    setRepCounter(0);
    setSessionRoutineId(null);
    setIsSessionViewOpen(false);
    setTrophyQueue([]);
    setBugMilestoneQueue([]);
    clearBugMoodTimers();
    setBugMood('none');
    setBugMarquee(null);
    setTodayIso(realToday);
    setSelectedDateIso(realToday);

    const importedEarnedToday = calculateDailyTotalXp(
      getDailyRecord(importedState.daysByIso, realToday),
      importedState.xpFormulas
    );
    lastDisplayedXpRef.current = Math.min(
      MAX_TOTAL_XP,
      importedState.settledTotalXp + importedEarnedToday
    );

    setAppState(importedState);
    try {
      window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(importedState));
    } catch {
      // Ignorar límites de almacenamiento
    }
    return true;
  }, [countdownTargetSec, clearBugMoodTimers]);

  const handleUpdateCustomText = useCallback((key: UiTextKey, value: string) => {
    setAppState((prev) => {
      const lang = prev.language;
      const existingLangMap = prev.customTexts[lang] || {};
      if (existingLangMap[key] === value) return prev;
      return {
        ...prev,
        customTexts: {
          ...prev.customTexts,
          [lang]: {
            ...existingLangMap,
            [key]: value,
          },
        },
      };
    });
  }, []);

  const handleResetCustomText = useCallback((key: UiTextKey) => {
    setAppState((prev) => {
      const lang = prev.language;
      const existingLangMap = prev.customTexts[lang];
      if (!existingLangMap || !(key in existingLangMap)) return prev;
      const { [key]: _removed, ...restLangMap } = existingLangMap;
      return {
        ...prev,
        customTexts: {
          ...prev.customTexts,
          [lang]: restLangMap,
        },
      };
    });
  }, []);

  const handleResetAllCustomTexts = useCallback(() => {
    setAppState((prev) => {
      const lang = prev.language;
      if (!prev.customTexts[lang] || Object.keys(prev.customTexts[lang]!).length === 0) {
        return prev;
      }
      const nextCustomTexts = { ...prev.customTexts };
      delete nextCustomTexts[lang];
      return {
        ...prev,
        customTexts: nextCustomTexts,
      };
    });
  }, []);

  const i18nContextValue = useMemo<I18nContextValue>(
    () => ({
      language: appState.language,
      locale: appState.language === 'en' ? 'en-US' : 'es-ES',
      t: uiTexts,
      defaultT: DEFAULT_UI_TEXTS[appState.language],
      customForLang: activeCustomForLang,
      formatCategory: (category: RoutineCategory) => getLocalizedCategoryLabel(category, uiTexts),
      onChangeLanguage: handleChangeLanguage,
      onUpdateCustomText: handleUpdateCustomText,
      onResetCustomText: handleResetCustomText,
      onResetAllCustomTexts: handleResetAllCustomTexts,
    }),
    [
      appState.language,
      uiTexts,
      activeCustomForLang,
      handleChangeLanguage,
      handleUpdateCustomText,
      handleResetCustomText,
      handleResetAllCustomTexts,
    ]
  );

  const bottomNavItems = useMemo(
    () => [
      { id: AppTab.TRAINING, label: uiTexts.nav_training, icon: Dumbbell },
      { id: AppTab.PROFILE, label: uiTexts.nav_profile, icon: User },
      { id: AppTab.STATS, label: uiTexts.nav_stats, icon: BarChart3 },
    ],
    [uiTexts.nav_training, uiTexts.nav_profile, uiTexts.nav_stats]
  );

  const handleChangeHideBug = useCallback(
    (nextHide: boolean) => {
      if (nextHide) {
        clearBugMoodTimers();
        setBugMood('none');
        setBugMarquee(null);
      }
      setAppState((prev) => ({
        ...prev,
        hideBug: nextHide,
      }));
    },
    [clearBugMoodTimers]
  );

  const handleChangeMuteBugText = useCallback((nextMute: boolean) => {
    if (nextMute) {
      setBugMarquee(null);
    }
    setAppState((prev) => ({
      ...prev,
      muteBugText: nextMute,
    }));
  }, []);

  const handleChangeMuteBugBounceSound = useCallback((nextMute: boolean) => {
    setAppState((prev) => ({
      ...prev,
      muteBugBounceSound: nextMute,
    }));
  }, []);

  const handleChangeBugMusicMode = useCallback((nextMode: BugMusicMode) => {
    setAppState((prev) => ({
      ...prev,
      bugMusicMode: nextMode,
    }));
  }, []);

  const handleChangeBugSelectedHat = useCallback((nextHat: BugHatId) => {
    setAppState((prev) => ({
      ...prev,
      bugSelectedHat: nextHat,
    }));
  }, []);

  const handleChangeBugHatColor = useCallback(
    (hat: BugWearableHatId, color: RgbColor) => {
      const sanitized = sanitizeRgbColor(color, DEFAULT_BUG_HAT_COLORS[hat]);
      setAppState((prev) => ({
        ...prev,
        bugHatColors: {
          ...prev.bugHatColors,
          [hat]: sanitized,
        },
      }));
    },
    []
  );

  const handleChangeBugDisableSuperSaiyan = useCallback((nextDisable: boolean) => {
    setAppState((prev) => ({
      ...prev,
      bugDisableSuperSaiyan: nextDisable,
    }));
  }, []);

  const handleAddCustomBugPhrase = useCallback(
    (category: BugDialogueCategory, rawText: string) => {
      const trimmed = rawText.trim().slice(0, 180);
      if (!trimmed) return;
      const newEntry: CustomBugPhrase = {
        id: `cbp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category,
        text: trimmed,
      };
      setAppState((prev) => {
        const lang = prev.language;
        const existingList = prev.customBugPhrases?.[lang] || [];
        return {
          ...prev,
          customBugPhrases: {
            ...prev.customBugPhrases,
            [lang]: [newEntry, ...existingList],
          },
        };
      });
    },
    []
  );

  const handleUpdateCustomBugPhrase = useCallback((id: string, nextText: string) => {
    const trimmed = nextText.trim().slice(0, 180);
    if (!trimmed) return;
    setAppState((prev) => {
      const lang = prev.language;
      const existingList = prev.customBugPhrases?.[lang];
      if (!existingList) return prev;
      return {
        ...prev,
        customBugPhrases: {
          ...prev.customBugPhrases,
          [lang]: existingList.map((item) =>
            item.id === id ? { ...item, text: trimmed } : item
          ),
        },
      };
    });
  }, []);

  const handleDeleteCustomBugPhrase = useCallback((id: string) => {
    setAppState((prev) => {
      const lang = prev.language;
      const existingList = prev.customBugPhrases?.[lang];
      if (!existingList) return prev;
      const filtered = existingList.filter((item) => item.id !== id);
      const nextMap = { ...prev.customBugPhrases };
      if (filtered.length > 0) {
        nextMap[lang] = filtered;
      } else {
        delete nextMap[lang];
      }
      return {
        ...prev,
        customBugPhrases: Object.keys(nextMap).length > 0 ? nextMap : undefined,
      };
    });
  }, []);

  const handleDeleteDefaultBugPhrase = useCallback((key: UiTextKey) => {
    setAppState((prev) => {
      const lang = prev.language;
      const existingDeleted = prev.deletedBugPhraseKeys?.[lang] || [];
      if (existingDeleted.includes(key)) return prev;
      return {
        ...prev,
        deletedBugPhraseKeys: {
          ...prev.deletedBugPhraseKeys,
          [lang]: [...existingDeleted, key],
        },
      };
    });
  }, []);

  const handleRestoreDeletedBugPhrases = useCallback(() => {
    setAppState((prev) => {
      const lang = prev.language;
      if (!prev.deletedBugPhraseKeys?.[lang]?.length) return prev;
      const nextDeleted = { ...prev.deletedBugPhraseKeys };
      delete nextDeleted[lang];
      return {
        ...prev,
        deletedBugPhraseKeys: Object.keys(nextDeleted).length > 0 ? nextDeleted : undefined,
      };
    });
  }, []);

  const handleUpdateDaySteps = useCallback(
    (dateIso: string, nextSteps: number) => {
      const realToday = getTodayDateIso();
      if (dateIso !== realToday) return;
      const safeSteps = Math.max(0, Math.min(200_000, nextSteps));
      const previousSteps = getDailyRecord(latestAppStateRef.current.daysByIso, dateIso).steps;

      setAppState((prev) => {
        const existing = getDailyRecord(prev.daysByIso, dateIso);
        return {
          ...prev,
          daysByIso: {
            ...prev.daysByIso,
            [dateIso]: {
              ...existing,
              steps: safeSteps,
            },
          },
        };
      });

      const snap = latestAppStateRef.current;
      const existingToday = getDailyRecord(snap.daysByIso, dateIso);
      const nextDayTotalXp = calculateDailyTotalXp(
        { ...existingToday, steps: safeSteps },
        snap.xpFormulas
      );
      const willShowBug =
        !snap.hideBug &&
        (isBugUnlocked || snap.settledTotalXp + nextDayTotalXp >= getMinXpForLevel(3));

      if (safeSteps > previousSteps && willShowBug) {
        triggerBugQuickReaction(snap.language);
      }
    },
    [isBugUnlocked, triggerBugQuickReaction]
  );

  const handleSensorStepsDetected = useCallback((deltaSteps: number) => {
    if (deltaSteps <= 0) return;
    const realToday = getTodayDateIso();
    setAppState((prev) => {
      const existing = getDailyRecord(prev.daysByIso, realToday);
      const nextSteps = Math.min(200_000, existing.steps + deltaSteps);
      if (nextSteps === existing.steps) return prev;
      return {
        ...prev,
        daysByIso: {
          ...prev.daysByIso,
          [realToday]: {
            ...existing,
            steps: nextSteps,
          },
        },
      };
    });
  }, []);

  const handleSyncHardwareTotalSteps = useCallback((hardwareTodaySteps: number) => {
    const safeHwSteps = Math.max(0, Math.min(200_000, Math.round(hardwareTodaySteps)));
    if (safeHwSteps <= 0) return;
    const realToday = getTodayDateIso();
    setAppState((prev) => {
      const existing = getDailyRecord(prev.daysByIso, realToday);
      const nextSteps = Math.max(existing.steps, safeHwSteps);
      if (nextSteps === existing.steps) return prev;
      return {
        ...prev,
        daysByIso: {
          ...prev.daysByIso,
          [realToday]: {
            ...existing,
            steps: nextSteps,
          },
        },
      };
    });
  }, []);

  const mobileStepSensor = useMobileStepSensor({
    enabled: Boolean(appState.motionStepsEnabled),
    currentSavedSteps: todayRecord.steps,
    onStepsDetected: handleSensorStepsDetected,
    onSyncHardwareTotalSteps: handleSyncHardwareTotalSteps,
  });

  const canBugSuperSaiyan = isBugSuperSaiyanUnlocked && !appState.bugDisableSuperSaiyan;

  const bugReactionContextValue = useMemo<BugReactionContextValue>(
    () => ({
      isAlarmRinging,
      trophyCelebrateToken,
      scrollTopHopToken,
      fastScrollUpToken,
      tabTeleportToken,
      muteBounceSound: Boolean(appState.muteBugBounceSound),
      isSleepHours,
      musicMode: bugMusicMode,
      equippedHat,
      equippedHatColor,
      isGrown: isBugGrown,
      canSuperSaiyan: canBugSuperSaiyan,
      onUnlockSecretCrown: handleUnlockSecretCrown,
    }),
    [
      isAlarmRinging,
      trophyCelebrateToken,
      scrollTopHopToken,
      fastScrollUpToken,
      tabTeleportToken,
      appState.muteBugBounceSound,
      isSleepHours,
      bugMusicMode,
      equippedHat,
      equippedHatColor,
      isBugGrown,
      canBugSuperSaiyan,
      handleUnlockSecretCrown,
    ]
  );

  const handleCompleteDevicePermissions = useCallback(
    (result: { timerNotificationsEnabled: boolean; motionStepsEnabled: boolean }) => {
      setAppState((prev) => {
        const updatedState: AppPersistentState = {
          ...prev,
          hasPromptedDevicePermissions: true,
          timerNotificationsEnabled: result.timerNotificationsEnabled,
          motionStepsEnabled: result.motionStepsEnabled,
        };
        try {
          window.localStorage.setItem(APP_STATE_STORAGE_KEY, JSON.stringify(updatedState));
        } catch {
          // Ignorar límites de almacenamiento
        }
        return updatedState;
      });
    },
    []
  );

  const handleChangeTimerNotifications = useCallback((enabled: boolean) => {
    setAppState((prev) => ({
      ...prev,
      hasPromptedDevicePermissions: true,
      timerNotificationsEnabled: enabled,
    }));
  }, []);

  const handleChangeMotionSteps = useCallback((enabled: boolean) => {
    setAppState((prev) => ({
      ...prev,
      hasPromptedDevicePermissions: true,
      motionStepsEnabled: enabled,
    }));
  }, []);

  const showFloatingSessionBar =
    (isAnyClockRunning || (activeSessionRoutine !== null && hasSessionProgress)) &&
    !isWorkoutScreenVisible;
  const floatingClockText = isCountdownRunning
    ? formatCompactClock(liveCountdownSec)
    : isStopwatchRunning
    ? formatCompactClock(liveStopwatchSec)
    : clockMode === WorkoutClockMode.COUNTDOWN
    ? formatCompactClock(liveCountdownSec)
    : formatCompactClock(liveStopwatchSec);

  const handleOpenFloatingSession = useCallback(() => {
    setIsSessionViewOpen(true);
    setTabTeleportToken((n) => n + 1);
    setActiveTab(AppTab.TRAINING);
  }, []);

  const handleToggleFloatingClock = useCallback(() => {
    const now = Date.now();
    setNowTick(now);
    if (isAnyClockRunning) {
      if (isCountdownRunning && countdownEndMs !== null) {
        disarmCountdownBackgroundAudio();
        setCountdownRemMs(Math.max(0, countdownEndMs - now));
        setCountdownEndMs(null);
      }
      if (isStopwatchRunning && stopwatchStartMs !== null) {
        setStopwatchAccumMs((prev) =>
          Math.min(MAX_STOPWATCH_MS, prev + Math.max(0, now - stopwatchStartMs))
        );
        setStopwatchStartMs(null);
      }
    } else if (clockMode === WorkoutClockMode.COUNTDOWN) {
      const baseMs = countdownRemMs > 0 ? countdownRemMs : countdownTargetSec * 1000;
      armCountdownBackgroundAudio(
        baseMs,
        activeSessionRoutine?.title,
        alarmCopyRef.current,
        Boolean(latestAppStateRef.current.timerNotificationsEnabled)
      );
      setCountdownRemMs(baseMs);
      setCountdownEndMs(now + baseMs);
    } else {
      setStopwatchStartMs(now);
    }
  }, [
    isAnyClockRunning,
    isCountdownRunning,
    countdownEndMs,
    isStopwatchRunning,
    stopwatchStartMs,
    clockMode,
    countdownRemMs,
    countdownTargetSec,
    activeSessionRoutine?.title,
  ]);

  return (
    <I18nContext.Provider value={i18nContextValue}>
      <BugReactionContext.Provider value={bugReactionContextValue}>
        <div className="min-h-screen text-fg flex flex-col safe-bottom-page">
        {/* Pregunta inicial única al abrir la app por primera vez: English or Spanish? */}
        <FirstLaunchLanguageModal
          isOpen={!appState.hasSelectedInitialLanguage}
          onSelectLanguage={handleSelectInitialLanguage}
        />

        {/* Tutorial interactivo guiado sobre la propia interfaz en el primer inicio (o bajo demanda) */}
        <OnboardingTutorial
          isOpen={isTutorialOpen}
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          onClose={handleCloseTutorial}
        />

        {/* Solicitud única e informativa de permisos opcionales del móvil */}
        <DevicePermissionsModal
          isOpen={isPermissionsModalOpen}
          onComplete={handleCompleteDevicePermissions}
        />

        {/* Notificación superior de Trofeo Desbloqueado */}
        {currentTrophyBanner && !isAlarmRinging && (
          <TrophyUnlockBanner
            key={currentTrophyBanner.id}
            trophy={currentTrophyBanner}
            onDismiss={handleDismissTrophyBanner}
          />
        )}

        {/* Notificación superior de Desbloqueo de Bug (Nivel 3, Nivel 5 y Nivel 50) */}
        {currentBugBanner && !currentTrophyBanner && !isAlarmRinging && (
          <BugUnlockBanner
            key={currentBugBanner}
            milestone={currentBugBanner}
            onDismiss={handleDismissBugBanner}
          />
        )}

        {/* Carrusel luminoso de metro de Bug (sin bocadillos; solo se activa en eventos específicos y si no está silenciado) */}
        {(bugMarquee?.isSecret || (showBug && !appState.muteBugText)) &&
          bugMarquee &&
          !isTutorialOpen &&
          !isLevel100FinaleOpen && (
            <BugSubwayMarquee
              message={bugMarquee.text}
              messageId={bugMarquee.id}
              shiftedDown={Boolean(currentTrophyBanner || currentBugBanner || isAlarmRinging)}
              onComplete={handleCompleteBugMarquee}
            />
          )}

        {/* Alerta superior de Temporizador Finalizado */}
        {isAlarmRinging && (
          <div
            role="alertdialog"
            aria-labelledby="alarm-banner-title"
            className="fixed safe-top-banner left-4 right-4 max-w-md mx-auto z-50 modal-sheet ndot-surface rounded-md p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <BellRing className="w-4 h-4 text-accent shrink-0" />
                <div className="min-w-0">
                  <p
                    id="alarm-banner-title"
                    className="font-display text-sm font-bold uppercase tracking-wide text-fg truncate"
                  >
                    {uiTexts.alarm_finished_title}
                  </p>
                  {activeSessionRoutine && (
                    <p className="text-xs text-fg-muted truncate">{activeSessionRoutine.title}</p>
                  )}
                </div>
              </div>
              <span className="font-mono text-base font-bold text-accent tabular-nums shrink-0">
                00:00
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleStopAlarm}
                className="btn-primary min-h-[42px] px-3 text-xs flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Square className="w-3 h-3 fill-current shrink-0" />
                <span>{uiTexts.alarm_stop_btn}</span>
              </button>

              <button
                type="button"
                onClick={handleSnoozeOneMinute}
                className="btn-secondary min-h-[42px] px-3 text-xs font-mono whitespace-nowrap"
              >
                {uiTexts.alarm_snooze_btn}
              </button>

              <button
                type="button"
                onClick={handleRepeatCountdown}
                className="btn-secondary min-h-[42px] px-3 text-xs flex items-center justify-center gap-1 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>{uiTexts.alarm_repeat_btn}</span>
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 safe-top-main pb-8">
          {activeTab === AppTab.TRAINING && (
            <TrainingView
              xpFormulas={appState.xpFormulas}
              routines={appState.routines}
              trashedRoutines={appState.trashedRoutines}
              activeSessionRoutine={
                isSessionViewOpen && !isTutorialOpen ? activeSessionRoutine : null
              }
              sessionFullXp={sessionFullXp}
              checkedExercises={checkedExercises}
              onToggleExerciseCheck={handleToggleExerciseCheck}
              dropsetByExercise={dropsetByExercise}
              onApplyDropsetWeight={handleApplyDropsetWeight}
              onResetDropsetWeight={handleResetDropsetWeight}
              onSetExerciseInitialWeight={handleSetExerciseInitialWeight}
              repCounter={repCounter}
              onIncrementRepCounter={handleIncrementRepCounter}
              onResetRepCounter={handleResetRepCounter}
              onChangeRepCounter={handleChangeRepCounter}
              clockMode={clockMode}
              onChangeClockMode={setClockMode}
              isClockRunning={isDisplayedClockRunning}
              displayedSeconds={displayedSeconds}
              countdownTargetSec={countdownTargetSec}
              onToggleClockPlayPause={handleToggleClockPlayPause}
              onResetClock={handleResetClock}
              onSetCountdownTargetSec={handleSetCountdownTargetSec}
              onStartRoutine={handleStartRoutineFromTraining}
              onExitSession={handleExitSessionView}
              onCompleteWorkout={handleCompleteWorkout}
              onSaveRoutine={handleSaveRoutine}
              onMoveRoutineToTrash={handleMoveRoutineToTrash}
              onRestoreRoutine={handleRestoreRoutine}
              onPermanentDeleteRoutine={handlePermanentDeleteRoutine}
              showBug={showBug}
              bugMood={bugMood}
              canPetBug={isBugPetUnlocked}
              canLaunchBugHockey={isBugHockeyUnlocked}
            />
          )}

          {activeTab === AppTab.PROFILE && (
            <ProfileView
              todayIso={todayIso}
              level={currentLevel}
              maxLevel={MAX_LEVEL}
              totalXp={totalXp}
              levelMinXp={levelMinXp}
              nextLevelXp={nextLevelXp}
              xpPulseToken={xpPulseToken}
              lastXpGain={lastXpGain}
              stepGoal={appState.stepGoal}
              onUpdateStepGoal={handleUpdateStepGoal}
              themeMode={appState.themeMode}
              onChangeThemeMode={handleChangeThemeMode}
              accentPalette={appState.accentPalette}
              onChangeAccentPalette={handleChangeAccentPalette}
              customAccentHex={appState.customAccentHex}
              onApplyCustomAccentHex={handleApplyCustomAccentHex}
              xpFormulas={appState.xpFormulas}
              onUpdateXpFormulas={handleUpdateXpFormulas}
              daysByIso={appState.daysByIso}
              routines={appState.routines}
              trashedRoutines={appState.trashedRoutines}
              activeSessionMuscles={activeSessionCheckedMuscles}
              selectedDateIso={selectedDateIso}
              onSelectDate={setSelectedDateIso}
              dismissedRepeatWeeks={appState.dismissedRepeatWeeks}
              onRepeatPreviousWeek={handleRepeatPreviousWeek}
              onDismissRepeatWeek={handleDismissRepeatWeek}
              onAssignRoutineToDate={handleAssignRoutineToDate}
              onRemoveScheduledRoutine={handleRemoveScheduledRoutine}
              onMoveScheduledRoutine={handleMoveScheduledRoutine}
              onCopyCompletedWorkoutToDate={handleCopyCompletedWorkoutToDate}
              onDeleteCompletedWorkoutToday={handleDeleteCompletedWorkoutToday}
              onUpdateDaySteps={handleUpdateDaySteps}
              onStartRoutineFromProfile={handleStartRoutineFromProfile}
              onExportBackup={handleExportBackup}
              onImportBackupJson={handleImportBackupJson}
              isBugUnlocked={isBugUnlocked}
              isBugCustomizationUnlocked={isBugCustomizationUnlocked}
              hideBug={hideBug}
              onChangeHideBug={handleChangeHideBug}
              muteBugText={Boolean(appState.muteBugText)}
              onChangeMuteBugText={handleChangeMuteBugText}
              muteBugBounceSound={Boolean(appState.muteBugBounceSound)}
              onChangeMuteBugBounceSound={handleChangeMuteBugBounceSound}
              bugMusicMode={bugMusicMode}
              onChangeBugMusicMode={handleChangeBugMusicMode}
              bugSelectedHat={appState.bugSelectedHat ?? 'none'}
              onChangeBugSelectedHat={handleChangeBugSelectedHat}
              bugHatColors={appState.bugHatColors}
              onChangeBugHatColor={handleChangeBugHatColor}
              bugUnlockedHats={bugUnlockedHats}
              isBugGrown={isBugGrown}
              isBugSuperSaiyanUnlocked={isBugSuperSaiyanUnlocked}
              bugDisableSuperSaiyan={Boolean(appState.bugDisableSuperSaiyan)}
              onChangeBugDisableSuperSaiyan={handleChangeBugDisableSuperSaiyan}
              onUnlockSecretScouter={handleUnlockSecretScouter}
              deletedBugPhraseKeys={appState.deletedBugPhraseKeys?.[appState.language] || []}
              customBugPhrases={appState.customBugPhrases?.[appState.language] || []}
              onAddCustomBugPhrase={handleAddCustomBugPhrase}
              onUpdateCustomBugPhrase={handleUpdateCustomBugPhrase}
              onDeleteCustomBugPhrase={handleDeleteCustomBugPhrase}
              onDeleteDefaultBugPhrase={handleDeleteDefaultBugPhrase}
              onRestoreDeletedBugPhrases={handleRestoreDeletedBugPhrases}
              showBug={showBug}
              bugMood={bugMood}
              canPetBug={isBugPetUnlocked}
              canLaunchBugHockey={isBugHockeyUnlocked}
              onOpenTutorial={handleOpenTutorial}
              isMotionSensorReceiving={mobileStepSensor.isReceivingMotion}
              timerNotificationsEnabled={Boolean(appState.timerNotificationsEnabled)}
              onChangeTimerNotifications={handleChangeTimerNotifications}
              motionStepsEnabled={Boolean(appState.motionStepsEnabled)}
              onChangeMotionSteps={handleChangeMotionSteps}
              onTriggerSecretBugMessage={handleTriggerSecretBugMessage}
              isLevel100FinaleActive={isLevel100FinaleOpen}
              onCompleteLevel100Finale={handleCompleteLevel100Finale}
              onPocketModeChange={setIsPocketModeActive}
            />
          )}

          {activeTab === AppTab.STATS && (
            <StatsView
              todayIso={todayIso}
              firstOpenDateIso={appState.firstOpenDateIso}
              daysByIso={appState.daysByIso}
              routines={appState.routines}
              trashedRoutines={appState.trashedRoutines}
              xpFormulas={appState.xpFormulas}
              totalXp={totalXp}
              stepGoal={appState.stepGoal}
              unlockedTrophies={appState.unlockedTrophies}
              showBug={showBug}
              bugMood={bugMood}
              canPetBug={isBugPetUnlocked}
              canLaunchBugHockey={isBugHockeyUnlocked}
            />
          )}
        </main>

        {/* Barra flotante inferior cuando hay un entrenamiento o descanso corriendo en segundo plano */}
        {showFloatingSessionBar && (
          <div className="fixed safe-bottom-floating left-4 right-4 max-w-md mx-auto z-30 sheet-panel ndot-surface border-strong px-4 py-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleOpenFloatingSession}
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
            >
              <span className="font-mono text-sm font-bold text-accent tabular-nums shrink-0">
                {floatingClockText}
              </span>
              <span className="font-display text-xs font-semibold uppercase tracking-wide text-fg truncate">
                {activeSessionRoutine ? activeSessionRoutine.title : uiTexts.floating_in_progress}
              </span>
            </button>

            <button
              type="button"
              onClick={handleToggleFloatingClock}
              aria-label={isAnyClockRunning ? uiTexts.session_pause_btn : uiTexts.common_start}
              className="btn-secondary min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              {isAnyClockRunning ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
            </button>
          </div>
        )}

        {/* Barra de navegación inferior Nothing × Cyberpunk */}
        <nav
          aria-label={uiTexts.nav_aria_label}
          className="fixed bottom-0 left-0 right-0 z-40 safe-bottom-nav bg-surface/94 backdrop-blur-md border-t border-strong"
        >
          <div className="max-w-xl mx-auto h-full grid grid-cols-3 items-stretch px-4">
            {bottomNavItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSelectTab(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative min-h-[48px] flex flex-col items-center justify-center transition-colors cursor-pointer touch-manipulation ${
                    isActive ? 'text-fg' : 'text-fg-muted hover:text-fg-secondary'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 w-9 h-[2.5px] bg-accent-fill"
                    />
                  )}
                  <Icon
                    className={`w-[19px] h-[19px] transition-colors ${
                      isActive ? 'text-accent stroke-[2.3]' : 'stroke-[1.75]'
                    }`}
                  />
                  <span
                    className={`font-display text-[11px] uppercase tracking-[0.06em] mt-0.5 whitespace-nowrap ${
                      isActive ? 'font-bold text-fg' : 'font-medium'
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
        </div>
      </BugReactionContext.Provider>
    </I18nContext.Provider>
  );
}
