import { isNativeReviewPage } from './review-mode.utils';

export interface ValveTimerHijacker {
  markClipTransition: () => void;
  markPlayerReplacement: () => void;
  dispose: () => void;
}

export const installValveTimerHijacker = (): ValveTimerHijacker => {
  const existing = window.__vacnetTimerHijacker;
  if (existing) return existing;
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  let hasClipTransition = false;
  let hasPlayerReplacement = false;
  // The updated layout is parsed before the inline video scripts, while the
  // verdict form appears later. Preserve its timers from their first invocation.
  const preserveSiteTimers = (): boolean => isNativeReviewPage(document)
    || document.querySelector('.review-layout') !== null;
  const pendingValveTimeouts = new Set<number>();

  type TimerHandlerFn = (...args: unknown[]) => void;
  const valveTimerCache = new WeakMap<TimerHandlerFn, Map<string, boolean>>();

  const isValveTimerPattern = (handler: TimerHandler, timeout: number | undefined, patterns: string[]): boolean => {
    if (timeout === undefined || typeof handler !== 'function') return false;
    const fn = handler as TimerHandlerFn;
    const cacheKey = patterns.join('|');
    let handlerCache = valveTimerCache.get(fn);
    if (!handlerCache) {
      handlerCache = new Map();
      valveTimerCache.set(fn, handlerCache);
    }
    const cached = handlerCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const result = patterns.every((pattern) => Function.prototype.toString.call(handler).includes(pattern));
    handlerCache.set(cacheKey, result);
    return result;
  };

  const guardedSetInterval = (
    handler: TimerHandler,
    timeout?: number,
    ...parameters: unknown[]
  ): number => {
    if (!preserveSiteTimers() && isValveTimerPattern(handler, timeout, ['startTime', 'endTime', 'currentTime'])) return -1;
    return nativeSetInterval(handler, timeout, ...parameters);
  };

  const guardedSetTimeout = (
    handler: TimerHandler,
    timeout?: number,
    ...parameters: unknown[]
  ): number => {
    if (!preserveSiteTimers() && isValveTimerPattern(handler, timeout, ['startTime', 'currentTime'])) {
      if (hasClipTransition || hasPlayerReplacement) return -1;
      const timeoutId = nativeSetTimeout(handler, timeout, ...parameters);
      pendingValveTimeouts.add(timeoutId);
      return timeoutId;
    }
    return nativeSetTimeout(handler, timeout, ...parameters);
  };

  try {
    Object.defineProperty(window, 'setInterval', { configurable: true, writable: true, value: guardedSetInterval });
    Object.defineProperty(window, 'setTimeout', { configurable: true, writable: true, value: guardedSetTimeout });
  } catch (error) {
    if (window.setInterval === guardedSetInterval) {
      Object.defineProperty(window, 'setInterval', { configurable: true, writable: true, value: nativeSetInterval });
    }
    throw error;
  }

  const hijacker: ValveTimerHijacker = {
      markClipTransition: () => {
        hasClipTransition = true;
      },
      markPlayerReplacement: () => {
        hasPlayerReplacement = true;
        for (const timeoutId of pendingValveTimeouts) nativeClearTimeout(timeoutId);
        pendingValveTimeouts.clear();
      },
    dispose: () => {
        for (const timeoutId of pendingValveTimeouts) nativeClearTimeout(timeoutId);
        pendingValveTimeouts.clear();
      if (window.setInterval === guardedSetInterval) {
        Object.defineProperty(window, 'setInterval', { configurable: true, writable: true, value: nativeSetInterval });
      }
      if (window.setTimeout === guardedSetTimeout) {
        Object.defineProperty(window, 'setTimeout', { configurable: true, writable: true, value: nativeSetTimeout });
      }
      delete window.__vacnetTimerHijacker;
    },
  };
  window.__vacnetTimerHijacker = hijacker;
  return hijacker;
};

declare global {
  interface Window {
    __vacnetTimerHijacker?: ValveTimerHijacker;
  }
}
