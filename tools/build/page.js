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

// [P-3] build.manifest → the web app manifest JSON (icon: its file name in the out dir, or none)
const ICON_TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
export function makeManifest(m, iconName) {
  const out = { name: m.name, short_name: m.shortName ?? m.name, start_url: './', scope: './', display: m.display ?? 'fullscreen' };
  if (m.orientation) out.orientation = m.orientation;
  if (m.themeColor) out.theme_color = m.themeColor;
  if (m.backgroundColor) out.background_color = m.backgroundColor;
  if (iconName) {
    const ext = iconName.slice(iconName.lastIndexOf('.')).toLowerCase(), type = ICON_TYPES[ext];
    if (!type) throw new Error(`build: build.manifest.icon must be ${Object.keys(ICON_TYPES).join(', ')} (got '${iconName}')`);
    out.icons = [{ src: iconName, sizes: 'any', type, purpose: 'any' }];
  }
  return out;
}
// the <link rel="manifest"> (and theme-color meta) a generated manifest needs, unless the template has them
export function linkManifest(html, m) {
  let tags = '';
  if (!/<link[^>]+rel=["']?manifest/i.test(html)) tags += '<link rel="manifest" href="manifest.webmanifest">';
  if (m.themeColor && !/<meta[^>]+name=["']?theme-color/i.test(html)) tags += `<meta name="theme-color" content="${m.themeColor}">`;
  if (!tags) return html;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, x => `${x}\n${tags}`) : `${tags}\n${html}`;
}
