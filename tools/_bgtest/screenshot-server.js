// Tiny local sidecar (no deps) so the test page can POST a canvas dataURL straight to
// disk instead of the automation tool round-tripping a multi-MB base64 string through
// chat context. QA-only, not part of the site.
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { name, dataUrl } = JSON.parse(body);
        const safeName = String(name).replace(/[^a-zA-Z0-9_\-]/g, '_') + '.png';
        const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(path.join(OUT_DIR, safeName), Buffer.from(b64, 'base64'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, file: safeName }));
        console.log('saved', safeName);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
  } else {
    res.writeHead(404); res.end();
  }
});

server.listen(8733, () => console.log('screenshot-server listening on :8733, writing to', OUT_DIR));
