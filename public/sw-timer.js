/**
 * Extensión del Service Worker de Upgrade para avisos del temporizador en segundo plano
 * y con la pantalla del móvil apagada.
 */

let scheduledAlarmTimeoutId = null;
let activeKeepAliveResolve = null;

function clearScheduledAlarm() {
  if (scheduledAlarmTimeoutId !== null) {
    clearTimeout(scheduledAlarmTimeoutId);
    scheduledAlarmTimeoutId = null;
  }
  if (activeKeepAliveResolve) {
    const resolve = activeKeepAliveResolve;
    activeKeepAliveResolve = null;
    resolve();
  }
}

async function closeActiveAlarmNotifications() {
  try {
    if (!self.registration || typeof self.registration.getNotifications !== 'function') {
      return;
    }
    const list = await self.registration.getNotifications({ tag: 'timer-alarm' });
    for (const notif of list) {
      notif.close();
    }
  } catch {
    // Ignorar errores al cerrar notificaciones previas
  }
}

async function showTimerFinishedNotification(title, body) {
  try {
    await self.registration.showNotification(title || 'Temporizador finalizado', {
      body: body || 'Tiempo de descanso completado',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'timer-alarm',
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [320, 120, 320, 120, 460],
      data: { type: 'timer-alarm', firedAt: Date.now() },
    });
  } catch {
    // Ignorar si el permiso fue revocado en el sistema operativo
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'CANCEL_TIMER_ALARM') {
    clearScheduledAlarm();
    event.waitUntil(closeActiveAlarmNotifications());
    return;
  }

  if (data.type === 'SCHEDULE_TIMER_ALARM') {
    clearScheduledAlarm();
    const endMs = typeof data.endMs === 'number' ? data.endMs : 0;
    const title = typeof data.title === 'string' ? data.title : 'Temporizador finalizado';
    const body = typeof data.body === 'string' ? data.body : 'Tiempo de descanso completado';
    const delayMs = Math.max(0, endMs - Date.now());

    // Si el navegador soporta Notification Triggers del sistema (Android), programarlo también a nivel SO
    if (
      typeof self.TimestampTrigger === 'function' &&
      'showTrigger' in Notification.prototype &&
      delayMs > 0
    ) {
      try {
        const trigger = new self.TimestampTrigger(endMs);
        event.waitUntil(
          self.registration
            .showNotification(title, {
              body,
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: 'timer-alarm',
              renotify: true,
              requireInteraction: true,
              silent: false,
              vibrate: [320, 120, 320, 120, 460],
              showTrigger: trigger,
              data: { type: 'timer-alarm', scheduledFor: endMs },
            })
            .catch(() => {})
        );
        return;
      } catch {
        // Continuar con temporizador en Service Worker
      }
    }

    const keepAlivePromise = new Promise((resolve) => {
      activeKeepAliveResolve = resolve;
      scheduledAlarmTimeoutId = setTimeout(async () => {
        scheduledAlarmTimeoutId = null;
        activeKeepAliveResolve = null;
        await showTimerFinishedNotification(title, body);
        resolve();
      }, delayMs);
    });

    event.waitUntil(keepAlivePromise);
  }
});

self.addEventListener('notificationclick', (event) => {
  const notif = event.notification;
  if (notif) {
    notif.close();
  }
  clearScheduledAlarm();

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        try {
          client.postMessage({ type: 'STOP_TIMER_ALARM_FROM_SW' });
        } catch {
          // Ignorar clientes desconectados
        }
      }

      const firstClient = windowClients[0];
      if (firstClient && 'focus' in firstClient) {
        await firstClient.focus();
      } else if (self.clients.openWindow) {
        await self.clients.openWindow('/');
      }
    })()
  );
});
