import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const inPath = process.argv[2];
const outPath = process.argv[3];
const removeNames = ['CTRL_Hole', 'Night'];

const doc = await io.read(inPath);
const root = doc.getRoot();
const scene = root.listScenes()[0];

let removed = [];
for (const name of removeNames) {
  const node = root.listNodes().find(n => n.getName() === name);
  if (node) {
    node.dispose();
    removed.push(name);
  }
}

console.log('Removed nodes:', removed.join(', ') || '(none found)');
console.log('Remaining root children:', scene.listChildren().map(n => n.getName()).join(', '));

await io.write(outPath, doc);
