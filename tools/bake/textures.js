// [A-3] bake.textures: compress the textures a bake keeps (keepTextures models; palette: 'vertex' removes the rest).
// webp: gltf-transform's textureCompress with sharp, EXT_texture_webp. ktx2: toktx from KTX-Software (not an npm
// package, so it must be on PATH), one call per texture, KHR_texture_basisu; colour slots are encoded as sRGB, data
// slots (normals, roughness) as linear. mode: 'etc1s' (smaller, default) or 'uastc' (higher quality).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { textureCompress, getTextureColorSpace } from '@gltf-transform/functions';
import { KHRTextureBasisu } from '@gltf-transform/extensions';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export async function compressTextures(doc, t) {
  if (!t || !doc.getRoot().listTextures().length) return doc;
  if (t.format === 'webp') {
    const { default: sharp } = await import('sharp');
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: t.quality ?? null, resize: t.resize }));
    return doc;
  }
  if (spawnSync('toktx', ['--version']).error) throw new Error("bake: textures.format 'ktx2' needs toktx (KTX-Software) on PATH: https://github.com/KhronosGroup/KTX-Software/releases");
  if (t.resize) await doc.transform(textureCompress({ resize: t.resize })); // resize first, keeping the format
  const dir = mkdtempSync(join(tmpdir(), 'lh-ktx2-'));
  try {
    doc.getRoot().listTextures().forEach((tex, i) => {
      const ext = EXT[tex.getMimeType()]; if (!ext) return; // already KTX2 (or a format toktx cannot read)
      const src = join(dir, `${i}.${ext}`), out = join(dir, `${i}.ktx2`);
      writeFileSync(src, tex.getImage());
      const mode = t.mode === 'uastc' ? ['--encode', 'uastc'] : ['--encode', 'etc1s', ...(t.quality ? ['--qlevel', String(Math.round(t.quality * 2.55))] : [])];
      const oetf = getTextureColorSpace(tex) === 'srgb' ? ['--assign_oetf', 'srgb'] : ['--assign_oetf', 'linear', '--assign_primaries', 'none'];
      const r = spawnSync('toktx', ['--t2', '--genmipmap', ...mode, ...oetf, out, src], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`bake: toktx failed on texture '${tex.getName() || i}': ${(r.stderr || r.stdout).trim()}`);
      tex.setImage(readFileSync(out)).setMimeType('image/ktx2');
      if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.[^.]+$/, '.ktx2'));
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  return doc;
}
