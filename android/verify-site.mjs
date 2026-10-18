import { assetLinks, productionOrigin } from './config.mjs';

export function matchesStatement(statements, expected) {
  return Array.isArray(statements) && statements.some(statement =>
    statement?.relation?.includes('delegate_permission/common.handle_all_urls') &&
    statement?.target?.namespace === 'android_app' &&
    statement.target.package_name === expected.package_name &&
    expected.sha256_cert_fingerprints.every(value => statement.target.sha256_cert_fingerprints?.includes(value)));
}

export async function verifySite(env, fetcher = fetch) {
  const origin = productionOrigin(env.CHATBIT_ANDROID_ORIGIN);
  const response = await fetcher(`${origin}/.well-known/assetlinks.json`, {
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok || !matchesStatement(await response.json(), assetLinks(env)[0].target)) {
    throw new Error('Production Digital Asset Links does not match this package and release certificate.');
  }
}
