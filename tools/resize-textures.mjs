import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const inPath = process.argv[2];
const outPath = process.argv[3];

const doc = await io.read(inPath);

const rules = [
  { pattern: /reed-naliboff/, resize: [2048, 2048] },
  { pattern: /Planks031A|Wood066|Fabric060|Leather027|Ground048/, resize: [1024, 1024] },
  { pattern: /plants-4|jeremy-bishop/, resize: [1024, 1024] },
  { pattern: /pexels-karolina/, resize: [512, 512] },
];

for (const rule of rules) {
  await doc.transform(textureCompress({ encoder: sharp, pattern: rule.pattern, resize: rule.resize }));
  console.log('resized pattern', rule.pattern.toString(), 'to', rule.resize);
}

await io.write(outPath, doc);
console.log('wrote', outPath);
