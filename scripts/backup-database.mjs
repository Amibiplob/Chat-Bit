// Only the manual backup workflow calls this script. Never loads dotenv or runs migrations.
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import { decryptBackup, encryptBackup, fileHash } from './backup-crypto.mjs';

const container = 'chatbit-backup-pg17';
const root = join(process.env.RUNNER_TEMP ?? '/tmp', 'chatbit-backup');
const plain = join(root, 'plain');
const out = join(root, 'encrypted');
let stage = 'configuration';

function check(condition) { if (!condition) throw new Error('Backup verification failed'); }
const quote = value => `"${value.replaceAll('"', '""')}"`;

// Reject transaction-pooler URLs, accidental local targets and arbitrary external hosts.
export function sourceConfiguration(env) {
  const provider = env.BACKUP_DATABASE_PROVIDER || 'supabase';
  check(['supabase','neon'].includes(provider));
  if (provider === 'neon') {
    const host = env.BACKUP_DATABASE_HOST ?? '';
    check(/^[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/.test(host) && !host.includes('-pooler.'));
    check(Boolean(env.BACKUP_DATABASE_USER) && Boolean(env.BACKUP_DATABASE_PASSWORD) && Boolean(env.BACKUP_DATABASE_NAME));
    check((env.CHATBIT_BACKUP_PASSPHRASE ?? '').length >= 32);
    return { host, user: env.BACKUP_DATABASE_USER, password: env.BACKUP_DATABASE_PASSWORD,
      database: env.BACKUP_DATABASE_NAME, port: 5432, ssl: { rejectUnauthorized: true },
      options: '-c default_transaction_read_only=on -c lock_timeout=10000',
      connectionTimeoutMillis: 15000, application_name: 'chatbit_manual_backup' };
  }
  const host = env.SUPABASE_BACKUP_HOST ?? '';
  const user = env.SUPABASE_BACKUP_USER ?? '';
  check(/^(?:db\.[a-z0-9]+\.supabase\.co|[a-z0-9.-]+\.pooler\.supabase\.com)$/.test(host));
  check(host.endsWith('.pooler.supabase.com') ? /^postgres\.[a-z0-9]+$/.test(user) : user === 'postgres');
  check(Boolean(env.SUPABASE_BACKUP_PASSWORD));
  check((env.SUPABASE_BACKUP_CA ?? '').includes('-----BEGIN CERTIFICATE-----'));
  check((env.CHATBIT_BACKUP_PASSPHRASE ?? '').length >= 32);
  return {
    host, user, password: env.SUPABASE_BACKUP_PASSWORD, port: 5432, database: 'postgres',
    ssl: { rejectUnauthorized: true, ca: env.SUPABASE_BACKUP_CA },
    options: '-c default_transaction_read_only=on -c lock_timeout=10000',
    connectionTimeoutMillis: 15000, application_name: 'chatbit_manual_backup',
  };
}

// Child output is deliberately not forwarded: database errors can contain private data.
async function run(command, args, env = {}) {
  const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.startsWith('SUPABASE_BACKUP_') && !key.startsWith('BACKUP_DATABASE_') && key !== 'CHATBIT_BACKUP_PASSPHRASE'));
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...safeEnv, ...env }, stdio: 'ignore', shell: false });
    child.on('error', () => reject(new Error('Backup tool could not start')));
    child.on('close', code => code === 0 ? resolve() : reject(new Error('Backup tool failed')));
  });
}

const sourceVariables = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE', 'PGSSLROOTCERT', 'PGOPTIONS'];
async function dump(env, tool, args) {
  await run('docker', ['exec', '--user', `${process.getuid()}:${process.getgid()}`,
    ...sourceVariables.flatMap(name => ['--env', name]), container, tool, ...args], env);
}

// Canonical ACL entries include grantor and grant option, and expand implicit defaults.
function acl(expression) {
  return `ARRAY(SELECT concat(pg_get_userbyid(a.grantor), ':',
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
    ':',a.privilege_type,':',a.is_grantable)
    FROM aclexplode(${expression}) a ORDER BY 1)`;
}

async function publicState(client) {
  const queries = {
    schema: `SELECT pg_get_userbyid(nspowner) AS owner, ${acl("coalesce(nspacl,acldefault('n',nspowner))")} AS acl
      FROM pg_namespace WHERE nspname='public'`,
    relations: `SELECT c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,
      ${acl("coalesce(c.relacl,acldefault((CASE WHEN c.relkind='S' THEN 'S' ELSE 'r' END)::\"char\",c.relowner))")} AS acl
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f') ORDER BY c.relname`,
    columns: `SELECT c.relname,a.attname,${acl('a.attacl')} AS acl FROM pg_attribute a
      JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f')
      ORDER BY c.relname,a.attnum`,
    indexes: `SELECT c.relname,i.indisvalid,i.indisready,pg_get_indexdef(c.oid) AS definition FROM pg_index i
      JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' ORDER BY c.relname`,
    functions: `SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args,p.prokind,p.prosecdef,p.proconfig,
      pg_get_userbyid(p.proowner) AS owner,${acl("coalesce(p.proacl,acldefault('f',p.proowner))")} AS acl
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname,args`,
    policies: `SELECT tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies
      WHERE schemaname='public' ORDER BY tablename,policyname`,
    defaults: `SELECT pg_get_userbyid(d.defaclrole) AS creator,d.defaclobjtype,${acl('d.defaclacl')} AS acl
      FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
      WHERE n.nspname='public' ORDER BY creator,d.defaclobjtype`,
  };
  const result = {};
  for (const [name, sql] of Object.entries(queries)) result[name] = (await client.query(sql)).rows;
  return result;
}

async function publicCounts(client) {
  // Count partition leaves once by counting only roots (which include their partitions).
  const tables = (await client.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relispartition ORDER BY c.relname`)).rows;
  const counts = {};
  for (const { relname } of tables) counts[relname] = (await client.query(`SELECT count(*) AS count FROM public.${quote(relname)}`)).rows[0].count;
  return counts;
}

async function exportSource(config) {
  const source = new pg.Client(config);
  // Query promises still reject; prevent idle socket errors from printing raw details.
  source.on('error', () => {});
  await source.connect();
  try {
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const version = (await source.query('SHOW server_version_num')).rows[0].server_version_num;
    check(Math.floor(Number(version) / 10000) === 17);
    check(source.connection.stream.authorized === true);
    check((await source.query('SHOW transaction_read_only')).rows[0].transaction_read_only === 'on');
    const snapshot = (await source.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
    const manifest = {
      format: 1, createdAt: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null, serverVersion: version,
      source: { host: config.host, database: config.database },
      publicState: await publicState(source), publicCounts: await publicCounts(source),
      roles: (await source.query(`SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
        rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,rolconfig FROM pg_roles ORDER BY rolname`)).rows,
      memberships: (await source.query(`SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,
        pg_get_userbyid(grantor) AS grantor,admin_option,inherit_option,set_option FROM pg_auth_members ORDER BY 1,2,3`)).rows,
      extensions: (await source.query('SELECT extname,extversion FROM pg_extension ORDER BY extname')).rows,
      schemas: (await source.query('SELECT nspname FROM pg_namespace ORDER BY nspname')).rows,
      eventTriggers: (await source.query(`SELECT e.evtname,e.evtevent,e.evtenabled,e.evttags,pg_get_userbyid(e.evtowner) AS owner,
        pg_get_functiondef(e.evtfoid) AS function FROM pg_event_trigger e ORDER BY e.evtname`)).rows,
      globalDefaults: (await source.query(`SELECT pg_get_userbyid(defaclrole) AS creator,defaclobjtype,
        defaclacl::text FROM pg_default_acl WHERE defaclnamespace=0 ORDER BY 1,2`)).rows,
      limitations: ['Generic restore validates public only; managed schema reference is not replayed.',
        'Role passwords, Storage file bytes, Vault keys and platform configuration are not included.',
        'Role attributes/memberships are reference-only in the generic rehearsal; no hosted service verification.'],
    };
    const sourceEnv = {
      PGHOST: config.host, PGPORT: '5432', PGUSER: config.user, PGPASSWORD: config.password, PGDATABASE: config.database,
      PGSSLMODE: 'verify-full', PGSSLROOTCERT: config.ssl.ca ? '/backup/ca.pem' : 'system', PGOPTIONS: config.options,
    };
    const common = ['--format=custom', '--quote-all-identifiers', `--snapshot=${snapshot}`];
    stage = 'public schema/data/privilege export';
    await dump(sourceEnv, 'pg_dump', [...common, '--schema=public', '--file=/backup/plain/public.dump']);
    if (config.host.endsWith('.supabase.co') || config.host.endsWith('.supabase.com')) {
    stage = 'Supabase Auth/Storage data export';
    await dump(sourceEnv, 'pg_dump', [...common, '--data-only', '--schema=auth', '--schema=storage',
      '--exclude-table=auth.schema_migrations', '--exclude-table=storage.migrations',
      '--exclude-table=storage.buckets_vectors', '--exclude-table=storage.vector_indexes',
      '--file=/backup/plain/auth-storage-data.dump']);
    stage = 'managed schema reference export';
    await dump(sourceEnv, 'pg_dump', [...common, '--schema-only', '--schema=auth', '--schema=storage', '--schema=realtime',
      '--file=/backup/plain/managed-schema-reference.dump']);
    }
    stage = 'role and membership reference export';
    // pg_dumpall cannot import a snapshot. Quiet-source confirmation is required by the workflow.
    await dump(sourceEnv, 'pg_dumpall', ['--roles-only', '--no-role-passwords', '--quote-all-identifiers',
      '--file=/backup/plain/roles-reference.sql']);
    await writeFile(join(plain, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await source.query('ROLLBACK');
    return manifest;
  } finally { await source.end(); }
}

async function rehearseRestore(directory) {
  // No source credentials or configurable connection strings can reach this client.
  const target = new pg.Client({ host: '127.0.0.1', port: 55432, database: 'restore_test',
    user: 'postgres', password: 'disposable-backup-rehearsal-only', ssl: false });
  target.on('error', () => {});
  await target.connect();
  try {
    check(Math.floor(Number((await target.query('SHOW server_version_num')).rows[0].server_version_num) / 10000) === 17);
    check((await target.query(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')`)).rows[0].count === '0');
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    for (const { rolname } of manifest.roles) {
      // Only name stubs: do not replay production passwords, SUPERUSER or membership grants.
      if (rolname !== 'postgres' && !rolname.startsWith('pg_')) await target.query(`CREATE ROLE ${quote(rolname)} NOLOGIN`);
    }
    await target.query('DROP SCHEMA public');
    await run('docker', ['exec', '--env', 'PGPASSWORD', container, 'pg_restore',
      '--host=127.0.0.1', '--username=postgres', '--dbname=restore_test',
      '--exit-on-error', '--single-transaction', '/backup/recovered/public.dump'],
    { PGPASSWORD: 'disposable-backup-rehearsal-only' });
    check(isDeepStrictEqual(await publicState(target), manifest.publicState));
    check(isDeepStrictEqual(await publicCounts(target), manifest.publicCounts));
  } finally { await target.end(); }
}

async function main() {
  check(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_EVENT_NAME === 'workflow_dispatch');
  process.umask(0o077);
  const config = sourceConfiguration(process.env);
  await mkdir(plain, { recursive: true, mode: 0o700 });
  await mkdir(out, { recursive: true, mode: 0o700 });
  if (config.ssl.ca) await writeFile(join(root, 'ca.pem'), config.ssl.ca, { mode: 0o600 });
  stage = 'read-only source preflight';
  await exportSource(config);
  console.log('Read-only exports completed. Encrypting before artifact storage.');
  const hashes = {};
  for (const file of (await readdir(plain)).sort()) hashes[file] = await fileHash(join(plain, file));
  await writeFile(join(plain, 'checksums.json'), JSON.stringify(hashes, null, 2), { mode: 0o600 });
  stage = 'backup encryption';
  const tar = join(root, 'backup.tar');
  const encrypted = join(out, 'chatbit-backup.tar.enc');
  await run('tar', ['-C', plain, '-cf', tar, '.']);
  const pendingCiphertext = join(root, 'backup.enc.partial');
  await encryptBackup(tar, pendingCiphertext, process.env.CHATBIT_BACKUP_PASSPHRASE);
  await rename(pendingCiphertext, encrypted);
  const cipherHash = await fileHash(encrypted);
  await writeFile(`${encrypted}.sha256`, `${cipherHash}  chatbit-backup.tar.enc\n`, { mode: 0o600 });
  stage = 'ciphertext checksum and authenticated decryption';
  const savedCipherHash = (await readFile(`${encrypted}.sha256`, 'utf8')).split(' ')[0];
  check(await fileHash(encrypted) === savedCipherHash);
  const recoveredTar = join(root, 'recovered.tar');
  await decryptBackup(encrypted, recoveredTar, process.env.CHATBIT_BACKUP_PASSPHRASE);
  check(await fileHash(tar) === await fileHash(recoveredTar));
  const recovered = join(root, 'recovered');
  await mkdir(recovered, { mode: 0o700 });
  await run('tar', ['-C', recovered, '-xf', recoveredTar]);
  const recoveredHashes = JSON.parse(await readFile(join(recovered, 'checksums.json'), 'utf8'));
  for (const [file, hash] of Object.entries(recoveredHashes)) {
    check(/^[a-z0-9.-]+$/.test(file));
    check(await fileHash(join(recovered, file)) === hash);
  }
  stage = 'archive readability';
  for (const file of (await readdir(recovered)).filter(name => name.endsWith('.dump'))) {
    await run('docker', ['exec', container, 'pg_restore', '--list', `/backup/recovered/${file}`]);
  }
  stage = 'isolated public restore and metadata/row-count comparison';
  await rehearseRestore(recovered);
  console.log('PASS: encrypted round trip, checksums, and isolated public restore with owner/ACL/RLS/index/function and row-count comparisons.');
  console.log('LIMITED: any managed-schema archives are readability-only; hosted services, role attributes/memberships and object storage bytes are not restore-tested.');
}

// Importing configuration helpers in tests never opens a database connection.
if (process.argv[1]?.endsWith('/backup-database.mjs')) {
  main().catch(() => {
    console.error(`Backup failed at: ${stage}. Raw tool/database errors are withheld to protect private data.`);
    console.error('An encrypted artifact may still be available; a failed run is not a verified backup.');
    process.exitCode = 1;
  });
}
