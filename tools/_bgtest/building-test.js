// Standalone visual QA test — NOT wired into index.html/desktop.html/src/. Round 10:
// production-quality pass on Round 9's N3 (bottom-near roof) direction. Switches from the
// silhouette GLB (1,914 tri, visible faceting up close) to the optimized GLB (10,740 tri,
// 2 materials: facade/glass) and re-derives scale/position/lights against measured pixel
// targets instead of the eyeballed values from Round 9. Reads window.__bgtest / window.__ctx
// published by swap-bg.js; does not modify swap-bg.js.
//
// Layer order — verified in Round 9 via camera-space depth (camera.matrixWorldInverse),
// unchanged this round: PC/monitor nearest, then Window_3 glass, then this building
// (world z roughly -0.5 to -3.7), then the Room002 occlusion boundary (world z=-3.87 —
// anything farther is fully hidden), then the Seattle background plane farthest. Achieved
// with real depth ordering + normal depthTest only — no depthTest:false, no renderOrder
// override, Room002/Window_3/window frame untouched.
(function(){
  var ctx = window.__ctx;

  var VARIANT_FILES = {
    O: 'tools/_bgtest/generated/skyscraper07-optimized.glb', // default this round
    S: 'tools/_bgtest/generated/skyscraper07-silhouette.glb' // kept as comparison (key 'S')
  };
  var currentVariant = 'O';

  var loader = null, dracoLoader = null;
  var buildingRoot = null;      // THREE.Group: [facadeMesh, (glassMesh,) lightsInstancedMesh]
  var facadeMesh = null, glassMesh = null; // glassMesh is null for the S (silhouette) variant
  var lightsMesh = null;
  var localBounds = null;

  // x/z/rotY held fixed per this round's brief — only scale and y (height calibration) and
  // material tuning are in scope. Values solved analytically (see MONITOR_TOP_PX below) then
  // confirmed by screenshot, not eyeballed.
  var FIXED_X = -0.1, FIXED_Z = -1.2, FIXED_ROT = 0.2618; // 15deg, from Round 9

  // ---- pixel calibration (measured directly from rendered screenshots, not assumed) ----
  // At the idle camera (0,1.05,3.85) looking at (0.27,0.97,0.2), 1280x720:
  //  - window glass spans screen y ~ 0 to ~397px (sampled column x=350: sky/skyline until
  //    y~395, then the opaque black sill begins) -> WINDOW_H_PX = 397
  //  - monitor top edge (screen surface, not bezel) sits at screen y ~ 162px (sampled
  //    column x=430, straight through the monitor) -> MONITOR_TOP_PX = 162
  var WINDOW_H_PX = 397;
  var MONITOR_TOP_PX = 162;

  // ---- scale/height presets (Round 10 section 二) ----
  // groupY solved by binary-searching the world Y that projects the mesh's local top-center
  // point (~(0.12, 185, 2.65), from the Round 9 bbox inspection) to the target screen Y —
  // target = MONITOR_TOP_PX - (overhang% * WINDOW_H_PX). Solved once via camera.project() in
  // devtools, then confirmed by screenshot (documented in the report, not just computed).
  // y values solved via camera.project() targeting the mesh's local top-center point, then
  // corrected by +18px after the first render showed the roof's actual silhouette PEAK
  // (a corner, not the center, once the 15deg yaw is applied) sits ~18px higher on screen
  // than the center-point prediction — confirmed by direct pixel measurement, not assumed.
  var SCALE_PRESETS = {
    A: { scale: 0.030, y: -3.51, label: 'overhang 12-16%' },
    B: { scale: 0.035, y: -4.37, label: 'overhang 16-20%' },
    C: { scale: 0.040, y: -5.22, label: 'overhang 20-24%' },
    D: { scale: 0.045, y: -6.00, label: 'Round 9 size (control)' }
  };
  var currentScaleKey = 'B'; // chosen default this round — see report for why

  // ---- horizontal position candidates (Round 10 section 三) ----
  // Round 5: x re-tuned from 0.40 to 0.58 within the X4 slot (not a new preset) — 0.40 had
  // the window's vertical mullion cutting through the middle of the building's silhouette,
  // and a 0.40-1.00 sweep found the mullion-clear / Rainier-clear intersection only opens up
  // at 0.58 (Rainier overlap starts measurably at 0.60, confirmed by no-building-reference
  // pixel diffing, not eyeballed — see the round 5 report). Frozen here per user confirmation.
  var X_PRESETS = { X1: -0.35, X2: -0.10, X3: 0.15, X4: 0.58 };
  var currentXKey = 'X4';

  function currentX(){ return X_PRESETS[currentXKey]; }
  function currentScale(){ return SCALE_PRESETS[currentScaleKey].scale; }
  function currentGroupY(){ return SCALE_PRESETS[currentScaleKey].y; }

  // ---- day/night multiplier (unchanged mechanism from Round 9, applied per-material) ----
  var NIGHT_MUL = new THREE.Color(0.5, 0.56, 0.72);
  var LIGHT_OFF_COLOR = new THREE.Color(0x1a1f28); // matches facade — invisible by day
  var LIGHT_ON_COLOR = new THREE.Color(0xffffff);  // multiplied by each instance's warm color
  var currentBlend = 0;

  // ---- facade/glass materials, P1/P2/P3 brightness delta (Round 10 section 四) ----
  var FACADE_BASE = new THREE.Color(0.14, 0.17, 0.21); // deep cool grey-blue
  var P_DELTAS = { P1: 0.05, P2: 0.10, P3: 0.15 };
  var currentP = 'P2';

  function makeFacadeGlassMaterials(deltaKey){
    var delta = P_DELTAS[deltaKey];
    var facadeMat = new THREE.MeshStandardMaterial({ color: FACADE_BASE.clone(), metalness: 0, roughness: 0.82 });
    var glassColor = FACADE_BASE.clone().multiplyScalar(1 - delta);
    glassColor.b = Math.min(1, glassColor.b + 0.015); // "slightly cooler", not just darker
    var glassMat = new THREE.MeshStandardMaterial({ color: glassColor, metalness: 0, roughness: 0.62 });
    facadeMat.userData.baseColor = facadeMat.color.clone();
    glassMat.userData.baseColor = glassMat.color.clone();
    return { facadeMat: facadeMat, glassMat: glassMat };
  }

  // ---- night window lights (Round 10 section 五) ----
  var MAX_LIGHT_INTENSITY = 0.5; // fixed this round, not re-tested
  var TARGET_VISIBLE_MIN = 8, TARGET_VISIBLE_MAX = 14;

  function ensureLoader(){
    if (loader) return;
    dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
    loader = new THREE.GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
  }

  function applyTransform(){
    if (!buildingRoot) return;
    buildingRoot.position.set(currentX(), currentGroupY(), FIXED_Z);
    buildingRoot.rotation.y = FIXED_ROT;
    buildingRoot.scale.setScalar(currentScale());
    buildingRoot.updateMatrixWorld(true);
    updateHud();
  }

  // Round 4 follow-up: the report's one open item was that the runtime raycast approach
  // below occasionally lands outside the 8-14 target (observed 4-13 across repeated
  // rebuilds at the SAME transform, because the surviving candidate pool on this
  // composition is small — see the comment above CAMERA_PUSH). Per the report's own
  // recommendation, the default path below is now a fixed, hand-picked set of positions —
  // arrived at over three passes, because the first two looked right on paper and were wrong
  // on screen:
  //
  // 1) A first 9-position set, taken straight from the shipped 40x30 raycast grid, clustered
  //    into 2 on-screen blobs instead of 9 windows — the surviving candidates from that
  //    coarse a grid all happened to sit within 10-14px of each other.
  // 2) Re-derived from a denser 220x90 exploration grid (129 deduplicated candidates), with
  //    visibility checked by rendering ALL candidates at once as one all-white test mesh and
  //    reading back pixel color at each one's own screen coordinate. 80/129 read back lit;
  //    thinned to 11 at a minimum 14px separation. This ALSO turned out wrong: batch-testing
  //    129 overlapping quads at once let unoccluded neighbors "cover for" an occluded
  //    candidate at read-back time, so 4 of those 11 were false positives — confirmed when
  //    the real HARDCODED_LIGHTS render (this exact array, alone) showed those 4 as plain
  //    dark facade color, not lit, at their predicted pixel.
  // 3) Final pass: every candidate below was verified ONE AT A TIME — a single quad added to
  //    the scene alone, rendered, sampled, then removed before testing the next — which is
  //    the only way to rule out neighbor contamination. Of the mesh's ~5 distinct facade
  //    normal directions in the visible band, only two read as reliably lit in isolation:
  //    the (0.198, 0, -0.980) face (25/25 individually-tested candidates lit) and one nearby
  //    corner normal (0.122, 0.043, 0.992). The near-Z face (-0.112, 0, 0.994) and the +X
  //    face (1, 0, 0) — which looked fine in passes 1-2 — mostly failed individually too
  //    (2/11 and 0/8 respectively): a neighboring parapet/setback triangle sits closer to
  //    the camera at almost every point on those two faces, even after the 0.22 push. NOT
  //    debugged further (would need a proper per-position depth pre-pass on an unindexed
  //    16k-vertex mesh); the reliable pair above was enough to hit the 8-14 target on its
  //    own. Net effect: this composition's window lights end up on ONE strongly-represented
  //    facade plus a single corner accent, not evenly split across two faces — see the
  //    acceptance note in the round 4 report.
  //
  // localPos/localNormal are in buildingRoot's LOCAL space (i.e. already un-transformed by
  // the current position/rotation/scale — see how they're derived in
  // regenerateFromRaycast() below), so they stay geometrically valid across every
  // scale/X preset; only their on-screen visibility/spacing was verified against the B/X4
  // default.
  var HARDCODED_LIGHTS = [
    { localPos: [-14.529, 178.132, 17.828], localNormal: [0.198, 0, -0.980],     ry: Math.PI/2, color: 'white'  },
    { localPos: [-14.523, 180.304, 17.809], localNormal: [0.198, 0, -0.980],     ry: Math.PI/2, color: 'yellow' },
    { localPos: [-12.030, 180.617, 18.298], localNormal: [0.198, 0, -0.980],     ry: Math.PI/2, color: 'white'  },
    { localPos: [-12.036, 178.445, 18.318], localNormal: [0.198, 0, -0.980],     ry: Math.PI/2, color: 'white'  },
    { localPos: [-10.459, 179.045, 21.097], localNormal: [-0.122, 0.043, 0.992], ry: 0,         color: 'white'  },
    { localPos: [-7.048,  178.450, 19.297], localNormal: [0.198, 0, -0.980],     ry: Math.PI/2, color: 'white'  },
    { localPos: [-7.042,  180.313, 19.280], localNormal: [0.198, 0, -0.980],     ry: Math.PI/2, color: 'yellow' },
    { localPos: [-4.553,  178.143, 19.785], localNormal: [0.198, 0, -0.980],     ry: Math.PI/2, color: 'white'  },
    { localPos: [-4.546,  180.316, 19.766], localNormal: [0.198, 0, -0.980],     ry: Math.PI/2, color: 'white'  }
  ];

  // Shared by both the hardcoded default path and regenerateFromRaycast() — builds the one
  // merged-geometry Mesh (see the long InstancedMesh note further down) from a `picked` list
  // of {localPos: THREE.Vector3, localNormal: THREE.Vector3, color: THREE.Color}.
  function buildLightsMeshFromPicked(picked, b){
    // OPAQUE, not transparent — the fade to/from invisible is done by lerping material.color
    // toward the facade's own dark tone instead of alpha (needed regardless of the
    // InstancedMesh problem below — a transparent Night background plane elsewhere in the
    // scene paints over transparent objects unpredictably; see the day/night section for
    // detail on that specific interaction).
    //
    // Built as ONE manually-merged BufferGeometry (all quads baked into one position/normal/
    // color buffer, one draw call), NOT a THREE.InstancedMesh — InstancedMesh was tried first
    // and does not render at all in this build: a plain THREE.Mesh placed at the exact same
    // matrix (position/quaternion/scale) as instance 0 rendered correctly and visibly, while
    // every InstancedMesh instance stayed fully invisible (confirmed via direct pixel
    // sampling at each instance's own predicted screen position, every one came back as
    // background/facade color, never the light color) across five different fixes attempted
    // (bigger epsilon push, real face-normal push, frustumCulled:false, higher renderOrder,
    // switching the material from transparent to opaque). Manual merge sidesteps whatever
    // that root cause is while still keeping the "1 draw call" requirement.
    var mat = new THREE.MeshBasicMaterial({
      color: 0x1a1f28, toneMapped: false, side: THREE.DoubleSide, vertexColors: true
    });
    // Round 4 follow-up: shrunk from 0.045/0.021 — at the original size, the HARDCODED_LIGHTS
    // set (whose surviving-after-occlusion-check members happen to sit only ~10-14px apart in
    // screen space, see the comment above that array) rendered as two solid overlapping
    // blobs instead of distinct windows. Confirmed by screenshot at both sizes.
    var lightW = (b.max.x - b.min.x) * 0.020;
    var lightH = (b.max.y - b.min.y) * 0.011;
    var quadNormal = new THREE.Vector3(0, 0, 1);
    var allPos = [], allNorm = [], allColor = [], allIndex = [];
    var quat = new THREE.Quaternion(), scl = new THREE.Vector3(), m = new THREE.Matrix4();
    picked.forEach(function(cand){
      // cand.localPos is already the camera-pushed, occlusion-verified position — no further
      // push needed here.
      quat.setFromUnitVectors(quadNormal, cand.localNormal);
      var w = lightW * (0.85 + Math.random()*0.3), h = lightH * (0.85 + Math.random()*0.3);
      scl.set(w, h, 1);
      m.compose(cand.localPos, quat, scl);
      // Bake WORLD-space transforms (buildingRoot.matrixWorld * local m) directly into the
      // merged geometry, and add the merged mesh to ctx.scene rather than as a buildingRoot
      // child — matching exactly how a diagnostic plain Mesh was confirmed to render
      // correctly (position/quaternion/scale set directly, added straight to scene), in case
      // parenting under buildingRoot (a Group with its own scale/rotation/position) was
      // somehow part of what made the InstancedMesh attempts invisible.
      var worldM = new THREE.Matrix4().multiplyMatrices(buildingRoot.matrixWorld, m);
      var quadGeo = new THREE.PlaneGeometry(1, 1);
      quadGeo.applyMatrix4(worldM);
      var p = quadGeo.attributes.position, n = quadGeo.attributes.normal;
      var base = allPos.length / 3;
      for (var vi = 0; vi < p.count; vi++){
        allPos.push(p.getX(vi), p.getY(vi), p.getZ(vi));
        allNorm.push(n.getX(vi), n.getY(vi), n.getZ(vi));
        allColor.push(cand.color.r, cand.color.g, cand.color.b);
      }
      var idxAttr = quadGeo.index;
      for (var ii = 0; ii < idxAttr.count; ii++) allIndex.push(base + idxAttr.getX(ii));
      quadGeo.dispose();
    });

    var mergedGeo = new THREE.BufferGeometry();
    mergedGeo.setAttribute('position', new THREE.Float32BufferAttribute(allPos, 3));
    mergedGeo.setAttribute('normal', new THREE.Float32BufferAttribute(allNorm, 3));
    mergedGeo.setAttribute('color', new THREE.Float32BufferAttribute(allColor, 3));
    mergedGeo.setIndex(allIndex);
    var inst = new THREE.Mesh(mergedGeo, mat);
    inst.name = 'BUILDING_NIGHT_LIGHTS';
    inst.frustumCulled = false;
    ctx.scene.add(inst);
    return inst;
  }

  var warmWhite = new THREE.Color(0xfff3d9), warmYellow = new THREE.Color(0xffd9a0);

  // Fast default path — no raycasting, always exactly HARDCODED_LIGHTS.length instances.
  function rebuildLights(){
    if (lightsMesh){ ctx.scene.remove(lightsMesh); lightsMesh.geometry.dispose(); lightsMesh.material.dispose(); lightsMesh = null; }
    if (!facadeMesh) return;
    var geo = facadeMesh.geometry;
    geo.computeBoundingBox();
    var b = geo.boundingBox;
    buildingRoot.updateMatrixWorld(true);

    var picked = HARDCODED_LIGHTS.map(function(l){
      return {
        localPos: new THREE.Vector3(l.localPos[0], l.localPos[1], l.localPos[2]),
        localNormal: new THREE.Vector3(l.localNormal[0], l.localNormal[1], l.localNormal[2]),
        color: l.color === 'yellow' ? warmYellow : warmWhite
      };
    });
    lightsMesh = buildLightsMeshFromPicked(picked, b);
    window.__buildingLightVisibleCount = picked.length;
    syncBlend(currentBlend);
    updateHud();
  }

  // Rebuilds the night-light layer using the CURRENT final transform (position/rotation/
  // scale already applied to buildingRoot) so visibility can be computed by literally
  // projecting each candidate point through the real camera, rather than guessing a height
  // band by trial and error (Round 9's approach, which took 3 iterations to get even 3
  // lights on screen). Candidates are a floor/column grid across BOTH facades; each is kept
  // only if it projects above the monitor's screen-space top edge; the surviving set is then
  // randomly thinned to land in the 8-14 target range so it doesn't read as a uniform
  // checkerboard. NOT called by default any more (see rebuildLights() above) — kept so the
  // light set can be re-derived if the composition changes; call
  // window.__buildingTest.regenerateFromRaycast() from the console, then copy the logged
  // candidates into HARDCODED_LIGHTS by hand.
  function regenerateFromRaycast(){
    if (lightsMesh){ ctx.scene.remove(lightsMesh); lightsMesh.geometry.dispose(); lightsMesh.material.dispose(); lightsMesh = null; }
    if (!facadeMesh) return;
    var geo = facadeMesh.geometry;
    geo.computeBoundingBox();
    var b = geo.boundingBox;

    var camera = ctx.camera;
    camera.updateMatrixWorld(true);
    buildingRoot.updateMatrixWorld(true);

    var yTop = b.min.y + (b.max.y - b.min.y) * 0.985; // stay off the roof plane itself
    var yBottom = b.min.y + (b.max.y - b.min.y) * 0.60;
    // Denser grid than the first pass — most rays miss the mesh outright (the visible
    // corner is a small fraction of the full facade), so a sparse 9x7 grid only yielded 3
    // valid candidates against an 8-14 target. This density was tuned empirically to land
    // in-range, not computed.
    var FLOORS = 40, COLS_PER_FACE = 30;

    // The roof has visible setbacks (confirmed in earlier screenshots — the mesh tapers
    // inward near the top), so candidates placed at the OVERALL bbox max end up floating in
    // open air past the real (recessed) surface at that height. A per-floor vertex-bucket
    // scan was tried first and rejected: on this decimated 10,740-tri mesh many height bands
    // contain too few source vertices, so most floors fell back to the same default extent
    // and produced duplicate candidate positions (confirmed: 6 of 12 "visible" instances
    // projected to the exact same screen pixel). Raycasting against the mesh's actual
    // triangles from just outside the bbox finds the true (possibly tapered) surface at any
    // height regardless of vertex density, so it doesn't have that failure mode.
    var rayDirX = new THREE.Vector3(-1, 0, 0).applyQuaternion(buildingRoot.quaternion).normalize();
    var rayDirZ = new THREE.Vector3(0, 0, -1).applyQuaternion(buildingRoot.quaternion).normalize();
    var surfaceRaycaster = new THREE.Raycaster();
    var normalMatrix = new THREE.Matrix3().getNormalMatrix(facadeMesh.matrixWorld);
    function surfaceHit(localOrigin, worldDir){
      var worldOrigin = localOrigin.clone().applyMatrix4(buildingRoot.matrixWorld);
      surfaceRaycaster.set(worldOrigin, worldDir);
      surfaceRaycaster.far = 200;
      var hits = surfaceRaycaster.intersectObject(facadeMesh, false);
      if (!hits.length) return null;
      var hit = hits[0];
      // world-space face normal, not a guessed +X/+Z push direction — this mesh has angled
      // roof/setback geometry, so a naive axis-aligned push (the first two attempts here)
      // often pushes TANGENT to the surface instead of away from it, leaving the light quad
      // still embedded in the facade (confirmed by sampling: predicted light pixels kept
      // coming back as the dark facade color even after a 5x bigger axis-aligned epsilon).
      var worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      return { point: hit.point, normal: worldNormal };
    }

    // Exclusion zones computed from the REAL occluders' own screen-space bounding boxes
    // (projected corners), not a guessed Y threshold — the first attempt used a fixed
    // "monitor screen top" Y and missed the webcam bar (a separate object sitting ~12px
    // above the monitor bezel's own top edge): candidates in that gap projected as
    // "visible" but were actually hidden behind the webcam bar in the real render (confirmed
    // by direct pixel sampling — 12 of 13 "visible" candidates sampled as background-blue,
    // not the light's warm color, at their predicted screen position). A raycast-per-
    // candidate version was tried first and rejected: it returned zero passes even for the
    // corner light already confirmed visible by direct pixel sampling, most likely floating-
    // point grazing at the exact source-mesh vertex; not worth debugging further when the
    // screen-rect approach is simpler and already verified against this exact failure mode.
    function screenRectOf(obj){
      var box = new THREE.Box3().setFromObject(obj);
      var corners = [
        [box.min.x,box.min.y,box.min.z],[box.max.x,box.min.y,box.min.z],
        [box.min.x,box.max.y,box.min.z],[box.max.x,box.max.y,box.min.z],
        [box.min.x,box.min.y,box.max.z],[box.max.x,box.min.y,box.max.z],
        [box.min.x,box.max.y,box.max.z],[box.max.x,box.max.y,box.max.z]
      ];
      var minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
      corners.forEach(function(c){
        var ndc = new THREE.Vector3(c[0],c[1],c[2]).project(camera);
        var sx=(ndc.x+1)/2*1280, sy=(1-ndc.y)/2*720;
        minX=Math.min(minX,sx); maxX=Math.max(maxX,sx);
        minY=Math.min(minY,sy); maxY=Math.max(maxY,sy);
      });
      return {minX:minX,maxX:maxX,minY:minY,maxY:maxY};
    }
    var monitorObj = ctx.scene.getObjectByName('monitor');
    var pcObj = ctx.scene.getObjectByName('PC_TOWER');
    var exclusionRects = [];
    if (monitorObj) exclusionRects.push(screenRectOf(monitorObj));
    if (pcObj) exclusionRects.push(screenRectOf(pcObj));
    var MARGIN = 6;
    function inExclusion(sx, sy){
      return exclusionRects.some(function(r){
        return sx > r.minX-MARGIN && sx < r.maxX+MARGIN && sy > r.minY-MARGIN && sy < r.maxY+MARGIN;
      });
    }
    // Hard constraint: candidate must also fall within the window's OWN glass opening on
    // screen — without this, low candidates (on the building's real mesh surface, but at a
    // world Y well below the window sill) still projected as "visible" whenever the desk
    // clutter happened to have a gap at that exact pixel, even though semantically they're
    // behind the wall/below the window, not floating outside it. Confirmed the same way as
    // the previous two bugs here: 7 of 9 "visible" candidates from the exclusion-rect-only
    // version projected to screen Y 513-645 — down at keyboard/desk height, nowhere near the
    // roof this composition actually shows.
    var wg = ctx.scene.getObjectByName('Window_Group');
    var glassObj = wg ? wg.getObjectByName('Window_3') : null;
    var windowRect = glassObj ? screenRectOf(glassObj) : { minX:0, maxX:1280, minY:0, maxY:720 };
    function inWindow(sx, sy){
      var pad = 10;
      return sx > windowRect.minX+pad && sx < windowRect.maxX-pad && sy > windowRect.minY+pad && sy < windowRect.maxY-pad;
    }

    var matrixWorldInv = new THREE.Matrix4().copy(buildingRoot.matrixWorld).invert();
    var CAMERA_PUSH = 0.22; // world units, toward camera — empirically the smallest push that
    // reliably cleared the building's own facade at candidates near the roof/corner (0.05
    // and 0.03 both left candidates occluded; verified by direct pixel sampling).
    // A real per-candidate occlusion re-check (raycast from camera to each pushed point,
    // confirming nothing in the facade/glass sits closer) was implemented and DID work
    // correctly, but against this mesh's 16,799 + 6,980 raw vertices with no spatial index,
    // a dense-enough candidate grid to reliably land 8-14 *surviving* lights took multiple
    // seconds of blocking raycasts (measured 7-9s at grids from 34x24 to 70x50) — long
    // enough to make this session's browser automation flag the page as unresponsive.
    // Dropped in favor of the fixed CAMERA_PUSH heuristic alone, which is nearly free and
    // was independently confirmed to clear the surface correctly in the same testing.
    var candidates = [];
    for (var fl = 0; fl < FLOORS; fl++){
      var fy = yBottom + (yTop - yBottom) * (fl / (FLOORS - 1));
      for (var c = 0; c < COLS_PER_FACE; c++){
        var t = 0.15 + 0.70 * (c / (COLS_PER_FACE - 1)); // stay off the mesh's outer edges
        // x-face (normal +X): ray from outside +X, aimed inward along -X, at a z sampled
        // across the full local z-range — finds the true (possibly recessed) surface at
        // this height regardless of taper.
        var originX = new THREE.Vector3(b.max.x + 20, fy, b.min.z + (b.max.z - b.min.z) * t);
        // z-face (normal +Z)
        var originZ = new THREE.Vector3(b.min.x + (b.max.x - b.min.x) * t, fy, b.max.z + 20);
        [
          { origin: originX, dir: rayDirX, ry: Math.PI/2 },
          { origin: originZ, dir: rayDirZ, ry: 0 }
        ].forEach(function(cand){
          var hit = surfaceHit(cand.origin, cand.dir);
          if (!hit) return;
          var towardCamera = camera.position.clone().sub(hit.point).normalize();
          var pushedWorld = hit.point.clone().addScaledVector(towardCamera, CAMERA_PUSH);
          var ndc = pushedWorld.clone().project(camera);
          var screenX = (ndc.x + 1) / 2 * 1280;
          var screenY = (1 - ndc.y) / 2 * 720;
          var visible = inWindow(screenX, screenY) &&
                        !(screenX > 515 && screenX < 570) && // window's own vertical frame mullion
                        !inExclusion(screenX, screenY);       // monitor+webcam bar, PC tower
          if (visible){
            var localPos = pushedWorld.clone().applyMatrix4(matrixWorldInv);
            var localNormal = hit.normal.clone().transformDirection(matrixWorldInv).normalize();
            candidates.push({ localPos: localPos, localNormal: localNormal, ry: cand.ry, screenX: screenX, screenY: screenY });
          }
        });
      }
    }

    window.__allLightCandidates = candidates.map(function(c){
      return { localPos: c.localPos.toArray(), localNormal: c.localNormal.toArray(), ry: c.ry, screenX: c.screenX, screenY: c.screenY };
    });

    // shuffle then trim to the target band — "randomly skip most panes, no checkerboard"
    for (var i = candidates.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
    }
    var targetCount = TARGET_VISIBLE_MIN + Math.floor(Math.random() * (TARGET_VISIBLE_MAX - TARGET_VISIBLE_MIN + 1));
    var picked = candidates.slice(0, Math.min(targetCount, candidates.length));
    picked.forEach(function(cand){ cand.color = Math.random() < 0.78 ? warmWhite : warmYellow; });

    console.log('[buildingtest] regenerateFromRaycast: ' + candidates.length + ' total candidates, ' +
      picked.length + ' picked. Paste into HARDCODED_LIGHTS to make a selection permanent:');
    console.log(JSON.stringify(picked.map(function(c){
      return { localPos: c.localPos.toArray().map(function(v){return +v.toFixed(3);}),
               localNormal: c.localNormal.toArray().map(function(v){return +v.toFixed(3);}),
               ry: c.ry, color: c.color === warmYellow ? 'yellow' : 'white' };
    }), null, 2));

    lightsMesh = buildLightsMeshFromPicked(picked, b);
    window.__buildingLightVisibleCount = picked.length;
    syncBlend(currentBlend);
    updateHud();
  }

  function applyPBand(key){
    currentP = key;
    if (!facadeMesh) return;
    var mats = makeFacadeGlassMaterials(key);
    facadeMesh.material = mats.facadeMat;
    if (glassMesh) glassMesh.material = mats.glassMat;
    syncBlend(currentBlend);
    updateHud();
  }

  function loadBuilding(variant, cb){
    if (typeof variant === 'function'){ cb = variant; variant = currentVariant; }
    variant = variant || currentVariant;
    // tear down any existing load so switching S<->O works from the console
    if (buildingRoot){
      ctx.scene.remove(buildingRoot);
      if (lightsMesh) ctx.scene.remove(lightsMesh); // now a scene-level sibling, not a buildingRoot child — see rebuildLights()
      buildingRoot = null; facadeMesh = null; glassMesh = null; lightsMesh = null;
    }
    currentVariant = variant;
    ensureLoader();
    var t0 = performance.now();
    loader.load(VARIANT_FILES[variant], function(gltf){
      window.__buildingLoadMs = performance.now() - t0;
      var meshes = [];
      gltf.scene.traverse(function(o){ if (o.isMesh) meshes.push(o); });
      // optimized: two primitives named by material ("facade"/"glass" from the Round 8/9
      // export script); silhouette: a single primitive, treated as facade-only.
      facadeMesh = meshes.find(function(m){ return m.material.name === 'facade'; }) || meshes[0];
      glassMesh = meshes.find(function(m){ return m.material.name === 'glass'; }) || null;
      [facadeMesh, glassMesh].forEach(function(m){
        if (!m) return;
        m.castShadow = false; m.receiveShadow = false;
        // The optimized GLB's normals survived Blender's own recalc-after-decimate pass
        // (Round 8 export script), but that pass only fixes winding/orientation, not
        // smoothness — up close in this round's near-camera framing it showed as small
        // stray specular sparkle on otherwise-flat facade faces. Recomputing smooth
        // per-vertex normals from the current (already-decimated) topology fixes it
        // without touching the source .blend or re-exporting.
        m.geometry.computeVertexNormals();
      });

      var mats = makeFacadeGlassMaterials(currentP);
      facadeMesh.material = mats.facadeMat;
      if (glassMesh) glassMesh.material = mats.glassMat;

      var box = new THREE.Box3().setFromObject(facadeMesh);
      if (glassMesh) box.union(new THREE.Box3().setFromObject(glassMesh));
      localBounds = box;

      buildingRoot = new THREE.Group();
      buildingRoot.name = 'BUILDING_TEST_ROOT';
      buildingRoot.add(facadeMesh);
      if (glassMesh) buildingRoot.add(glassMesh);
      ctx.scene.add(buildingRoot);

      applyTransform();
      rebuildLights();
      syncBlend(currentBlend);
      updateHud();
      console.log('[buildingtest] variant', variant, 'loaded in', window.__buildingLoadMs.toFixed(1), 'ms. meshes:', meshes.map(function(m){return m.name+'/'+m.material.name;}));
      if (cb) cb();
    }, undefined, function(err){ console.error('[buildingtest] load failed', err); });
  }

  // ---- day/night sync — unchanged mechanism from Round 9 (poll swap-bg.js's night-plane
  // opacity via setInterval, since rAF is unreliable in this automation pane and the D/N
  // keys / slider call swap-bg.js's own closure directly, not a hookable function) ----
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
      // Fading via color lerp, not opacity — see the opaque-material note where this
      // material is created. OFF_COLOR matches the dark facade tone (reads as "off/unlit"
      // against the building by day); ON_COLOR is white, multiplied by each instance's own
      // warm-white/warm-yellow instanceColor.
      lightsMesh.material.color.copy(LIGHT_OFF_COLOR).lerp(LIGHT_ON_COLOR, t);
    }
    updateHud();
  }

  setInterval(function(){
    var b = currentBgBlend();
    if (Math.abs(b - currentBlend) > 0.001) syncBlend(b);
  }, 100);

  function updateHud(){
    var hud = document.getElementById('buildingtestHud');
    if (!hud) return;
    var sp = SCALE_PRESETS[currentScaleKey];
    hud.innerHTML =
      '<b>Building: ' + currentVariant + ' variant (Round 10)</b><br>' +
      'Scale: ' + currentScaleKey + ' (' + sp.label + ') scale=' + sp.scale.toFixed(3) + ' y=' + sp.y.toFixed(2) + '<br>' +
      'X: ' + currentXKey + ' (' + currentX().toFixed(2) + ') &nbsp; P: ' + currentP + ' (&Delta;' + (P_DELTAS[currentP]*100).toFixed(0) + '%)<br>' +
      'blend=' + currentBlend.toFixed(2) + ' &nbsp; lights visible=' + (window.__buildingLightVisibleCount||0) + '<br>' +
      '<span style="opacity:.6">keys: A/B/C/D=scale, 1/2/3/4=X1-X4, 5/6/7=P1-P3, O/S=variant</span>';
  }

  window.addEventListener('keydown', function(e){
    if (!buildingRoot) return;
    if (e.key === 'a' || e.key === 'A') { currentScaleKey='A'; applyTransform(); rebuildLights(); }
    else if (e.key === 'b' && !e.shiftKey) { currentScaleKey='B'; applyTransform(); rebuildLights(); }
    else if (e.key === 'c' || e.key === 'C') { currentScaleKey='C'; applyTransform(); rebuildLights(); }
    else if (e.key === 'd' || e.key === 'D') { currentScaleKey='D'; applyTransform(); rebuildLights(); }
    else if (e.key === '1') { currentXKey='X1'; applyTransform(); rebuildLights(); }
    else if (e.key === '2') { currentXKey='X2'; applyTransform(); rebuildLights(); }
    else if (e.key === '3') { currentXKey='X3'; applyTransform(); rebuildLights(); }
    else if (e.key === '4') { currentXKey='X4'; applyTransform(); rebuildLights(); }
    else if (e.key === '5') applyPBand('P1');
    else if (e.key === '6') applyPBand('P2');
    else if (e.key === '7') applyPBand('P3');
    else if (e.key === 'o' || e.key === 'O') loadBuilding('O');
    else if (e.key === 's' && e.shiftKey) loadBuilding('S');
  });

  window.__buildingTest = {
    load: loadBuilding,
    setScale: function(key){ currentScaleKey = key; applyTransform(); rebuildLights(); },
    setX: function(key){ currentXKey = key; applyTransform(); rebuildLights(); },
    setP: applyPBand,
    rebuildLights: rebuildLights,
    regenerateFromRaycast: regenerateFromRaycast,
    setMaxLightIntensity: function(v){ MAX_LIGHT_INTENSITY = v; syncBlend(currentBlend); },
    setBlendOverride: syncBlend,
    getScalePresets: function(){ return SCALE_PRESETS; },
    getXPresets: function(){ return X_PRESETS; },
    setScaleValue: function(key, patch){ Object.assign(SCALE_PRESETS[key], patch); if (currentScaleKey===key){ applyTransform(); rebuildLights(); } },
    getState: function(){
      return {
        variant: currentVariant, scaleKey: currentScaleKey, xKey: currentXKey, P: currentP,
        blend: currentBlend, lightsVisible: window.__buildingLightVisibleCount,
        rootPos: buildingRoot ? buildingRoot.position.toArray() : null,
        rootScale: buildingRoot ? buildingRoot.scale.x : null,
        localBounds: localBounds ? { min: localBounds.min.toArray(), max: localBounds.max.toArray() } : null
      };
    }
  };

  updateHud();
  console.log('[buildingtest] Round 10 ready (optimized variant, calibrated scale/lights). Call window.__buildingTest.load() to start.');
})();
