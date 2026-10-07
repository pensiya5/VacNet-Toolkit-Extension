const VIDEO_SELECTOR = '[data-vacnet-review-video], #video_html5_api, video#video, #video video, video#video';

const hasVideoSource = (root: Document): boolean => {
  const video = root.querySelector<HTMLVideoElement>(VIDEO_SELECTOR);
  if (video && (video.currentSrc || video.getAttribute('src') || video.src)) return true;
  return !!video?.querySelector<HTMLSourceElement>('source[src]')?.getAttribute('src')?.trim();
};

const hasTask = (root: Document): boolean => Boolean(
  root.querySelector<HTMLInputElement>("#submitverdictform input[name='verdict_task']")?.value.trim()
  || root.querySelector<HTMLAnchorElement>("#detailsModalContent .detailstable a[href*='/vacnet/view']")?.textContent.trim(),
);

const hasTiming = (root: Document): boolean => {
  if (root.querySelector('[data-start-time], [data-clip-start]')) return true;
  return Array.from(root.scripts).some((script) => /videojs\s*\(\s*['"]video['"]\s*\)/u.test(script.textContent)
    && /(?:startTime|endTime|eventTime)\s*=/u.test(script.textContent));
};

const isValvePageReady = (root: Document): boolean => Boolean(
  root.querySelector('.videocontainer')
  && root.querySelector('#submitverdictform')
  && root.querySelector(VIDEO_SELECTOR)
  && hasVideoSource(root)
  && hasTask(root)
  && hasTiming(root),
);

export const waitForValvePageReady = (root: Document, signal: AbortSignal): Promise<void> => {
  if (isValvePageReady(root)) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    const observer = new MutationObserver(check);

    const cleanup = (): void => {
      observer.disconnect();
      signal.removeEventListener('abort', abort);
    };
    const complete = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const abort = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Valve page initialization aborted.', 'AbortError'));
    };
    function check(): void {
      if (isValvePageReady(root)) complete();
    }

    signal.addEventListener('abort', abort, { once: true });
    observer.observe(root.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-start-time', 'data-clip-start', 'value'] });
    check();
  });
};
