import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { decryptBackup, encryptBackup, fileHash } from '../scripts/backup-crypto.mjs';
import { sourceConfiguration } from '../scripts/backup-database.mjs';

test('backup workflow is manual/default-branch guarded and uploads an explicit encrypted-only allowlist', async () => {
  const require = createRequire(import.meta.url);
  const { load } = createRequire(require.resolve('eslint/package.json'))('js-yaml');
  const workflow = load(await readFile(new URL('../.github/workflows/backup-database.yml', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  const steps = workflow.jobs.backup.steps;
  assert.match(steps[0].run, /test "\$CONFIRMED" = true/);
  assert.match(steps[0].run, /test "\$GITHUB_REF" = "refs\/heads\/\$DEFAULT_BRANCH"/);
  const secretSteps = steps.filter(step => JSON.stringify(step).includes('secrets.'));
  assert.equal(secretSteps.length, 1);
  assert.equal(secretSteps[0].run, 'node scripts/backup-database.mjs');
  const uploads = steps.filter(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.equal(uploads.length, 1);
  assert.deepEqual(uploads[0].with.path.trim().split('\n'), [
    '${{ runner.temp }}/chatbit-backup/encrypted/chatbit-backup.tar.enc',
    '${{ runner.temp }}/chatbit-backup/encrypted/chatbit-backup.tar.enc.sha256',
  ]);
  assert.equal(uploads[0].with['retention-days'], 7);
  assert.equal(steps.at(-1).if, 'always()');
});

test('backup confirmation accepts only checked input on the default branch', async () => {
  const require = createRequire(import.meta.url);
  const { load } = createRequire(require.resolve('eslint/package.json'))('js-yaml');
  const workflow = load(await readFile(new URL('../.github/workflows/backup-database.yml', import.meta.url), 'utf8'));
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.confirm_quiet_source, {
    description: 'I paused application writes and concurrent schema/role changes for this backup',
    type: 'boolean', required: true, default: false,
  });
  const guard = workflow.jobs.backup.steps[0];
  // Verify the real input binding; do not substitute a truthiness fallback that
  // could accept the nonempty string "false" as confirmation.
  assert.equal(guard.env.CONFIRMED, '${{ inputs.confirm_quiet_source }}');
  assert.equal(guard.env.DEFAULT_BRANCH, '${{ github.event.repository.default_branch }}');
  for (const [confirmed, ref, branch, accepted] of [
    [true, 'refs/heads/main', 'main', true],
    [false, 'refs/heads/main', 'main', false],
    ['', 'refs/heads/main', 'main', false],
    ['TRUE', 'refs/heads/main', 'main', false],
    ['false; exit 0', 'refs/heads/main', 'main', false],
    [true, 'refs/heads/topic', 'main', false],
    [true, 'refs/tags/main', 'main', false],
    [true, 'refs/heads/release', 'release', true],
  ]) {
    // Execute only the YAML's first guard step, with no inherited environment,
    // credentials, backup command, network access or database connection.
    const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', guard.run], {
      env: { CONFIRMED: String(confirmed), GITHUB_REF: ref, DEFAULT_BRANCH: branch },
      encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, accepted ? 0 : 1, `confirmation=${confirmed}, ref=${ref}`);
    if (String(confirmed) !== 'true') assert.match(result.stdout, /::error::Quiet-source confirmation was not true/);
  }
});

test('backup source accepts only verified Supabase TLS/session endpoints, never local or transaction-pooler URLs', () => {
  const env = { SUPABASE_BACKUP_HOST: 'aws-0-example.pooler.supabase.com', SUPABASE_BACKUP_USER: 'postgres.example',
    SUPABASE_BACKUP_PASSWORD: 'test-only', SUPABASE_BACKUP_CA: '-----BEGIN CERTIFICATE-----\nfixture',
    CHATBIT_BACKUP_PASSPHRASE: 'isolated-test-passphrase-32-characters' };
  const config = sourceConfiguration(env);
  assert.equal(config.port, 5432);
  assert.equal(config.database, 'postgres');
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.match(config.options, /default_transaction_read_only=on/);
  for (const host of ['127.0.0.1', 'example.com', 'postgresql://private@host/postgres', 'pooler.supabase.com.evil.invalid']) {
    assert.throws(() => sourceConfiguration({ ...env, SUPABASE_BACKUP_HOST: host }));
  }
  assert.throws(() => sourceConfiguration({ ...env, SUPABASE_BACKUP_USER: 'someone_else' }));
  assert.throws(() => sourceConfiguration({ ...env, SUPABASE_BACKUP_CA: '' }));
  assert.throws(() => sourceConfiguration({ ...env, CHATBIT_BACKUP_PASSPHRASE: 'short' }));
});

test('authenticated backup encryption round trip rejects tampering/wrong keys and preserves existing recovery files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chatbit-backup-crypto-'));
  try {
    const input = join(directory, 'backup.tar');
    const encrypted = join(directory, 'backup.enc');
    const output = join(directory, 'recovered.tar');
    const secret = randomBytes(48).toString('base64');
    const bytes = randomBytes(1024 * 1024 + 7);
    await writeFile(input, bytes, { mode: 0o600 });
    await encryptBackup(input, encrypted, secret);
    assert.equal((await stat(encrypted)).mode & 0o777, 0o600);
    assert.notEqual(await fileHash(input), await fileHash(encrypted));
    await decryptBackup(encrypted, output, secret);
    assert.equal(await fileHash(input), await fileHash(output));
    assert.deepEqual(await readFile(output), bytes);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    await assert.rejects(decryptBackup(encrypted, output, secret));
    assert.deepEqual(await readFile(output), bytes);
    await assert.rejects(encryptBackup(input, encrypted, secret));

    const badOutput = join(directory, 'wrong-key.tar');
    await assert.rejects(decryptBackup(encrypted, badOutput, randomBytes(48).toString('base64')));
    await assert.rejects(stat(badOutput), { code: 'ENOENT' });
    await assert.rejects(stat(`${badOutput}.partial`), { code: 'ENOENT' });

    const modified = await readFile(encrypted);
    modified[modified.length - 20] ^= 1;
    const tampered = join(directory, 'tampered.enc');
    await writeFile(tampered, modified);
    assert.notEqual(await fileHash(tampered), await fileHash(encrypted));
    await assert.rejects(decryptBackup(tampered, badOutput, secret));
    await assert.rejects(stat(badOutput), { code: 'ENOENT' });

    const partial = `${badOutput}.partial`;
    await writeFile(partial, 'existing private recovery file');
    await assert.rejects(decryptBackup(encrypted, badOutput, secret));
    assert.equal(await readFile(partial, 'utf8'), 'existing private recovery file');
    await assert.rejects(stat(badOutput), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Neon backup selection requires direct credentials and verified system CA without Supabase fallback', () => {
  const env={BACKUP_DATABASE_PROVIDER:'neon',BACKUP_DATABASE_HOST:'ep-test.us-east-2.aws.neon.tech',BACKUP_DATABASE_USER:'neondb_owner',BACKUP_DATABASE_PASSWORD:'synthetic-private',BACKUP_DATABASE_NAME:'neondb',CHATBIT_BACKUP_PASSPHRASE:'x'.repeat(32)};
  const config=sourceConfiguration(env);
  assert.equal(config.database,'neondb');assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.ssl.ca,undefined);
  assert.match(config.options,/default_transaction_read_only=on/);
  for(const patch of [{BACKUP_DATABASE_HOST:'ep-test-pooler.us-east-2.aws.neon.tech'},{BACKUP_DATABASE_HOST:'localhost'},{BACKUP_DATABASE_USER:''},{BACKUP_DATABASE_PASSWORD:''},{BACKUP_DATABASE_NAME:''},{BACKUP_DATABASE_PROVIDER:'typo'}]) assert.throws(()=>sourceConfiguration({...env,...patch}));
});
