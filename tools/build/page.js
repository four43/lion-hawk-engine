// The page (B-1, B-5): the template with the bundle at <!--APP-->, a build stamp meta tag, and the service worker stamp.
// D1: the bare <!--APP--> marker becomes an inline <script type="module"> (ESM bundle, so a game may use top-level await).
export function fillTemplate(template, js) {
  if (!template.includes('<!--APP-->')) throw new Error('build: the template has no <!--APP--> marker');
  if (/<script\b[^>]*>\s*<!--APP-->/i.test(template)) throw new Error('build: <!--APP--> sits inside a <script>; remove that tag (the build writes <script type="module">)');
  return template.replace('<!--APP-->', () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
}
// B-5: <meta name="lion-hawk-build" content="<game> <gameVersion> lion-hawk <engineVersion> <hash>"> after <head>
export function stampPage(html, { id, version, engine, hash }) {
  const meta = `<meta name="lion-hawk-build" content="${id} ${version} lion-hawk ${engine} ${hash}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => `${m}\n${meta}`) : `${meta}\n${html}`;
}
// sw.js: __VERSION__ → "<gameVersion>+lh<engineVersion>-<hash>", __PRECACHE__ → a JSON array literal
export function stampWorker(sw, { version, engine, hash, precache }) {
  if (!sw.includes('__PRECACHE__')) throw new Error('build: pwa/sw.js has no __PRECACHE__ (const PRECACHE = __PRECACHE__;)');
  if (!sw.includes('__VERSION__')) throw new Error('build: pwa/sw.js has no __VERSION__');
  return sw.replaceAll('__VERSION__', `${version}+lh${engine}-${hash}`).replace('__PRECACHE__', () => JSON.stringify(precache));
}
