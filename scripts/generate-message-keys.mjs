import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const file = (path) => new URL(`../${path}`, import.meta.url);
const [english, russian] = await Promise.all(['en', 'ru'].map(async (locale) =>
  JSON.parse(await readFile(file(`public/_locales/${locale}/messages.json`), 'utf8'))));
const keys = Object.keys(english).sort();
assert.deepEqual(keys, Object.keys(russian).sort(), 'English and Russian translation keys must match');
for (const [locale, catalog] of Object.entries({ en: english, ru: russian })) {
  for (const key of keys) {
    assert.ok(catalog[key].message?.trim(), `${locale}: empty translation ${key}`);
  }
}
const source = `export const messageKeys = [\n${keys.map((key) => `  ${JSON.stringify(key)},`).join('\n')}\n] as const;\n\nexport type MessageKey = (typeof messageKeys)[number];\n`;
await writeFile(file('src/shared/utils/generated-message-keys.utils.ts'), source);
console.log(`Generated ${keys.length} translation keys.`);
