// Test-only fork of src/interaction.js — NOT wired into the production site.
// Only change from the original: parallax amplitude reduced (0.5/0.25 -> 0.15/0.08)
// per Round 4 feedback. Diff this against ../../src/interaction.js to see the full
// (single) change; everything else is copied verbatim so the rest of the scene
// behaves identically to production for this test.
(function(){
  var ctx = window.__ctx;
  var scene = ctx.scene, camera = ctx.camera, renderer = ctx.renderer;
  var warmLight = ctx.warmLight, screenLight = ctx.screenLight;
  var zoomDuration = ctx.zoomDuration, zoomFromPos = ctx.zoomFromPos, zoomFromLook = ctx.zoomFromLook;
  var zoomToPos = ctx.zoomToPos, zoomToLook = ctx.zoomToLook, zoomToFov = ctx.zoomToFov, currentLook = ctx.currentLook;
  var easeInOutCubic = ctx.easeInOutCubic, drawIdleScreen = ctx.drawIdleScreen;

  var raycaster = new THREE.Raycaster();
  var mouseVec = new THREE.Vector2();
  renderer.domElement.style.pointerEvents = 'auto';
  renderer.domElement.addEventListener('click', function(e){
    mouseVec.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseVec.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouseVec, camera);
    var hits = raycaster.intersectObject(ctx.interactiveHitbox, false);
    if (hits.length > 0){
      ctx.boot();
    }
  });

  renderer.domElement.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar'){
      e.preventDefault();
      ctx.boot();
    }
  });

  // mouse parallax
  var mouseX = 0, mouseY = 0;
  window.addEventListener('mousemove', function(e){
    mouseX = (e.clientX / window.innerWidth) - 0.5;
    mouseY = (e.clientY / window.innerHeight) - 0.5;
  });
  // exposed so the QA script can drive extreme values without real mouse events
  window.__testMouse = { set: function(x,y){ mouseX = x; mouseY = y; } };
  // Round 9: coefficients are now runtime-mutable (window.__parallaxParams.x/.y) so the
  // F1/F2/F3 background-parallax comparison can be driven from the console without a
  // file edit + reload per tier. Production src/interaction.js is untouched — still a
  // fixed 0.5/0.25 there.
  // Default updated to F2 (0.06/0.03) after the Round 9 comparison: the near building and
  // far background react to the SAME camera translation, so their relative motion ratio is
  // fixed by depth alone — dialing the shared coefficient down doesn't change that ratio,
  // it only shrinks both proportionally. F2 is the tier where the background's
  // (already-smaller, because-it's-far) motion reads as "barely alive" while the building's
  // motion (larger, because it's close) stays clearly the dominant, obviously-nearer layer.
  // F3 (0/0) was also tested and rejected: it removes ALL parallax, including the
  // building's own — with it, nothing moves and the near/far depth cue disappears entirely.
  window.__parallaxParams = { x: 0.06, y: 0.03 };

  function updateClock(){
    var d = new Date();
    var hh = String(d.getHours()).padStart(2,'0');
    var mm = String(d.getMinutes()).padStart(2,'0');
    var ss = String(d.getSeconds()).padStart(2,'0');
    document.getElementById('clock').textContent = hh+':'+mm+':'+ss;
  }
  setInterval(updateClock, 1000);
  updateClock();

  window.addEventListener('resize', function(){
    var w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
    renderer.setSize(w,h);
  });

  var clock = ctx.clock = new THREE.Clock();
  var pcMixerClock = ctx.pcMixerClock = new THREE.Clock();
  function animate(){
    requestAnimationFrame(animate);
    var t = clock.getElapsedTime();
    var pcDt = pcMixerClock.getDelta();
    if (ctx.pcMixer) ctx.pcMixer.update(pcDt);

    if (ctx.state.zooming){
      var zt = Math.min((t - ctx.zoomStart) / zoomDuration, 1);
      var ez = easeInOutCubic(zt);
      camera.position.lerpVectors(zoomFromPos, zoomToPos, ez);
      currentLook.lerpVectors(zoomFromLook, zoomToLook, ez);
      camera.lookAt(currentLook);
      camera.fov = ctx.zoomFromFov + (zoomToFov - ctx.zoomFromFov) * ez;
      camera.updateProjectionMatrix();
    } else if (ctx.reduceMotion){
      camera.position.x = 0;
      camera.position.y = 1.05;
      camera.lookAt(0.27, 0.97, 0.2);
    } else {
      // ROUND 4 CHANGE: 0.5 -> 0.15, 0.25 -> 0.08 (~65-70% smaller parallax amplitude)
      // ROUND 9: coefficients read from window.__parallaxParams each frame (see above)
      var pp = window.__parallaxParams;
      camera.position.x += (mouseX*pp.x - camera.position.x) * 0.03;
      camera.position.y += (1.05 - mouseY*pp.y - camera.position.y) * 0.03;
      camera.lookAt(0.27, 0.97, 0.2);
    }

    warmLight.intensity = ctx.reduceMotion ? 0.62 : 0.62 + Math.sin(t*0.6)*0.02;

    if (!ctx.state.booted){
      drawIdleScreen(t);
      screenLight.intensity = ctx.reduceMotion ? 0.12 : 0.12 + Math.sin(t*4)*0.03;
    } else {
      screenLight.intensity += (1.4 - screenLight.intensity) * 0.05;
    }

    renderer.render(scene, camera);
  }
  animate();
})();
