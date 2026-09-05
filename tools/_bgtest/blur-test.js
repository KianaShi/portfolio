// Standalone visual QA test — NOT wired into index.html/desktop.html/src/. Round 6.
// Tests offline-pregenerated Gaussian-blur variants of the Seattle day/night backdrop, to
// see whether blurring it sells "background is farther away than the near-camera building"
// without touching Window_3/fog/toneMapped/bg-scale (all fixed since Round 3-4) and without
// any runtime blur (no CSS filter, no Three.js post-processing/DepthOfField/per-frame blur —
// all four variants per day/night are separate pre-blurred WebP files, swapped by reference).
// Depends on swap-bg.js having already created dayMesh/nightMesh (window.__bgtest) — this
// script only ever swaps their material.map, never touches opacity/position/scale/fog/etc.
(function(){
  var ctx = window.__ctx;
  var RADII = [0, 2, 4, 6];
  var BLUR_DIR = 'tools/_bgtest/generated/bg-blur/';

  var textures = { day: {}, night: {} }; // textures.day[radius] = THREE.Texture
  var loadedCount = 0;
  var TOTAL = RADII.length * 2;
  var currentRadius = 0;
  var ready = false;

  var loader = new THREE.TextureLoader();
  RADII.forEach(function(r){
    loader.load(BLUR_DIR + 'seattle-day-blur' + r + '.webp', function(tex){
      tex.flipY = false; tex.encoding = THREE.sRGBEncoding;
      textures.day[r] = tex;
      loadedCount++; tryReady();
    });
    loader.load(BLUR_DIR + 'seattle-night-blur' + r + '.webp', function(tex){
      tex.flipY = false; tex.encoding = THREE.sRGBEncoding;
      textures.night[r] = tex;
      loadedCount++; tryReady();
    });
  });

  function tryReady(){
    if (loadedCount < TOTAL || ready) return;
    if (!window.__bgtest || !window.__bgtest.dayMesh || !window.__bgtest.nightMesh) {
      setTimeout(tryReady, 100); // swap-bg.js may still be initializing
      return;
    }
    ready = true;
    console.log('[blurtest] all', TOTAL, 'blur variants loaded. window.__blurTest.setBlur(0|2|4|6)');
    // Round 6 pick: 2px. 0 gives no depth separation from the sharp near-camera building;
    // 4 already softens the skyline into a mush at full-frame viewing; 6 loses Rainier's
    // silhouette almost entirely against the night sky and rounds off the Space Needle's
    // saucer into a blob (see round 6 report for the zoomed comparisons). 2 keeps Space
    // Needle/Rainier both clearly identifiable while still visibly receding versus the
    // sharp Skyscraper07 in front of it.
    setBlur(2);
    updateHud();
  }

  function setBlur(radius){
    if (RADII.indexOf(radius) === -1) { console.warn('[blurtest] invalid radius', radius); return; }
    if (!window.__bgtest) return;
    var dayMat = window.__bgtest.dayMesh.material;
    var nightMat = window.__bgtest.nightMesh.material;
    dayMat.map = textures.day[radius];
    nightMat.map = textures.night[radius];
    dayMat.needsUpdate = true;
    nightMat.needsUpdate = true;
    currentRadius = radius;
    updateHud();
  }

  function updateHud(){
    var hud = document.getElementById('blurtestHud');
    if (!hud) return;
    hud.innerHTML =
      '<b>BG blur test (Round 6)</b><br>' +
      'radius: ' + currentRadius + 'px &nbsp; ' +
      '<span style="opacity:.6">keys: 0/2/4/6 = blur radius</span>';
  }

  window.addEventListener('keydown', function(e){
    if (e.key === '0') setBlur(0);
    else if (e.key === '2') setBlur(2);
    else if (e.key === '4') setBlur(4);
    else if (e.key === '6') setBlur(6);
  });

  window.__blurTest = {
    setBlur: setBlur,
    getRadius: function(){ return currentRadius; },
    isReady: function(){ return ready; }
  };
})();
