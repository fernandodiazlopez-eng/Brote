/**
 * Diccionario completo de textos de la interfaz (Español e Inglés) y metadatos
 * para el editor de textos personalizados en Ajustes Avanzados.
 *
 * Nota: Los textos de los 31 logros/trofeos NO se incluyen aquí intencionadamente;
 * viven en `trophiesCatalog.ts` (solo ES/EN) para evitar spoilers.
 */

import { AppLanguage, RoutineCategory } from '../types';

export const DEFAULT_ES_TEXTS = {
  // 1. Navegación y Alertas Globales
  nav_training: 'Entrenamiento',
  nav_profile: 'Perfil',
  nav_stats: 'Estadísticas',
  nav_aria_label: 'Navegación principal',
  floating_in_progress: 'En curso',
  alarm_finished_title: 'Temporizador finalizado',
  alarm_stop_btn: 'Parar',
  alarm_snooze_btn: '+1 min',
  alarm_repeat_btn: 'Repetir',
  alarm_notif_tap_to_stop: 'Pulsa para parar la alarma',
  alarm_notif_rest_done: 'Tiempo de descanso completado',

  // 2. Acciones Comunes
  common_start: 'Iniciar',
  common_delete: 'Eliminar',
  common_cancel: 'Cancelar',
  common_edit: 'Editar',
  common_save: 'Guardar',
  common_back: 'Volver',
  common_close: 'Cerrar',

  // 3. Perfil, Árbol y Agenda
  profile_level_prefix: 'Nivel',
  profile_xp_unit: 'XP',
  profile_this_week: 'Esta semana',
  profile_next_week: 'Próxima semana',
  profile_add_btn: 'Añadir',
  profile_repeat_week_btn: 'Repetir misma rutina',
  profile_today_badge: 'Hoy',
  profile_move_prefix: 'Mover',
  profile_move_suffix: 'a otro día',
  profile_copy_prefix: 'Pegar',
  profile_copy_suffix: 'en otro día',
  profile_no_workouts_past: 'Sin entrenamientos',
  profile_completed_today: 'Completados hoy',
  profile_none_yet: 'Ninguno todavía',
  profile_scheduled_heading: 'Programadas',
  profile_no_scheduled: 'Sin rutinas programadas',
  profile_no_routines_created: 'Sin rutinas creadas',

  // 4. Pasos Diarios
  steps_title: 'Pasos',
  steps_km_unit: 'km',
  steps_confirm_btn: 'Añadir pasos',

  // 5. Calendario (Días y Meses)
  day_mon: 'Lunes',
  day_tue: 'Martes',
  day_wed: 'Miércoles',
  day_thu: 'Jueves',
  day_fri: 'Viernes',
  day_sat: 'Sábado',
  day_sun: 'Domingo',
  day_mon_short: 'L',
  day_tue_short: 'M',
  day_wed_short: 'X',
  day_thu_short: 'J',
  day_fri_short: 'V',
  day_sat_short: 'S',
  day_sun_short: 'D',
  month_jan: 'ene',
  month_feb: 'feb',
  month_mar: 'mar',
  month_apr: 'abr',
  month_may: 'may',
  month_jun: 'jun',
  month_jul: 'jul',
  month_aug: 'ago',
  month_sep: 'sep',
  month_oct: 'oct',
  month_nov: 'nov',
  month_dec: 'dic',

  // 6. Entrenamiento y Rutinas
  training_title: 'Rutinas',
  training_new_btn: 'Nueva',
  training_empty: 'Sin rutinas activas',
  category_strength: 'Fuerza',
  category_cardio: 'Cardio',
  training_min_short: 'min',
  training_exercises_short: 'ej.',
  editor_new_routine: 'Nueva rutina',
  editor_edit_routine: 'Editar rutina',
  editor_default_routine_name: 'Rutina',
  editor_name_label: 'Nombre',
  editor_name_placeholder: 'Torso Fuerza',
  editor_type_label: 'Tipo',
  editor_minutes_label: 'Minutos',
  editor_exercises_label: 'Ejercicios',
  editor_exercise_placeholder: 'Ejercicio',
  editor_sets_placeholder: '4 × 10',
  trash_title: 'Papelera',
  trash_empty: 'Papelera vacía',
  trash_restore_btn: 'Restaurar',
  session_stopwatch: 'Cronómetro',
  session_timer: 'Temporizador',
  session_sec_short: 'seg',
  session_pause_btn: 'Pausar',
  session_reset_label: 'Reiniciar',
  session_no_exercises: 'Sin ejercicios asignados',
  session_finish_btn: 'Finalizar entrenamiento',

  // 7. Estadísticas
  stats_title: 'Estadísticas',
  stats_metric_minutes: 'Minutos',
  stats_metric_steps: 'Pasos',
  stats_kpi_sessions: 'Sesiones',
  stats_kpi_time: 'Tiempo',
  stats_kpi_steps_day: 'Pasos / día',
  stats_kpi_consistency: 'Constancia',
  stats_steps_unit_lower: 'pasos',
  stats_28_days: '28 días',
  stats_modalities: 'Modalidades',
  stats_sessions_short: 'ses.',
  stats_trophy_showcase: 'Vitrina de trofeos',
  stats_trophy_empty: 'Aún no has desbloqueado ningún trofeo',

  // 8. Información del Sistema de Puntos
  info_title: 'Sistema de puntos',
  info_p1:
    'Tu cuerpo es como el personaje de un juego donde el objetivo es alcanzar el nivel cien acumulando cien mil puntos de experiencia. Para avanzar solo necesitas registrar tu actividad física diaria ya sean tus pasos o tus rutinas de fuerza y cardio. El sistema valora más la constancia y el equilibrio que hacer esfuerzos extremos un solo día. Por eso los primeros treinta minutos de cualquier ejercicio te dan la mayor cantidad de puntos. Esto significa que subirás más rápido si combinas varias cosas en lugar de hacer tres horas de lo mismo.',
  info_p2:
    'Al principio notarás que pasas de nivel muy rápido con poco esfuerzo. Los primeros niveles requieren muy pocos puntos para simular esa mejora inicial que todos tenemos al empezar a entrenar. Sin embargo a medida que te acercas a los niveles más altos te costará mucho más subir. Pasar del nivel noventa al cien requiere semanas de dedicación constante. Esto refleja lo difícil que es mejorar cuando ya tienes una excelente condición física.',
  info_p3:
    'El descanso también es parte del entrenamiento. Si decides parar entre uno y cuatro días no perderás absolutamente ningún punto. Tu cuerpo necesita ese tiempo libre para recuperarse y hacerse más fuerte. Pero si pasas cinco días seguidos sin hacer nada empezarás a perder puntos poco a poco. Esto simula la pérdida real de tu capacidad cardiovascular al dejar de moverte. Si llegas a los quince días de inactividad esa pérdida se acelera un poco más. Durante esa inactividad tu árbol nunca encogerá de tamaño, sino que se irá marchitando poco a poco hasta que vuelvas a moverte y recupere su vitalidad.',
  info_p4:
    'Aun así nunca perderás todo tu progreso. El sistema tiene una función de memoria muscular que te protege. Esto impide que caigas más de quince niveles por debajo del máximo que hayas logrado alcanzar en el pasado. Da igual si te lesionas o te vas de vacaciones sin hacer nada de deporte. Cuando decidas volver a entrenar te será mucho más rápido recuperar tu nivel que cuando empezaste desde cero por primera vez.',

  // 9. Ajustes y Ajustes Avanzados
  settings_title: 'Ajustes',
  settings_language_label: 'Idioma',
  settings_lang_es: 'Español',
  settings_lang_en: 'Inglés',
  settings_style_label: 'Estilo',
  settings_theme_light: 'Claro',
  settings_theme_dark: 'Oscuro',
  settings_palette_label: 'Paleta de colores',
  palette_lima: 'Lima',
  palette_esmeralda: 'Esmeralda',
  palette_oceano: 'Océano',
  palette_ambar: 'Ámbar',
  palette_amatista: 'Amatista',
  palette_coral: 'Coral',
  settings_seasons_label: 'Estaciones del año',
  settings_seasons_on: 'Activadas',
  settings_seasons_off: 'Desactivadas',
  settings_install_label: 'Aplicación móvil',
  settings_install_btn: 'Instalar aplicación',
  settings_ios_install_title: 'Instalar en iPhone / iPad',
  settings_ios_install_step1: '1. Pulsa el botón Compartir en la barra de Safari.',
  settings_ios_install_step2: '2. Desliza hacia abajo y pulsa Añadir a pantalla de inicio.',
  settings_advanced_btn: 'Ajustes avanzados',
  advanced_formulas_heading: 'Fórmulas de experiencia',
  advanced_reset_formulas_btn: 'Volver a las predeterminadas',
  advanced_texts_heading: 'Textos de la aplicación',
  advanced_texts_subtitle: 'Cambia cualquier texto de la app (excepto los logros)',
  advanced_texts_edit_btn: 'Personalizar textos',
  advanced_texts_search_placeholder: 'Buscar texto...',
  advanced_texts_reset_all_btn: 'Restaurar todos los textos',
  advanced_texts_reset_one_btn: 'Restaurar',
  advanced_texts_no_results: 'No se encontraron textos',
  advanced_backup_heading: 'Copia de seguridad',
  advanced_backup_subtitle: 'Guarda o restaura todo tu progreso en un archivo local',
  advanced_backup_export_btn: 'Exportar datos',
  advanced_backup_import_btn: 'Importar datos',
  advanced_backup_success: 'Copia de seguridad restaurada',
  advanced_backup_error: 'Archivo de copia no válido',
} as const;

export type UiTextKey = keyof typeof DEFAULT_ES_TEXTS;
export type UiTextsMap = Record<UiTextKey, string>;

export const DEFAULT_EN_TEXTS: UiTextsMap = {
  // 1. Navigation & Global Alerts
  nav_training: 'Training',
  nav_profile: 'Profile',
  nav_stats: 'Statistics',
  nav_aria_label: 'Main navigation',
  floating_in_progress: 'In progress',
  alarm_finished_title: 'Timer finished',
  alarm_stop_btn: 'Stop',
  alarm_snooze_btn: '+1 min',
  alarm_repeat_btn: 'Repeat',
  alarm_notif_tap_to_stop: 'Tap to stop alarm',
  alarm_notif_rest_done: 'Rest time completed',

  // 2. Common Actions
  common_start: 'Start',
  common_delete: 'Delete',
  common_cancel: 'Cancel',
  common_edit: 'Edit',
  common_save: 'Save',
  common_back: 'Back',
  common_close: 'Close',

  // 3. Profile, Tree & Planner
  profile_level_prefix: 'Level',
  profile_xp_unit: 'XP',
  profile_this_week: 'This week',
  profile_next_week: 'Next week',
  profile_add_btn: 'Add',
  profile_repeat_week_btn: 'Repeat same routine',
  profile_today_badge: 'Today',
  profile_move_prefix: 'Move',
  profile_move_suffix: 'to another day',
  profile_copy_prefix: 'Paste',
  profile_copy_suffix: 'on another day',
  profile_no_workouts_past: 'No workouts',
  profile_completed_today: 'Completed today',
  profile_none_yet: 'None yet',
  profile_scheduled_heading: 'Scheduled',
  profile_no_scheduled: 'No scheduled routines',
  profile_no_routines_created: 'No routines created',

  // 4. Daily Steps
  steps_title: 'Steps',
  steps_km_unit: 'km',
  steps_confirm_btn: 'Add steps',

  // 5. Calendar (Days & Months)
  day_mon: 'Monday',
  day_tue: 'Tuesday',
  day_wed: 'Wednesday',
  day_thu: 'Thursday',
  day_fri: 'Friday',
  day_sat: 'Saturday',
  day_sun: 'Sunday',
  day_mon_short: 'M',
  day_tue_short: 'T',
  day_wed_short: 'W',
  day_thu_short: 'T',
  day_fri_short: 'F',
  day_sat_short: 'S',
  day_sun_short: 'S',
  month_jan: 'Jan',
  month_feb: 'Feb',
  month_mar: 'Mar',
  month_apr: 'Apr',
  month_may: 'May',
  month_jun: 'Jun',
  month_jul: 'Jul',
  month_aug: 'Aug',
  month_sep: 'Sep',
  month_oct: 'Oct',
  month_nov: 'Nov',
  month_dec: 'Dec',

  // 6. Training & Routines
  training_title: 'Routines',
  training_new_btn: 'New',
  training_empty: 'No active routines',
  category_strength: 'Strength',
  category_cardio: 'Cardio',
  training_min_short: 'min',
  training_exercises_short: 'ex.',
  editor_new_routine: 'New routine',
  editor_edit_routine: 'Edit routine',
  editor_default_routine_name: 'Routine',
  editor_name_label: 'Name',
  editor_name_placeholder: 'Upper Body Strength',
  editor_type_label: 'Type',
  editor_minutes_label: 'Minutes',
  editor_exercises_label: 'Exercises',
  editor_exercise_placeholder: 'Exercise',
  editor_sets_placeholder: '4 × 10',
  trash_title: 'Trash',
  trash_empty: 'Trash is empty',
  trash_restore_btn: 'Restore',
  session_stopwatch: 'Stopwatch',
  session_timer: 'Timer',
  session_sec_short: 'sec',
  session_pause_btn: 'Pause',
  session_reset_label: 'Reset',
  session_no_exercises: 'No exercises assigned',
  session_finish_btn: 'Finish workout',

  // 7. Statistics
  stats_title: 'Statistics',
  stats_metric_minutes: 'Minutes',
  stats_metric_steps: 'Steps',
  stats_kpi_sessions: 'Sessions',
  stats_kpi_time: 'Time',
  stats_kpi_steps_day: 'Steps / day',
  stats_kpi_consistency: 'Consistency',
  stats_steps_unit_lower: 'steps',
  stats_28_days: '28 days',
  stats_modalities: 'Modalities',
  stats_sessions_short: 'sess.',
  stats_trophy_showcase: 'Trophy showcase',
  stats_trophy_empty: 'No trophies unlocked yet',

  // 8. Points System Info
  info_title: 'Points system',
  info_p1:
    'Your body is like a game character where the goal is to reach level one hundred by accumulating one hundred thousand experience points. To progress, simply log your daily physical activity—whether your steps or your strength and cardio routines. The system rewards consistency and balance over extreme single-day efforts. That is why the first thirty minutes of any exercise grant the highest amount of points, meaning you will level up faster by combining varied activities rather than doing three hours of the same thing.',
  info_p2:
    'At first, you will notice that you level up very quickly with modest effort. Early levels require very few points to mirror the rapid initial progress everyone experiences when starting to train. However, as you approach higher levels, advancing becomes much more demanding. Moving from level ninety to one hundred takes weeks of steady dedication, reflecting how challenging it is to improve once you are already in peak physical shape.',
  info_p3:
    'Rest is also part of training. Taking between one and four days off costs you zero points—your body needs that recovery time to grow stronger. However, after five consecutive days of inactivity, you will gradually begin losing points to simulate real cardiovascular detraining. Reaching fifteen inactive days accelerates that loss slightly. During inactivity, your tree will never shrink in size; instead, it will slowly wither until you start moving again and restore its vitality.',
  info_p4:
    'Even so, you will never lose all your progress. A built-in muscle memory floor protects you from dropping more than fifteen levels below the highest level you have ever achieved. Whether you get injured or take a long vacation without exercising, returning to training will let you regain your peak level much faster than when you started from scratch.',

  // 9. Settings & Advanced Settings
  settings_title: 'Settings',
  settings_language_label: 'Language',
  settings_lang_es: 'Spanish',
  settings_lang_en: 'English',
  settings_style_label: 'Appearance',
  settings_theme_light: 'Light',
  settings_theme_dark: 'Dark',
  settings_palette_label: 'Color palette',
  palette_lima: 'Lime',
  palette_esmeralda: 'Emerald',
  palette_oceano: 'Ocean',
  palette_ambar: 'Amber',
  palette_amatista: 'Amethyst',
  palette_coral: 'Coral',
  settings_seasons_label: 'Seasons',
  settings_seasons_on: 'Enabled',
  settings_seasons_off: 'Disabled',
  settings_install_label: 'Mobile app',
  settings_install_btn: 'Install app',
  settings_ios_install_title: 'Install on iPhone / iPad',
  settings_ios_install_step1: '1. Tap the Share button in the Safari toolbar.',
  settings_ios_install_step2: '2. Scroll down and tap Add to Home Screen.',
  settings_advanced_btn: 'Advanced settings',
  advanced_formulas_heading: 'Experience formulas',
  advanced_reset_formulas_btn: 'Restore default formulas',
  advanced_texts_heading: 'App texts',
  advanced_texts_subtitle: 'Change any text in the app (except achievements)',
  advanced_texts_edit_btn: 'Customize texts',
  advanced_texts_search_placeholder: 'Search text...',
  advanced_texts_reset_all_btn: 'Restore all texts',
  advanced_texts_reset_one_btn: 'Reset',
  advanced_texts_no_results: 'No matching texts found',
  advanced_backup_heading: 'Data backup',
  advanced_backup_subtitle: 'Export or restore all your progress from a local file',
  advanced_backup_export_btn: 'Export backup',
  advanced_backup_import_btn: 'Import backup',
  advanced_backup_success: 'Backup restored successfully',
  advanced_backup_error: 'Invalid backup file',
};

export const DEFAULT_UI_TEXTS: Record<AppLanguage, UiTextsMap> = {
  es: DEFAULT_ES_TEXTS,
  en: DEFAULT_EN_TEXTS,
};

export interface UiTextFieldMeta {
  key: UiTextKey;
  labelEs: string;
  labelEn: string;
  multiline?: boolean;
}

export interface UiTextSectionMeta {
  id: string;
  titleEs: string;
  titleEn: string;
  fields: UiTextFieldMeta[];
}

export const UI_TEXT_SECTIONS: UiTextSectionMeta[] = [
  {
    id: 'nav_alerts',
    titleEs: 'Navegación y alertas',
    titleEn: 'Navigation & alerts',
    fields: [
      { key: 'nav_training', labelEs: 'Pestaña Entrenamiento', labelEn: 'Training tab' },
      { key: 'nav_profile', labelEs: 'Pestaña Perfil', labelEn: 'Profile tab' },
      { key: 'nav_stats', labelEs: 'Pestaña Estadísticas', labelEn: 'Statistics tab' },
      { key: 'nav_aria_label', labelEs: 'Etiqueta barra navegación', labelEn: 'Navigation bar label' },
      { key: 'floating_in_progress', labelEs: 'Barra flotante (en curso)', labelEn: 'Floating bar (in progress)' },
      { key: 'alarm_finished_title', labelEs: 'Título de alarma finalizada', labelEn: 'Timer finished title' },
      { key: 'alarm_stop_btn', labelEs: 'Botón parar alarma', labelEn: 'Stop alarm button' },
      { key: 'alarm_snooze_btn', labelEs: 'Botón posponer (+1 min)', labelEn: 'Snooze (+1 min) button' },
      { key: 'alarm_repeat_btn', labelEs: 'Botón repetir alarma', labelEn: 'Repeat alarm button' },
      { key: 'alarm_notif_tap_to_stop', labelEs: 'Aviso notificación (parar)', labelEn: 'Notification prompt (stop)' },
      { key: 'alarm_notif_rest_done', labelEs: 'Aviso descanso completado', labelEn: 'Notification rest completed' },
    ],
  },
  {
    id: 'common',
    titleEs: 'Botones generales',
    titleEn: 'General buttons',
    fields: [
      { key: 'common_start', labelEs: 'Botón Iniciar', labelEn: 'Start button' },
      { key: 'common_delete', labelEs: 'Botón Eliminar', labelEn: 'Delete button' },
      { key: 'common_cancel', labelEs: 'Botón Cancelar', labelEn: 'Cancel button' },
      { key: 'common_edit', labelEs: 'Botón Editar', labelEn: 'Edit button' },
      { key: 'common_save', labelEs: 'Botón Guardar', labelEn: 'Save button' },
      { key: 'common_back', labelEs: 'Botón Volver', labelEn: 'Back button' },
      { key: 'common_close', labelEs: 'Acción Cerrar', labelEn: 'Close action' },
    ],
  },
  {
    id: 'profile',
    titleEs: 'Perfil y agenda semanal',
    titleEn: 'Profile & weekly planner',
    fields: [
      { key: 'profile_level_prefix', labelEs: 'Texto de Nivel', labelEn: 'Level label' },
      { key: 'profile_xp_unit', labelEs: 'Siglas de experiencia (XP)', labelEn: 'Experience unit (XP)' },
      { key: 'profile_this_week', labelEs: 'Selector Esta semana', labelEn: 'This week tab' },
      { key: 'profile_next_week', labelEs: 'Selector Próxima semana', labelEn: 'Next week tab' },
      { key: 'profile_add_btn', labelEs: 'Botón Añadir a la agenda', labelEn: 'Add to schedule button' },
      { key: 'profile_repeat_week_btn', labelEs: 'Sugerencia repetir semana', labelEn: 'Repeat week button' },
      { key: 'profile_today_badge', labelEs: 'Indicador Hoy', labelEn: 'Today badge' },
      { key: 'profile_move_prefix', labelEs: 'Aviso mover (inicio)', labelEn: 'Move banner (prefix)' },
      { key: 'profile_move_suffix', labelEs: 'Aviso mover (final)', labelEn: 'Move banner (suffix)' },
      { key: 'profile_copy_prefix', labelEs: 'Aviso copiar (inicio)', labelEn: 'Paste banner (prefix)' },
      { key: 'profile_copy_suffix', labelEs: 'Aviso copiar (final)', labelEn: 'Paste banner (suffix)' },
      { key: 'profile_no_workouts_past', labelEs: 'Día pasado vacío', labelEn: 'Empty past day' },
      { key: 'profile_completed_today', labelEs: 'Título Completados hoy', labelEn: 'Completed today heading' },
      { key: 'profile_none_yet', labelEs: 'Completados hoy vacío', labelEn: 'None completed yet' },
      { key: 'profile_scheduled_heading', labelEs: 'Título Programadas', labelEn: 'Scheduled heading' },
      { key: 'profile_no_scheduled', labelEs: 'Día futuro sin rutinas', labelEn: 'No scheduled routines' },
      { key: 'profile_no_routines_created', labelEs: 'Aviso sin rutinas creadas', labelEn: 'No routines created notice' },
    ],
  },
  {
    id: 'steps',
    titleEs: 'Rueda de pasos',
    titleEn: 'Steps dial',
    fields: [
      { key: 'steps_title', labelEs: 'Título Pasos', labelEn: 'Steps heading' },
      { key: 'steps_km_unit', labelEs: 'Unidad de distancia (km)', labelEn: 'Distance unit (km)' },
      { key: 'steps_confirm_btn', labelEs: 'Botón confirmar pasos', labelEn: 'Confirm steps button' },
    ],
  },
  {
    id: 'calendar',
    titleEs: 'Calendario (días y meses)',
    titleEn: 'Calendar (days & months)',
    fields: [
      { key: 'day_mon', labelEs: 'Lunes', labelEn: 'Monday' },
      { key: 'day_tue', labelEs: 'Martes', labelEn: 'Tuesday' },
      { key: 'day_wed', labelEs: 'Miércoles', labelEn: 'Wednesday' },
      { key: 'day_thu', labelEs: 'Jueves', labelEn: 'Thursday' },
      { key: 'day_fri', labelEs: 'Viernes', labelEn: 'Friday' },
      { key: 'day_sat', labelEs: 'Sábado', labelEn: 'Saturday' },
      { key: 'day_sun', labelEs: 'Domingo', labelEn: 'Sunday' },
      { key: 'day_mon_short', labelEs: 'Inicial Lunes', labelEn: 'Monday short' },
      { key: 'day_tue_short', labelEs: 'Inicial Martes', labelEn: 'Tuesday short' },
      { key: 'day_wed_short', labelEs: 'Inicial Miércoles', labelEn: 'Wednesday short' },
      { key: 'day_thu_short', labelEs: 'Inicial Jueves', labelEn: 'Thursday short' },
      { key: 'day_fri_short', labelEs: 'Inicial Viernes', labelEn: 'Friday short' },
      { key: 'day_sat_short', labelEs: 'Inicial Sábado', labelEn: 'Saturday short' },
      { key: 'day_sun_short', labelEs: 'Inicial Domingo', labelEn: 'Sunday short' },
      { key: 'month_jan', labelEs: 'Enero (corto)', labelEn: 'January (short)' },
      { key: 'month_feb', labelEs: 'Febrero (corto)', labelEn: 'February (short)' },
      { key: 'month_mar', labelEs: 'Marzo (corto)', labelEn: 'March (short)' },
      { key: 'month_apr', labelEs: 'Abril (corto)', labelEn: 'April (short)' },
      { key: 'month_may', labelEs: 'Mayo (corto)', labelEn: 'May (short)' },
      { key: 'month_jun', labelEs: 'Junio (corto)', labelEn: 'June (short)' },
      { key: 'month_jul', labelEs: 'Julio (corto)', labelEn: 'July (short)' },
      { key: 'month_aug', labelEs: 'Agosto (corto)', labelEn: 'August (short)' },
      { key: 'month_sep', labelEs: 'Septiembre (corto)', labelEn: 'September (short)' },
      { key: 'month_oct', labelEs: 'Octubre (corto)', labelEn: 'October (short)' },
      { key: 'month_nov', labelEs: 'Noviembre (corto)', labelEn: 'November (short)' },
      { key: 'month_dec', labelEs: 'Diciembre (corto)', labelEn: 'December (short)' },
    ],
  },
  {
    id: 'training',
    titleEs: 'Entrenamiento y rutinas',
    titleEn: 'Training & routines',
    fields: [
      { key: 'training_title', labelEs: 'Título Rutinas', labelEn: 'Routines heading' },
      { key: 'training_new_btn', labelEs: 'Botón Nueva rutina', labelEn: 'New routine button' },
      { key: 'training_empty', labelEs: 'Lista de rutinas vacía', labelEn: 'Empty routines list' },
      { key: 'category_strength', labelEs: 'Categoría Fuerza', labelEn: 'Strength category' },
      { key: 'category_cardio', labelEs: 'Categoría Cardio', labelEn: 'Cardio category' },
      { key: 'training_min_short', labelEs: 'Abreviatura minutos (min)', labelEn: 'Minutes short (min)' },
      { key: 'training_exercises_short', labelEs: 'Abreviatura ejercicios (ej.)', labelEn: 'Exercises short (ex.)' },
      { key: 'editor_new_routine', labelEs: 'Título crear rutina', labelEn: 'Create routine title' },
      { key: 'editor_edit_routine', labelEs: 'Título editar rutina', labelEn: 'Edit routine title' },
      { key: 'editor_default_routine_name', labelEs: 'Nombre por defecto de rutina', labelEn: 'Default routine name' },
      { key: 'editor_name_label', labelEs: 'Campo Nombre', labelEn: 'Name field label' },
      { key: 'editor_name_placeholder', labelEs: 'Ejemplo de nombre', labelEn: 'Name placeholder' },
      { key: 'editor_type_label', labelEs: 'Campo Tipo', labelEn: 'Type field label' },
      { key: 'editor_minutes_label', labelEs: 'Campo Minutos', labelEn: 'Minutes field label' },
      { key: 'editor_exercises_label', labelEs: 'Título Ejercicios', labelEn: 'Exercises heading' },
      { key: 'editor_exercise_placeholder', labelEs: 'Ejemplo de ejercicio', labelEn: 'Exercise placeholder' },
      { key: 'editor_sets_placeholder', labelEs: 'Ejemplo de series', labelEn: 'Sets placeholder' },
      { key: 'trash_title', labelEs: 'Título Papelera', labelEn: 'Trash title' },
      { key: 'trash_empty', labelEs: 'Papelera vacía', labelEn: 'Empty trash' },
      { key: 'trash_restore_btn', labelEs: 'Botón Restaurar rutina', labelEn: 'Restore routine button' },
      { key: 'session_stopwatch', labelEs: 'Modo Cronómetro', labelEn: 'Stopwatch mode' },
      { key: 'session_timer', labelEs: 'Modo Temporizador', labelEn: 'Timer mode' },
      { key: 'session_sec_short', labelEs: 'Abreviatura segundos (seg)', labelEn: 'Seconds short (sec)' },
      { key: 'session_pause_btn', labelEs: 'Botón Pausar', labelEn: 'Pause button' },
      { key: 'session_reset_label', labelEs: 'Acción Reiniciar reloj', labelEn: 'Reset clock label' },
      { key: 'session_no_exercises', labelEs: 'Sesión sin ejercicios', labelEn: 'No exercises in session' },
      { key: 'session_finish_btn', labelEs: 'Botón Finalizar entrenamiento', labelEn: 'Finish workout button' },
    ],
  },
  {
    id: 'stats',
    titleEs: 'Estadísticas',
    titleEn: 'Statistics',
    fields: [
      { key: 'stats_title', labelEs: 'Título Estadísticas', labelEn: 'Statistics heading' },
      { key: 'stats_metric_minutes', labelEs: 'Filtro Minutos', labelEn: 'Minutes filter' },
      { key: 'stats_metric_steps', labelEs: 'Filtro Pasos', labelEn: 'Steps filter' },
      { key: 'stats_kpi_sessions', labelEs: 'Indicador Sesiones', labelEn: 'Sessions metric' },
      { key: 'stats_kpi_time', labelEs: 'Indicador Tiempo', labelEn: 'Time metric' },
      { key: 'stats_kpi_steps_day', labelEs: 'Indicador Pasos / día', labelEn: 'Steps / day metric' },
      { key: 'stats_kpi_consistency', labelEs: 'Indicador Constancia', labelEn: 'Consistency metric' },
      { key: 'stats_steps_unit_lower', labelEs: 'Unidad pasos en gráfico', labelEn: 'Chart steps unit' },
      { key: 'stats_28_days', labelEs: 'Título 28 días', labelEn: '28 days heading' },
      { key: 'stats_modalities', labelEs: 'Título Modalidades', labelEn: 'Modalities heading' },
      { key: 'stats_sessions_short', labelEs: 'Abreviatura sesiones (ses.)', labelEn: 'Sessions short (sess.)' },
      { key: 'stats_trophy_showcase', labelEs: 'Título Vitrina de trofeos', labelEn: 'Trophy showcase heading' },
      { key: 'stats_trophy_empty', labelEs: 'Vitrina de trofeos vacía', labelEn: 'Empty trophy showcase' },
    ],
  },
  {
    id: 'info',
    titleEs: 'Información del sistema de puntos',
    titleEn: 'Points system info',
    fields: [
      { key: 'info_title', labelEs: 'Título de información', labelEn: 'Info modal title' },
      { key: 'info_p1', labelEs: 'Párrafo 1 (Constancia y equilibrio)', labelEn: 'Paragraph 1 (Consistency & balance)', multiline: true },
      { key: 'info_p2', labelEs: 'Párrafo 2 (Progresión de niveles)', labelEn: 'Paragraph 2 (Level progression)', multiline: true },
      { key: 'info_p3', labelEs: 'Párrafo 3 (Descanso y marchitamiento)', labelEn: 'Paragraph 3 (Rest & withering)', multiline: true },
      { key: 'info_p4', labelEs: 'Párrafo 4 (Memoria muscular)', labelEn: 'Paragraph 4 (Muscle memory)', multiline: true },
    ],
  },
  {
    id: 'settings',
    titleEs: 'Ajustes',
    titleEn: 'Settings',
    fields: [
      { key: 'settings_title', labelEs: 'Título Ajustes', labelEn: 'Settings title' },
      { key: 'settings_language_label', labelEs: 'Etiqueta Idioma', labelEn: 'Language label' },
      { key: 'settings_lang_es', labelEs: 'Opción Español', labelEn: 'Spanish option' },
      { key: 'settings_lang_en', labelEs: 'Opción Inglés', labelEn: 'English option' },
      { key: 'settings_style_label', labelEs: 'Etiqueta Estilo', labelEn: 'Appearance label' },
      { key: 'settings_theme_light', labelEs: 'Modo Claro', labelEn: 'Light mode' },
      { key: 'settings_theme_dark', labelEs: 'Modo Oscuro', labelEn: 'Dark mode' },
      { key: 'settings_palette_label', labelEs: 'Etiqueta Paleta de colores', labelEn: 'Color palette label' },
      { key: 'palette_lima', labelEs: 'Color Lima', labelEn: 'Lime color' },
      { key: 'palette_esmeralda', labelEs: 'Color Esmeralda', labelEn: 'Emerald color' },
      { key: 'palette_oceano', labelEs: 'Color Océano', labelEn: 'Ocean color' },
      { key: 'palette_ambar', labelEs: 'Color Ámbar', labelEn: 'Amber color' },
      { key: 'palette_amatista', labelEs: 'Color Amatista', labelEn: 'Amethyst color' },
      { key: 'palette_coral', labelEs: 'Color Coral', labelEn: 'Coral color' },
      { key: 'settings_seasons_label', labelEs: 'Etiqueta Estaciones del año', labelEn: 'Seasons label' },
      { key: 'settings_seasons_on', labelEs: 'Estaciones Activadas', labelEn: 'Seasons enabled' },
      { key: 'settings_seasons_off', labelEs: 'Estaciones Desactivadas', labelEn: 'Seasons disabled' },
      { key: 'settings_install_label', labelEs: 'Etiqueta Aplicación móvil', labelEn: 'Mobile app label' },
      { key: 'settings_install_btn', labelEs: 'Botón Instalar aplicación', labelEn: 'Install app button' },
      { key: 'settings_ios_install_title', labelEs: 'Guía iOS título', labelEn: 'iOS guide title' },
      { key: 'settings_ios_install_step1', labelEs: 'Guía iOS paso 1', labelEn: 'iOS guide step 1' },
      { key: 'settings_ios_install_step2', labelEs: 'Guía iOS paso 2', labelEn: 'iOS guide step 2' },
      { key: 'settings_advanced_btn', labelEs: 'Título Ajustes avanzados', labelEn: 'Advanced settings title' },
      { key: 'advanced_formulas_heading', labelEs: 'Sección Fórmulas de XP', labelEn: 'XP formulas heading' },
      { key: 'advanced_reset_formulas_btn', labelEs: 'Botón restaurar fórmulas', labelEn: 'Reset formulas button' },
      { key: 'advanced_texts_heading', labelEs: 'Sección Textos de la app', labelEn: 'App texts heading' },
      { key: 'advanced_texts_subtitle', labelEs: 'Subtítulo de textos', labelEn: 'App texts subtitle' },
      { key: 'advanced_texts_edit_btn', labelEs: 'Botón Personalizar textos', labelEn: 'Customize texts button' },
      { key: 'advanced_texts_search_placeholder', labelEs: 'Buscador de textos', labelEn: 'Search texts placeholder' },
      { key: 'advanced_texts_reset_all_btn', labelEs: 'Botón restaurar todos los textos', labelEn: 'Restore all texts button' },
      { key: 'advanced_texts_reset_one_btn', labelEs: 'Botón restaurar un texto', labelEn: 'Reset single text button' },
      { key: 'advanced_texts_no_results', labelEs: 'Búsqueda sin resultados', labelEn: 'No matching texts message' },
      { key: 'advanced_backup_heading', labelEs: 'Sección Copia de seguridad', labelEn: 'Data backup heading' },
      { key: 'advanced_backup_subtitle', labelEs: 'Subtítulo Copia de seguridad', labelEn: 'Data backup subtitle' },
      { key: 'advanced_backup_export_btn', labelEs: 'Botón Exportar datos', labelEn: 'Export backup button' },
      { key: 'advanced_backup_import_btn', labelEs: 'Botón Importar datos', labelEn: 'Import backup button' },
      { key: 'advanced_backup_success', labelEs: 'Aviso copia restaurada', labelEn: 'Backup restored notice' },
      { key: 'advanced_backup_error', labelEs: 'Aviso error de archivo', labelEn: 'Invalid backup notice' },
    ],
  },
];

const VALID_TEXT_KEYS_SET = new Set<string>(Object.keys(DEFAULT_ES_TEXTS));

export function isValidUiTextKey(key: string): key is UiTextKey {
  return VALID_TEXT_KEYS_SET.has(key);
}

export function resolveUiTexts(
  language: AppLanguage,
  customForLanguage?: Partial<Record<UiTextKey, string>>
): UiTextsMap {
  const defaults = DEFAULT_UI_TEXTS[language];
  if (!customForLanguage) return defaults;

  const merged: UiTextsMap = { ...defaults };
  for (const [rawKey, customVal] of Object.entries(customForLanguage)) {
    if (
      isValidUiTextKey(rawKey) &&
      typeof customVal === 'string' &&
      customVal.trim() !== ''
    ) {
      merged[rawKey] = customVal;
    }
  }
  return merged;
}

export function getLocalizedCategoryLabel(
  category: RoutineCategory,
  t: UiTextsMap
): string {
  return category === 'Fuerza' ? t.category_strength : t.category_cardio;
}
