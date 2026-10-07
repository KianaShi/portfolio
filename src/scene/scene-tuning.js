(function(){
  // Material/lighting corrections for the desk GLB (the room, window, desk props — not the
  // PC tower, which pc-lighting.js / surface-materials.js own). Runs after the GLB loads.
  //
  //  1. materials: Blender's glTF exporter writes unconfigured materials as white,
  //     metalness 1, roughness 1. Rendered as fully rough white metal with nothing to
  //     reflect, those surfaces (window frame, blind, riser trim, phone camera parts) came
  //     out flat grey. Only that exact signature is corrected — no metalness/roughness
  //     texture, no emission — so real metals (alum.*, phone body), texture-driven ones
  //     (the floor's metallicRoughness map) and emissive-only parts are left alone.
  //  2. environment: the desk GLB's materials get the same RoomEnvironment PMREM the desk
  //     top already uses (ctx.surfaceEnvMap) at a low intensity, so metals have something
  //     to reflect. Assigned per material rather than via scene.environment, which would
  //     also light the night skyline backdrop and the buildings outside the window.
  //
  // Each step is exposed on ctx.sceneTuning for before/after comparison; `?tuning=off` in
  // the URL loads the page without applying them.
  var ctx = window.__ctx;
  var POLL_MS = 200, POLL_TIMEOUT_MS = 30000;

  // [roughness, albedo] per corrected material. The material *type* is fixed (plastic /
  // fabric, not metal); the albedo keeps each surface's established on-screen tone — the
  // near-black window frame the composition was built around, dark speaker dust caps —
  // rather than the literal white the exporter wrote, which turned them into pale slabs.
  var CORRECTION = {
    'PVC': [0.45, 0x25262a],                    // window frame
    'Plastic': [0.5, 0x25262a],                 // window inner frame, riser trim, dust caps
    'Rail_material': [0.45, 0x25262a],          // blind head rail
    'Support_1.L_material': [0.5, 0x25262a],
    'String_material': [0.8, 0x9a9792],         // blind cord
    'Fabric_material': [0.9, 0xcfcac2]          // blind fabric
  };
  var CORRECTION_DEFAULT = [0.4, 0x202022];     // small phone camera-module parts

  var ENV_INTENSITY_METAL = 0.6, ENV_INTENSITY_DIELECTRIC = 0.15;

  function isDefaultSignature(m){
    return m.isMeshStandardMaterial && m.metalness === 1 && m.roughness === 1 &&
      !m.metalnessMap && !m.roughnessMap && !m.emissiveMap &&
      m.emissive.getHex() === 0 && m.color.getHex() === 0xffffff;
  }

  // The room shell (walls/floor, under "Room002") is a large interior surface: studio
  // reflections there only lifted the wall to a flat light grey, so it's left unlit by
  // the environment.
  function inRoomShell(o){
    for (var p = o; p; p = p.parent) if (/^Room/.test(p.name)) return true;
    return false;
  }

  function deskMaterials(root){
    var mats = [];
    root.traverse(function(o){
      if (!o.isMesh || !o.material || inRoomShell(o)) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m){
        if (m.isMeshStandardMaterial && mats.indexOf(m) < 0) mats.push(m);
      });
    });
    return mats;
  }

  function fixMaterials(mats){
    var changed = [];
    mats.forEach(function(m){
      if (!isDefaultSignature(m)) return;
      var c = CORRECTION[m.name] || CORRECTION_DEFAULT;
      m.metalness = 0;
      m.roughness = c[0];
      m.color.setHex(c[1]);
      m.needsUpdate = true;
      changed.push(m.name);
    });
    return changed;
  }

  // Dielectrics only get it when genuinely glossy (mug glaze, phone glass, ceramic pots).
  // On anything rougher the bright studio RoomEnvironment adds almost no visible
  // reflection, just a flat ambient lift — measured in the same-load before/after, it
  // raised the window frame ~35% and greyed the black keycaps ~20%.
  var ENV_MAX_DIELECTRIC_ROUGHNESS = 0.3;

  function applyEnvironment(mats, envMap){
    var n = 0;
    mats.forEach(function(m){
      if (m.envMap) return;                       // already has one (the desk top)
      if (m.emissiveMap) return;                  // emissive-only backdrop
      if (m.transparent) return;                  // window glass: would wash a studio
                                                  // reflection over the whole city view
      if (m.metalness <= 0.5 && m.roughness >= ENV_MAX_DIELECTRIC_ROUGHNESS) return;
      // texture-driven metalness (the floor): the factor says nothing about which texels
      // are metal, so it's left as authored
      if (m.metalnessMap) return;
      m.envMap = envMap;
      m.envMapIntensity = m.metalness > 0.5 ? ENV_INTENSITY_METAL : ENV_INTENSITY_DIELECTRIC;
      m.needsUpdate = true;
      n++;
    });
    return n;
  }

  var off = /[?&]tuning=off\b/.test(location.search);
  var started = Date.now();
  var pollId = setInterval(function(){
    if (Date.now() - started > POLL_TIMEOUT_MS){
      clearInterval(pollId);
      console.warn('[scene-tuning] desk GLB / env map never appeared — left as loaded.');
      return;
    }
    var table = ctx.scene && ctx.scene.getObjectByName('Table');
    if (!table || !ctx.surfaceEnvMap) return;
    clearInterval(pollId);

    // the desk GLB root: Table's ancestor directly under the scene
    var root = table;
    while (root.parent && root.parent !== ctx.scene) root = root.parent;
    var mats = deskMaterials(root);

    ctx.sceneTuning = {
      materials: function(){ return fixMaterials(mats); },
      environment: function(){ return applyEnvironment(mats, ctx.surfaceEnvMap); }
    };
    if (off) return;
    ctx.sceneTuning.materials();
    ctx.sceneTuning.environment();
  }, POLL_MS);
})();
