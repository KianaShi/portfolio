(function(){
  var ctx = window.__ctx;
  var scene = ctx.scene, camera = ctx.camera, renderer = ctx.renderer;
  var warmLight = ctx.warmLight, screenLight = ctx.screenLight;
  var zoomDuration = ctx.zoomDuration, zoomFromPos = ctx.zoomFromPos, zoomFromLook = ctx.zoomFromLook;
  var zoomToPos = ctx.zoomToPos, zoomToLook = ctx.zoomToLook, zoomToFov = ctx.zoomToFov, currentLook = ctx.currentLook;
  var easeInOutCubic = ctx.easeInOutCubic, drawIdleScreen = ctx.drawIdleScreen;

  // raycasting click
  var raycaster = new THREE.Raycaster();
  var mouseVec = new THREE.Vector2();
  renderer.domElement.style.pointerEvents = 'auto';

  function setMouseVecFromEvent(e){
    mouseVec.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseVec.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  // Click priority: phone screen first, then the monitor screen — a hit on the phone
  // consumes the click (no boot(), no camera zoom) even if the hit missed every control,
  // since the intent was clearly "interact with the phone", not "boot the monitor".
  renderer.domElement.addEventListener('click', function(e){
    setMouseVecFromEvent(e);
    raycaster.setFromCamera(mouseVec, camera);

    if (ctx.phonePlayerReady && ctx.phoneHitbox){
      var phoneHits = raycaster.intersectObject(ctx.phoneHitbox, false);
      if (phoneHits.length > 0 && phoneHits[0].uv){
        ctx.phonePlayer.handleScreenHit(phoneHits[0].uv);
        return;
      }
    }

    var hits = raycaster.intersectObject(ctx.interactiveHitbox, false);
    if (hits.length > 0){
      ctx.boot();
    }
  });

  // Progress-bar drag-to-seek on the phone screen. There is no existing pointer-drag
  // interaction on this canvas (the parallax above is passive mousemove tracking, not a
  // capture-drag), so this can't conflict with camera controls. Scoped to only the
  // progress-bar hit region so ordinary clicks/taps elsewhere are unaffected.
  var phoneSeekDragging = false;
  renderer.domElement.addEventListener('pointerdown', function(e){
    if (!ctx.phonePlayerReady || !ctx.phoneHitbox) return;
    setMouseVecFromEvent(e);
    raycaster.setFromCamera(mouseVec, camera);
    var hits = raycaster.intersectObject(ctx.phoneHitbox, false);
    if (hits.length > 0 && hits[0].uv && ctx.phonePlayer.isSeekUV(hits[0].uv)){
      phoneSeekDragging = true;
      ctx.phonePlayer.seekAtUV(hits[0].uv);
      renderer.domElement.setPointerCapture(e.pointerId);
    }
  });
  renderer.domElement.addEventListener('pointermove', function(e){
    if (!phoneSeekDragging) return;
    setMouseVecFromEvent(e);
    raycaster.setFromCamera(mouseVec, camera);
    var hits = raycaster.intersectObject(ctx.phoneHitbox, false);
    if (hits.length > 0 && hits[0].uv){
      ctx.phonePlayer.seekAtUV(hits[0].uv);
    }
  });
  function endPhoneSeekDrag(e){
    if (!phoneSeekDragging) return;
    phoneSeekDragging = false;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch (err){}
  }
  renderer.domElement.addEventListener('pointerup', endPhoneSeekDrag);
  renderer.domElement.addEventListener('pointercancel', endPhoneSeekDrag);

  // Keyboard equivalent of clicking the monitor: the canvas is a single focusable target
  // (tabindex/role/aria-label set in create-scene.js), so there's no raycast position to
  // test here — Enter/Space just calls the same ctx.boot() the click handler calls.
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


  // resize
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
      // No parallax: sit at the same resting position the lerp below would otherwise
      // settle toward when mouseX/mouseY are 0.
      camera.position.x = 0;
      camera.position.y = 1.05;
      camera.lookAt(0.27, 0.97, 0.2);
    } else {
      // Round 6 environment integration: amplitude taken from tools/_bgtest's confirmed F2
      // tier (was 0.5/0.25 unchanged since the original build). IMPORTANT — this is not a
      // background-only control: there is one shared camera for the whole scene, so this
      // reduces parallax sway for the desk/monitor/phone/PC exactly as much as it does for
      // the backdrop and the two new buildings. That was the deliberate tradeoff verified
      // in bgtest rounds 3-6: at 0.5/0.25 the far Seattle backdrop swung distractingly far
      // for how distant it's supposed to read, and 0.06/0.03 was the tier where the
      // backdrop reads as "barely alive" while the near buildings still clearly read as the
      // nearest moving layer — the interior desk scene sways less now as a direct
      // consequence, not a separate, isolated change.
      camera.position.x += (mouseX*0.06 - camera.position.x) * 0.03;
      camera.position.y += (1.05 - mouseY*0.03 - camera.position.y) * 0.03;
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
