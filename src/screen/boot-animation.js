(function(){
  var ctx = window.__ctx;
  var camera = ctx.camera;

  var bootLines = [
    '> initializing session...',
    '> loading AI Agent Applications',
    '> loading Data',
    '> loading Product',
    '> welcome.'
  ];
  var typedText = ctx.typedText = [];
  var lineIndex = 0, charIndex = 0;

  function typeStep(){
    if (ctx.reduceMotion){
      for (var i=0; i<bootLines.length; i++) typedText.push(bootLines[i]);
      lineIndex = bootLines.length;
      ctx.drawBootScreen();
      return;
    }
    if (lineIndex >= bootLines.length) return;
    var line = bootLines[lineIndex];
    if (charIndex === 0) typedText.push('');
    charIndex++;
    typedText[lineIndex] = line.substring(0, charIndex);
    ctx.drawBootScreen();
    if (charIndex >= line.length){
      lineIndex++; charIndex = 0;
      setTimeout(typeStep, 220);
    } else {
      setTimeout(typeStep, 28);
    }
  }

  ctx.zoomStart = 0;
  var zoomDuration = ctx.zoomDuration = ctx.reduceMotion ? 0.05 : 1.5;
  var zoomFromPos = ctx.zoomFromPos = new THREE.Vector3();
  ctx.zoomFromFov = camera.fov;
  var zoomFromLook = ctx.zoomFromLook = new THREE.Vector3(0.27, 0.97, 0.2);
  var zoomToPos = ctx.zoomToPos = new THREE.Vector3(0.3, 0.11, 2.55);
  var zoomToLook = ctx.zoomToLook = new THREE.Vector3(0.3, 0.11, 1.165);
  var zoomToFov = ctx.zoomToFov = 29;
  var currentLook = ctx.currentLook = new THREE.Vector3(0.3, 0, 0);

  function easeInOutCubic(x){
    return x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x+2, 3)/2;
  }
  ctx.easeInOutCubic = easeInOutCubic;

  function boot(){
    if (ctx.state.booted) return;
    ctx.state.booted = true;
    document.getElementById('hint').classList.add('hidden');
    ctx.powerBtn.material.emissive.setHex(0x5fd6c2);
    ctx.powerBtn.material.emissiveIntensity = 0.8;
    typeStep();
    zoomFromPos.copy(camera.position);
    ctx.zoomFromFov = camera.fov;
    ctx.state.zooming = true;
    ctx.zoomStart = ctx.clock.getElapsedTime();
    setTimeout(function(){
      document.getElementById('app').classList.add('fade-out');
      document.getElementById('enterLink').classList.add('show');
      setTimeout(function(){
        window.location.href = 'desktop.html';
      }, 650);
    }, zoomDuration*1000 + 250);
  }

  // hint typewriter ("click to know me")
  var hintPhrase = 'click screen to interact';
  var hintTextEl = document.getElementById('hintText');
  var hi = 0;
  function typeHint(){
    if (ctx.state.booted) return;
    if (ctx.reduceMotion){
      hintTextEl.textContent = hintPhrase;
      return;
    }
    if (hi <= hintPhrase.length){
      hintTextEl.textContent = hintPhrase.substring(0, hi);
      hi++;
      setTimeout(typeHint, 65);
    }
  }
  typeHint();
  ctx.boot = boot;
})();
