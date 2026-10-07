import { z } from 'zod';
import { ClipDataSchema, PageSnapshotSchema, type ClipData, type PageSnapshot } from '../../entities/clip.entity';
import { HistoryLookupSchema } from '../../entities/history.entity';
import { PreferencesPatchSchema, PreferencesSchema, type Preferences, type PreferencesPatch } from '../../entities/preferences.entity';
import { VerdictNameSchema, VerdictSelectionSchema, VerdictValueSchema, type VerdictSelection, type VerdictName } from '../../entities/verdict.entity';
import { MessageCatalogSchema, type MessageCatalog } from '../services/i18n.service';

export const toMainEvent = 'vacnet:v3:to-main';
export const fromMainEvent = 'vacnet:v3:from-main';

export const WebmMetadataSchema = z.strictObject({
  matchTimestamp: z.number().finite().nonnegative(),
  duration: z.number().finite().nonnegative(),
});

export const ReviewCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('confirm-verdict') }),
  z.strictObject({ type: z.literal('cancel-verdict') }),
  z.strictObject({ type: z.literal('report-bad-clip') }),
  z.strictObject({
    type: z.literal('set-verdict'),
    name: VerdictNameSchema,
    value: VerdictValueSchema,
  }),
  z.strictObject({
    type: z.literal('set-verdicts'),
    verdicts: VerdictSelectionSchema,
  }),
  z.strictObject({
    type: z.literal('submit'),
    verdicts: VerdictSelectionSchema,
    badClip: z.boolean(),
  }),
]);

export const PlayerCommandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('toggle-playback') }),
  z.strictObject({ type: z.literal('restart') }),
  z.strictObject({ type: z.literal('toggle-zoom') }),
  z.strictObject({ type: z.literal('jump-to-event') }),
  z.strictObject({
    type: z.literal('change-speed'),
    direction: z.union([z.literal(-1), z.literal(1)]),
  }),
  z.strictObject({
    type: z.literal('step'),
    direction: z.union([z.literal(-1), z.literal(1)]),
  }),
]);

export const PlayerOverlayEventSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('speed'), text: z.string().max(32) }),
  z.strictObject({
    kind: z.literal('trigger'),
    phase: z.enum(['countdown', 'flash', 'hidden']),
    text: z.string().max(256),
  }),
]);

export type ReviewCommand =
  | { type: 'confirm-verdict' }
  | { type: 'cancel-verdict' }
  | { type: 'report-bad-clip' }
  | { type: 'set-verdict'; name: VerdictName; value: 'positive' | 'negative' | 'skip' }
  | { type: 'set-verdicts'; verdicts: VerdictSelection }
  | { type: 'submit'; verdicts: VerdictSelection; badClip: boolean };

export type PlayerCommand =
  | { type: 'toggle-playback' }
  | { type: 'restart' }
  | { type: 'toggle-zoom' }
  | { type: 'jump-to-event' }
  | { type: 'change-speed'; direction: -1 | 1 }
  | { type: 'step'; direction: -1 | 1 };

export type PlayerOverlayEvent = z.infer<typeof PlayerOverlayEventSchema>;

export type IsolatedEvent =
  | { type: 'initialize'; catalog: MessageCatalog; preferences: Preferences }
  | { type: 'preferences'; preferences: PreferencesPatch }
  | { type: 'review-command'; command: ReviewCommand }
  | { type: 'player-command'; command: PlayerCommand };

export type MainEvent =
  | { type: 'ready' }
  | { type: 'initialized' }
  | { type: 'snapshot'; snapshot: PageSnapshot }
  | { type: 'preferences'; preferences: PreferencesPatch }
  | { type: 'player-overlay'; overlay: PlayerOverlayEvent };

export type HistoryFindParams = { clip: ClipData };
export type HistorySaveParams = { clip: ClipData; verdicts: VerdictSelection; badClip: boolean; verdictTick?: number | null; submittedAt?: number };
export type WebmMetadata = z.infer<typeof WebmMetadataSchema>;
export type WebmMetadataReadParams = { url: string };

export type RemoteFailure = { code: 'handler-unavailable' | 'handler-failed'; message: string };

const RemoteFailureSchema = z.strictObject({
  code: z.enum(['handler-unavailable', 'handler-failed']),
  message: z.string().max(8_192),
});

const HistoryFindParamsSchema = z.strictObject({ clip: ClipDataSchema });
export const HistorySaveParamsSchema = z.strictObject({
  clip: ClipDataSchema,
  verdicts: VerdictSelectionSchema,
  badClip: z.boolean(),
  verdictTick: z.number().finite().nonnegative().nullable().optional(),
  submittedAt: z.number().finite().nonnegative().optional(),
});
const WebmMetadataReadParamsSchema = z.strictObject({ url: z.string().min(1).max(8_192) });

const IsolatedEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('initialize'), catalog: MessageCatalogSchema, preferences: PreferencesSchema }),
  z.strictObject({ type: z.literal('preferences'), preferences: PreferencesPatchSchema }),
  z.strictObject({ type: z.literal('review-command'), command: ReviewCommandSchema }),
  z.strictObject({ type: z.literal('player-command'), command: PlayerCommandSchema }),
]);

const MainEventSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({ type: z.literal('initialized') }),
  z.strictObject({ type: z.literal('snapshot'), snapshot: PageSnapshotSchema }),
  z.strictObject({ type: z.literal('preferences'), preferences: PreferencesPatchSchema }),
  z.strictObject({ type: z.literal('player-overlay'), overlay: PlayerOverlayEventSchema }),
]);

type WireResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: RemoteFailure };

export type ToMainWireMessage =
  | { kind: 'event'; event: IsolatedEvent }
  | { kind: 'response'; id: string; method: 'history.find' | 'history.save' | 'webm-metadata.read'; result: WireResult<unknown> };

export type FromMainWireMessage =
  | { kind: 'event'; event: MainEvent }
  | { kind: 'request'; id: string; method: 'history.find' | 'history.save' | 'webm-metadata.read'; params: Record<string, unknown> };

const isValidId = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= 128;
const isValidMethod = (value: unknown): value is 'history.find' | 'history.save' | 'webm-metadata.read' =>
  value === 'history.find' || value === 'history.save' || value === 'webm-metadata.read';

const parseWireObject = (detail: unknown): Record<string, unknown> | null => {
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) return null;
  return Object.fromEntries(Object.entries(detail));
};

type RequestMethod = Extract<FromMainWireMessage, { kind: 'request' }>['method'];

const parseResult = (method: RequestMethod, value: unknown): WireResult<unknown> | null => {
  const object = parseWireObject(value);
  if (!object) return null;

  if (object.ok === false) {
    const error = RemoteFailureSchema.safeParse(object.error);
    return error.success ? { ok: false, error: error.data } : null;
  }
  if (object.ok !== true) return null;

  const schema = method === 'history.find'
    ? HistoryLookupSchema
    : method === 'history.save'
      ? z.null()
      : WebmMetadataSchema.nullable();
  const result = schema.safeParse(object.value);
  return result.success ? { ok: true, value: result.data } : null;
};

const parseRequestParams = (method: RequestMethod, value: unknown): Record<string, unknown> | null => {
  const schema = method === 'history.find'
    ? HistoryFindParamsSchema
    : method === 'history.save'
      ? HistorySaveParamsSchema
      : WebmMetadataReadParamsSchema;
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
};

export const parseToMainWireMessage = (detail: unknown): ToMainWireMessage | null => {
  const m = parseWireObject(detail);
  if (!m) return null;
  if (m.kind === 'event') {
    const event = IsolatedEventSchema.safeParse(m.event);
    return event.success ? { kind: 'event', event: event.data } : null;
  }
  if (m.kind === 'response' && isValidId(m.id) && isValidMethod(m.method)) {
    const result = parseResult(m.method, m.result);
    if (!result) return null;
    return { kind: 'response', id: m.id, method: m.method, result };
  }
  return null;
};

export const parseFromMainWireMessage = (detail: unknown): FromMainWireMessage | null => {
  const m = parseWireObject(detail);
  if (!m) return null;
  if (m.kind === 'event') {
    const event = MainEventSchema.safeParse(m.event);
    return event.success ? { kind: 'event', event: event.data } : null;
  }
  if (m.kind === 'request' && isValidId(m.id) && isValidMethod(m.method)) {
    const params = parseRequestParams(m.method, m.params);
    if (!params) return null;
    return { kind: 'request', id: m.id, method: m.method, params };
  }
  return null;
};

declare global {
  interface WindowEventMap {
    'message': MessageEvent;
  }
}
