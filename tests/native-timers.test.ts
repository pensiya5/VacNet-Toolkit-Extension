import { afterEach, expect, it, vi } from 'vitest';
import { installValveTimerHijacker, type ValveTimerHijacker } from '../src/features/valve-interop/timer-hijacker.injector';

let hijacker: ValveTimerHijacker | null = null;
afterEach(() => { hijacker?.dispose(); hijacker = null; vi.useRealTimers(); });

it('preserves new site timers before the verdict form has been parsed', () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div class="review-layout"><div class="videocontainer"></div></div>';
  hijacker = installValveTimerHijacker();
  const tick = vi.fn();
  window.setInterval(function () { const startTime = 0; const endTime = 10; const currentTime = 2; tick(startTime, endTime, currentTime); }, 1_000);
  window.setTimeout(function () { const startTime = 0; const currentTime = 2; tick(startTime, currentTime); }, 1_000);
  hijacker.dispose();
  vi.advanceTimersByTime(1_000);
  expect(tick).toHaveBeenCalledTimes(2);
});

it('retains legacy timer suppression for the replaced clip player', () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div class="flex-row-wrap"></div>';
  hijacker = installValveTimerHijacker();
  const tick = vi.fn();
  window.setInterval(function () { const startTime = 0; const endTime = 10; const currentTime = 2; tick(startTime, endTime, currentTime); }, 1_000);
  vi.advanceTimersByTime(1_000);
  expect(tick).not.toHaveBeenCalled();
});
