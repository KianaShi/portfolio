// Cache-busting: stamps ?v=<timestamp> onto every local <script src> / <link href> in the
// two pages. GitHub Pages serves everything with max-age=600, so without this a returning
// visitor can get a fresh index.html alongside a cached older script — e.g. the old
// interaction.js writing to the removed #clock element threw and left the scene black.
// Run by .git/hooks/pre-commit (see tools/install-hooks.sh); safe to run by hand too.
import fs from 'fs';

const PAGES = ['index.html', 'desktop.html'];
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const re = /((?:src|href)="(?:src|styles)\/[^"?]+\.(?:js|css))(?:\?v=\w+)?"/g;

for (const page of PAGES) {
  const before = fs.readFileSync(page, 'utf8');
  const after = before.replace(re, `$1?v=${v}"`);
  if (after !== before) fs.writeFileSync(page, after);
}
console.log('asset version', v);
