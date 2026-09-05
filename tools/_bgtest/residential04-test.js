// Standalone visual QA test — NOT wired into index.html/desktop.html/src/. Round 7.
// Second near-camera building (001_Residential_04, optimized GLB from
// tools/_bgtest/generated/residential04-optimized.glb) added alongside the already-frozen
// Skyscraper07 (building-test.js) to test whether a second depth layer reads as "more depth"
// or just "clutter". Positioned in the open gap between Skyscraper07's right edge and the PC
// tower (screen x roughly 734-999 at the idle camera), not behind either — so unlike
// Skyscraper07 (hidden by the monitor), this building's "only roof visible" look comes from
// its own Y offset sinking most of its height below the window's visible opening, calibrated
// the same way Skyscraper07's overhang was (pixel measurement, not eyeballing).
(function(){
  var ctx = window.__ctx;
  var GLB_PATH = 'tools/_bgtest/generated/residential04-optimized.glb';

  var loader = null, dracoLoader = null;
  var root = null, facadeMesh = null, glassMesh = null, lightsMesh = null;
  var localBounds = null;
  var currentBlend = 0;

  // ---- transform (tuned empirically against screenshots — see round 7 report) ----
  // Round 7: placed in the far-right option (not bottom-left — the Space Needle occupies
  // the window's whole left side at ground level with nothing to hide behind, while the
  // right side has the PC tower as a natural occluder, same role the monitor plays for
  // Skyscraper07). z=-0.85 (vs Skyscraper07's -1.2) puts it nearer the camera, so it picks
  // up more parallax motion from the same camera translation — no per-object multiplier
  // needed, that's just true parallax. x/y solved by binary-searching the screen-projected
  // bbox: first attempts (scale 0.0185, then 0.013) put the visible sliver's LEFT edge in
  // the 780-950px gap between Skyscraper07 and the PC tower, in open sky with nothing to
  // occlude the lower body — so instead of a restrained peek, the whole tall mesh rendered
  // top-to-bottom and swallowed Rainier's peak (confirmed by screenshot, see round 7
  // report). Re-solved to sit almost entirely BEHIND the PC tower instead (screen x
  // >= 1015, clearing Rainier's ~830-1010 band entirely) so the PC's own geometry occludes
  // the lower body the same way the monitor does for Skyscraper07 — only the swept roof
  // cap and a few window rows above the PC's screen-top (~258px) are actually visible.
  // x updated to 2.349 — the frozen production value (src/environment/buildings.js), re-tuned
  // from this script's original 2.761639491607184 after a later pixel-measurement pass found
  // that value left the building ~80% embedded in the right wall. Test default now mirrors
  // production so later building tests (e.g. Building03) compose against the real frozen scene.
  var transform = { x: 2.349, y: -0.2667781388095136, z: -0.85, rotY: -0.15, scale: 0.007 };

  // ---- day/night, matching Skyscraper07's mechanism exactly (same NIGHT_MUL, same
  // smoothstep light-fade curve) so the two buildings look like the same time of day ----
  var NIGHT_MUL = new THREE.Color(0.5, 0.56, 0.72);
  var LIGHT_OFF_COLOR = new THREE.Color(0x1c2129);
  var LIGHT_ON_COLOR = new THREE.Color(0xffffff);
  // "强度不得超过Skyscraper07" (0.50) — kept strictly lower, and the two buildings' light
  // layouts are intentionally different (see LIGHTS below) so they never read as the same
  // repeated pattern lit at the same time.
  var MAX_LIGHT_INTENSITY = 0.42;

  // facade/glass tone matched to Skyscraper07's P2 in export_residential04.py (+8% brighter,
  // same hue) — baked into the GLB's own materials already, this script only applies the
  // day/night color multiply on top, identically to building-test.js's syncBlend().
  function ensureLoader(){
    if (loader) return;
    dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
    loader = new THREE.GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
  }

  function applyTransform(){
    if (!root) return;
    root.position.set(transform.x, transform.y, transform.z);
    root.rotation.y = transform.rotY;
    root.scale.setScalar(transform.scale);
    root.updateMatrixWorld(true);
    updateHud();
  }

  // 7 fixed local-space light positions, verified the same way Skyscraper07's Round 4 fix
  // was done — one candidate at a time (single test quad added alone, rendered, sampled,
  // removed, next candidate), never batch-verified (that produced false positives on
  // Skyscraper07's mesh — neighbors "covering for" an occluded candidate at readback time).
  // This mesh's hit rate was much higher (49/52 individually-tested candidates lit, vs
  // Skyscraper07's ~40%), likely because this decimation pass used a milder ratio (0.75)
  // and the shape has fewer competing parapet/setback triangles near the visible band.
  // Spans 3 distinct facade normals (unlike Skyscraper07's effectively-2), so lights land
  // on more than one visible face without extra effort. Local coordinates are in the GLB's
  // own un-transformed space, so they follow root's transform automatically.
  var HARDCODED_LIGHTS = [
    { localPos: [-41.773, 247.363, -35.904], localNormal: [0.389, 0, 0.921],   color: 'white'  },
    { localPos: [-41.752, 275.395, -35.969], localNormal: [0.389, 0, 0.921],   color: 'yellow' },
    { localPos: [-41.723, 303.436, -36.057], localNormal: [0.389, 0, 0.921],   color: 'white'  },
    { localPos: [-32.175, 293.553, -11.964], localNormal: [-0.921, 0, 0.389],  color: 'white'  },
    { localPos: [-27.438, 244.506, -1.116],  localNormal: [0.389, 0, 0.921],   color: 'yellow' },
    { localPos: [-15.845, 323.072, -27.245], localNormal: [0.917, 0, -0.399], color: 'white'  },
    { localPos: [-24.253, 265.490, 8.052],   localNormal: [-0.921, 0, 0.389],  color: 'white'  }
  ];

  function buildLightsMesh(){
    if (lightsMesh){ ctx.scene.remove(lightsMesh); lightsMesh.geometry.dispose(); lightsMesh.material.dispose(); lightsMesh = null; }
    if (!facadeMesh || !HARDCODED_LIGHTS.length) { updateHud(); return; }
    var geo = facadeMesh.geometry;
    geo.computeBoundingBox();
    var b = geo.boundingBox;
    root.updateMatrixWorld(true);

    var mat = new THREE.MeshBasicMaterial({ color: 0x1c2129, toneMapped: false, side: THREE.DoubleSide, vertexColors: true });
    var lightW = (b.max.x - b.min.x) * 0.05;
    var lightH = (b.max.y - b.min.y) * 0.018;
    var quadNormal = new THREE.Vector3(0, 0, 1);
    var warmWhite = new THREE.Color(0xfff3d9), warmYellow = new THREE.Color(0xffd9a0);
    var allPos = [], allNorm = [], allColor = [], allIndex = [];
    var quat = new THREE.Quaternion(), scl = new THREE.Vector3(), m = new THREE.Matrix4();
    HARDCODED_LIGHTS.forEach(function(l){
      var lp = new THREE.Vector3(l.localPos[0], l.localPos[1], l.localPos[2]);
      var ln = new THREE.Vector3(l.localNormal[0], l.localNormal[1], l.localNormal[2]);
      var color = l.color === 'yellow' ? warmYellow : warmWhite;
      quat.setFromUnitVectors(quadNormal, ln);
      scl.set(lightW, lightH, 1);
      m.compose(lp, quat, scl);
      var worldM = new THREE.Matrix4().multiplyMatrices(root.matrixWorld, m);
      var qg = new THREE.PlaneGeometry(1, 1);
      qg.applyMatrix4(worldM);
      var p = qg.attributes.position, n = qg.attributes.normal;
      var base = allPos.length / 3;
      for (var vi = 0; vi < p.count; vi++){
        allPos.push(p.getX(vi), p.getY(vi), p.getZ(vi));
        allNorm.push(n.getX(vi), n.getY(vi), n.getZ(vi));
        allColor.push(color.r, color.g, color.b);
      }
      var ia = qg.index;
      for (var ii = 0; ii < ia.count; ii++) allIndex.push(base + ia.getX(ii));
      qg.dispose();
    });
    var mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3));
    mg.setAttribute('normal', new THREE.Float32BufferAttribute(allNorm, 3));
    mg.setAttribute('color', new THREE.Float32BufferAttribute(allColor, 3));
    mg.setIndex(allIndex);
    var inst = new THREE.Mesh(mg, mat);
    inst.name = 'RESIDENTIAL04_LIGHTS';
    inst.frustumCulled = false;
    ctx.scene.add(inst);
    lightsMesh = inst;
    syncBlend(currentBlend);
    updateHud();
  }

  function loadModel(cb){
    ensureLoader();
    var t0 = performance.now();
    loader.load(GLB_PATH, function(gltf){
      window.__residential04LoadMs = performance.now() - t0;
      var meshes = [];
      gltf.scene.traverse(function(o){ if (o.isMesh) meshes.push(o); });
      facadeMesh = meshes.find(function(m){ return m.material.name === 'facade'; }) || meshes[0];
      glassMesh = meshes.find(function(m){ return m.material.name === 'glass'; }) || null;
      [facadeMesh, glassMesh].forEach(function(m){
        if (!m) return;
        m.castShadow = false; m.receiveShadow = false;
        m.geometry.computeVertexNormals();
        m.material.userData.baseColor = m.material.color.clone();
      });

      var box = new THREE.Box3().setFromObject(facadeMesh);
      if (glassMesh) box.union(new THREE.Box3().setFromObject(glassMesh));
      localBounds = box;

      root = new THREE.Group();
      root.name = 'RESIDENTIAL04_ROOT';
      root.add(facadeMesh);
      if (glassMesh) root.add(glassMesh);
      ctx.scene.add(root);

      applyTransform();
      buildLightsMesh();
      syncBlend(currentBlend);
      updateHud();
      console.log('[residential04test] loaded in', window.__residential04LoadMs.toFixed(1), 'ms. meshes:', meshes.map(function(m){return m.name+'/'+m.material.name;}), 'localBounds', box.min.toArray(), box.max.toArray());
      if (cb) cb();
    }, undefined, function(err){ console.error('[residential04test] load failed', err); });
  }

  function currentBgBlend(){
    return (window.__bgtest && window.__bgtest.nightMesh) ? window.__bgtest.nightMesh.material.opacity : 0;
  }

  function syncBlend(blend){
    currentBlend = blend;
    [facadeMesh, glassMesh].forEach(function(mesh){
      if (!mesh || !mesh.material.userData.baseColor) return;
      var mul = new THREE.Color(1, 1, 1).lerp(NIGHT_MUL, blend);
      mesh.material.color.copy(mesh.material.userData.baseColor).multiply(mul);
    });
    if (lightsMesh){
      var e0 = 0.55, e1 = 1.0;
      var x = Math.min(1, Math.max(0, (blend - e0) / (e1 - e0)));
      var t = x * x * (3 - 2 * x) * MAX_LIGHT_INTENSITY;
      lightsMesh.material.color.copy(LIGHT_OFF_COLOR).lerp(LIGHT_ON_COLOR, t);
    }
    updateHud();
  }

  setInterval(function(){
    var b = currentBgBlend();
    if (Math.abs(b - currentBlend) > 0.001) syncBlend(b);
  }, 100);

  function updateHud(){
    var hud = document.getElementById('residential04Hud');
    if (!hud) return;
    hud.innerHTML =
      '<b>Residential_04 (Round 7)</b><br>' +
      'pos ' + transform.x.toFixed(2) + ',' + transform.y.toFixed(2) + ',' + transform.z.toFixed(2) +
      ' scale ' + transform.scale.toFixed(4) + ' rotY ' + transform.rotY.toFixed(2) + '<br>' +
      'lights: ' + HARDCODED_LIGHTS.length + ' &nbsp; blend=' + currentBlend.toFixed(2);
  }

  window.__residential04Test = {
    load: loadModel,
    setTransform: function(patch){ Object.assign(transform, patch); applyTransform(); buildLightsMesh(); },
    getTransform: function(){ return transform; },
    setLights: function(lights){ HARDCODED_LIGHTS = lights; buildLightsMesh(); },
    getLights: function(){ return HARDCODED_LIGHTS; },
    buildLightsMesh: buildLightsMesh,
    setMaxLightIntensity: function(v){ MAX_LIGHT_INTENSITY = v; syncBlend(currentBlend); },
    setBlendOverride: syncBlend,
    getState: function(){
      return {
        transform: transform, lightsCount: HARDCODED_LIGHTS.length, blend: currentBlend,
        rootPos: root ? root.position.toArray() : null,
        localBounds: localBounds ? { min: localBounds.min.toArray(), max: localBounds.max.toArray() } : null
      };
    }
  };

  console.log('[residential04test] Round 7 ready. Call window.__residential04Test.load() to start.');
})();
