import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import sharp from 'sharp';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const inPath = process.argv[2];
const outPath = process.argv[3];

const doc = await io.read(inPath);
const textures = doc.getRoot().listTextures();

for (const tex of textures) {
  const mime = tex.getMimeType();
  if (mime !== 'image/jpeg' && mime !== 'image/png') continue;
  const name = tex.getName() || tex.getURI() || '';
  const buf = Buffer.from(tex.getImage());
  const isNormalMap = /Normal/i.test(name);
  const quality = isNormalMap ? 92 : 84;

  const out = await sharp(buf, { limitInputPixels: false }).webp({ quality }).toBuffer();
  const before = buf.length, after = out.length;
  if (after >= before) {
    console.log(`skip (webp not smaller): ${name} (${mime}) ${(before/1024).toFixed(0)}KB vs webp ${(after/1024).toFixed(0)}KB`);
    continue;
  }
  tex.setImage(out).setMimeType('image/webp');
  console.log(`webp: ${name} (${mime}) ${(before/1024).toFixed(0)}KB -> ${(after/1024).toFixed(0)}KB q=${quality}`);
}

const webpExt = doc.createExtension(EXTTextureWebP);
webpExt.setRequired(true);

await io.write(outPath, doc);
console.log('wrote', outPath);
