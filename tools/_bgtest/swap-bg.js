// Standalone visual QA test — NOT wired into index.html or desktop.html.
// Round 8: Day/Night background cross-fade, on top of the fixed baseline settled in
// prior rounds (fog=false, toneMapped=true, bg color-mul=1.10, Window_3.opacity=0.10 —
// none of these vary with the day/night blend). Two coincident background planes (day
// opaque underneath, night alpha-blended on top) are created ONCE; only their
// opacity/light intensities are mutated per frame — no material/texture/mesh is ever
// recreated. Z-fighting is avoided the standard three.js way: day is opaque (renders in
// the opaque pass, writes depth normally); night is transparent (material.transparent),
// so three.js renders it afterward in the back-to-front transparent pass with depthTest
// still ON — it reads the depth every opaque object (day, monitor, desk, phone, PC)
// already wrote, so it's correctly occluded by anything nearer than the window, and
// isn't fighting day for the same pixels since it draws strictly after. depthWrite is
// off (standard for a transparent surface) so it doesn't block the closer Glass pane.
(function(){
  var ctx = window.__ctx;
  var dayNode = null;   // original GLB "Day" node — hidden, kept for reference via B key
  var glassMesh = null; // Window_3 / "Glass"

  var dayTexture = null, nightTexture = null;
  var dayMesh = null, nightMesh = null;
  var dayLoaded = false, nightLoaded = false;

  var SCALE_FACTOR = 1.12;      // unchanged from prior rounds
  var GLASS_OPACITY = 0.10;     // fixed, confirmed prior round — never varies with blend
  var BG_COLOR_MUL = 1.10;      // fixed, confirmed prior round — applied to both day & night

  var blend = 0; // 0 = full day, 1 = full night

  // ---- lighting test params — interpolated by blend, mutated at runtime only in this
  // test page. create-scene.js (production) is never edited. ----
  var DAY_LIGHTS   = { ambient: 0.24, warm: 0.62, fill: 0.14, keyFill: 0.16 };
  var NIGHT_LIGHTS = { ambient: 0.08, warm: 0.16, fill: 0.24, keyFill: 0.05 }; // fill boosted = light cool "window glow"

  var loader = new THREE.TextureLoader();
  loader.load('assets/environment/seattle/seattle-day.webp', function(tex){
    tex.flipY = false; tex.encoding = THREE.sRGBEncoding;
    dayTexture = tex; dayLoaded = true; tryInit();
  });
  loader.load('assets/environment/seattle/seattle-night.webp', function(tex){
    tex.flipY = false; tex.encoding = THREE.sRGBEncoding;
    nightTexture = tex; nightLoaded = true; tryInit();
  });

  var pollId = setInterval(tryInit, 200);

  function tryInit(){
    if (!ctx.scene || !dayLoaded || !nightLoaded || dayMesh) return;
    var day = ctx.scene.getObjectByName('Day');
    if (!day) return;
    var wg = ctx.scene.getObjectByName('Window_Group');
    var glass = wg ? wg.getObjectByName('Window_3') : null;
    if (!glass) return;
    clearInterval(pollId);
    dayNode = day;
    glassMesh = glass;

    glassMesh.material.opacity = GLASS_OPACITY; // fixed for the whole session
    glassMesh.visible = true;

    var colorMul = new THREE.Color(BG_COLOR_MUL, BG_COLOR_MUL, BG_COLOR_MUL);

    var dayMat = new THREE.MeshBasicMaterial({ map: dayTexture, fog: false, toneMapped: true, color: colorMul.clone() });
    dayMesh = new THREE.Mesh(day.geometry, dayMat);
    dayMesh.name = 'Day_TEST_DAY';
    dayMesh.position.copy(day.position);
    dayMesh.rotation.copy(day.rotation);
    dayMesh.scale.copy(day.scale).multiplyScalar(SCALE_FACTOR);
    dayMesh.renderOrder = 0;
    day.parent.add(dayMesh);

    // Night is transparent, so three.js renders it in the separate back-to-front
    // transparent pass, strictly AFTER every opaque object (day plane, monitor, desk,
    // phone, PC — all opaque) has already written its depth. depthTest stays enabled
    // (default) so night is correctly occluded by anything nearer than the window (the
    // monitor, etc.) — depthTest:false was wrong here: it painted night over the desk
    // furniture regardless of what was actually in front, causing the whole room to
    // "cross-fade" instead of just the background. depthWrite stays off (standard for
    // a transparent surface) so night doesn't block the closer Glass pane behind it.
    var nightMat = new THREE.MeshBasicMaterial({
      map: nightTexture, fog: false, toneMapped: true, color: colorMul.clone(),
      transparent: true, opacity: 0, depthWrite: false
    });
    nightMesh = new THREE.Mesh(day.geometry, nightMat);
    nightMesh.name = 'Day_TEST_NIGHT';
    nightMesh.position.copy(dayMesh.position);
    nightMesh.rotation.copy(dayMesh.rotation);
    nightMesh.scale.copy(dayMesh.scale);
    nightMesh.renderOrder = 1;
    day.parent.add(nightMesh);

    day.visible = false; // start on the day/night pair; B toggles back to the original GLB photo

    window.__bgtest = { day: day, dayMesh: dayMesh, nightMesh: nightMesh, glassMesh: glassMesh, scaleFactor: SCALE_FACTOR };

    setBlend(0);
    wireControls();
    setupSampler();
    console.log('[bgtest] Round 8 day/night crossfade ready. Slider #bgtestBlend (0-100), keys D/N = pure day/night, B = original GLB Day node.');
  }

  function setBlend(v){
    blend = Math.max(0, Math.min(1, v));
    nightMesh.material.opacity = blend;
    interpolateLights(blend);
    var slider = document.getElementById('bgtestBlend');
    if (slider) slider.value = Math.round(blend * 100);
    updateHud();
  }

  function lerp(a, b, t){ return a + (b - a) * t; }

  function interpolateLights(t){
    if (ctx.warmLight) ctx.warmLight.intensity = lerp(DAY_LIGHTS.warm, NIGHT_LIGHTS.warm, t);
    ctx.scene.children.forEach(function(o){
      if (o.isHemisphereLight){
        o.intensity = lerp(DAY_LIGHTS.ambient, NIGHT_LIGHTS.ambient, t);
      } else if (o.isPointLight && o.color.getHex() === 0x7897bf){ // fillLight — doubles as the "window direction" cool light
        o.intensity = lerp(DAY_LIGHTS.fill, NIGHT_LIGHTS.fill, t);
      } else if (o.isPointLight && o.color.getHex() === 0xffead8){ // keyFill
        o.intensity = lerp(DAY_LIGHTS.keyFill, NIGHT_LIGHTS.keyFill, t);
      }
      // screenLight (monitor glow) and the PC tower's emissive fan materials are
      // intentionally untouched — "保留显示器和机箱灯光".
    });
  }

  function wireControls(){
    window.addEventListener('keydown', function(e){
      if (e.key === 'd' || e.key === 'D') setBlend(0);
      else if (e.key === 'n' || e.key === 'N') setBlend(1);
      else if (e.key === 'b' || e.key === 'B'){
        dayNode.visible = !dayNode.visible;
        var showPair = !dayNode.visible;
        dayMesh.visible = showPair;
        nightMesh.visible = showPair;
        console.log('[bgtest] showing:', dayNode.visible ? 'ORIGINAL GLB Day node' : 'day/night crossfade pair');
        updateHud();
      }
    });
    var slider = document.getElementById('bgtestBlend');
    if (slider){
      slider.addEventListener('input', function(){ setBlend(slider.value / 100); });
    }
  }

  function updateHud(){
    var hud = document.getElementById('bgtestHud');
    if (!hud) return;
    var pp = window.__parallaxParams || { x: '?', y: '?' };
    hud.innerHTML =
      '<b>Day/Night blend: ' + blend.toFixed(2) + '</b><br>' +
      'fog: false (fixed)<br>' +
      'glass opacity: ' + GLASS_OPACITY.toFixed(2) + ' (fixed)<br>' +
      'toneMapped: true (fixed)<br>' +
      'bg color mul: ' + BG_COLOR_MUL.toFixed(2) + ' (fixed)<br>' +
      'bg scale: ' + SCALE_FACTOR.toFixed(2) + 'x<br>' +
      'parallax: ' + pp.x + ' / ' + pp.y + '<br>' +
      '<span style="opacity:.6">slider or keys D/N = pure day/night, B = original GLB Day node</span>';
  }

  // ---- fixed-region pixel sampler (same regions/method as the prior diagnosis round) ----
  function setupSampler(){
    var SAMPLE_REGIONS = {
      skyUpper:      { x: 560, y: 15,  w: 90, h: 40 },
      horizon:       { x: 560, y: 115, w: 90, h: 25 },
      spaceNeedle:   { x: 228, y: 160, w: 16, h: 80 },
      rainier:       { x: 870, y: 245, w: 70, h: 45 },
      windowInterior:{ x: 300, y: 150, w: 90, h: 100 }
    };
    window.__bgtestSample = function(){
      var canvas = ctx.renderer.domElement;
      var gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      var out = {};
      Object.keys(SAMPLE_REGIONS).forEach(function(key){
        var r = SAMPLE_REGIONS[key];
        var glY = canvas.height - (r.y + r.h);
        var pixels = new Uint8Array(r.w * r.h * 4);
        gl.readPixels(r.x, glY, r.w, r.h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        var rs = 0, gs = 0, bs = 0, n = r.w * r.h;
        for (var i = 0; i < pixels.length; i += 4){ rs += pixels[i]; gs += pixels[i+1]; bs += pixels[i+2]; }
        out[key] = {
          r: Math.round(rs / n), g: Math.round(gs / n), b: Math.round(bs / n),
          luma: Math.round(0.2126 * (rs/n) + 0.7152 * (gs/n) + 0.0722 * (bs/n))
        };
      });
      return out;
    };
    window.__bgtestSampleRegions = SAMPLE_REGIONS;
  }

  // exposed for QA scripting
  window.__bgtestSetBlend = setBlend;
})();
