import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import fs from 'fs';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
const doc = await io.read('../assets/desk-glb/desk-optimized.glb');
const root = doc.getRoot();

const targetNames = ['Day', 'Room002', 'Window_Group', 'Rail'];

console.log('=== ALL SCENE NODES (name, mesh?, children) ===');
function walk(node, depth) {
  const mesh = node.getMesh();
  console.log('  '.repeat(depth) + (node.getName() || '(unnamed)') + (mesh ? '  [MESH]' : ''));
  node.listChildren().forEach(c => walk(c, depth + 1));
}
root.listScenes().forEach(s => s.listChildren().forEach(n => walk(n, 0)));

console.log();
console.log('=== TARGET NODES DETAIL ===');
const allNodes = root.listNodes();
targetNames.forEach(tn => {
  const matches = allNodes.filter(n => n.getName() === tn);
  console.log(`\n--- "${tn}" : ${matches.length} node(s) matched ---`);
  matches.forEach((n, i) => {
    const mesh = n.getMesh();
    console.log(`  [${i}] translation=${n.getTranslation()} scale=${n.getScale()} rotation=${n.getRotation()}`);
    if (!mesh) { console.log('      (no mesh on this node)'); return; }
    mesh.listPrimitives().forEach((prim, pi) => {
      const mat = prim.getMaterial();
      console.log(`      prim[${pi}] material=${mat ? mat.getName() : '(none)'}`);
      if (mat) {
        const baseTex = mat.getBaseColorTexture();
        const emissiveTex = mat.getEmissiveTexture();
        console.log(`        baseColorFactor=${mat.getBaseColorFactor()} emissiveFactor=${mat.getEmissiveFactor()} alpha=${mat.getAlpha()} alphaMode=${mat.getAlphaMode()} doubleSided=${mat.getDoubleSided()}`);
        if (baseTex) {
          console.log(`        baseColorTexture: name=${baseTex.getName()} uri=${baseTex.getURI()} mimeType=${baseTex.getMimeType()} size=${baseTex.getSize()} byteLen=${baseTex.getImage()?.byteLength}`);
        } else {
          console.log('        baseColorTexture: none');
        }
        if (emissiveTex) {
          console.log(`        emissiveTexture: name=${emissiveTex.getName()} uri=${emissiveTex.getURI()} mimeType=${emissiveTex.getMimeType()} size=${emissiveTex.getSize()}`);
        }
      }
    });
  });
});

console.log();
console.log('=== ALL EMBEDDED TEXTURES ===');
root.listTextures().forEach((t, i) => {
  const img = t.getImage();
  console.log(i, 'name=', t.getName(), 'uri=', t.getURI(), 'mimeType=', t.getMimeType(), 'size=', t.getSize(), 'bytes=', img?.byteLength);
});

console.log();
console.log('=== ALL MATERIALS (name only, for cross-ref) ===');
root.listMaterials().forEach((m, i) => console.log(i, m.getName()));

// dump embedded textures used by target nodes to disk for visual inspection
console.log();
console.log('=== DUMPING relevant textures to tools/_inspect_out/ ===');
fs.mkdirSync('_inspect_out', { recursive: true });
const dumped = new Set();
targetNames.forEach(tn => {
  allNodes.filter(n => n.getName() === tn).forEach(n => {
    const mesh = n.getMesh();
    if (!mesh) return;
    mesh.listPrimitives().forEach(prim => {
      const mat = prim.getMaterial();
      if (!mat) return;
      const tex = mat.getBaseColorTexture();
      if (!tex) return;
      const key = tex.getName() + '|' + mat.getName();
      if (dumped.has(key)) return;
      dumped.add(key);
      const img = tex.getImage();
      const mime = tex.getMimeType();
      const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
      const fname = `_inspect_out/${tn}__${mat.getName().replace(/[^a-z0-9_.-]/gi,'_')}.${ext}`;
      fs.writeFileSync(fname, Buffer.from(img));
      console.log('wrote', fname, img.byteLength, 'bytes');
    });
  });
});
