// Standalone visual QA test — NOT wired into index.html/desktop.html/src/. Third near-camera
// building (01_Building03, optimized GLB from tools/_bgtest/generated/building03-optimized.glb)
// tested alongside the already-frozen Skyscraper07 (building-test.js, x=0.58) and Residential_04
// (residential04-test.js — production value x=2.349 is hardcoded as this script's own starting
// point too, see TRANSFORM below) to fill the empty lower-left of the window without touching
// either frozen building. No window lights this round (per brief) — facade/glass day/night
// color multiply only, same mechanism as the other two.
(function(){
  var ctx = window.__ctx;
  var GLB_PATH = 'tools/_bgtest/generated/building03-optimized.glb';

  var loader = null, dracoLoader = null;
  var root = null, facadeMesh = null, glassMesh = null;
  var localBounds = null;
  var currentBlend = 0;

  // Starting transform — deliberately conservative (small scale, tucked at the window's
  // left/bottom edge) since the brief's screen-space target is only ~10-18% visible height.
  // x/y/z/rotY/scale all get swept at runtime via setTransform(); this is just the initial
  // load position, not a frozen value.
  var transform = { x: -1.55, y: -6.3, z: -1.0, rotY: 0.35, scale: 0.014 };

  var NIGHT_MUL = new THREE.Color(0.5, 0.56, 0.72);

  var FACADE_BASE = new THREE.Color(0.1316, 0.1598, 0.1974); // matches the GLB's own baked "facade" color (export script's 0.94x-darkened family)
  var B_PRESETS = {
    B1: { mul: 1.00, label: 'match Skyscraper07 baseline' },
    B2: { mul: 1.07, label: '+7% brighter' },
    B3: { mul: 0.93, label: '-7% darker (near-silhouette)' }
  };
  var currentB = 'B1';

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

  function makeMaterials(key){
    var mul = B_PRESETS[key].mul;
    var facadeColor = FACADE_BASE.clone().multiplyScalar(mul);
    var glassColor = facadeColor.clone().multiplyScalar(0.90);
    glassColor.b = Math.min(1, glassColor.b + 0.015);
    var facadeMat = new THREE.MeshStandardMaterial({ color: facadeColor, metalness: 0, roughness: 0.84 });
    var glassMat = new THREE.MeshStandardMaterial({ color: glassColor, metalness: 0, roughness: 0.62 });
    facadeMat.userData.baseColor = facadeMat.color.clone();
    glassMat.userData.baseColor = glassMat.color.clone();
    return { facadeMat: facadeMat, glassMat: glassMat };
  }

  function applyB(key){
    currentB = key;
    if (!facadeMesh) return;
    var mats = makeMaterials(key);
    facadeMesh.material = mats.facadeMat;
    if (glassMesh) glassMesh.material = mats.glassMat;
    syncBlend(currentBlend);
    updateHud();
  }

  function loadModel(cb){
    ensureLoader();
    var t0 = performance.now();
    loader.load(GLB_PATH, function(gltf){
      window.__building03LoadMs = performance.now() - t0;
      var meshes = [];
      gltf.scene.traverse(function(o){ if (o.isMesh) meshes.push(o); });
      facadeMesh = meshes.find(function(m){ return m.material.name === 'facade'; }) || meshes[0];
      glassMesh = meshes.find(function(m){ return m.material.name === 'glass'; }) || null;
      [facadeMesh, glassMesh].forEach(function(m){
        if (!m) return;
        m.castShadow = false; m.receiveShadow = false;
        m.geometry.computeVertexNormals();
      });

      var mats = makeMaterials(currentB);
      facadeMesh.material = mats.facadeMat;
      if (glassMesh) glassMesh.material = mats.glassMat;

      var box = new THREE.Box3().setFromObject(facadeMesh);
      if (glassMesh) box.union(new THREE.Box3().setFromObject(glassMesh));
      localBounds = box;

      root = new THREE.Group();
      root.name = 'BUILDING03_ROOT';
      root.add(facadeMesh);
      if (glassMesh) root.add(glassMesh);
      ctx.scene.add(root);

      applyTransform();
      syncBlend(currentBlend);
      updateHud();
      console.log('[building03test] loaded in', window.__building03LoadMs.toFixed(1), 'ms. meshes:', meshes.map(function(m){return m.name+'/'+m.material.name;}), 'localBounds', box.min.toArray(), box.max.toArray());
      if (cb) cb();
    }, undefined, function(err){ console.error('[building03test] load failed', err); });
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
    updateHud();
  }

  setInterval(function(){
    var b = currentBgBlend();
    if (Math.abs(b - currentBlend) > 0.001) syncBlend(b);
  }, 100);

  function updateHud(){
    var hud = document.getElementById('building03Hud');
    if (!hud) return;
    hud.innerHTML =
      '<b>Building03 (test)</b><br>' +
      'pos ' + transform.x.toFixed(3) + ',' + transform.y.toFixed(3) + ',' + transform.z.toFixed(3) +
      ' scale ' + transform.scale.toFixed(4) + ' rotY ' + transform.rotY.toFixed(2) + '<br>' +
      'B: ' + currentB + ' (' + B_PRESETS[currentB].label + ') &nbsp; blend=' + currentBlend.toFixed(2) + '<br>' +
      '<span style="opacity:.6">no window lights this round</span>';
  }

  window.__building03Test = {
    load: loadModel,
    setTransform: function(patch){ Object.assign(transform, patch); applyTransform(); },
    getTransform: function(){ return transform; },
    setB: applyB,
    setBlendOverride: syncBlend,
    getState: function(){
      return {
        transform: transform, B: currentB, blend: currentBlend,
        rootPos: root ? root.position.toArray() : null,
        localBounds: localBounds ? { min: localBounds.min.toArray(), max: localBounds.max.toArray() } : null
      };
    }
  };

  console.log('[building03test] ready. Call window.__building03Test.load() to start.');
})();
