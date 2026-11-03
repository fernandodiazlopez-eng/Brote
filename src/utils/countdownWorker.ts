/**
 * Reloj en segundo plano mediante Web Worker dedicado:
 * evita que el navegador móvil congele `window.setInterval` / `window.setTimeout`
 * cuando el usuario cambia a otra app con el entrenamiento o descanso abierto.
 */

export interface BackgroundClockTicker {
  start: (intervalMs?: number) => void;
  stop: () => void;
  dispose: () => void;
}

const WORKER_SOURCE = `
let intervalId = null;
self.onmessage = function(e) {
  const data = e.data || {};
  if (data.cmd === 'start') {
    if (intervalId !== null) clearInterval(intervalId);
    const ms = typeof data.intervalMs === 'number' && data.intervalMs >= 50 ? data.intervalMs : 250;
    intervalId = setInterval(function() {
      self.postMessage('tick');
    }, ms);
  } else if (data.cmd === 'stop') {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
};
`;

export function createBackgroundClockTicker(onTick: () => void): BackgroundClockTicker {
  let worker: Worker | null = null;
  let blobUrl: string | null = null;
  let fallbackIntervalId: number | null = null;

  if (typeof window !== 'undefined' && typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
    try {
      const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
      blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl);
      worker.onmessage = () => {
        onTick();
      };
    } catch {
      worker = null;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
    }
  }

  return {
    start(intervalMs = 250) {
      if (worker) {
        worker.postMessage({ cmd: 'start', intervalMs });
        return;
      }
      if (typeof window !== 'undefined') {
        if (fallbackIntervalId !== null) window.clearInterval(fallbackIntervalId);
        fallbackIntervalId = window.setInterval(onTick, intervalMs);
      }
    },
    stop() {
      if (worker) {
        worker.postMessage({ cmd: 'stop' });
      }
      if (fallbackIntervalId !== null && typeof window !== 'undefined') {
        window.clearInterval(fallbackIntervalId);
        fallbackIntervalId = null;
      }
    },
    dispose() {
      if (worker) {
        worker.postMessage({ cmd: 'stop' });
        worker.terminate();
        worker = null;
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
      if (fallbackIntervalId !== null && typeof window !== 'undefined') {
        window.clearInterval(fallbackIntervalId);
        fallbackIntervalId = null;
      }
    },
  };
}
