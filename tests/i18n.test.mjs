import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('translation catalogs and generated message keys stay in sync', () => {
  const english = JSON.parse(read('public/_locales/en/messages.json'));
  const russian = JSON.parse(read('public/_locales/ru/messages.json'));
  const generated = [...read('src/shared/utils/generated-message-keys.utils.ts')
    .matchAll(/^\s+"([^"]+)"/gm)].map((match) => match[1]);

  assert.deepEqual(Object.keys(english).sort(), Object.keys(russian).sort());
  assert.deepEqual(generated, Object.keys(english).sort());
  for (const [locale, catalog] of Object.entries({ en: english, ru: russian })) {
    for (const [key, translation] of Object.entries(catalog)) {
      assert.ok(translation.message?.trim(), `${locale}: empty translation ${key}`);
    }
  }
});
