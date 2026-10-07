(function(){
  // ARGB lighting for the PC: every part that glowed flat cyan in the GLB (fan blades and
  // frames, GPU fans, LED indicators) gets a slowly flowing pink -> purple -> blue palette,
  // and the in-case fan lights (pc-lighting.js) cycle through the same palette so the
  // walls, glass and desk pick up the shifting color.
  //
  // On fans the color runs around the ring (hue from the angle about the fan's own axis)
  // and rotates over time, like a real ARGB fan. The angle is taken in world space, so the
  // ring stays put while the blades spin through it. Each mesh gets its own material
  // clone: the ring center/axis are per-mesh uniforms, and three.js only re-uploads
  // material uniforms when the material changes between draws.
  var ctx = window.__ctx;
  var POLL_MS = 250, POLL_TIMEOUT_MS = 45000;
  var SPEED = 0.06;   // palette cycles per second (~17s per full loop)
  var RGB_MATERIALS = /^(TRANSPARENT WHITE\. RGB FANS|case fan TRANSPARENT|gpu fan|blue led indicator)$/;

  // pink -> purple -> blue, looping; kept in sync with the GLSL rgbPal() below
  var PAL = [new THREE.Color(1.0, 0.28, 0.72), new THREE.Color(0.58, 0.25, 1.0), new THREE.Color(0.22, 0.5, 1.0)];
  function palette(t, out){
    t = ((t % 1) + 1) % 1;
    var s = t * 3, i = Math.floor(s), f = s - i;
    f = f * f * (3 - 2 * f);
    return out.copy(PAL[i]).lerp(PAL[(i + 1) % 3], f);
  }

  var GLSL_PAL = [
    'vec3 rgbPal( float t ){',
    '  t = fract( t ); float s = t * 3.0;',
    '  vec3 a = vec3( 1.0, 0.28, 0.72 ), b = vec3( 0.58, 0.25, 1.0 ), c = vec3( 0.22, 0.5, 1.0 );',
    '  if ( s < 1.0 ) return mix( a, b, smoothstep( 0.0, 1.0, s ) );',
    '  if ( s < 2.0 ) return mix( b, c, smoothstep( 0.0, 1.0, s - 1.0 ) );',
    '  return mix( c, a, smoothstep( 0.0, 1.0, s - 2.0 ) );',
    '}'
  ].join('\n');

  var time = { value: 0 };   // shared by every RGB material

  function makeRgb(mesh, phase){
    var m = mesh.material.clone();
    var box = new THREE.Box3().setFromObject(mesh);
    var size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    // a fan is thin along its spin axis: the ring lies in the other two axes
    var axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
    var dims = [size.x, size.y, size.z];
    var thin = dims.indexOf(Math.min.apply(null, dims));
    var ring = axes.filter(function(_, i){ return i !== thin; });
    var uniforms = {
      uRgbTime: time,
      uRgbCenter: { value: center },
      uRgbU: { value: ring[0] },
      uRgbV: { value: ring[1] },
      uRgbPhase: { value: phase },
      uRgbIntensity: { value: m.emissiveIntensity * 1.8 }
    };
    // fan blades were tinted cyan-white; neutral so the emissive palette reads true
    if (m.name === 'TRANSPARENT WHITE. RGB FANS') m.color.setHex(0xf1eef8);
    m.onBeforeCompile = function(shader){
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRgbPos;')
        .replace('#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvRgbPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', [
          '#include <common>',
          'varying vec3 vRgbPos;',
          'uniform float uRgbTime, uRgbPhase, uRgbIntensity;',
          'uniform vec3 uRgbCenter, uRgbU, uRgbV;',
          GLSL_PAL
        ].join('\n'))
        .replace('vec3 totalEmissiveRadiance = emissive;', [
          'vec3 rgbD = vRgbPos - uRgbCenter;',
          'float rgbT = atan( dot( rgbD, uRgbV ), dot( rgbD, uRgbU ) ) / 6.2831853',
          '  + uRgbTime * ' + SPEED.toFixed(3) + ' + uRgbPhase;',
          'vec3 totalEmissiveRadiance = rgbPal( rgbT ) * uRgbIntensity;'
        ].join('\n'));
    };
    m.needsUpdate = true;
    mesh.material = m;
  }

  var started = Date.now();
  var pollId = setInterval(function(){
    if (Date.now() - started > POLL_TIMEOUT_MS){
      clearInterval(pollId);
      console.warn('[pc-rgb] PC fan lights never appeared — RGB left as loaded.');
      return;
    }
    var pc = ctx.scene && ctx.scene.getObjectByName('PC_TOWER');
    // pcFanLights is set by pc-lighting.js once its env capture/material pass is set up
    if (!pc || !ctx.pcFanLights) return;
    clearInterval(pollId);

    var meshes = [];
    pc.traverse(function(o){
      if (o.isMesh && o.material && !Array.isArray(o.material) && RGB_MATERIALS.test(o.material.name)) meshes.push(o);
    });
    // staggered phases so neighbouring fans aren't in lockstep
    meshes.forEach(function(o, i){ makeRgb(o, i * 0.11); });

    var lights = ctx.pcFanLights, c = new THREE.Color();
    var reduce = ctx.reduceMotion;
    function tick(){
      time.value = reduce ? 0 : performance.now() / 1000;
      lights.forEach(function(l, i){ l.color.copy(palette(time.value * SPEED + i * 0.33, c)); });
      if (!reduce) requestAnimationFrame(tick);
    }
    tick();
  }, POLL_MS);
})();
