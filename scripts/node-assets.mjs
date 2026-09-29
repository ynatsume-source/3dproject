// Lets headless scripts import the app's modules: image/audio imports resolve to their path.
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
export async function load(url, context, next) {
  if (/\\.(jpg|jpeg|png|mp3|webp)$/.test(url)) return { format: 'module', shortCircuit: true, source: 'export default ' + JSON.stringify(url) };
  return next(url, context);
}`));
