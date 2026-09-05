(function(){
  var ctx = window.__ctx;
  var sw = 320, sh = 240;
  var screenCanvas = document.createElement('canvas');
  screenCanvas.width = sw; screenCanvas.height = sh;
  var sctx = screenCanvas.getContext('2d');
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

  function drawIdleScreen(t){
    sctx.fillStyle = '#04181a';
    sctx.fillRect(0,0,sw,sh);
    for (var y=0; y<sh; y+=3){
      sctx.fillStyle = 'rgba(0,0,0,0.12)';
      sctx.fillRect(0,y,sw,1);
    }

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

    sctx.font = '14px monospace';
    sctx.fillStyle = '#8ff0dd';
    var textWidth = sctx.measureText(shown).width;
    var textX = sw/2 - textWidth/2;
    sctx.fillText(shown, textX, sh/2 + 5);

    var blink = ctx.reduceMotion ? true : Math.sin(t*4) > 0;
    if (blink){
      sctx.fillStyle = '#cfeee8';
      sctx.fillRect(textX + textWidth + 3, sh/2 - 9, 7, 14);
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
