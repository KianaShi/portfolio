(function(){
  var ctx = window.__ctx;
  var container = document.getElementById('app');
  var W = window.innerWidth, H = window.innerHeight;

  var scene = ctx.scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0c11);
  scene.fog = new THREE.Fog(0x0a0c11, 6, 40);

  // FOV 37.5 zooms the workstation in ~13% vs a standard 42, framing the monitor larger.
  var camera = ctx.camera = new THREE.PerspectiveCamera(37.5, W/H, 0.1, 100);
  // Camera Y raised more than the lookAt Y, giving a -1.25° downward pitch (genuinely
  // looking down at the desk rather than level or upward).
  camera.position.set(0, 1.05, 3.85);

  var renderer = ctx.renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  // Keep PBR textures in the color space they were authored for, then compress the
  // highlights with a filmic curve instead of letting bright LEDs clip to flat color.
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.64;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.insertBefore(renderer.domElement, container.firstChild);

  // Keyboard-operable equivalent of clicking the monitor screen: the actual Enter/Space
  // handler lives in interaction.js alongside the click raycaster, since that file already
  // owns "how boot() gets triggered by user input".
  renderer.domElement.setAttribute('tabindex', '0');
  renderer.domElement.setAttribute('role', 'button');
  renderer.domElement.setAttribute('aria-label', 'Interactive workstation scene — press Enter to start');

  // lights
  // A weak neutral hemisphere preserves material contrast. The previous strong blue
  // AmbientLight tinted every surface equally and made wood, plastic and metal converge.
  var ambient = new THREE.HemisphereLight(0xa7bdd5, 0x171513, 0.24);
  scene.add(ambient);

  var warmLight = ctx.warmLight = new THREE.DirectionalLight(0xffdec2, 0.62);
  warmLight.position.set(-3.2, 5.2, 4.4);
  warmLight.castShadow = true;
  warmLight.shadow.mapSize.set(2048, 2048);
  warmLight.shadow.camera.left = -5;
  warmLight.shadow.camera.right = 5;
  warmLight.shadow.camera.top = 5;
  warmLight.shadow.camera.bottom = -3;
  warmLight.shadow.camera.near = 0.5;
  warmLight.shadow.camera.far = 16;
  warmLight.shadow.bias = -0.00015;
  warmLight.shadow.radius = 3;
  scene.add(warmLight);

  var screenLight = ctx.screenLight = new THREE.PointLight(0x5fd6c2, 0.12, 5, 2);
  screenLight.position.set(0, 0.15, 0.6);
  scene.add(screenLight);

  var fillLight = new THREE.PointLight(0x7897bf, 0.14, 10, 2);
  fillLight.position.set(-3, 1.5, 1);
  scene.add(fillLight);

  var keyFill = new THREE.PointLight(0xffead8, 0.16, 12, 2);
  keyFill.position.set(0.2, 1.2, 3.4);
  scene.add(keyFill);

  // floor
  var floor = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshStandardMaterial({color:0x0d0f14, roughness:1})
  );
  floor.rotation.x = -Math.PI/2;
  floor.position.y = -1.35;
  scene.add(floor);
})();
