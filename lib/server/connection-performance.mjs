import { AsyncLocalStorage } from 'node:async_hooks';
import { createPerformanceTrace } from '../connection-performance.mjs';
const traces = new AsyncLocalStorage();
export function performanceRequest(operation, name = 'server') {
  return traces.run(createPerformanceTrace(name, { enabled: process.env.CHATBIT_PERFORMANCE === '1' }), () => traces.getStore().step('request', operation));
}
export function performanceStep(stage, operation) {
  const trace = traces.getStore();
  return (trace ?? createPerformanceTrace('server', { enabled: process.env.CHATBIT_PERFORMANCE === '1' })).step(stage, operation);
}
export function performanceDuration(stage, duration) { traces.getStore()?.duration(stage, duration); }
