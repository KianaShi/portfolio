import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read('pc-convert/pc-raw.glb');
const root = doc.getRoot();

const anims = root.listAnimations();
console.log('total animations:', anims.length);

console.log();
console.log('=== TRUE self-matching actions (targetName === actionSuffix minus "Action") ===');
let selfMatches = [];
anims.forEach(a => {
  const name = a.getName();
  const idx = name.indexOf('|');
  if (idx < 0) return;
  const target = name.slice(0, idx);
  let actionSuffix = name.slice(idx + 1);
  if (actionSuffix.endsWith('Action')) actionSuffix = actionSuffix.slice(0, -6);
  if (target.trim() === actionSuffix.trim()) {
    const dur = a.listSamplers()[0]?.getOutput()?.getCount();
    selfMatches.push({name, target, dur});
  }
});
selfMatches.forEach(s => console.log(s.target.padEnd(25), '|', s.name, ' keyframes=', s.dur));
console.log('count:', selfMatches.length);

console.log();
console.log('=== all UNIQUE action-suffixes (to find RGB/shader ones not object-named) ===');
const suffixes = new Set();
anims.forEach(a => {
  const name = a.getName();
  const idx = name.indexOf('|');
  if (idx < 0) { suffixes.add(name); return; }
  suffixes.add(name.slice(idx+1));
});
console.log([...suffixes].sort());
