import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Android build orchestration keeps signing passwords out of tool arguments and requires release secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chatbit-build-fixture-'));
  try {
    for (const path of ['generated', 'sdk/build-tools/36.1.0', 'jdk/bin']) await mkdir(join(root, path), { recursive: true });
    await copyFile(new URL('../android/build.mjs', import.meta.url), join(root, 'build.mjs'));
    await writeFile(join(root, 'generated/gradlew'), 'mkdir -p app/build/outputs/apk/release app/build/outputs/bundle/release\nprintf fixture > app/build/outputs/apk/release/app-release-unsigned.apk\nprintf fixture > app/build/outputs/bundle/release/app-release.aab\n');
    const tool = `#!${process.execPath}\nimport { appendFileSync, writeFileSync } from 'node:fs';\nconst args=process.argv.slice(2);appendFileSync(process.env.TOOL_TRACE,JSON.stringify(args)+'\\n');for(const flag of ['--out','-signedjar']){const index=args.indexOf(flag);if(index>=0)writeFileSync(args[index+1],'fixture');}\n`;
    for (const path of ['sdk/build-tools/36.1.0/apksigner', 'sdk/build-tools/36.1.0/zipalign', 'jdk/bin/jarsigner']) await writeFile(join(root, path), tool, { mode: 0o700 });
    const env = { ...process.env, JAVA_HOME: join(root, 'jdk'), ANDROID_HOME: join(root, 'sdk'), ANDROID_KEYSTORE_PATH: join(root, 'fixture.keystore'), ANDROID_KEY_ALIAS: 'fixture', BUBBLEWRAP_KEYSTORE_PASSWORD: 'fixture secret " $()', BUBBLEWRAP_KEY_PASSWORD: 'fixture other secret', TOOL_TRACE: join(root, 'trace') };
    const result = spawnSync(process.execPath, [join(root, 'build.mjs')], { env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const trace = await readFile(env.TOOL_TRACE, 'utf8');
    assert.ok(!trace.includes(env.BUBBLEWRAP_KEYSTORE_PASSWORD));
    assert.ok(!trace.includes(env.BUBBLEWRAP_KEY_PASSWORD));
    assert.match(trace, /env:BUBBLEWRAP_KEYSTORE_PASSWORD/);
    assert.match(trace, /-storepass:env/);
    assert.equal(await readFile(join(root, 'generated/app-release-signed.apk'), 'utf8'), 'fixture');
    const missing = spawnSync(process.execPath, [join(root, 'build.mjs')], { env: { ...env, BUBBLEWRAP_KEY_PASSWORD: '' }, encoding: 'utf8' });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Release builds require/);
    const unsigned = spawnSync(process.execPath, [join(root, 'build.mjs'), '--unsigned'], { env: { ...env, BUBBLEWRAP_KEY_PASSWORD: '' }, encoding: 'utf8' });
    assert.equal(unsigned.status, 0, unsigned.stderr);
    assert.equal(await readFile(join(root, 'generated/app-release-unsigned.apk'), 'utf8'), 'fixture');
  } finally { await rm(root, { recursive: true, force: true }); }
});
