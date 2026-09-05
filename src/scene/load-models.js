(function(){
  var ctx = window.__ctx;
  var scene = ctx.scene;
  var screenMatGLB = ctx.screenMatGLB;
  var desk = ctx.desk, monitor = ctx.monitor, deskCluster = ctx.deskCluster, roomCluster = ctx.roomCluster;
  // Real desk model (assets/desk-glb/) — replaces the procedural desk/monitor/room fallback
  // (built in procedural-scene.js) once it loads; see tools/ for the conversion pipeline.
  var floorY = -1.35;

  // Excluded from the auto-fit bounding box below (backdrop/room shell, not furniture).
  // THREE.GLTFLoader sanitizes node names for animation-path safety
  // (PropertyBinding.sanitizeNodeName strips dots), so the glTF's "Room.002" arrives here
  // as "Room002". CTRL_Hole and the Night backdrop were already stripped from the GLB
  // itself at build time; the CTRL_Hole lookup below is just a defensive no-op.
  var FIT_EXCLUDE_NAMES = ['Day', 'Room002', 'Window_Group', 'Rail'];

  // loading overlay: covers the procedural CRT scene while the real model streams in over
  // the network, so the fallback scene never flashes on screen before the swap happens
  var loadingHidden = false;
  function hideLoadingOverlay(){
    if (loadingHidden) return;
    loadingHidden = true;
    var el = document.getElementById('loadingOverlay');
    el.classList.add('hidden');
    setTimeout(function(){ el.style.display = 'none'; }, 550);
  }
  setTimeout(hideLoadingOverlay, 8000); // safety net if the model never resolves

  var dracoLoader = new THREE.DRACOLoader();
  dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
  var deskGltfLoader = new THREE.GLTFLoader();
  deskGltfLoader.setDRACOLoader(dracoLoader);
  deskGltfLoader.load('assets/desk-glb/desk-optimized.glb', function(gltf){
    if (ctx.state.booted) return; // don't yank the scene out from under a boot animation already in flight

    var obj = gltf.scene;

    // defensive no-op: CTRL_Hole was removed at build time already (see comment above)
    var ctrlHole = obj.getObjectByName('CTRL_Hole');
    if (ctrlHole) ctrlHole.parent.remove(ctrlHole);

    var monitorChild = obj.getObjectByName('monitor');

    // The real screen surface is the GLB's own mesh, not a separate plane we add.
    // GLTFLoader splits the monitor's multi-material glTF mesh into one child Mesh per
    // material (Cube004, Cube004_1, Cube004_2, ...), and Material.021 is the one that's
    // the actual screen (thin/flat sub-mesh nested inside the Material.025 bezel). We swap
    // that mesh's material for our canvas-driven one on the same mesh/UVs — no extra plane.
    var screenSurface = monitorChild ? monitorChild.children.find(function(c){
      return c.material && c.material.name === 'Material.021';
    }) : null;

    if (screenSurface){
      screenSurface.material = screenMatGLB;
      screenSurface.name = 'SCREEN_REAL';
      ctx.interactiveScreen = screenSurface;
      ctx.interactiveHitbox = screenSurface;
    } else {
      console.warn('desk.glb: Material.021 screen mesh not found under "monitor" — keeping the CRT as the interactive screen');
    }

    // Rotate to face the camera, scale furniture to a fixed target width, recenter — so
    // this reuses the already-tuned idle/zoom camera state without adjusting it per-asset.
    obj.rotation.y = -Math.PI/2;
    obj.updateMatrixWorld(true);

    function furnitureBox(){
      var b = new THREE.Box3();
      var any = false;
      obj.children.forEach(function(child){
        var n = child.name || '';
        if (FIT_EXCLUDE_NAMES.indexOf(n) !== -1) return;
        b.union(new THREE.Box3().setFromObject(child));
        any = true;
      });
      return any ? b : new THREE.Box3().setFromObject(obj);
    }

    var box = furnitureBox();
    var size = new THREE.Vector3();
    box.getSize(size);
    var targetWidth = 4.2;
    var scale = size.x > 0 ? targetWidth / size.x : 1;
    obj.scale.setScalar(scale);
    obj.updateMatrixWorld(true);

    var box2 = furnitureBox();
    var center2 = new THREE.Vector3();
    box2.getCenter(center2);
    obj.position.x += (0.3 - center2.x);
    obj.position.y += (floorY - box2.min.y);
    obj.position.z += (0.4 - center2.z);

    scene.add(obj);
    obj.updateMatrixWorld(true);

    if (screenSurface){
      // The mesh's own transform is the whole model's pivot, not the screen's visual
      // center (position/rotation offsets are baked into the vertex data) — use the
      // geometry's own bounding-box center instead of getWorldPosition(mesh).
      var screenGeo = ctx.interactiveScreen.geometry;
      screenGeo.computeBoundingBox();
      var localCenter = new THREE.Vector3();
      screenGeo.boundingBox.getCenter(localCenter);
      var screenWorldPos = ctx.interactiveScreen.localToWorld(localCenter.clone());

      // vertex normal attribute read directly off this mesh's geometry (averaged, all
      // near-identical for a flat surface) — confirmed (1,0,0) locally, not guessed.
      var screenWorldNormal = new THREE.Vector3(1, 0, 0);
      screenWorldNormal.transformDirection(ctx.interactiveScreen.matrixWorld).normalize();
      ctx.zoomToLook.copy(screenWorldPos);
      ctx.zoomToPos.copy(screenWorldPos).addScaledVector(screenWorldNormal, 1.4);
    }

    // The GLB's "Glass" material ships opaque (transparent=false, no
    // KHR_materials_transmission) — needs manual transparency here.
    obj.traverse(function(o){
      if (o.isMesh){
        // The large room/window shells should receive light but must not cast a single
        // room-sized shadow over the desk. Smaller opaque props provide contact shadows.
        var isShell = /Room|Window|Day|Rail/i.test(o.name);
        o.castShadow = !isShell;
        o.receiveShadow = true;
      }
      if (!o.material) return;
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function(m){
        if (m.name === 'Glass'){
          m.transparent = true;
          m.opacity = 0.28;
          m.depthWrite = false;
          m.metalness = 0;
          m.roughness = 0.12;
          m.side = THREE.DoubleSide;
        }
      });
      if (o.isMesh && mats.some(function(m){ return m.transparent || m.opacity < 0.7; })){
        o.castShadow = false;
      }
    });

    // Room.002 (Material.017) is already THREE.DoubleSide as loaded from the GLB
    // (GLTFLoader honors the artist's material.doubleSided flag) — no override needed here.

    // the purchased model is now the whole scene — remove every procedural desk prop
    // and our own room shell (its own Room/Window/day-backdrop replace them)
    scene.remove(desk);
    scene.remove(monitor);
    deskCluster.forEach(function(m){ scene.remove(m); });
    roomCluster.forEach(function(m){ scene.remove(m); });

    // Remove the headphones/stand — verified exact node names by enumerating obj.children
    // at runtime (not guessed): "headphones" and "Headphones_Stand". The desk phone prop
    // ("iphone_13White001", "Phone_Stand") is a different object and is left untouched.
    var headphonesObj = obj.getObjectByName('headphones');
    var headphonesStandObj = obj.getObjectByName('Headphones_Stand');
    if (headphonesObj) obj.remove(headphonesObj);
    if (headphonesStandObj) obj.remove(headphonesStandObj);

    // "Cube004_4", a submesh of the monitor's Cube004 group, is a leftover zero-height
    // construction plane from the source model that reads as a bright sliver above the
    // monitor bezel — not part of the screen/bezel/stand geometry, safe to remove.
    var monitorArtifact = obj.getObjectByName('monitor').getObjectByName('Cube004_4');
    if (monitorArtifact) monitorArtifact.parent.remove(monitorArtifact);

    // ---- RGB PC tower: replaces the headphones on the right side of the desk ----
    var pcGltfLoader = new THREE.GLTFLoader();
    pcGltfLoader.setDRACOLoader(dracoLoader);
    pcGltfLoader.load('assets/pc/pc-optimized.glb', function(pcGltf){
      var pcRoot = pcGltf.scene;
      var pcGroup = new THREE.Group();
      pcGroup.name = 'PC_TOWER';
      pcGroup.add(pcRoot);
      scene.add(pcGroup);

      // Scale from the model's own measured bounding box (not native Blender units),
      // targeting a tower height a bit under the monitor's own height (1.132 units).
      // Y-axis rotation never changes a vertex's Y, so this scale is yaw-independent.
      var box0 = new THREE.Box3().setFromObject(pcRoot);
      var size0 = new THREE.Vector3(); box0.getSize(size0);
      var targetHeight = 0.98;
      var pcScale = targetHeight / size0.y;
      pcGroup.scale.setScalar(pcScale);
      pcGroup.updateMatrixWorld(true);

      // Provisional position (rotation.y still 0 here): desk surface height read from
      // Table's own measured bbox, not assumed. This places the tower in its real desk
      // slot so the front-panel-to-camera direction measured below reflects where it will
      // actually sit, not where it started at the scene origin.
      var tableBox = new THREE.Box3().setFromObject(obj.getObjectByName('Table'));
      var deskSurfaceY = tableBox.max.y;
      var targetCenterX = 1.85, targetCenterZ = 0.55;

      var box1 = new THREE.Box3().setFromObject(pcGroup);
      var center1 = new THREE.Vector3(); box1.getCenter(center1);
      pcGroup.position.x += (targetCenterX - center1.x);
      pcGroup.position.z += (targetCenterZ - center1.z);
      pcGroup.position.y += (deskSurfaceY - box1.min.y);
      pcGroup.updateMatrixWorld(true);

      // Orientation is aligned to the WORKSTATION (the monitor's forward direction), not
      // the camera — the PC should sit on the desk like a real tower regardless of where
      // the camera happens to be.
      //
      // The case's front face is identified from geometry, not inferred from "sidepanel":
      // the mesh named "front_panel" is confirmed correct two ways, since name alone is
      // unreliable here (this model's "back_mesh" is near-parallel to "front_panel", not
      // opposite it). (1) its dominant face normal sits at exactly 90 degrees from the
      // glass sidepanel's normal, matching an ATX case's front/side being perpendicular;
      // (2) "power_on_button_1" — which can only exist on a case's front — sits ~0.27
      // world units from front_panel's center vs. ~0.9+ from every other candidate face.
      var frontPanel = null;
      pcGroup.traverse(function(o){ if (o.name === 'front_panel') frontPanel = o; });

      function dominantFaceNormalWorld(mesh){
        var geom = mesh.geometry;
        var posAttr = geom.attributes.position;
        var index = geom.index;
        var triCount = index ? index.count / 3 : posAttr.count / 3;
        function vertAt(i){ return new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)); }
        function idx(t, k){ return index ? index.getX(t * 3 + k) : t * 3 + k; }
        var buckets = {};
        for (var t = 0; t < triCount; t++){
          var i0 = idx(t, 0), i1 = idx(t, 1), i2 = idx(t, 2);
          var a = vertAt(i0), b = vertAt(i1), c = vertAt(i2);
          var cross = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
          var area = cross.length() * 0.5;
          if (area < 1e-10) continue;
          var n = cross.clone().normalize();
          var key = Math.round(n.x * 40) + '_' + Math.round(n.y * 40) + '_' + Math.round(n.z * 40);
          if (!buckets[key]) buckets[key] = { area: 0, normal: new THREE.Vector3() };
          buckets[key].area += area;
          buckets[key].normal.addScaledVector(n, area);
        }
        var bestKey = Object.keys(buckets).reduce(function(best, k){
          return (!best || buckets[k].area > buckets[best].area) ? k : best;
        }, null);
        var localNormal = buckets[bestKey].normal.clone().normalize();
        var nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
        return localNormal.clone().applyMatrix3(nm).normalize();
      }

      var frontNormal = dominantFaceNormalWorld(frontPanel);
      var frontNormalXZ = new THREE.Vector2(frontNormal.x, frontNormal.z).normalize();

      // Reuses screenWorldNormal (computed above from the monitor screen mesh's own
      // vertex-normal attribute) — measures (0, 0, 1), screen facing straight down world +Z.
      var monitorFrontXZ = new THREE.Vector2(screenWorldNormal.x, screenWorldNormal.z).normalize();

      // rotation.y transforms a local (x,z) like complex multiplication by e^(i*yaw) using
      // (z + i*x) as the complex plane, so the yaw carrying frontNormalXZ onto monitorFrontXZ
      // is just the difference of their atan2(x,z) arguments.
      var pcYaw = Math.atan2(monitorFrontXZ.x, monitorFrontXZ.y) - Math.atan2(frontNormalXZ.x, frontNormalXZ.y);
      pcRoot.rotation.y = pcYaw;
      pcGroup.updateMatrixWorld(true);

      // Position (final): re-center after rotation, since the footprint's XZ shape changes
      // with yaw even though its height doesn't, then re-anchor the bottom to the desk
      // surface using the post-rotation bbox.
      var box2 = new THREE.Box3().setFromObject(pcGroup);
      var center2 = new THREE.Vector3(); box2.getCenter(center2);
      pcGroup.position.x += (targetCenterX - center2.x);
      pcGroup.position.z += (targetCenterZ - center2.z);
      pcGroup.position.y += (deskSurfaceY - box2.min.y);
      pcGroup.updateMatrixWorld(true);

      // Collision check against the right speaker: the "speakers" node is a single mesh
      // covering BOTH the left and right units, so its own bbox spans nearly the whole desk
      // width and is useless for a proximity check here. Instead this samples only the
      // mesh's world-space vertices with x>0.9 (the right-hand cluster nearest the PC) and
      // hulls those into a tight box for the actual overlap test.
      var rightSpeakerBox = (function(){
        var speakers = scene.getObjectByName('speakers');
        var mesh = null;
        speakers.traverse(function(o){ if (o.isMesh && !mesh) mesh = o; });
        var pos = mesh.geometry.attributes.position;
        var mw = mesh.matrixWorld;
        var v = new THREE.Vector3();
        var b = new THREE.Box3();
        for (var i = 0; i < pos.count; i++){
          v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mw);
          if (v.x > 0.9) b.expandByPoint(v);
        }
        return b;
      })();

      var pcBox = new THREE.Box3().setFromObject(pcGroup);
      var speakerClearanceApplied = pcBox.intersectsBox(rightSpeakerBox);
      if (speakerClearanceApplied){
        // small forward (+Z) nudge only — camera/table/monitor/speakers/model-root untouched
        var neededZ = (rightSpeakerBox.max.z - pcBox.min.z) + 0.035;
        pcGroup.position.z += neededZ;
        pcGroup.updateMatrixWorld(true);
        pcBox = new THREE.Box3().setFromObject(pcGroup);
      }

      // RGB emissive: the source .blend's color-cycling shader animation doesn't survive
      // the Blender->FBX->glTF pipeline. Fan blades ship as translucent white ("TRANSPARENT
      // WHITE. RGB FANS", meant to be lit from behind by colored LEDs), so a flat per-fan
      // emissive color is applied here as a substitute.
      var rgbAssignments = [
        {match:/aio fan 1/i, color: 0x00e5ff},
        {match:/aio fan 2/i, color: 0xa259ff},
        {match:/aio fan 3/i, color: 0xff2d95},
        {match:/^case fan$/i, color: 0xff2d95},
        {match:/case fan\.001/i, color: 0xff5da2},
        {match:/case fan\.002/i, color: 0x39ff6a},
        {match:/case fan\.003/i, color: 0x00e5ff},
        {match:/case fan\.004/i, color: 0xa259ff},
        {match:/case fan\.005/i, color: 0xffb347}
      ];
      pcRoot.traverse(function(o){
        if (!o.isMesh || !o.material) return;
        o.castShadow = true;
        o.receiveShadow = true;
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        if (mats.some(function(m){ return m.transparent || m.opacity < 0.7; })){
          o.castShadow = false;
        }
        mats.forEach(function(m){
          if (/TRANSPARENT WHITE\. RGB FANS|blue led indicator|case fan TRANSPARENT|gpu fan/i.test(m.name)){
            var match = rgbAssignments.find(function(a){ return a.match.test(o.name); });
            m.emissive = new THREE.Color(match ? match.color : 0x00e5ff);
            // Preserve the RGB identity without flattening the fan texture into a neon
            // silhouette. ACES tone mapping handles the remaining highlight roll-off.
            m.emissiveIntensity = 0.52;
          }
        });
      });

      // Fan rotation animation: 12 of the 13 real per-object actions survived the FBX
      // conversion (verified by name against the .blend's own AnimData.action pointers,
      // not guessed) and are looped continuously here.
      if (pcGltf.animations && pcGltf.animations.length){
        var pcMixer = new THREE.AnimationMixer(pcRoot);
        pcGltf.animations.forEach(function(clip){
          var action = pcMixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat);
          action.play();
        });
        ctx.pcMixer = pcMixer;
      }
    }, undefined, function(err){
      console.error('pc-optimized.glb failed to load', err);
    });

    hideLoadingOverlay();
  }, undefined, function(err){
    console.error('desk-optimized.glb failed to load — keeping the procedural scene', err);
    hideLoadingOverlay();
  });
})();
