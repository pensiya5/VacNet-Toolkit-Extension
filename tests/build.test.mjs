import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

for (const browser of ['chrome', 'firefox']) {
  test(`${browser}: installable MV3 package with both runtime contexts and translations`, () => {
    const output = join(root, '.output', `${browser}-mv3`);
    const manifestPath = join(output, 'manifest.json');
    assert.ok(existsSync(manifestPath), `Missing ${browser} build; run npm run build:all first`);
    const manifest = readJson(manifestPath);
    const pkg = readJson(join(root, 'package.json'));

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.default_locale, 'en');
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.deepEqual(manifest.host_permissions, ['https://replay-video.valve.net/*']);
    assert.equal(manifest.content_scripts.length, 2);
    assert.deepEqual(manifest.content_scripts.map((script) => script.world).sort(), ['ISOLATED', 'MAIN']);

    const assets = new Set(Object.values(manifest.icons));
    for (const script of manifest.content_scripts) {
      assert.deepEqual(script.matches, ['https://www.counter-strike.net/vacnet/clips*']);
      assert.equal(script.run_at, 'document_start');
      assert.ok(script.js.length > 0);
      for (const asset of [...script.js, ...(script.css ?? [])]) assets.add(asset);
    }
    if (browser === 'chrome') {
      assert.ok(manifest.background.service_worker);
      assets.add(manifest.background.service_worker);
    } else {
      assert.ok(manifest.background.scripts.length > 0);
      for (const asset of manifest.background.scripts) assets.add(asset);
      assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '128.0');
    }
    for (const asset of assets) {
      assert.ok(existsSync(join(output, asset)), `Missing packaged asset: ${asset}`);
    }

    const english = readJson(join(output, '_locales', 'en', 'messages.json'));
    const russian = readJson(join(output, '_locales', 'ru', 'messages.json'));
    assert.deepEqual(Object.keys(english).sort(), Object.keys(russian).sort());
    const keySource = readFileSync(join(root, 'src/shared/utils/generated-message-keys.utils.ts'), 'utf8');
    const requiredKeys = [...keySource.matchAll(/^\s+"([^"]+)"/gm)].map((match) => match[1]);
    assert.ok(requiredKeys.length > 0);
    for (const [locale, catalog] of Object.entries({ en: english, ru: russian })) {
      for (const key of requiredKeys) {
        assert.ok(catalog[key]?.message?.trim(), `${locale}: missing translation ${key}`);
      }
    }
  });
}
