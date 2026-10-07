(function(){
  // Desk clock: the desk GLB bakes a static "22:45" image (1920x1080, white digits on black)
  // into the face mesh Cube016_1's map + emissiveMap. Swap it for a canvas of the same
  // size and layout that shows the visitor's local time (24h, HH:MM).
  var ctx = window.__ctx;
  var POLL_MS = 200, POLL_TIMEOUT_MS = 30000;
  var W = 1920, H = 1080;
  // digit block of the baked image: x 424-1494, y 336-744
  var CX = 959, CY = 540, TEXT_W = 1070, TEXT_H = 408;

  var canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  var c2 = canvas.getContext('2d');
  var texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;               // matches the GLB texture it replaces
  texture.encoding = THREE.sRGBEncoding;

  var shown = '';
  function draw(){
    var d = new Date();
    var text = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (text === shown) return;
    shown = text;
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.fillStyle = '#000';
    c2.fillRect(0, 0, W, H);
    // Size by cap height, then squeeze horizontally into the original digit block so it
    // reads like the baked condensed face whatever font the visitor's system substitutes.
    c2.font = 'bold ' + Math.round(TEXT_H / 0.72) + 'px "Arial Narrow", Arial, sans-serif';
    c2.textAlign = 'center';
    c2.textBaseline = 'alphabetic';
    var sx = Math.min(1, TEXT_W / c2.measureText(text).width);
    c2.setTransform(sx, 0, 0, 1, CX, CY + TEXT_H / 2);
    c2.fillStyle = '#fff';
    c2.fillText(text, 0, 0);
    texture.needsUpdate = true;
  }

  var started = Date.now();
  var pollId = setInterval(function(){
    if (Date.now() - started > POLL_TIMEOUT_MS){
      clearInterval(pollId);
      console.warn('[desk-clock] clock face (Cube016_1) never appeared — left as loaded.');
      return;
    }
    var face = ctx.scene && ctx.scene.getObjectByName('Cube016_1');
    if (!face || !face.material) return;
    clearInterval(pollId);
    draw();
    var m = face.material;
    m.map = texture;
    if (m.emissiveMap) m.emissiveMap = texture;
    m.needsUpdate = true;
    setInterval(draw, 1000);
  }, POLL_MS);
})();
