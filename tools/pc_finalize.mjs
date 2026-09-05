import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';
import fs from 'fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('pc-convert/pc-glassfix.glb');
const root = doc.getRoot();

// Relink "Textured Metal.001" to the real Brushed_iron_02_1K set extracted from the
// purchased textures.rar — this is an INFERRED pairing (the FBX export's own texture
// paths were absolute paths on the original artist's machine and didn't resolve), based
// on the material being literally named "Textured Metal" and this being the only
// brushed-metal-style PBR set in textures.rar. The other two texture slots (LOGO.001,
// FANS.001 baseColorTexture) reference ambiguous unlabeled images (a mic-brand logo, an
// unidentified "h732" file) with no clear correspondence, so those are left as flat
// factor colors rather than guessed.
function loadImg(path) { return fs.readFileSync(path); }
const texDir = '../3d/pc/extracted/textures/textures/';

const brushedColor = doc.createTexture('Brushed_iron_Color').setImage(loadImg(texDir + 'Brushed_iron_02_1K_Base_Color.png')).setMimeType('image/png');
const brushedNormal = doc.createTexture('Brushed_iron_Normal').setImage(loadImg(texDir + 'Brushed_iron_02_1K_Normal.png')).setMimeType('image/png');

let relinked = 0;
root.listMaterials().forEach(m => {
  const name = m.getName();
  if (name === 'Textured Metal.001' || name === 'Textured Metal') {
    m.setBaseColorTexture(brushedColor);
    m.setNormalTexture(brushedNormal);
    // no metallicRoughnessTexture: the extracted roughness map is a standalone grayscale
    // image, and glTF packs roughness(G)/metalness(B) into one texture — feeding a plain
    // grayscale image into that slot would also modulate metalness incorrectly. A flat
    // factor is more correct for a uniformly-metallic brushed panel than a wrong-channel image.
    m.setMetallicFactor(1);
    m.setRoughnessFactor(0.4);
    relinked++;
  }
  // strip the broken 1x1 placeholder textures so materials fall back to their flat factor
  if (name === 'LOGO.001' || name === 'FANS.001') {
    m.setBaseColorTexture(null);
  }
});
console.log('relinked brushed-metal materials:', relinked);

await doc.transform(dedup(), prune({ keepAttributes: false, keepIndices: true, keepLeaves: false }));

// compute bounding box before writing
const { Accessor } = await import('@gltf-transform/core');
let min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
root.listNodes().forEach(n => {}); // (world bbox computed at runtime in three.js instead — SDNA/GLTF-Transform bbox is local per-primitive, less useful here)

await io.write('pc-convert/pc-final-pretex.glb', doc);
console.log('wrote pc-final-pretex.glb, size=', fs.statSync('pc-convert/pc-final-pretex.glb').size);
