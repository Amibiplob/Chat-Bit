import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { resolvedTheme } from '../lib/theme.mjs';

const bootstrap = readFileSync(new URL('../public/theme-bootstrap.js', import.meta.url), 'utf8');
test('the served bootstrap matches theme preferences and tolerates unavailable storage', () => {
  for (const dark of [false, true]) {
    for (const preference of ['light', 'dark', 'system', 'unknown', null, 'storage-error']) {
      let applied;
      runInNewContext(bootstrap, {
        localStorage: { getItem() { if (preference === 'storage-error') throw new Error('Storage blocked'); return preference; } },
        matchMedia: () => ({ matches: dark }),
        document: { documentElement: { classList: { toggle(name, value) { assert.equal(name, 'dark'); applied = value; } } } },
      });
      assert.equal(applied, resolvedTheme(preference, dark) === 'dark');
    }
  }
});
