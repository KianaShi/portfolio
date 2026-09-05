import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('pc-convert/pc-raw.glb');
const root = doc.getRoot();

console.log('=== ANIMATIONS (unique target object -> which action names target it) ===');
const anims = root.listAnimations();
console.log('total animations:', anims.length);
const byTargetNode = {};
anims.forEach(a => {
  const channels = a.listChannels();
  const targets = new Set(channels.map(c => c.getTargetNode()?.getName()));
  targets.forEach(t => {
    if (!byTargetNode[t]) byTargetNode[t] = [];
    byTargetNode[t].push(a.getName());
  });
});
Object.keys(byTargetNode).forEach(t => {
  console.log(t, '->', byTargetNode[t].length, 'actions:', byTargetNode[t].slice(0,3), byTargetNode[t].length>3?'...':'');
});

console.log();
console.log('=== self-named actions (action name matches its own target node name) ===');
anims.forEach(a => {
  const name = a.getName(); // format "TargetObj|ActionName" typically from FBX2glTF
  const channels = a.listChannels();
  const targets = [...new Set(channels.map(c => c.getTargetNode()?.getName()))];
  if (targets.length === 1 && name.startsWith(targets[0] + '|')) {
    console.log(name, 'duration=', a.listSamplers()[0]?.getOutput()?.getCount());
  }
});

console.log();
console.log('=== MATERIALS: emissive / alpha / extensions ===');
root.listMaterials().forEach((m, i) => {
  const ext = m.listExtensions().map(e => e.extensionName);
  console.log(i, m.getName(), 'base=', m.getBaseColorFactor(), 'emissive=', m.getEmissiveFactor(), 'alpha=', m.getAlpha(), 'alphaMode=', m.getAlphaMode(), 'rough=', m.getRoughnessFactor(), 'metal=', m.getMetallicFactor(), 'ext=', ext);
});
