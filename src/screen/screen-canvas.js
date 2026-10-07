(function(){
  var ctx = window.__ctx;
  // Drawing code works in a 320x240 logical space; the backing canvas is RES times that so
  // the screensaver art stays sharp on the monitor.
  var sw = 320, sh = 240, RES = 3;
  var screenCanvas = document.createElement('canvas');
  screenCanvas.width = sw * RES; screenCanvas.height = sh * RES;
  var sctx = screenCanvas.getContext('2d');
  sctx.scale(RES, RES);
  var screenTexture = new THREE.CanvasTexture(screenCanvas);
  var screenMat = ctx.screenMat = new THREE.MeshBasicMaterial({map:screenTexture});
  // separate CanvasTexture on the SAME source canvas for the real GLB screen mesh —
  // its UV orientation was verified at runtime (quadrant-color readPixels test) to need
  // flipY=false with no rotation/offset/repeat, which differs from the procedural CRT
  // fallback plane below, so the two textures can't share one flipY setting.
  var screenTextureGLB = new THREE.CanvasTexture(screenCanvas);
  screenTextureGLB.flipY = false;
  var screenMatGLB = ctx.screenMatGLB = new THREE.MeshBasicMaterial({map:screenTextureGLB});

  var idlePhrase = 'CLICK TO KNOW MORE ABOUT ME';
  var idleCharMs = 95;
  var idleTypeMs = idlePhrase.length * idleCharMs;
  var idleHoldMs = 1100;
  var idleEraseMs = idlePhrase.length * 45;
  var idlePauseMs = 900;
  var idleCycleMs = idleTypeMs + idleHoldMs + idleEraseMs + idlePauseMs;

  // Screensaver: eyes-closed art for the current time of day (src/wallpaper.js) at 75%
  // over the screen's dark base. The canvas is stretched onto the GLB screen mesh, which is
  // ~1.89:1, so the source is cropped to that aspect (not the canvas's 4:3) to land undistorted.
  var SCREEN_ASPECT = 1.89, SAVER_ALPHA = 0.75;
  var saverImg = null, lastIdleKey = '';
  Wallpaper.watch(function(p){
    var img = new Image();
    img.onload = function(){ saverImg = img; lastIdleKey = ''; };
    img.src = Wallpaper.url('screensaver', p);
  });

  function drawIdleScreen(t){
    var shown;
    if (ctx.reduceMotion){
      // Skip the type/hold/erase state machine — show the full phrase every frame.
      shown = idlePhrase;
    } else {
      var ms = (t*1000) % idleCycleMs;
      if (ms < idleTypeMs){
        shown = idlePhrase.substring(0, Math.floor(ms / idleCharMs));
      } else if (ms < idleTypeMs + idleHoldMs){
        shown = idlePhrase;
      } else if (ms < idleTypeMs + idleHoldMs + idleEraseMs){
        var eraseProgress = (ms - idleTypeMs - idleHoldMs) / idleEraseMs;
        shown = idlePhrase.substring(0, Math.round(idlePhrase.length * (1 - eraseProgress)));
      } else {
        shown = '';
      }
    }

    var blink = ctx.reduceMotion ? true : Math.sin(t*4) > 0;
    // Called every frame, but the frame only changes when the typed text or the cursor
    // blink does — skip the redraw + texture upload otherwise.
    var key = shown + '|' + blink;
    if (key === lastIdleKey) return;
    lastIdleKey = key;

    sctx.fillStyle = '#04181a';
    sctx.fillRect(0,0,sw,sh);
    if (saverImg){
      var iw = saverImg.naturalWidth, ih = saverImg.naturalHeight;
      var cw = iw, ch = iw / SCREEN_ASPECT;
      if (ch > ih){ ch = ih; cw = ih * SCREEN_ASPECT; }
      sctx.globalAlpha = SAVER_ALPHA;
      sctx.drawImage(saverImg, (iw-cw)/2, (ih-ch)/2, cw, ch, 0, 0, sw, sh);
      sctx.globalAlpha = 1;
    }
    for (var y=0; y<sh; y+=3){
      sctx.fillStyle = 'rgba(0,0,0,0.12)';
      sctx.fillRect(0,y,sw,1);
    }

    sctx.font = '14px monospace';
    var fullWidth = sctx.measureText(idlePhrase).width;
    var textWidth = sctx.measureText(shown).width;
    var textX = sw/2 - textWidth/2;
    // with art behind it, the prompt sits low so it doesn't cover the character's face
    var textY = saverImg ? sh - 34 : sh/2;
    if (saverImg){
      // dark band behind the prompt so it stays legible over the bright daytime art
      sctx.fillStyle = 'rgba(4,24,26,0.55)';
      sctx.fillRect(sw/2 - fullWidth/2 - 14, textY - 13, fullWidth + 28, 24);
    }
    sctx.fillStyle = '#8ff0dd';
    sctx.fillText(shown, textX, textY + 5);

    if (blink){
      sctx.fillStyle = '#cfeee8';
      sctx.fillRect(textX + textWidth + 3, textY - 9, 7, 14);
    }
    screenTexture.needsUpdate = true;
    screenTextureGLB.needsUpdate = true;
  }
  ctx.drawIdleScreen = drawIdleScreen;

  function drawBootScreen(){
    sctx.fillStyle = '#04181a';
    sctx.fillRect(0,0,sw,sh);
    for (var y=0; y<sh; y+=3){
      sctx.fillStyle = 'rgba(0,0,0,0.12)';
      sctx.fillRect(0,y,sw,1);
    }
    sctx.font = '13px monospace';
    sctx.fillStyle = '#8ff0dd';
    var startY = 40;
    for (var i=0; i<ctx.typedText.length; i++){
      sctx.fillText(ctx.typedText[i], 18, startY + i*22);
    }
    screenTexture.needsUpdate = true;
    screenTextureGLB.needsUpdate = true;
  }
  ctx.drawBootScreen = drawBootScreen;
})();
