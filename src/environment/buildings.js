(function(){
  // Production near-camera buildings (Skyscraper07 + Residential_04) seen through the desk
  // window. Transform/material/light values below are copied verbatim from the frozen test
  // scripts (tools/_bgtest/building-test.js round 4-5, tools/_bgtest/residential04-test.js
  // round 6/7) — not re-tuned here. Both buildings' window lights are a fixed, hand-picked
  // local-coordinate list; there is no runtime raycast / occlusion search / random light
  // placement in this file (that machinery lives only in the test scripts, and even there
  // it's no longer the default path — see building-test.js's own comments on why the
  // raycast approach was replaced with a verified hardcoded list).
  var ctx = window.__ctx;

  var GLB_DIR = 'assets/environment/buildings/';

  // Shared day/night mechanism, identical across both buildings and matching the
  // background's own tone shift (tools/_bgtest/swap-bg.js) so everything reads as the same
  // time of day.
  var NIGHT_MUL = new THREE.Color(0.5, 0.56, 0.72);
  var LIGHT_ON_COLOR = new THREE.Color(0xffffff);
  var WARM_WHITE = new THREE.Color(0xfff3d9), WARM_YELLOW = new THREE.Color(0xffd9a0);
  var LIGHT_FADE_E0 = 0.55, LIGHT_FADE_E1 = 1.0; // smoothstep(0.55, 1.0, blend), lights stay off until blend is mostly-night

  var dracoLoader = new THREE.DRACOLoader();
  dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
  var gltfLoader = new THREE.GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  // Builds the one merged-geometry window-light Mesh for a building — one draw call, no
  // THREE.InstancedMesh (confirmed not to render at all in this three r128 build across
  // five different fixes — see building-test.js for the full debugging note), no
  // THREE.PointLight, no shadows. `hardcodedLights` is a fixed array of
  // {localPos:[x,y,z], localNormal:[x,y,z], color:'white'|'yellow'} in the building root's
  // own un-transformed local space, so it follows the root's transform automatically.
  function buildLightsMesh(root, facadeMesh, hardcodedLights, sizeXFactor, sizeYFactor, sizeJitter, lightOffColor, name){
    var geo = facadeMesh.geometry;
    geo.computeBoundingBox();
    var b = geo.boundingBox;
    root.updateMatrixWorld(true);

    var mat = new THREE.MeshBasicMaterial({
      color: lightOffColor.getHex(), toneMapped: false, side: THREE.DoubleSide, vertexColors: true
    });
    var lightW = (b.max.x - b.min.x) * sizeXFactor;
    var lightH = (b.max.y - b.min.y) * sizeYFactor;
    var quadNormal = new THREE.Vector3(0, 0, 1);
    var allPos = [], allNorm = [], allColor = [], allIndex = [];
    var quat = new THREE.Quaternion(), scl = new THREE.Vector3(), m = new THREE.Matrix4();
    hardcodedLights.forEach(function(l){
      var lp = new THREE.Vector3(l.localPos[0], l.localPos[1], l.localPos[2]);
      var ln = new THREE.Vector3(l.localNormal[0], l.localNormal[1], l.localNormal[2]);
      var color = l.color === 'yellow' ? WARM_YELLOW : WARM_WHITE;
      quat.setFromUnitVectors(quadNormal, ln);
      var w = sizeJitter ? lightW * (0.85 + Math.random() * 0.3) : lightW;
      var h = sizeJitter ? lightH * (0.85 + Math.random() * 0.3) : lightH;
      scl.set(w, h, 1);
      m.compose(lp, quat, scl);
      // World-space transform baked directly into the merged geometry (buildingRoot's
      // matrixWorld * this quad's local matrix), mesh added as a scene-level sibling of
      // the building root rather than a child — matches exactly how this was confirmed to
      // render correctly in the test scripts.
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
    var mesh = new THREE.Mesh(mg, mat);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    ctx.scene.add(mesh);
    return mesh;
  }

  function applyBuildingBlend(facadeMesh, glassMesh, lightsMesh, lightOffColor, maxLightIntensity, blend){
    if (!facadeMesh) return;
    var mul = new THREE.Color(1, 1, 1).lerp(NIGHT_MUL, blend);
    facadeMesh.material.color.copy(facadeMesh.material.userData.baseColor).multiply(mul);
    if (glassMesh) glassMesh.material.color.copy(glassMesh.material.userData.baseColor).multiply(mul);
    if (lightsMesh){
      var x = Math.min(1, Math.max(0, (blend - LIGHT_FADE_E0) / (LIGHT_FADE_E1 - LIGHT_FADE_E0)));
      var t = x * x * (3 - 2 * x) * maxLightIntensity; // smoothstep(0.55,1.0,blend) * max
      lightsMesh.material.color.copy(lightOffColor).lerp(LIGHT_ON_COLOR, t);
    }
  }

  // ---------------- Skyscraper07 ----------------
  // Transform: tools/_bgtest/building-test.js SCALE_PRESETS.B + X_PRESETS.X4 (frozen round
  // 5). Material: P2 (facade/glass brightness delta 10%). 9 fixed lights (round 4 fix —
  // individually pixel-verified, not raycast-picked at runtime).
  var sky07 = (function(){
    var TRANSFORM = { x: 0.58, y: -4.37, z: -1.2, rotY: 0.2618, scale: 0.035 };
    var FACADE_BASE = new THREE.Color(0.14, 0.17, 0.21);
    var P2_DELTA = 0.10;
    var MAX_LIGHT_INTENSITY = 0.50;
    var LIGHT_OFF_COLOR = new THREE.Color(0x1a1f28);
    var HARDCODED_LIGHTS = [
      { localPos: [-14.529, 178.132, 17.828], localNormal: [0.198, 0, -0.980],     color: 'white'  },
      { localPos: [-14.523, 180.304, 17.809], localNormal: [0.198, 0, -0.980],     color: 'yellow' },
      { localPos: [-12.030, 180.617, 18.298], localNormal: [0.198, 0, -0.980],     color: 'white'  },
      { localPos: [-12.036, 178.445, 18.318], localNormal: [0.198, 0, -0.980],     color: 'white'  },
      { localPos: [-10.459, 179.045, 21.097], localNormal: [-0.122, 0.043, 0.992], color: 'white'  },
      { localPos: [-7.048,  178.450, 19.297], localNormal: [0.198, 0, -0.980],     color: 'white'  },
      { localPos: [-7.042,  180.313, 19.280], localNormal: [0.198, 0, -0.980],     color: 'yellow' },
      { localPos: [-4.553,  178.143, 19.785], localNormal: [0.198, 0, -0.980],     color: 'white'  },
      { localPos: [-4.546,  180.316, 19.766], localNormal: [0.198, 0, -0.980],     color: 'white'  }
    ];

    var root = null, facadeMesh = null, glassMesh = null, lightsMesh = null, ready = false;

    function load(onDone){
      gltfLoader.load(GLB_DIR + 'skyscraper07-optimized.glb', function(gltf){
        var meshes = [];
        gltf.scene.traverse(function(o){ if (o.isMesh) meshes.push(o); });
        facadeMesh = meshes.find(function(m){ return m.material.name === 'facade'; }) || meshes[0];
        glassMesh = meshes.find(function(m){ return m.material.name === 'glass'; }) || null;

        var facadeMat = new THREE.MeshStandardMaterial({ color: FACADE_BASE.clone(), metalness: 0, roughness: 0.82 });
        var glassColor = FACADE_BASE.clone().multiplyScalar(1 - P2_DELTA);
        glassColor.b = Math.min(1, glassColor.b + 0.015);
        var glassMat = new THREE.MeshStandardMaterial({ color: glassColor, metalness: 0, roughness: 0.62 });
        facadeMat.userData.baseColor = facadeMat.color.clone();
        glassMat.userData.baseColor = glassMat.color.clone();

        facadeMesh.material = facadeMat;
        facadeMesh.castShadow = false; facadeMesh.receiveShadow = false;
        facadeMesh.geometry.computeVertexNormals(); // decimated normals -> stray specular sparkle up close otherwise
        if (glassMesh){
          glassMesh.material = glassMat;
          glassMesh.castShadow = false; glassMesh.receiveShadow = false;
          glassMesh.geometry.computeVertexNormals();
        }

        root = new THREE.Group();
        root.name = 'ENV_SKYSCRAPER07';
        root.add(facadeMesh);
        if (glassMesh) root.add(glassMesh);
        root.position.set(TRANSFORM.x, TRANSFORM.y, TRANSFORM.z);
        root.rotation.y = TRANSFORM.rotY;
        root.scale.setScalar(TRANSFORM.scale);
        root.updateMatrixWorld(true);
        ctx.scene.add(root);

        lightsMesh = buildLightsMesh(root, facadeMesh, HARDCODED_LIGHTS, 0.020, 0.011, true, LIGHT_OFF_COLOR, 'ENV_SKYSCRAPER07_LIGHTS');

        ready = true;
        if (onDone) onDone();
      }, undefined, function(err){
        console.error('[environment] Skyscraper07 failed to load', err);
      });
    }

    function applyBlend(blend){
      applyBuildingBlend(facadeMesh, glassMesh, lightsMesh, LIGHT_OFF_COLOR, MAX_LIGHT_INTENSITY, blend);
    }

    return { load: load, applyBlend: applyBlend, isReady: function(){ return ready; } };
  })();

  // ---------------- Residential_04 ----------------
  // Transform + 7 fixed lights: tools/_bgtest/residential04-test.js round 7, frozen as-is
  // (this round's brief: adopt the test defaults directly, no re-tuning). Materials are
  // already baked as flat facade/glass colors in the GLB itself (see
  // tools/_bgtest/blender-scripts/export_residential04.py) — this file only applies the
  // day/night multiply on top, same as Skyscraper07.
  var res04 = (function(){
    // x re-tuned from 2.761639491607184 (embedded in the right wall, ~19.5% visible) to
    // 2.349 — the W1.00 candidate from the runtime pixel-measurement pass: full facade+roof
    // now readable (~64% visible), PC_TOWER still naturally occludes the lower body (~36%,
    // by design, not a clipping bug), zero overlap with the monitor or Skyscraper07 at
    // default and both parallax extremes, Rainier's peak tip never occluded (only the
    // mountain's right shoulder, which is an accepted tradeoff, not a hard constraint).
    var TRANSFORM = { x: 2.349, y: -0.2667781388095136, z: -0.85, rotY: -0.15, scale: 0.007 };
    var MAX_LIGHT_INTENSITY = 0.42; // strictly below Skyscraper07's 0.50 and PC RGB's 0.52 emissiveIntensity
    var LIGHT_OFF_COLOR = new THREE.Color(0x1c2129);
    var HARDCODED_LIGHTS = [
      { localPos: [-41.773, 247.363, -35.904], localNormal: [0.389, 0, 0.921],    color: 'white'  },
      { localPos: [-41.752, 275.395, -35.969], localNormal: [0.389, 0, 0.921],    color: 'yellow' },
      { localPos: [-41.723, 303.436, -36.057], localNormal: [0.389, 0, 0.921],    color: 'white'  },
      { localPos: [-32.175, 293.553, -11.964], localNormal: [-0.921, 0, 0.389],   color: 'white'  },
      { localPos: [-27.438, 244.506, -1.116],  localNormal: [0.389, 0, 0.921],    color: 'yellow' },
      { localPos: [-15.845, 323.072, -27.245], localNormal: [0.917, 0, -0.399],   color: 'white'  },
      { localPos: [-24.253, 265.490, 8.052],   localNormal: [-0.921, 0, 0.389],   color: 'white'  }
    ];

    var root = null, facadeMesh = null, glassMesh = null, lightsMesh = null, ready = false;

    function load(onDone){
      gltfLoader.load(GLB_DIR + 'residential04-optimized.glb', function(gltf){
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

        root = new THREE.Group();
        root.name = 'ENV_RESIDENTIAL04';
        root.add(facadeMesh);
        if (glassMesh) root.add(glassMesh);
        root.position.set(TRANSFORM.x, TRANSFORM.y, TRANSFORM.z);
        root.rotation.y = TRANSFORM.rotY;
        root.scale.setScalar(TRANSFORM.scale);
        root.updateMatrixWorld(true);
        ctx.scene.add(root);

        // no size jitter (sizeJitter=false) — matches residential04-test.js exactly, which
        // never had the random-size variance building-test.js uses
        lightsMesh = buildLightsMesh(root, facadeMesh, HARDCODED_LIGHTS, 0.05, 0.018, false, LIGHT_OFF_COLOR, 'ENV_RESIDENTIAL04_LIGHTS');

        ready = true;
        if (onDone) onDone();
      }, undefined, function(err){
        console.error('[environment] Residential_04 failed to load', err);
      });
    }

    function applyBlend(blend){
      applyBuildingBlend(facadeMesh, glassMesh, lightsMesh, LIGHT_OFF_COLOR, MAX_LIGHT_INTENSITY, blend);
    }

    return { load: load, applyBlend: applyBlend, isReady: function(){ return ready; } };
  })();

  function applyBlendToAll(blend){
    sky07.applyBlend(blend);
    res04.applyBlend(blend);
  }

  function onBuildingReady(){
    if (!ctx.environmentBuildings){
      ctx.environmentBuildings = { ready: false, applyBlend: applyBlendToAll };
    }
    ctx.environmentBuildings.ready = sky07.isReady() || res04.isReady();
    // Immediate sync so a building that finishes loading between two 60s ticks doesn't sit
    // at the wrong day/night tone until the next tick — reads the blend day-night.js has
    // already computed rather than recomputing time itself (single source of truth).
    applyBlendToAll(ctx.environmentBlend || 0);
  }

  // ---------------- readiness gate ----------------
  // Waits for the desk GLB's Day/Window_1/Window_2/Window_3 (per spec) plus monitor and
  // PC_TOWER — the two occluders Skyscraper07 and Residential_04 respectively depend on for
  // correct depth (monitor hides Skyscraper07's lower body; PC_TOWER hides
  // Residential_04's). Without waiting for PC_TOWER specifically (which loads via its own
  // nested GLTFLoader call inside load-models.js, after the desk GLB itself), Residential_04
  // could render fully unoccluded for a frame or two before PC_TOWER catches up.
  var pollStart = performance.now();
  var POLL_TIMEOUT_MS = 20000;
  var startedLoading = false;
  var pollId = setInterval(tryStart, 200);

  function tryStart(){
    if (startedLoading) return;
    if (performance.now() - pollStart > POLL_TIMEOUT_MS){
      clearInterval(pollId);
      console.warn('[environment] required scene nodes (Day/Window_1/Window_2/Window_3/monitor/PC_TOWER) never appeared within ' + POLL_TIMEOUT_MS + 'ms — buildings not added.');
      return;
    }
    if (!ctx.scene) return;
    var day = ctx.scene.getObjectByName('Day');
    var wg = ctx.scene.getObjectByName('Window_Group');
    var glass = wg ? wg.getObjectByName('Window_3') : null;
    var w1 = wg ? wg.getObjectByName('Window_1') : null;
    var w2 = wg ? wg.getObjectByName('Window_2') : null;
    var monitor = ctx.scene.getObjectByName('monitor');
    var pcTower = ctx.scene.getObjectByName('PC_TOWER');
    if (!day || !glass || !w1 || !w2 || !monitor || !pcTower) return;
    clearInterval(pollId);
    startedLoading = true;
    sky07.load(onBuildingReady);
    res04.load(onBuildingReady);
  }
})();
