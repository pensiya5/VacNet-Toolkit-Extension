import { expect, it } from 'vitest';
import html from './fixtures/review-page.html?raw';
import { waitForValvePageReady } from '../src/features/valve-interop/valve-page-ready.service';

it('waits for a late native video source before allowing initialization', async () => {
  document.documentElement.innerHTML = html;
  const video = document.querySelector<HTMLVideoElement>('#video_html5_api')!;
  const source = video.querySelector('source')!;
  source.remove();
  let ready = false;
  const waiting = waitForValvePageReady(document, new AbortController().signal).then(() => { ready = true; });
  await Promise.resolve();
  expect(ready).toBe(false);
  video.append(source);
  await waiting;
  expect(ready).toBe(true);
});
