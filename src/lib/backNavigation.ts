import { App as CapApp } from '@capacitor/app';

export type BackHandler = () => boolean; // return true if handled

const backHandlers: BackHandler[] = [];

/**
 * Register a local back handler (e.g. inside a modal, drawer, or sub-tab).
 * Last registered handler is executed first (LIFO order).
 * Returns an unregister cleanup function.
 */
export function registerBackHandler(handler: BackHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const idx = backHandlers.lastIndexOf(handler);
    if (idx !== -1) {
      backHandlers.splice(idx, 1);
    }
  };
}

/**
 * Executes registered back handlers in reverse order.
 * Returns true if a handler consumed the event.
 */
export function executeBackHandlers(): boolean {
  for (let i = backHandlers.length - 1; i >= 0; i--) {
    try {
      const handled = backHandlers[i]();
      if (handled) {
        return true;
      }
    } catch (err) {
      console.error('[EstateMaster BackHandler] Error executing handler:', err);
    }
  }
  return false;
}

/**
 * Safe exit helper for Android APK via Capacitor App plugin.
 */
export async function exitAppSafely(): Promise<void> {
  try {
    await CapApp.exitApp();
  } catch (e) {
    // If not in Capacitor or in web browser, fall back to window history or no-op
    if (window.history.length > 1) {
      window.history.back();
    }
  }
}
