import { spawnSync } from 'node:child_process';
import { access, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build generated Gradle source directly: no interactive Bubblewrap bootstrap,
// checksum prompt or shell interpolation of signing passwords.
const directory = fileURLToPath(new URL('./generated/', import.meta.url));
const env = process.env;
if (!env.JAVA_HOME || !env.ANDROID_HOME) throw new Error('Set JAVA_HOME (JDK 17) and ANDROID_HOME.');
const unsigned = process.argv.includes('--unsigned');
const debug = process.argv.includes('--debug');
if (debug && unsigned) throw new Error('Choose debug or unsigned release, not both.');
if (!unsigned && !debug && ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEY_ALIAS', 'BUBBLEWRAP_KEYSTORE_PASSWORD', 'BUBBLEWRAP_KEY_PASSWORD'].some(key => !env[key])) {
  throw new Error('Release builds require a keystore, alias and both password environment variables.');
}
function run(command, args) {
  const result = spawnSync(command, args, { cwd: directory, env, stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0) throw new Error(`Android build tool failed: ${command}`);
}
await access(join(directory, 'gradlew'), constants.R_OK);
if (debug) {
  run('bash', ['./gradlew', '--no-daemon', 'assembleDebug']);
  const apk = join(directory, 'app/build/outputs/apk/debug/app-debug.apk');
  run(join(env.ANDROID_HOME, 'build-tools/36.1.0/apksigner'), ['verify', '--verbose', '--print-certs', apk]);
  await copyFile(apk, join(directory, 'ChatBit-debug.apk'));
  console.log('Installable debug-signed APK: android/generated/ChatBit-debug.apk. Testing only.');
} else {
run('bash', ['./gradlew', '--no-daemon', 'assembleRelease', 'bundleRelease']);
const apk = join(directory, 'app/build/outputs/apk/release/app-release-unsigned.apk');
const bundle = join(directory, 'app/build/outputs/bundle/release/app-release.aab');
if (unsigned) {
  await copyFile(apk, join(directory, 'app-release-unsigned.apk'));
  console.log('Unsigned compile only; do not publish this APK.');
} else {
  const tools = join(env.ANDROID_HOME, 'build-tools/36.1.0');
  const keystore = resolve(env.ANDROID_KEYSTORE_PATH);
  run(join(tools, 'zipalign'), ['-c', '-P', '16', '4', apk]);
  run(join(tools, 'apksigner'), ['sign', '--ks', keystore, '--ks-key-alias', env.ANDROID_KEY_ALIAS,
    '--ks-pass', 'env:BUBBLEWRAP_KEYSTORE_PASSWORD', '--key-pass', 'env:BUBBLEWRAP_KEY_PASSWORD',
    '--out', 'app-release-signed.apk', apk]);
  run(join(tools, 'apksigner'), ['verify', '--verbose', '--print-certs', 'app-release-signed.apk']);
  run(join(env.JAVA_HOME, 'bin/jarsigner'), ['-keystore', keystore, '-storepass:env', 'BUBBLEWRAP_KEYSTORE_PASSWORD',
    '-keypass:env', 'BUBBLEWRAP_KEY_PASSWORD', '-signedjar', 'app-release-bundle.aab', bundle, env.ANDROID_KEY_ALIAS]);
  run(join(env.JAVA_HOME, 'bin/jarsigner'), ['-verify', 'app-release-bundle.aab']);
  console.log('Signed APK and AAB created. Verify installation and DAL on a real device.');
}
}
