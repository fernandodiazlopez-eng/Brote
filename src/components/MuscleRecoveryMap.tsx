/**
 * Silueta lineal genérica frontal integrada en el módulo de Nivel (Nothing OS × Cyberpunk):
 * - Solo colorea el contorno (sin relleno interior).
 * - Círculos exteriores con líneas simples (sin punta de flecha) que terminan justo en el borde
 *   de la silueta sin sobrepasar el cuerpo, sugiriendo que apuntan por detrás a Espalda y Glúteo.
 * - Hitboxes amplias y priorizadas: los músculos pequeños ganan frontera frente a los grandes,
 *   pecho y abdomen más centrados, bíceps (interior) y tríceps (exterior) con frontera igual entre sí
 *   expandiéndose hacia dentro y hacia fuera respectivamente, y antebrazo desplazado hacia la mano.
 * - Al pulsar una zona: sin rectángulos; el contorno se ilumina en blanco si está descansado,
 *   o en su propio color más luminoso y grueso si se ha entrenado.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import {
  DailyActivityRecord,
  MuscleFatigueState,
  MuscleGroupId,
  Routine,
} from '../types';
import {
  computeAllMuscleStatuses,
  getLocalizedMuscleLabel,
} from '../utils/muscleRecovery';
import { BugGlobalMood, BugPerch } from './BugCompanion';

interface MuscleRecoveryMapProps {
  todayIso: string;
  daysByIso: Record<string, DailyActivityRecord>;
  routines: Routine[];
  trashedRoutines: Routine[];
  activeSessionMuscles?: MuscleGroupId[];
  showBug?: boolean;
  bugMood?: BugGlobalMood;
  canPetBug?: boolean;
  canLaunchBugHockey?: boolean;
}

function getZoneStateClass(state: MuscleFatigueState): string {
  if (state === 'loaded') return 'muscle-zone-loaded';
  if (state === 'recovering') return 'muscle-zone-recovering';
  return 'muscle-zone-fresh';
}

function getTextStateClass(state: MuscleFatigueState): string {
  if (state === 'loaded') return 'muscle-text-loaded';
  if (state === 'recovering') return 'muscle-text-recovering';
  return 'muscle-text-fresh';
}

export const MuscleRecoveryMap: React.FC<MuscleRecoveryMapProps> = React.memo(({
  todayIso,
  daysByIso,
  routines,
  trashedRoutines,
  activeSessionMuscles,
  showBug = false,
  bugMood = 'none',
  canPetBug = false,
  canLaunchBugHockey = false,
}) => {
  const { t } = useI18n();
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroupId | null>(null);

  useEffect(() => {
    const refreshClock = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setNowMs(Date.now());
    };
    const intervalId = window.setInterval(refreshClock, 60_000);
    window.addEventListener('focus', refreshClock);
    document.addEventListener('visibilitychange', refreshClock);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshClock);
      document.removeEventListener('visibilitychange', refreshClock);
    };
  }, []);

  useEffect(() => {
    setNowMs(Date.now());
  }, [daysByIso, routines, todayIso, activeSessionMuscles]);

  const statuses = useMemo(
    () =>
      computeAllMuscleStatuses({
        todayIso,
        nowMs,
        daysByIso,
        routines,
        trashedRoutines,
        activeSessionMuscles,
      }),
    [todayIso, nowMs, daysByIso, routines, trashedRoutines, activeSessionMuscles]
  );

  const getStateLabel = (state: MuscleFatigueState): string => {
    if (state === 'loaded') return t.muscle_state_loaded;
    if (state === 'recovering') return t.muscle_state_recovering;
    return t.muscle_state_fresh;
  };

  const toggleSelectMuscle = (muscle: MuscleGroupId, e: React.SyntheticEvent) => {
    e.stopPropagation();
    setSelectedMuscle((prev) => (prev === muscle ? null : muscle));
  };

  const renderMuscleGroupProps = (muscle: MuscleGroupId) => {
    const status = statuses[muscle];
    const isSelected = selectedMuscle === muscle;
    const label = getLocalizedMuscleLabel(muscle, t);
    const stateText = getStateLabel(status.state);

    return {
      role: 'button' as const,
      tabIndex: 0,
      'aria-label': `${label}: ${stateText}`,
      'aria-pressed': isSelected,
      onMouseDown: (e: React.MouseEvent<SVGGElement>) => e.preventDefault(),
      onClick: (e: React.MouseEvent<SVGGElement>) => toggleSelectMuscle(muscle, e),
      onKeyDown: (e: React.KeyboardEvent<SVGGElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleSelectMuscle(muscle, e);
        }
      },
      className: `muscle-zone ${getZoneStateClass(status.state)} ${
        isSelected ? 'muscle-zone-selected' : ''
      }`,
    };
  };

  const activeStatus = selectedMuscle ? statuses[selectedMuscle] : null;

  return (
    <div
      className="relative w-full flex flex-col items-center"
      onClick={() => setSelectedMuscle(null)}
    >
      <svg
        viewBox="36 12.5 148 255"
        className="muscle-svg block h-[196px] sm:h-[216px] w-auto select-none"
        role="group"
        aria-label={t.profile_level_prefix}
      >
        {/* Contorno estructural neutro (cabeza, cuello, costados, pelvis, manos, rodillas y pies) */}
        <g aria-hidden="true" className="pointer-events-none">
          {/* Cabeza */}
          <path
            className="muscle-silhouette-frame"
            d="M 110 14 C 117.5 14, 121.5 19.5, 121 27.5 C 120.5 35, 116 41, 110 41.5 C 104 41, 99.5 35, 99 27.5 C 98.5 19.5, 102.5 14, 110 14 Z"
          />
          {/* Cuello */}
          <path
            className="muscle-silhouette-line"
            d="M 105 40.5 C 105 44.5, 103.5 47.5, 100 49.5 M 115 40.5 C 115 44.5, 116.5 47.5, 120 49.5"
          />
          {/* Costados neutros del tronco y línea pélvica */}
          <path
            className="muscle-silhouette-line"
            d="M 89 77.5 C 90 94, 90.5 114, 88.5 135 C 95.5 138, 103 140.5, 110 141.5 C 117 140.5, 124.5 138, 131.5 135 C 129.5 114, 130 94, 131 77.5"
          />
          {/* Manos */}
          <path
            className="muscle-silhouette-frame"
            d="M 67 140.5 L 73 141.2 L 71 151 C 68.5 152, 66 150.5, 65 147.5 Z"
          />
          <path
            className="muscle-silhouette-frame"
            d="M 153 140.5 L 147 141.2 L 149 151 C 151.5 152, 154 150.5, 155 147.5 Z"
          />
          {/* Rodillas */}
          <path
            className="muscle-silhouette-frame"
            d="M 92 200.5 C 95.5 200, 99.5 200, 103 200.5 L 102 208.5 C 98.5 209, 95.5 209, 92 208.5 Z"
          />
          <path
            className="muscle-silhouette-frame"
            d="M 128 200.5 C 124.5 200, 120.5 200, 117 200.5 L 118 208.5 C 121.5 209, 124.5 209, 128 208.5 Z"
          />
          {/* Pies */}
          <path
            className="muscle-silhouette-frame"
            d="M 92.5 257.5 L 99.5 257.5 L 101 266 L 88 266 C 88 262.5, 90 259.5, 92.5 257.5 Z"
          />
          <path
            className="muscle-silhouette-frame"
            d="M 127.5 257.5 L 120.5 257.5 L 119 266 L 132 266 C 132 262.5, 130 259.5, 127.5 257.5 Z"
          />
        </g>

        {/* Hombros (ganan frontera frente al pecho) */}
        <g {...renderMuscleGroupProps('hombro')}>
          <path
            className="muscle-hit-area"
            d="M 60 47 L 95 47 L 94 77 L 60 77 Z M 125 51 L 156 51 L 156 77 L 126 77 Z"
          />
          <path
            className="muscle-visual"
            d="M 88.5 51.5 C 80 52.5, 74 58, 73.5 66.5 C 73.2 70.5, 75 73.5, 78 75 C 82 73, 85.5 68, 88 62 C 89 58, 89.2 54.5, 88.5 51.5 Z"
          />
          <path
            className="muscle-visual"
            d="M 131.5 51.5 C 140 52.5, 146 58, 146.5 66.5 C 146.8 70.5, 145 73.5, 142 75 C 138 73, 134.5 68, 132 62 C 131 58, 130.8 54.5, 131.5 51.5 Z"
          />
        </g>

        {/* Pecho (hitbox más centrada) */}
        <g {...renderMuscleGroupProps('pecho')}>
          <path className="muscle-hit-area" d="M 95 51 L 125 51 L 126 82 L 94 82 Z" />
          <path
            className="muscle-visual"
            d="M 91 52.5 C 97 53.5, 103 54, 108.5 54 L 108.5 77.5 C 103 79.5, 95 80, 90 77 C 88 75.5, 87.5 71.5, 89 65.5 C 90 60.5, 90.5 56, 91 52.5 Z"
          />
          <path
            className="muscle-visual"
            d="M 129 52.5 C 123 53.5, 117 54, 111.5 54 L 111.5 77.5 C 117 79.5, 125 80, 130 77 C 132 75.5, 132.5 71.5, 131 65.5 C 130 60.5, 129.5 56, 129 52.5 Z"
          />
        </g>

        {/* Tríceps (exterior del brazo: frontera igual con bíceps y más terreno hacia el exterior y hacia el codo) */}
        <g {...renderMuscleGroupProps('triceps')}>
          <path
            className="muscle-hit-area"
            d="M 52 77 L 76.5 77 L 75.5 115 L 52 115 Z M 143.5 77 L 168 77 L 168 115 L 144.5 115 Z"
          />
          <path
            className="muscle-visual"
            d="M 75 76.5 C 71.5 84.5, 70 94.5, 70.5 104.5 L 75.5 105.5 C 75.5 95.5, 76.8 86, 79 77.5 Z"
          />
          <path
            className="muscle-visual"
            d="M 145 76.5 C 148.5 84.5, 150 94.5, 149.5 104.5 L 144.5 105.5 C 144.5 95.5, 143.2 86, 141 77.5 Z"
          />
        </g>

        {/* Bíceps (interior del brazo: frontera igual con tríceps, gana terreno hacia el abdomen y hacia el codo) */}
        <g {...renderMuscleGroupProps('biceps')}>
          <path
            className="muscle-hit-area"
            d="M 76.5 77 L 94 77 L 96 82 L 96 115 L 75.5 115 Z M 126 77 L 143.5 77 L 144.5 115 L 124 115 L 124 82 Z"
          />
          <path
            className="muscle-visual"
            d="M 81 77.8 C 85 84, 85.5 95, 82 105.8 L 77.5 105.5 C 77.5 95.5, 78.8 86, 81 77.8 Z"
          />
          <path
            className="muscle-visual"
            d="M 139 77.8 C 135 84, 134.5 95, 138 105.8 L 142.5 105.5 C 142.5 95.5, 141.2 86, 139 77.8 Z"
          />
        </g>

        {/* Antebrazos (hitbox más desplazada hacia la muñeca y la mano) */}
        <g {...renderMuscleGroupProps('antebrazo')}>
          <path
            className="muscle-hit-area"
            d="M 52 115 L 86 115 L 82 155 L 52 155 Z M 134 115 L 168 115 L 168 152 L 144 152 L 138 138 Z"
          />
          <path
            className="muscle-visual"
            d="M 70 108 L 81.5 108.5 C 80.5 119, 77 129.5, 73.5 139 L 67 138 C 67 128, 68 118, 70 108 Z"
          />
          <path
            className="muscle-visual"
            d="M 150 108 L 138.5 108.5 C 139.5 119, 143 129.5, 146.5 139 L 153 138 C 153 128, 152 118, 150 108 Z"
          />
        </g>

        {/* Abdomen (hitbox compacta en el centro) */}
        <g {...renderMuscleGroupProps('abdomen')}>
          <path className="muscle-hit-area" d="M 96 82 L 124 82 L 123 134 L 97 134 Z" />
          <path
            className="muscle-visual"
            d="M 94.5 82 C 99.5 83, 104.5 83.5, 110 83.5 C 115.5 83.5, 120.5 83, 125.5 82 C 127 96, 126 113, 121.5 128.5 C 117.5 131, 114 132, 110 132 C 106 132, 102.5 131, 98.5 128.5 C 94 113, 93 96, 94.5 82 Z"
          />
          <path
            className="muscle-visual"
            d="M 110 84 L 110 131.5 M 94.3 98 Q 110 99.5, 125.7 98 M 95.6 113.5 Q 110 115, 124.4 113.5"
          />
        </g>

        {/* Muslos */}
        <g {...renderMuscleGroupProps('muslo')}>
          <path className="muscle-hit-area" d="M 83 135 L 133 135 L 133 202 L 83 202 Z" />
          <path
            className="muscle-visual"
            d="M 88.5 139.5 C 95.5 142, 102 143.8, 107.5 144.8 C 107 163, 105.5 181, 103.5 198 L 91 198 C 88 180, 86.5 159, 88.5 139.5 Z"
          />
          <path
            className="muscle-visual"
            d="M 131.5 139.5 C 124.5 142, 118 143.8, 112.5 144.8 C 113 163, 114.5 181, 116.5 198 L 129 198 C 132 180, 133.5 159, 131.5 139.5 Z"
          />
        </g>

        {/* Gemelos */}
        <g {...renderMuscleGroupProps('gemelos')}>
          <path className="muscle-hit-area" d="M 80 202 L 140 202 L 140 267 L 80 267 Z" />
          <path
            className="muscle-visual"
            d="M 92 211 L 102 211 C 104 223, 102.5 239, 99.5 255 L 92.5 255 C 89 239, 88.5 223, 92 211 Z"
          />
          <path
            className="muscle-visual"
            d="M 128 211 L 118 211 C 116 223, 117.5 239, 120.5 255 L 127.5 255 C 131 239, 131.5 223, 128 211 Z"
          />
        </g>

        {/* Círculo pequeño + línea exterior hacia la Espalda (sin punta de flecha y sin sobrepasar el cuerpo) */}
        <g {...renderMuscleGroupProps('espalda')}>
          <path className="muscle-hit-area" d="M 125 22 L 184 22 L 184 50.5 L 125 50.5 Z" />
          <path className="muscle-visual" d="M 166.5 34 L 146 34 L 126.4 52.9" />
          <circle cx="173" cy="34" r="6.5" className="muscle-visual" />
        </g>

        {/* Círculo pequeño + línea exterior hacia el Glúteo (sin punta de flecha y sin sobrepasar el cuerpo) */}
        <g {...renderMuscleGroupProps('gluteo')}>
          <path
            className="muscle-hit-area"
            d="M 133.5 145 L 146 153 L 184 153 L 184 172 L 133.5 172 Z"
          />
          <path className="muscle-visual" d="M 166.5 158 L 144 158 L 132.2 148.4" />
          <circle cx="173" cy="158" r="6.5" className="muscle-visual" />
        </g>
      </svg>

      {/* Bug apoyado en la zona inferior izquierda, cerca de los pies del avatar holográfico */}
      {showBug && (
        <div className="absolute bottom-0.5 left-[calc(50%-64px)] sm:left-[calc(50%-72px)] z-10 flex items-end">
          <BugPerch
            gazeMode="avatar-front"
            globalMood={bugMood}
            canPet={canPetBug}
            canLaunchHockey={canLaunchBugHockey}
          />
        </div>
      )}

      {/* Lectura sin recuadro al pulsar una zona muscular */}
      {activeStatus && (
        <div
          className={`absolute bottom-0.5 ${
            showBug ? 'right-0 text-right' : 'left-0 text-left'
          } pointer-events-none select-none leading-tight`}
        >
          <p className="font-display text-xs font-bold uppercase tracking-wider text-fg">
            {getLocalizedMuscleLabel(activeStatus.id, t)}
          </p>
          <p
            className={`font-display text-[10px] font-semibold uppercase tracking-wider ${getTextStateClass(
              activeStatus.state
            )}`}
          >
            {getStateLabel(activeStatus.state)}
          </p>
        </div>
      )}
    </div>
  );
});
