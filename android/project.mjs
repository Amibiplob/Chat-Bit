import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { TwaManifest, TwaGenerator, ConsoleLog } = require('@bubblewrap/core');
const { fetchUtils } = require('@bubblewrap/core/dist/lib/FetchUtils.js');

export async function generateProject(directory, value, { localAssets = false } = {}) {
  const manifest = new TwaManifest(value);
  if (manifest.validate() !== null) throw new Error('Invalid Bubblewrap manifest.');
  const original = fetchUtils.fetch;
  try {
    if (localAssets) fetchUtils.fetch = async raw => {
      const url = new URL(raw);
      if (url.origin !== `https://${value.host}`) throw new Error('Unexpected asset origin.');
      if (url.pathname === '/manifest.webmanifest') return Response.json({
        name: value.name, start_url: value.startUrl, display: value.display,
        icons: [{ src: value.iconUrl, sizes: '512x512', type: 'image/png' }],
      });
      const icons = ['/icons/chatbit-512.png', '/icons/chatbit-maskable.png'];
      if (!icons.includes(url.pathname)) throw new Error('Unexpected packaging asset.');
      return new Response(await readFile(new URL(`../public${url.pathname}`, import.meta.url)), { headers: { 'Content-Type': 'image/png' } });
    };
    await new TwaGenerator().createTwaProject(directory, manifest, new ConsoleLog('ChatBit Android'));
    // The pinned generator still emits retired JCenter repositories. All current
    // dependencies resolve from Google Maven / Maven Central.
    for (const path of ['build.gradle', 'app/build.gradle']) {
      const file = join(directory, path);
      let source = (await readFile(file, 'utf8')).replaceAll('jcenter()', 'mavenCentral()');
      if (path === 'app/build.gradle') source = source.replace('compileSdkVersion 36', "compileSdkVersion 36\n    buildToolsVersion '36.1.0'");
      await writeFile(file, source);
    }
    await writeFile(join(directory, 'twa-manifest.json'), JSON.stringify(value, null, 2) + '\n');
  } finally { fetchUtils.fetch = original; }
}
