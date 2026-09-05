(function(){
  // Production Day/Night Seattle backdrop + local-time blend. Mechanism (two coincident
  // background planes, day opaque underneath / night alpha-blended on top, only
  // opacity/color mutated per update — never recreated) is copied unchanged from
  // tools/_bgtest/swap-bg.js, verified across bgtest rounds 3-6. This file additionally
  // owns the local-time-to-blend mapping, which the test page never had (it only exposed
  // a manual slider/keys).
  var ctx = window.__ctx;

  var DAY_TEX_PATH = 'assets/environment/seattle/seattle-day-blur2.webp';
  var NIGHT_TEX_PATH = 'assets/environment/seattle/seattle-night-blur2.webp';

  // Fixed since bgtest round 3-4 — confirmed correct for this exact backdrop plane/camera,
  // not re-derived here.
  var SCALE_FACTOR = 1.12;
  var GLASS_OPACITY = 0.10;
  var BG_COLOR_MUL = 1.10;

  var dayTexture = null, nightTexture = null, dayLoaded = false, nightLoaded = false;
  var dayNode = null, glassMesh = null, dayMesh = null, nightMesh = null;
  var currentBlend = 0;
  var initTried = false;

  // ---- ?envTime=<0-24> debug override — dev-only, no UI, not persisted ----
  var overrideHour = (function(){
    var raw;
    try { raw = new URLSearchParams(window.location.search).get('envTime'); }
    catch (e) { return null; }
    if (raw === null) return null;
    var v = parseFloat(raw);
    if (!isFinite(v) || v < 0 || v >= 24) return null; // invalid -> fall back to real time, no warning
    console.warn('[environment] envTime override active: ' + v + ' (remove ?envTime= to use the real local time)');
    return v;
  })();

  function smoothstep(edge0, edge1, x){
    var t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function currentHour(){
    if (overrideHour !== null) return overrideHour;
    var d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }

  // 05:00-07:00 Night->Day, 07:00-17:00 Day, 17:00-20:00 Day->Night, 20:00-05:00 Night.
  // Smoothstep, not linear, at both transition edges.
  function blendForHour(h){
    if (h >= 5 && h < 7) return 1 - smoothstep(5, 7, h);
    if (h >= 7 && h < 17) return 0;
    if (h >= 17 && h < 20) return smoothstep(17, 20, h);
    return 1; // 20:00-24:00 and 00:00-05:00
  }

  var loader = new THREE.TextureLoader();
  loader.load(DAY_TEX_PATH, function(tex){
    tex.flipY = false; tex.encoding = THREE.sRGBEncoding;
    dayTexture = tex; dayLoaded = true; tryInit();
  }, undefined, function(err){
    console.error('[environment] failed to load day backdrop texture', err);
  });
  loader.load(NIGHT_TEX_PATH, function(tex){
    tex.flipY = false; tex.encoding = THREE.sRGBEncoding;
    nightTexture = tex; nightLoaded = true; tryInit();
  }, undefined, function(err){
    console.error('[environment] failed to load night backdrop texture', err);
  });

  var pollStart = performance.now();
  var POLL_TIMEOUT_MS = 20000;
  var pollId = setInterval(tryInit, 200);

  function tryInit(){
    if (ctx.environmentReady || initTried) return;
    if (performance.now() - pollStart > POLL_TIMEOUT_MS){
      clearInterval(pollId);
      console.warn('[environment] desk model window nodes (Day/Window_3/Window_1/Window_2) never appeared within ' + POLL_TIMEOUT_MS + 'ms — keeping the original GLB Day backdrop.');
      return;
    }
    if (!ctx.scene || !dayLoaded || !nightLoaded) return;
    var day = ctx.scene.getObjectByName('Day');
    if (!day) return;
    var wg = ctx.scene.getObjectByName('Window_Group');
    var glass = wg ? wg.getObjectByName('Window_3') : null;
    var w1 = wg ? wg.getObjectByName('Window_1') : null;
    var w2 = wg ? wg.getObjectByName('Window_2') : null;
    // Window_1/Window_2 aren't touched by this module at all (per spec) — their presence
    // is only checked here as part of "the desk model finished loading and is the real
    // thing, not a half-parsed scene graph."
    if (!glass || !w1 || !w2) return;

    clearInterval(pollId);
    initTried = true;
    dayNode = day;
    glassMesh = glass;

    glassMesh.material.opacity = GLASS_OPACITY;
    glassMesh.visible = true;

    var colorMul = new THREE.Color(BG_COLOR_MUL, BG_COLOR_MUL, BG_COLOR_MUL);

    var dayMat = new THREE.MeshBasicMaterial({ map: dayTexture, fog: false, toneMapped: true, color: colorMul.clone() });
    dayMesh = new THREE.Mesh(day.geometry, dayMat);
    dayMesh.name = 'ENV_DAY';
    dayMesh.position.copy(day.position);
    dayMesh.rotation.copy(day.rotation);
    dayMesh.scale.copy(day.scale).multiplyScalar(SCALE_FACTOR);
    dayMesh.renderOrder = 0;
    day.parent.add(dayMesh);

    // Night: transparent, depthWrite off, rendered strictly after every opaque object in
    // the back-to-front transparent pass — correctly occluded by anything nearer (monitor,
    // desk, the two new buildings), never fights Day for the same pixels.
    var nightMat = new THREE.MeshBasicMaterial({
      map: nightTexture, fog: false, toneMapped: true, color: colorMul.clone(),
      transparent: true, opacity: 0, depthWrite: false
    });
    nightMesh = new THREE.Mesh(day.geometry, nightMat);
    nightMesh.name = 'ENV_NIGHT';
    nightMesh.position.copy(dayMesh.position);
    nightMesh.rotation.copy(dayMesh.rotation);
    nightMesh.scale.copy(dayMesh.scale);
    nightMesh.renderOrder = 1;
    day.parent.add(nightMesh);

    ctx.environmentReady = true;

    // Only hide the original GLB Day node once the new layers have had a real chance to
    // render. interaction.js's own animate() loop (started independently at page load,
    // well before this async GLB-dependent setup runs) is already calling
    // renderer.render() every frame by this point, so any short delay here — not
    // specifically an rAF callback — is enough for at least one of those frames to have
    // picked up the new dayMesh/nightMesh. Deliberately NOT chained rAF callbacks: those
    // don't fire reliably in every environment (confirmed in earlier bgtest rounds), while
    // a plain timer does.
    setTimeout(function(){
      day.visible = false;
    }, 50);

    applyBlend(blendForHour(currentHour()), true);

    setInterval(recalc, 60000);
    document.addEventListener('visibilitychange', function(){
      if (!document.hidden) recalc();
    });
    window.addEventListener('focus', recalc);
  }

  function applyBlend(blend, force){
    if (!force && Math.abs(blend - currentBlend) < 0.0005){
      currentBlend = blend;
      return;
    }
    currentBlend = blend;
    ctx.environmentBlend = blend;
    if (nightMesh) nightMesh.material.opacity = blend;
    if (ctx.environmentBuildings && ctx.environmentBuildings.ready){
      ctx.environmentBuildings.applyBlend(blend);
    }
  }

  function recalc(){
    applyBlend(blendForHour(currentHour()));
  }

  // Shared cross-file entry point: environment/buildings.js calls this once its own
  // assets finish loading (rather than duplicating the time->blend computation), and it's
  // the function driving the 60s tick + visibility/focus refreshes above.
  ctx.updateEnvironment = recalc;
  ctx.environmentReady = false;
  ctx.environmentBlend = 0;
})();
