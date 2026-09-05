import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const inPath = process.argv[2];
const outPath = process.argv[3];

const doc = await io.read(inPath);
const textures = doc.getRoot().listTextures();

const rules = [
  { pattern: /reed-naliboff/, size: 2048 },
  { pattern: /Planks031A|Wood066|Fabric060|Leather027|Ground048/, size: 1024 },
  { pattern: /plants-4|jeremy-bishop/, size: 1024 },
  { pattern: /pexels-karolina/, size: 512 },
];

// sequential (not Promise.all) to avoid a libvips/GObject concurrency issue
// seen with gltf-transform's built-in textureCompress in this environment.
for (const tex of textures) {
  const name = tex.getName() || tex.getURI() || '';
  const rule = rules.find(r => r.pattern.test(name));
  if (!rule) { console.log('skip (no rule):', name); continue; }

  const mime = tex.getMimeType();
  const buf = Buffer.from(tex.getImage());
  const srcKB = (buf.length / 1024).toFixed(0);

  const meta = await sharp(buf).metadata();
  if (Math.max(meta.width, meta.height) <= rule.size) {
    console.log(`skip (already <= ${rule.size}):`, name, `${meta.width}x${meta.height}`);
    continue;
  }

  let pipeline = sharp(buf, { limitInputPixels: false }).resize(rule.size, rule.size, { fit: 'inside', withoutEnlargement: true });
  if (mime === 'image/jpeg') pipeline = pipeline.jpeg({ quality: 85 });
  else if (mime === 'image/png') pipeline = pipeline.png({ compressionLevel: 9 });

  const out = await pipeline.toBuffer();
  tex.setImage(out);
  console.log(`resized: ${name} ${meta.width}x${meta.height} (${srcKB}KB) -> max ${rule.size} (${(out.length/1024).toFixed(0)}KB)`);
}

await io.write(outPath, doc);
console.log('wrote', outPath);
