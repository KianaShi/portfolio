import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('pc-convert/pc-raw.glb');
const root = doc.getRoot();

// definitive object->action mapping read directly from the .blend AnimData.action
// pointers (not name-guessed) — see pc_blend_extract3.py output.
const KEEP = {
  'aio fan 1': 'aio fan 1Action',
  'aio fan 2': 'aio fan 2Action',
  'aio fan 3': 'aio fan 3Action',
  'AIO FAN FRAME 2': 'AIO FAN FRAME 2Action',
  'case fan': 'case fanAction',
  'case fan.001': 'case fan.001Action',
  'case fan.002': 'case fan.002Action',
  'case fan.003': 'case fan.003Action',
  'case fan.004': 'case fan.004Action',
  'case fan.005': 'case fan.005Action',
  'fan 1': 'Circle.002Action',
  'fan 2': 'Circle.003Action',
  'fan 3': 'Circle.001Action',
};

const anims = root.listAnimations();
console.log('before prune:', anims.length);

let kept = 0, removed = 0;
anims.forEach(a => {
  const name = a.getName();
  const idx = name.indexOf('|');
  const target = idx >= 0 ? name.slice(0, idx) : null;
  const actionSuffix = idx >= 0 ? name.slice(idx + 1) : null;
  if (target && KEEP[target] === actionSuffix) {
    kept++;
    a.setName(target); // rename to just the object name for a cleaner clip name
  } else {
    a.dispose();
    removed++;
  }
});
console.log('kept:', kept, 'removed:', removed);
console.log('after prune:', root.listAnimations().length);

await io.write('pc-convert/pc-pruned.glb', doc);
console.log('wrote pc-convert/pc-pruned.glb');
