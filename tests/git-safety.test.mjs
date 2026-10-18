import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

test('git ignore protects private/generated artifacts without hiding configuration, migrations or fixtures', () => {
  const privatePaths = ['.env', '.env.local', '.env.production.local', '.env.local.backup', 'certs/private.crt', 'certificates/private.pem', 'credentials/account.json', '.aws/credentials', '.pgpass', 'private.key', 'signing.jks', 'android.keystore', 'private.p12', 'private.pfx', 'backups/export.sql', 'backup/export.tar', 'export.dump', 'export.dump.gz', 'database-backup.sql', 'database.backup.sql', 'backup.sql', 'export.sql.bak', 'export.tar.enc', 'export.tar.enc.sha256', 'local.log', 'notes.tmp', 'file.tsx~', '.vscode/settings.json', '.idea/project.xml', '.next/server/build.js', 'node_modules/package/index.js', 'test-results.log', 'coverage/index.html', '.cache/tool', '.pnpm-store/index', 'tsconfig.tsbuildinfo'];
  const sourcePaths = ['.env.example', 'db/migrations/001_initial.sql', 'db/migrations/008_security_hardening.sql', '.github/workflows/verify.yml', '.github/workflows/backup-database.yml', 'components.json', 'package.json', 'pnpm-lock.yaml', 'tests/fixtures/example.sql', 'tests/fixtures/example.json', 'tests/fixtures/example.yaml'];
  const ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin'], { input: [...privatePaths, ...sourcePaths].join('\n'), encoding: 'utf8' }).trim().split('\n');
  assert.deepEqual(ignored, privatePaths);
  assert.equal(execFileSync('git', ['check-ignore', '--no-index', '--stdin'], { input: '.ssh/config\nid_ed25519\nexport.sql.xz\nexport.sql.zst\n', encoding: 'utf8' }), '.ssh/config\nid_ed25519\nexport.sql.xz\nexport.sql.zst\n');
  const android = ['android/generated/app/build.gradle', 'android/node_modules/tool/index.js', 'android/signing/release.jks', 'android/local.properties', 'release-assets/ChatBit-v1.0.0.apk', 'app-release.aab', 'android/.gradle/cache'];
  assert.deepEqual(execFileSync('git', ['check-ignore', '--no-index', '--stdin'], { input: android.join('\n'), encoding: 'utf8' }).trim().split('\n'), android);
});
