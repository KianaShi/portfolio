(function(){
  // Shared state for the classic (non-module) scripts loaded after this one — each reads/
  // writes these directly off window.__ctx instead of using global vars. Load order (set
  // by index.html's <script> tags) matters: a field must be set by some earlier-loaded
  // file, or read lazily inside a callback, before a later file can rely on it.
  //
  // Keep this object to fields genuinely read or written by more than one file. A value
  // only one file ever touches belongs as a local var in that file, not here.
  window.__ctx = {
    // Computed once, here, rather than per-file — every file that guards an animation
    // behind it should read this exact value, not call matchMedia() again itself.
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,

    // --- set by scene/create-scene.js ---
    scene: null,
    camera: null,
    renderer: null,
    warmLight: null,   // read by interaction.js's animate() for the idle intensity pulse
    screenLight: null, // read by interaction.js's animate() for the boot-state glow

    // --- set by screen/screen-canvas.js ---
    screenMat: null,      // procedural CRT screen material, consumed by procedural-scene.js
    screenMatGLB: null,   // real GLB screen material, consumed by scene/load-models.js
    drawIdleScreen: null, // called every frame by interaction.js while not booted
    drawBootScreen: null, // called by screen/boot-animation.js's typeStep()
    typedText: [],         // written by boot-animation.js's typeStep(), read by drawBootScreen

    // --- set by scene/procedural-scene.js ---
    desk: null,
    monitor: null,
    deskCluster: null,
    roomCluster: null,
    powerBtn: null,           // lit up by boot-animation.js's boot()
    interactiveScreen: null,  // reassigned by load-models.js once the real GLB screen loads
    interactiveHitbox: null,  // read by interaction.js's click handler on every click

    // --- set by scene/load-models.js ---
    pcMixer: null, // PC fan AnimationMixer, only set once the PC GLB finishes loading

    // --- set by environment/day-night.js ---
    environmentBlend: 0,        // 0 = full day, 1 = full night; local-time-driven, read by environment/buildings.js
    environmentReady: false,    // true once the Day/Night backdrop swap has actually happened
    updateEnvironment: null,    // recompute blend from the current time and reapply — called on a 60s tick, on
                                 // visibilitychange/focus, and (once) by environment/buildings.js after its own load

    // --- set by environment/buildings.js ---
    environmentBuildings: null, // { ready, applyBlend(blend) } — day-night.js calls applyBlend whenever
                                 // environmentBlend changes, so the buildings stay in sync without owning a timer

    // --- set by screen/boot-animation.js ---
    boot: null,          // called only by interaction.js's click handler — not a general API
    easeInOutCubic: null,
    zoomStart: 0,
    zoomDuration: 1.5,
    zoomFromPos: null,
    zoomFromFov: 0,
    zoomFromLook: null,
    zoomToPos: null,  // mutated in place by load-models.js once the real screen position is known
    zoomToLook: null, // mutated in place by load-models.js once the real screen position is known
    zoomToFov: 29,
    currentLook: null,

    // --- set by interaction.js ---
    clock: null,        // read by boot-animation.js's boot() to timestamp the zoom start
    pcMixerClock: null,

    // --- set by player/tracks.js ---
    phonePlayerTracks: null, // config array, read once by player/phone-player.js

    // --- set by player/phone-player.js ---
    phoneScreen: null,      // the real GLB phone-screen Mesh, read by interaction.js's raycaster
    phoneHitbox: null,      // same mesh as phoneScreen; kept separate in case that ever diverges
    phonePlayerReady: false, // guards interaction.js's phone raycast until the mesh/texture exist
    phonePlayer: null,      // {handleScreenHit, isSeekUV, seekAtUV, prev, next, togglePlay}

    // shared mutable flags, read/written across several files — kept together so a stray
    // top-level `var booted` or `var zooming` can't silently shadow the real one
    state: {
      booted: false,
      zooming: false
    }
  };
})();
