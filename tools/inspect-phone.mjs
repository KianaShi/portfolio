import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import fs from 'fs';

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read('../assets/desk-glb/desk-optimized.glb');
const root = doc.getRoot();

console.log('=== ALL NODE NAMES CONTAINING "phone" (case-insensitive) ===');
const allNodes = root.listNodes();
allNodes.forEach(n => {
  if (/phone/i.test(n.getName() || '')) console.log(JSON.stringify(n.getName()));
});

function dumpNode(name){
  console.log(`\n--- "${name}" ---`);
  const matches = allNodes.filter(n => n.getName() === name);
  console.log('matched count:', matches.length);
  matches.forEach((n, i) => {
    const mesh = n.getMesh();
    console.log(`[${i}] translation=${n.getTranslation()} scale=${n.getScale()} rotation=${n.getRotation()}`);
    console.log(`    children: ${n.listChildren().map(c=>c.getName()).join(', ') || '(none)'}`);
    if (!mesh) { console.log('    (no mesh)'); return; }
    mesh.listPrimitives().forEach((prim, pi) => {
      const mat = prim.getMaterial();
      const posAcc = prim.getAttribute('POSITION');
      const uvAcc = prim.getAttribute('TEXCOORD_0');
      console.log(`    prim[${pi}] material=${mat ? mat.getName() : '(none)'} vertexCount=${posAcc ? posAcc.getCount() : 'n/a'}`);
      if (uvAcc) {
        const count = uvAcc.getCount();
        let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
        const arr = uvAcc.getArray();
        for (let vi=0; vi<count; vi++){
          const u = arr[vi*2], v = arr[vi*2+1];
          if (u<minU) minU=u; if (u>maxU) maxU=u;
          if (v<minV) minV=v; if (v>maxV) maxV=v;
        }
        console.log(`      UV range: U[${minU.toFixed(4)}, ${maxU.toFixed(4)}] V[${minV.toFixed(4)}, ${maxV.toFixed(4)}] count=${count}`);
      } else {
        console.log('      (no UV attribute)');
      }
      if (mat) {
        const baseTex = mat.getBaseColorTexture();
        const emissiveTex = mat.getEmissiveTexture();
        console.log(`      baseColorFactor=${mat.getBaseColorFactor()} emissiveFactor=${mat.getEmissiveFactor()} alpha=${mat.getAlpha()} alphaMode=${mat.getAlphaMode()} doubleSided=${mat.getDoubleSided()}`);
        console.log(`      baseColorTexture: ${baseTex ? (baseTex.getName()+' '+baseTex.getSize()) : 'none'}`);
        console.log(`      emissiveTexture: ${emissiveTex ? (emissiveTex.getName()+' '+emissiveTex.getSize()) : 'none'}`);
      }
    });
  });
}

dumpNode('iphone 13.White.001');
dumpNode('Phone Stand');

console.log();
console.log('=== SEARCH: any material/texture with "phone" or "screen" in name ===');
root.listMaterials().forEach((m,i) => { if (/phone|screen/i.test(m.getName())) console.log('material', i, m.getName()); });
root.listTextures().forEach((t,i) => { if (/phone|screen/i.test(t.getName()||'')) console.log('texture', i, t.getName(), t.getSize()); });

// dump the phone's texture(s) to disk for visual check
fs.mkdirSync('_inspect_out', { recursive: true });
['iphone 13.White.001'].forEach(name => {
  allNodes.filter(n => n.getName() === name).forEach(n => {
    const mesh = n.getMesh();
    if (!mesh) return;
    mesh.listPrimitives().forEach(prim => {
      const mat = prim.getMaterial();
      if (!mat) return;
      const tex = mat.getBaseColorTexture();
      if (!tex) return;
      const img = tex.getImage();
      const mime = tex.getMimeType();
      const ext = mime === 'image/png' ? 'png' : (mime === 'image/webp' ? 'webp' : 'jpg');
      const fname = `_inspect_out/PHONE__${mat.getName().replace(/[^a-z0-9_.-]/gi,'_')}.${ext}`;
      fs.writeFileSync(fname, Buffer.from(img));
      console.log('wrote', fname, img.byteLength, 'bytes');
    });
  });
});
