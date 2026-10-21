import { beginPageNavigation, createPerformanceTrace } from './lib/connection-performance.mjs';
beginPageNavigation(true);
const trace = createPerformanceTrace('page');
window.addEventListener('load', () => trace.duration('initial-load', performance.now()), { once: true });
export function onRouterTransitionStart() {
  // Never record the URL or framework transition metadata.
  beginPageNavigation();
}
