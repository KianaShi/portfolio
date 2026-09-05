import { parseFile } from 'music-metadata';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const tracksDir = '../assets/audio/tracks';
const coversDir = '../assets/audio/covers';

const trackFiles = fs.readdirSync(tracksDir);
const coverFiles = fs.readdirSync(coversDir);

console.log('=== TRACKS ===');
for (const f of trackFiles) {
  const p = path.join(tracksDir, f);
  const stat = fs.statSync(p);
  try {
    const meta = await parseFile(p);
    console.log(JSON.stringify({
      file: f,
      sizeMB: (stat.size / 1024 / 1024).toFixed(2),
      format: meta.format.container,
      codec: meta.format.codec,
      durationSec: meta.format.duration ? meta.format.duration.toFixed(1) : null,
      sampleRate: meta.format.sampleRate,
      bitrate: meta.format.bitrate ? Math.round(meta.format.bitrate/1000)+'kbps' : null,
    }));
  } catch (e) {
    console.log(JSON.stringify({ file: f, sizeMB: (stat.size/1024/1024).toFixed(2), error: e.message }));
  }
}

console.log();
console.log('=== COVERS ===');
for (const f of coverFiles) {
  const p = path.join(coversDir, f);
  const stat = fs.statSync(p);
  const meta = await sharp(p).metadata();
  console.log(JSON.stringify({
    file: f,
    sizeMB: (stat.size/1024/1024).toFixed(2),
    format: meta.format,
    width: meta.width,
    height: meta.height,
    aspect: (meta.width/meta.height).toFixed(3),
    hasAlpha: meta.hasAlpha,
  }));
}

console.log();
console.log('=== PAIRING CHECK (basename match, case-sensitive) ===');
const trackBase = trackFiles.map(f => f.replace(/\.[^.]+$/, ''));
const coverBase = coverFiles.map(f => f.replace(/\.[^.]+$/, ''));
trackBase.forEach(tb => {
  const match = coverBase.includes(tb);
  console.log(tb, '-> cover match:', match);
});
console.log('extra covers with no track:', coverBase.filter(cb => !trackBase.includes(cb)));
