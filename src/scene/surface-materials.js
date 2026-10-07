(function(){
  // Surface detail for the two purchased models that arrive as flat colors: the desk
  // (every mesh on the gray Material.018 — "Table" plus the drawer riser "Cube001" — no UVs) and the PC tower (every case material is a
  // flat color with metalness 0.4 from the FBX->glTF conversion, no UVs). Both are
  // procedural canvas textures (seamless by construction, no extra downloads) applied
  // through generated box-projected UVs. assets/desk/textures/desk_wood_* is floorboard
  // planks with visible seams, which reads as a floor rather than a desk top, so it isn't
  // reused here.
  var ctx = window.__ctx;

  var POLL_MS = 200, POLL_TIMEOUT_MS = 30000;

  // ---------------------------------------------------------------- periodic noise
  // Value noise on an integer lattice that wraps at `period`, so a texture sampled over
  // one full period tiles with no seam.
  function makeNoise(seed){
    var SIZE = 256, perm = new Uint8Array(SIZE * 2), vals = new Float32Array(SIZE);
    var s = seed >>> 0;
    function rnd(){ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }
    for (var i = 0; i < SIZE; i++){ perm[i] = i; vals[i] = rnd(); }
    for (var j = SIZE - 1; j > 0; j--){ var k = Math.floor(rnd() * (j + 1)), t = perm[j]; perm[j] = perm[k]; perm[k] = t; }
    for (var m = 0; m < SIZE; m++) perm[m + SIZE] = perm[m];
    function lat(x, y, px, py){ x = ((x % px) + px) % px; y = ((y % py) + py) % py; return vals[perm[(x & 255) + perm[y & 255]]]; }
    function fade(t){ return t * t * (3 - 2 * t); }
    return function(x, y, px, py){
      var xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
      var a = lat(xi, yi, px, py), b = lat(xi + 1, yi, px, py), c = lat(xi, yi + 1, px, py), d = lat(xi + 1, yi + 1, px, py);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
  }

  // Height field -> tangent-space normal map (wrapping central differences).
  function heightToNormal(h, size, strength){
    var cv = document.createElement('canvas'); cv.width = cv.height = size;
    var c2 = cv.getContext('2d'), img = c2.createImageData(size, size), d = img.data;
    for (var y = 0; y < size; y++){
      for (var x = 0; x < size; x++){
        var l = h[y * size + (x - 1 + size) % size], r = h[y * size + (x + 1) % size];
        var u = h[((y - 1 + size) % size) * size + x], dn = h[((y + 1) % size) * size + x];
        var nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1;
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz), o = (y * size + x) * 4;
        d[o] = (nx / len * 0.5 + 0.5) * 255; d[o + 1] = (ny / len * 0.5 + 0.5) * 255; d[o + 2] = (nz / len * 0.5 + 0.5) * 255; d[o + 3] = 255;
      }
    }
    c2.putImageData(img, 0, 0);
    return cv;
  }

  function canvasTexture(cv, isColor){
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (isColor) t.encoding = THREE.sRGBEncoding;
    if (ctx.renderer) t.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  // ---------------------------------------------------------------- oak veneer
  // Grain runs along canvas X (texture U). Long, gently warped growth lines plus
  // stretched pore streaks; one continuous veneer, no plank seams.
  function buildWood(){
    var S = 1024, noise = makeNoise(7), pores = makeNoise(31);
    var height = new Float32Array(S * S);
    var col = document.createElement('canvas'); col.width = col.height = S;
    var rgh = document.createElement('canvas'); rgh.width = rgh.height = S;
    var cc = col.getContext('2d'), rc = rgh.getContext('2d');
    var ci = cc.createImageData(S, S), ri = rc.createImageData(S, S);
    var light = [178, 132, 88], dark = [118, 78, 46];
    for (var y = 0; y < S; y++){
      for (var x = 0; x < S; x++){
        var u = x / S, v = y / S;
        // slow warp so the growth lines wander instead of being ruler-straight
        var warp = noise(u * 2, v * 3, 2, 3) * 1.4 + noise(u * 6, v * 8, 6, 8) * 0.35;
        var g = v * 44 + warp * 3.0;
        // asymmetric ring profile: thin dark latewood line, wide pale earlywood
        var ring = 0.5 + 0.5 * Math.sin(g * Math.PI * 2);
        ring = Math.pow(ring, 4.0);
        // fine secondary figure between the growth lines
        var fine = noise(u * 4, v * 160, 4, 160);
        // pores: long in U, very short in V
        var p = pores(u * 6, v * 260, 6, 260);
        var pore = p > 0.74 ? (p - 0.74) / 0.26 : 0;
        // broad tonal drift so no two areas of the top read identically
        var tone = noise(u * 2, v * 2, 2, 2) * 0.3 + noise(u * 1, v * 5, 1, 5) * 0.15;
        var f = Math.min(1, ring * 0.38 + fine * 0.12 + tone + pore * 0.35);
        var o = (y * S + x) * 4;
        ci.data[o]     = light[0] + (dark[0] - light[0]) * f;
        ci.data[o + 1] = light[1] + (dark[1] - light[1]) * f;
        ci.data[o + 2] = light[2] + (dark[2] - light[2]) * f;
        ci.data[o + 3] = 255;
        // satin lacquer: smooth overall, pores and dark latewood a bit rougher
        var r = 0.42 + ring * 0.08 + pore * 0.22;
        ri.data[o] = ri.data[o + 1] = ri.data[o + 2] = r * 255; ri.data[o + 3] = 255;
        height[y * S + x] = -pore * 1.0 - ring * 0.15;
      }
    }
    cc.putImageData(ci, 0, 0); rc.putImageData(ri, 0, 0);
    return { map: canvasTexture(col, true), roughnessMap: canvasTexture(rgh, false), normalMap: canvasTexture(heightToNormal(height, S, 1.6), false) };
  }

  // ---------------------------------------------------------------- powder coat
  // Fine orange-peel texture typical of a painted steel case panel.
  function buildPowderCoat(){
    var S = 512, n1 = makeNoise(101), n2 = makeNoise(202);
    var height = new Float32Array(S * S);
    var rgh = document.createElement('canvas'); rgh.width = rgh.height = S;
    var rc = rgh.getContext('2d'), ri = rc.createImageData(S, S);
    for (var y = 0; y < S; y++){
      for (var x = 0; x < S; x++){
        var u = x / S, v = y / S;
        var h = n1(u * 64, v * 64, 64, 64) * 0.7 + n2(u * 160, v * 160, 160, 160) * 0.3;
        height[y * S + x] = h;
        var r = 0.5 + (n1(u * 8, v * 8, 8, 8) - 0.5) * 0.12 + (h - 0.5) * 0.1;
        var o = (y * S + x) * 4;
        ri.data[o] = ri.data[o + 1] = ri.data[o + 2] = r * 255; ri.data[o + 3] = 255;
      }
    }
    rc.putImageData(ri, 0, 0);
    return { roughnessMap: canvasTexture(rgh, false), normalMap: canvasTexture(heightToNormal(height, S, 2.2), false) };
  }

  // ---------------------------------------------------------------- box UVs
  // Projects world-space position onto the plane of each vertex normal's dominant axis.
  // The models are static once placed, so world space keeps texel density uniform
  // across meshes regardless of their individual node scales.
  function boxProjectUVs(mesh, unitsPerTile){
    var geo = mesh.geometry;
    if (geo.attributes.uv) return;
    mesh.updateMatrixWorld(true);
    var pos = geo.attributes.position, nrm = geo.attributes.normal;
    var mw = mesh.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(mw);
    var p = new THREE.Vector3(), n = new THREE.Vector3();
    var uv = new Float32Array(pos.count * 2);
    for (var i = 0; i < pos.count; i++){
      p.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mw);
      n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).applyMatrix3(nm);
      var ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z), a, b;
      if (ay >= ax && ay >= az){ a = p.x; b = p.z; }      // top/bottom: grain along X
      else if (az >= ax){ a = p.x; b = p.y; }             // front/back faces
      else { a = p.z; b = p.y; }                          // left/right faces
      uv[i * 2] = a / unitsPerTile; uv[i * 2 + 1] = b / unitsPerTile;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  // ---------------------------------------------------------------- reflections
  // A neutral studio environment so metal and glass have something to reflect. Applied
  // per-material (not scene.environment) so the room shell, backdrop and night mood keep
  // their existing lighting.
  function buildEnvMap(){
    if (!THREE.RoomEnvironment || !ctx.renderer) return null;
    var pmrem = new THREE.PMREMGenerator(ctx.renderer);
    var rt = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04);
    pmrem.dispose();
    return rt.texture;
  }

  // ---------------------------------------------------------------- apply
  function forEachMat(mesh, fn){
    var mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(fn);
  }

  var DESK_MATERIAL = 'Material.018';

  function deskMeshes(scene){
    var found = [];
    scene.traverse(function(o){
      if (o.isMesh && !Array.isArray(o.material) && o.material.name === DESK_MATERIAL) found.push(o);
    });
    return found;
  }

  function upgradeDesk(meshes, envMap){
    var wood = buildWood();
    var m = meshes[0].material.clone();
    meshes.forEach(function(o){
      boxProjectUVs(o, 1.3);
      o.material = m;
    });
    m.color.setHex(0xffffff);
    m.map = wood.map; m.roughnessMap = wood.roughnessMap; m.normalMap = wood.normalMap;
    m.normalScale = new THREE.Vector2(0.6, 0.6);
    m.roughness = 1; m.metalness = 0;
    if (envMap){ m.envMap = envMap; m.envMapIntensity = 0.35; }
    m.needsUpdate = true;
  }

  function upgradePc(pc, envMap){
    var coat = buildPowderCoat();
    pc.traverse(function(o){
      if (!o.isMesh || !o.material) return;
      forEachMat(o, function(m){
        var name = m.name || '';
        if (/^(black|BLACK matt)$/i.test(name)){
          // painted steel shell: dielectric paint over metal, fine orange-peel grain
          boxProjectUVs(o, 0.12);
          m.color.setHex(0x101012);
          m.metalness = 0.15; m.roughness = 1;
          m.roughnessMap = coat.roughnessMap; m.normalMap = coat.normalMap;
          m.normalScale = new THREE.Vector2(0.35, 0.35);
        } else if (/^(BLACK AIO|BLACK PLASTIC\.001|Black Plastic\.001|BLACK thread)$/i.test(name)){
          m.metalness = 0; m.roughness = Math.max(m.roughness, 0.45);
        } else if (/^Metal$/i.test(name)){
          m.metalness = 0.95; m.roughness = 0.32;
        } else if (/^(glass|glass\.003)$/i.test(name)){
          // smoked tempered glass. r128 scales reflections by opacity under normal
          // blending, so the panel needs some opacity (and a strong envMap) for the sheen
          // to read at all — at the GLB's own 0.05-0.13 it was effectively invisible.
          m.color.setHex(0x2a3036);
          m.metalness = 0; m.roughness = 0.03;
          m.transparent = true; m.opacity = 0.2; m.depthWrite = false;
        } else if (/^Board Material$/i.test(name)){
          m.metalness = 0.1; m.roughness = 0.55;
        }
        if (envMap && !m.envMap){
          m.envMap = envMap;
          m.envMapIntensity = /glass/i.test(name) ? 4 : 0.45;
        }
        m.needsUpdate = true;
      });
    });
  }

  var started = Date.now();
  var pollId = setInterval(function(){
    if (Date.now() - started > POLL_TIMEOUT_MS){
      clearInterval(pollId);
      console.warn('[surface-materials] desk (Table)/PC_TOWER never appeared — surfaces left as loaded.');
      return;
    }
    var scene = ctx.scene;
    var table = scene && scene.getObjectByName('Table');
    var pc = scene && scene.getObjectByName('PC_TOWER');
    // PC_TOWER is added as an empty group first; wait for the GLB root inside it
    if (!table || !pc || !pc.children.length) return;
    clearInterval(pollId);
    var envMap = buildEnvMap();
    upgradeDesk(deskMeshes(scene), envMap);
    upgradePc(pc, envMap);
    ctx.surfaceEnvMap = envMap;
  }, POLL_MS);
})();
