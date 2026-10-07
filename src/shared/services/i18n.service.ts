import { z } from 'zod';
import russianMessages from '../../../public/_locales/ru/messages.json';
import { messageKeys, type MessageKey } from '../utils/generated-message-keys.utils';

export { messageKeys, type MessageKey } from '../utils/generated-message-keys.utils';

const catalogShape = Object.fromEntries(
  messageKeys.map((key) => [key, z.string().min(1)]),
) as Record<MessageKey, z.ZodString>;

export const MessageCatalogSchema = z.strictObject({
  ...catalogShape,
  videoJsLocale: z.enum(['ru', 'en']),
});

export type MessageCatalog = z.infer<typeof MessageCatalogSchema>;

export type Translate = (key: MessageKey, substitutions?: string | string[]) => string;

export const getMessage: Translate = (key, substitutions) => {
  const message = russianMessages[key]?.message;
  if (!message) throw new Error(`Missing browser translation: ${key}`);
  if (substitutions === undefined) return message;
  const values = Array.isArray(substitutions) ? substitutions : [substitutions];
  let index = 0;
  return message.replace(/\{[^{}]+\}/gu, (placeholder) => values[index++] ?? placeholder);
};

export const createCatalog = (): MessageCatalog => MessageCatalogSchema.parse({
  ...Object.fromEntries(messageKeys.map((key) => [key, getMessage(key)])),
  videoJsLocale: 'ru',
});
