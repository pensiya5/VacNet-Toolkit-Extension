import { getMessage } from '../../shared/services/i18n.service';
import { extractVideoId, type ClipData, type ClipRange } from '../../entities/clip.entity';
import type { WebmMetadata } from '../../shared/ports/protocol.port';
import { getAllowedValvePageUrl, getAllowedValveSubmitUrl, getAllowedWebmUrl } from '../../shared/utils/url.utils';
import { isNativeReviewPage } from './review-mode.utils';

type WebmMetadataReader = (url: string) => Promise<WebmMetadata | null>;

interface ClipTiming {
  range: ClipRange;
  eventTime: number;
}

export interface ParsedValvePage {
  document: Document;
  clip: ClipData;
}

const readSource = (root: Document): string => {
  const video = root.querySelector<HTMLVideoElement>('[data-vacnet-review-video], #video_html5_api, video#video, #video video');
  const sourceElement = root.querySelector<HTMLSourceElement>('[data-vacnet-review-video] source, #video source, video#video source, video source');
  const source = video?.currentSrc
    || video?.getAttribute('src')
    || sourceElement?.getAttribute('src')
    || video?.src
    || sourceElement?.src;
  if (!source?.trim()) throw new Error(getMessage("errValveNoVideoSource"));
  return source.trim();
};

const readTaskId = (root: Document): string => {
  const formValue = root
    .querySelector<HTMLInputElement>("#submitverdictform input[name='verdict_task']")
    ?.value.trim();
  if (formValue) return formValue;

  const detailValue = root
    .querySelector<HTMLAnchorElement>("#detailsModalContent .detailstable a[href*='/vacnet/view']")
    ?.textContent.trim();
  if (!detailValue) throw new Error(getMessage("errValveNoTaskId"));
  return detailValue;
};

const createTiming = (start: number, end: number, eventTime: number): ClipTiming | null => {
  if (!Number.isFinite(start) || start < 0) return null;
  if (!Number.isFinite(end) || end <= start) return null;
  if (!Number.isFinite(eventTime) || (eventTime < 0 && eventTime !== -1)) return null;

  return { range: { start, end }, eventTime };
};

const parseNumericValue = (expression: string, baseStart: number): number | null => {
  if (!expression.trim()) return null;
  const numeric = Number(expression);
  if (Number.isFinite(numeric)) return numeric;
  const offset = expression.match(/^startTime\s*([+-])\s*(\d+(?:\.\d+)?)$/u);
  if (!offset) return null;
  const [, operator, rawValue] = offset;
  if (!operator || !rawValue) return null;
  const value = Number(rawValue);
  return operator === '-' ? baseStart - value : baseStart + value;
};

const extractScriptDeclarations = (source: string): Map<string, string> => {
  const declarations = new Map<string, string>();
  if (!/videojs\s*\(\s*['"]video['"]\s*\)/u.test(source)) return declarations;
  for (const match of source.matchAll(/(?:^|[;\n])\s*(?:const|let|var)\s+(startTime|endTime|eventTime)\s*=\s*([^;\n]+)/gu)) {
    const [, name, expression] = match;
    if (name && expression) declarations.set(name, expression.trim());
  }
  return declarations;
};

const timingFromScript = (source: string): ClipTiming | null => {
  const declarations = extractScriptDeclarations(source);
  if (declarations.size === 0) return null;
  const start = parseNumericValue(declarations.get('startTime') ?? '', 0);
  if (start === null) return null;
  const end = parseNumericValue(declarations.get('endTime') ?? '', start);
  const eventTime = parseNumericValue(declarations.get('eventTime') ?? '', start);
  if (end === null || eventTime === null) return null;
  return createTiming(start, end, eventTime);
};

const readTimingFromElement = (element: HTMLElement | null): ClipTiming | null => {
  if (!element) return null;
  const startAttribute = element.dataset.startTime ?? element.dataset.clipStart;
  const endAttribute = element.dataset.endTime ?? element.dataset.clipEnd;
  if (startAttribute === undefined && endAttribute === undefined) return null;
  return createTiming(Number(startAttribute), Number(endAttribute), Number(element.dataset.eventTime));
};

const readTimingFromScripts = (scripts: HTMLCollectionOf<HTMLScriptElement>): ClipTiming | null => {
  for (let i = 0; i < scripts.length; i++) {
    const timing = timingFromScript(scripts[i]!.textContent);
    if (timing) return timing;
  }
  return null;
};

const readTiming = (root: Document): ClipTiming => {
  const element = root.querySelector<HTMLElement>('[data-start-time], [data-clip-start]');
  const timing = readTimingFromElement(element) ?? readTimingFromScripts(root.scripts);
  if (!timing) throw new Error(getMessage("errValveNoTiming"));
  return timing;
};

const readApp = (root: Document): string => {
  const rows = Array.from(
    root.querySelectorAll<HTMLTableRowElement>('#detailsModalContent .detailstable tr, .detailstable tr'),
  );
  for (const row of rows) {
    const key = row.cells[0]?.textContent.trim().toLowerCase() ?? '';
    const value = row.cells[1]?.textContent.trim() ?? '';
    if (/^(?:app|application|приложение)$/iu.test(key) && value) return value;
  }
  return rows[1]?.cells[1]?.textContent.trim() || '730';
};

export const readValveClip = async (
  root: Document,
  baseUrl: string,
  readWebmMetadata: WebmMetadataReader,
): Promise<ClipData> => {
  const source = readSource(root);
  const taskId = readTaskId(root);
  const allowedBaseUrl = getAllowedValvePageUrl(baseUrl);
  if (!allowedBaseUrl) throw new Error(getMessage("errValveUnexpectedPageUrl", baseUrl));
  const sourceWebmUrl = getAllowedWebmUrl(new URL(source, allowedBaseUrl).href)?.href;
  if (!sourceWebmUrl) throw new Error(getMessage("errValveDisallowedVideoUrl", source));
  const timing = readTiming(root);
  const reviewType = isNativeReviewPage(root) ? 'cheating' : 'legacy';
  if (timing.eventTime < 0 && reviewType === 'legacy') throw new Error(getMessage('errValveNoTiming'));
  const metadata = await readWebmMetadata(sourceWebmUrl);

  return {
    taskId,
    sourceWebmUrl,
    videoId: extractVideoId(sourceWebmUrl),
    range: timing.range,
    eventTime: timing.eventTime,
    reviewType,
    clipCount: root.querySelector('.ClipCount')?.textContent.match(/\d+/u)?.[0] ?? null,
    app: readApp(root),
    matchTimestamp: metadata?.matchTimestamp ?? null,
    webmDuration: metadata?.duration ?? null,
  };
};

export const parseValvePage = async (
  html: string,
  baseUrl: string,
  readWebmMetadata: WebmMetadataReader,
): Promise<ParsedValvePage> => {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const form = parsed.querySelector<HTMLFormElement>('#submitverdictform');
  if (!form) throw new Error(getMessage("errValveNextFormMissing"));
  const allowedBaseUrl = getAllowedValvePageUrl(baseUrl);
  if (!allowedBaseUrl) throw new Error(getMessage("errValveUnexpectedPageUrl", baseUrl));
  const rawAction = form.getAttribute('action')?.trim();
  if (!rawAction) throw new Error(getMessage("errValveNextFormNoAction"));
  const action = getAllowedValveSubmitUrl(new URL(rawAction, allowedBaseUrl).href);
  if (!action) throw new Error(getMessage("errValveDisallowedActionUrl", new URL(rawAction, allowedBaseUrl).href));
  form.action = action.href;
  return { document: parsed, clip: await readValveClip(parsed, allowedBaseUrl.href, readWebmMetadata) };
};
