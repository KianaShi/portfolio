import sharp from '../tools/node_modules/sharp/lib/index.js';

const SRC = 'tools/source-assets/environment/seattle/seattle-thom-milkovic-original.jpg';
const MAX_DIM = 2560; // same as seattle-dusk-v2.webp — same resize approach, no crop

function combinedLinear(contrastMult, tint){
  const r = contrastMult * tint[0];
  const g = contrastMult * tint[1];
  const b = contrastMult * tint[2];
  const offR = 128 * (1 - r);
  const offG = 128 * (1 - g);
  const offB = 128 * (1 - b);
  return { mult: [r, g, b], off: [offR, offG, offB] };
}

async function grade(name, opts){
  const { mult, off } = combinedLinear(opts.contrast, opts.tint);
  // Order matters: desaturating AFTER a channel tint just flattens the still-warm-dominant
  // highlights toward brownish-gray (no blue hue was ever introduced for desaturation to
  // preserve). Desaturating FIRST removes the vivid warm dominance, so the cool tint that
  // follows actually shows through instead of fighting a saturated orange.
  await sharp(SRC)
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .modulate({ saturation: opts.saturation })
    .linear(mult, off)
    .modulate({ brightness: opts.brightness })
    .webp({ quality: 82 })
    .toFile(`assets/environment/seattle/${name}.webp`);
  const meta = await sharp(`assets/environment/seattle/${name}.webp`).metadata();
  const stats = await sharp(`assets/environment/seattle/${name}.webp`).stats();
  const fs = await import('fs');
  const size = fs.statSync(`assets/environment/seattle/${name}.webp`).size;
  console.log(name, JSON.stringify({
    width: meta.width, height: meta.height, sizeKB: Math.round(size/1024),
    channelMeans: stats.channels.map(c => Math.round(c.mean))
  }));
}

// ---- DAY: gentler than seattle-dusk-v2 — smaller overall gain so the horizon doesn't
// blow out, mild warm push on buildings, mild contrast, protects Rainier's highlight detail
await grade('seattle-day', {
  contrast: 1.03,
  tint: [1.04, 1.00, 0.985],
  brightness: 1.12,
  saturation: 1.04
});

// ---- NIGHT: the master photo is a warm golden-hour shot, so a midpoint-anchored
// contrast-preserving tint (out = in*mult + off, anchored at 128) barely suppresses the
// BRIGHT warm sky/highlights — the offset compensates too much for values above the
// anchor. Night instead uses plain multiplicative scaling (no anchor offset), which
// suppresses bright warm pixels proportionally harder than dark ones — the correct
// direction for a "day-for-night" grade — plus a small flat additive blue lift so
// shadows settle toward deep blue instead of pure black.
await sharp(SRC)
  .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
  .modulate({ saturation: 0.55 }) // desaturate the vivid sunset FIRST so the tint below isn't fighting it
  .linear([0.42, 0.55, 0.95], [4, 6, 18]) // strong R/G suppression, mild B scale + flat blue lift
  .modulate({ brightness: 0.78 }) // final exposure trim (most darkening already came from the multiply above)
  .webp({ quality: 82 })
  .toFile('assets/environment/seattle/seattle-night.webp');
{
  const meta = await sharp('assets/environment/seattle/seattle-night.webp').metadata();
  const stats = await sharp('assets/environment/seattle/seattle-night.webp').stats();
  const fs = await import('fs');
  const size = fs.statSync('assets/environment/seattle/seattle-night.webp').size;
  console.log('seattle-night', JSON.stringify({
    width: meta.width, height: meta.height, sizeKB: Math.round(size / 1024),
    channelMeans: stats.channels.map(c => Math.round(c.mean))
  }));
}
