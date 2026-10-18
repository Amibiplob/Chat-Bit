import assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import manifest from '../app/manifest.ts';

test('install manifest uses one scoped standalone application and real launcher assets', async () => {
  const value = manifest();
  assert.equal(value.id, '/');
  assert.equal(value.start_url, '/chat');
  assert.equal(value.scope, '/');
  assert.equal(value.display, 'standalone');
  for (const icon of value.icons) {
    const meta = await sharp(fileURLToPath(new URL(`../public${icon.src}`, import.meta.url))).metadata();
    assert.equal(`${meta.width}x${meta.height}`, icon.sizes);
    assert.equal(meta.format, 'png');
  }
  assert.ok(value.icons.some(icon => icon.purpose === 'maskable'));
});
