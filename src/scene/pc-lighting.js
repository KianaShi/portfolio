(function(){
  // Grounds the PC tower in the room's own lighting (runs after surface-materials.js has
  // set up its materials):
  //  - reflections: the PC's materials used the generic studio RoomEnvironment, which lit
  //    it like a separate product shot. A cube capture taken from the tower's position
  //    (tower hidden) reflects the actual window, skyline and desk instead, and is re-taken
  //    periodically so it follows the day/night backdrop.
  //  - RGB fans: cyan point lights at the fan clusters so the fans light the interior,
  //    glass and desk, rather than only being cyan themselves.
  //  - a soft contact shadow under the case so it sits on the desk.
  var ctx = window.__ctx;
  var POLL_MS = 250, POLL_TIMEOUT_MS = 45000;
  var RECAPTURE_MS = 120000;
  var FAN_COLOR = 0x19e3ff;

  // material name -> envMapIntensity against the captured (much darker) room
  var ENV_INTENSITY = {
    'glass': 3.0, 'glass.003': 3.0,
    'black': 3.5, 'BLACK matt': 3.5,
    'LOGO.001': 2.4, 'Metal': 2.0, 'Textured Metal.001': 2.0
  };
  var ENV_DEFAULT = 1.2;

  function pcMaterials(pc){
    var mats = [];
    pc.traverse(function(o){
      if (!o.isMesh || !o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(function(m){
        if (mats.indexOf(m) < 0) mats.push(m);
      });
    });
    return mats;
  }

  function makeCapture(pc, extraHidden){
    var renderer = ctx.renderer, scene = ctx.scene;
    var cubeRT = new THREE.WebGLCubeRenderTarget(128, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      generateMipmaps: false, minFilter: THREE.LinearFilter
    });
    var cubeCam = new THREE.CubeCamera(0.05, 30, cubeRT);
    var center = new THREE.Box3().setFromObject(pc).getCenter(new THREE.Vector3());
    cubeCam.position.copy(center);
    scene.add(cubeCam);
    var pmrem = new THREE.PMREMGenerator(renderer);
    var current = null;

    return function capture(){
      pc.visible = false;
      extraHidden.forEach(function(o){ o.visible = false; });
      cubeCam.update(renderer, scene);
      pc.visible = true;
      extraHidden.forEach(function(o){ o.visible = true; });
      var rt = pmrem.fromCubemap(cubeRT.texture);
      var prev = current;
      current = rt;
      if (prev) prev.dispose();
      return rt.texture;
    };
  }

  function addFanLights(pc){
    var pcBox = new THREE.Box3().setFromObject(pc);
    var height = pcBox.max.y - pcBox.min.y;
    var bottom = [], side = [];
    pc.traverse(function(o){
      if (!o.isMesh || !o.material || o.material.name !== 'TRANSPARENT WHITE. RGB FANS') return;
      var c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      (c.y < pcBox.min.y + height * 0.2 ? bottom : side).push(c);
    });
    var lights = [];
    [[bottom, 0.55], [side, 0.7]].forEach(function(pair){
      var pts = pair[0];
      if (!pts.length) return;
      var avg = new THREE.Vector3();
      pts.forEach(function(p){ avg.add(p); });
      avg.divideScalar(pts.length);
      var light = new THREE.PointLight(FAN_COLOR, pair[1], 1.1, 2);
      light.position.copy(avg);
      ctx.scene.add(light);
      lights.push(light);
    });
    return lights;
  }

  // Soft rounded-rect falloff: dark right under the footprint, fading out a few cm past it.
  function addContactShadow(pc){
    var box = new THREE.Box3().setFromObject(pc);
    var size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    var S = 256, PAD = 0.35;
    var cv = document.createElement('canvas'); cv.width = cv.height = S;
    var c2 = cv.getContext('2d');
    c2.filter = 'blur(' + Math.round(S * 0.07) + 'px)';
    c2.fillStyle = 'rgba(0,0,0,0.85)';
    var inset = S * PAD / (1 + PAD) / 2;
    c2.fillRect(inset, inset, S - inset * 2, S - inset * 2);
    var tex = new THREE.CanvasTexture(cv);
    var plane = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x * (1 + PAD), size.z * (1 + PAD)),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(center.x, box.min.y + 0.002, center.z);
    plane.renderOrder = 1;
    plane.name = 'PC_CONTACT_SHADOW';
    ctx.scene.add(plane);
    return plane;
  }

  var started = Date.now();
  var pollId = setInterval(function(){
    if (Date.now() - started > POLL_TIMEOUT_MS){
      clearInterval(pollId);
      console.warn('[pc-lighting] PC/environment never became ready — lighting left as is.');
      return;
    }
    var pc = ctx.scene && ctx.scene.getObjectByName('PC_TOWER');
    // surfaceEnvMap marks surface-materials.js as done; environmentReady means the
    // window backdrop is in, so the first capture already reflects the real skyline
    if (!pc || !ctx.surfaceEnvMap || !ctx.environmentReady) return;
    clearInterval(pollId);

    addFanLights(pc);
    var shadow = addContactShadow(pc);
    // fan lights stay on during capture: toggling a light changes the light count and
    // would recompile every material in the scene on each re-capture
    var capture = makeCapture(pc, [shadow]);
    var mats = pcMaterials(pc);
    function apply(){
      var env = capture();
      mats.forEach(function(m){
        if (!('envMap' in m)) return;
        m.envMap = env;
        m.envMapIntensity = ENV_INTENSITY[m.name] !== undefined ? ENV_INTENSITY[m.name] : ENV_DEFAULT;
        m.needsUpdate = true;
      });
    }
    apply();
    setInterval(apply, RECAPTURE_MS);
  }, POLL_MS);
})();
