// 3D phone music player.
// Confirmed at runtime (tools/inspect-phone.mjs + tools/_bgtest/probe-phone.js), not
// guessed: GLTFLoader sanitizes the glTF node name "iphone 13.White.001" to
// "iphone_13White001" (dots/spaces stripped). That Group has 14 children — one Mesh
// per glTF primitive/material — and the screen surface is specifically the child whose
// material.name === "screen" (runtime name "Cube005_2"), a dedicated sub-mesh that does
// NOT share its material with the phone body/case, so replacing its material can't
// affect the rest of the phone. Its UV range is a narrow band, NOT full 0..1
// (confirmed: U[0.3709,0.6291] V[0.0108,0.9980]) — texture.repeat/offset below remaps
// that band to the full canvas. texture.flipY=false with no axis flip was confirmed by
// rendering a labeled TOP/BOTTOM/LEFT/RIGHT test texture and screenshotting the mesh,
// not assumed from convention.
(function(){
  var ctx = window.__ctx;
  var tracks = ctx.phonePlayerTracks;

  var a11y = {
    prevBtn: document.getElementById('ppPrev'),
    playBtn: document.getElementById('ppPlayPause'),
    nextBtn: document.getElementById('ppNext'),
    seek: document.getElementById('ppSeek'),
    live: document.getElementById('ppNowPlaying')
  };

  var currentIndex = 0;
  var isPlaying = false;
  var isLoading = false;
  var hasError = false;
  var duration = 0;
  var currentTime = 0;
  var coverCache = {};
  var seekDragging = false; // guards the DOM range input against fighting timeupdate

  var audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = 0.5;

  var audioCtx = null, sourceNode = null, analyserNode = null, freqData = null;
  var audioGraphReady = false;

  var WAVE_BARS = 20;
  var waveformBars = new Array(WAVE_BARS).fill(0.06);
  var waveformRestBars = new Array(WAVE_BARS).fill(0.06);

  var playerCanvas = window.__phonePlayerCanvasModule.create(512, 1024);
  var texture = new THREE.CanvasTexture(playerCanvas.canvas);
  texture.flipY = false;
  texture.encoding = THREE.sRGBEncoding;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  var screenMesh = null;
  var uvBounds = null;

  // ---------------------------------------------------------------- mesh discovery
  function findPhoneScreen(){
    var found = null;
    ctx.scene.traverse(function(o){
      if (found) return;
      if (o.isMesh && o.material && o.material.name === 'screen' && /iphone/i.test((o.parent && o.parent.name) || '')){
        found = o;
      }
    });
    return found;
  }

  var findPollId = setInterval(function(){
    if (!ctx.scene) return;
    var mesh = findPhoneScreen();
    if (!mesh) return;
    clearInterval(findPollId);
    initScreen(mesh);
  }, 200);

  function initScreen(mesh){
    screenMesh = mesh;

    var uvAttr = mesh.geometry.attributes.uv;
    var uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (var i = 0; i < uvAttr.count; i++){
      var u = uvAttr.getX(i), v = uvAttr.getY(i);
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
    uvBounds = { uMin: uMin, uMax: uMax, vMin: vMin, vMax: vMax };
    texture.repeat.set(1 / (uMax - uMin), 1 / (vMax - vMin));
    texture.offset.set(-uMin * texture.repeat.x, -vMin * texture.repeat.y);
    if (ctx.renderer && ctx.renderer.capabilities){
      texture.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    }

    // MeshBasicMaterial is unlit (same approach as the monitor's screenMatGLB in
    // screen-canvas.js) so room lighting/shadows never gray out or dim the UI.
    mesh.material = new THREE.MeshBasicMaterial({ map: texture });

    ctx.phoneScreen = mesh;
    ctx.phoneHitbox = mesh;
    ctx.phonePlayerReady = true;

    loadTrack(currentIndex, false);
    startWaveformLoop();

    // Page-load autoplay attempt for whichever track is now current (tracks[0]).
    // attemptPlay() below handles the allowed/blocked branches and, if blocked, arms a
    // one-time first-gesture retry — this is a single real audio.play() call, not a
    // loop or a simulated click.
    attemptPlay(true);
  }

  // ---------------------------------------------------------------- cover loading
  function loadCover(index){
    if (coverCache[index]) { redraw(); return; }
    var track = tracks[index];
    var entry = { image: null, failed: false };
    coverCache[index] = entry;
    var img = new Image();
    img.onload = function(){ entry.image = img; if (index === currentIndex) redraw(); };
    img.onerror = function(){ entry.failed = true; if (index === currentIndex) redraw(); };
    img.src = encodeURI(track.cover);
  }

  // ---------------------------------------------------------------- audio graph
  function ensureAudioGraph(){
    if (audioGraphReady) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    sourceNode = audioCtx.createMediaElementSource(audio);
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 64;
    freqData = new Uint8Array(analyserNode.frequencyBinCount);
    sourceNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
    audioGraphReady = true;
  }

  audio.addEventListener('loadedmetadata', function(){
    duration = audio.duration || 0;
    redraw(); syncA11y();
  });
  audio.addEventListener('timeupdate', function(){
    if (seekDragging) return;
    currentTime = audio.currentTime;
    redraw(); syncA11y();
  });
  audio.addEventListener('waiting', function(){ isLoading = true; redraw(); });
  audio.addEventListener('playing', function(){ isLoading = false; isPlaying = true; hasError = false; redraw(); syncA11y(); });
  audio.addEventListener('pause', function(){ isPlaying = false; redraw(); syncA11y(); });
  audio.addEventListener('error', function(){
    isLoading = false; isPlaying = false; hasError = true; redraw(); syncA11y();
    // A genuinely broken source isn't worth retrying on the next gesture.
    removeAutoplayGestureListeners();
    console.warn('[phone-player] audio element error', audio.error);
  });
  audio.addEventListener('ended', function(){
    // Natural end-of-track fires 'pause' (which clears isPlaying) *before* 'ended', per
    // the HTML spec's "reaches the end" steps — so goTo()'s normal wasPlaying=isPlaying
    // read would see false here and load the next track without resuming playback.
    // 'ended' firing at all means playback WAS just running, so force it forward.
    goTo(currentIndex + 1, true);
  });

  // ---------------------------------------------------------------- playback control
  function loadTrack(index, autoplayIntent){
    currentIndex = ((index % tracks.length) + tracks.length) % tracks.length;
    var track = tracks[currentIndex];
    hasError = false;
    duration = 0;
    currentTime = 0;
    audio.src = encodeURI(track.audio);
    audio.load();
    loadCover(currentIndex);
    redraw();
    syncA11y();
    announce();
    if (autoplayIntent) play();
  }

  // ---------------------------------------------------- autoplay-on-load / gesture retry
  // playAttemptInFlight is checked synchronously at the top of attemptPlay(), so it's safe
  // to call attemptPlay() from two places that might both react to the *same* user gesture
  // (the deferred autoplay retry below and a normal click on the play button reaching
  // interaction.js's raycaster handler) — whichever runs first "wins" and the other is a
  // no-op, instead of two overlapping audio.play() calls (start-then-immediately-stop).
  var playAttemptInFlight = false;
  var autoplayGestureArmed = false;

  function attemptPlay(isAutoplayAttempt){
    if (playAttemptInFlight) return;
    playAttemptInFlight = true;

    ensureAudioGraph(); // AudioContext is only ever created/resumed from here
    var resumePromise = (audioCtx.state === 'suspended') ? audioCtx.resume().catch(function(){}) : null;

    isLoading = true;
    if (!isAutoplayAttempt) hasError = false;
    redraw();

    var playResult = audio.play();
    var playPromise = (playResult && typeof playResult.then === 'function') ? playResult : Promise.resolve();

    playPromise.then(function(){
      return resumePromise; // best-effort; already caught its own rejection above
    }).then(function(){
      playAttemptInFlight = false;
      isLoading = false;
      if (!audioCtx || audioCtx.state === 'running'){
        isPlaying = true; hasError = false;
        removeAutoplayGestureListeners();
      } else {
        // The <audio> element reports "playing" but its output is routed through a
        // still-suspended AudioContext (createMediaElementSource captures it), so no
        // sound would actually be audible — don't claim isPlaying=true for silence.
        try { audio.pause(); } catch (e){}
        isPlaying = false;
        if (isAutoplayAttempt) armAutoplayGestureListeners();
      }
      redraw(); syncA11y();
    }).catch(function(err){
      playAttemptInFlight = false;
      isLoading = false; isPlaying = false;
      if (isAutoplayAttempt && !hasError){
        // Expected/likely: blocked by autoplay policy, not a real error — no AUDIO ERROR,
        // no alert. Wait for the user's first gesture anywhere on the page.
        console.info('[phone-player] autoplay blocked by the browser; will retry on first user gesture.', err && err.name);
        if (a11y.live) a11y.live.textContent = tracks[currentIndex].title + ' ready. Press play to listen.';
        armAutoplayGestureListeners();
      } else if (!isAutoplayAttempt){
        console.warn('[phone-player] play() rejected:', err);
        hasError = true;
      }
      redraw(); syncA11y();
    });
  }

  function onFirstGesture(){
    removeAutoplayGestureListeners();
    // Deferred so THIS SAME gesture's normal click handling (interaction.js's raycaster
    // hit-test -> togglePlay()/boot(), or a direct click on the a11y play button) runs
    // first. If that already started attemptPlay(), playAttemptInFlight makes this a
    // no-op instead of a second overlapping play() call.
    setTimeout(function(){
      if (!isPlaying && !hasError) attemptPlay(true);
    }, 0);
  }
  function armAutoplayGestureListeners(){
    if (autoplayGestureArmed) return;
    autoplayGestureArmed = true;
    window.addEventListener('pointerdown', onFirstGesture, true);
    window.addEventListener('click', onFirstGesture, true);
    window.addEventListener('keydown', onFirstGesture, true);
  }
  function removeAutoplayGestureListeners(){
    if (!autoplayGestureArmed) return;
    autoplayGestureArmed = false;
    window.removeEventListener('pointerdown', onFirstGesture, true);
    window.removeEventListener('click', onFirstGesture, true);
    window.removeEventListener('keydown', onFirstGesture, true);
  }

  function play(){ attemptPlay(false); }

  function pause(){
    audio.pause();
    isPlaying = false;
    redraw(); syncA11y();
  }

  function togglePlay(){ if (isPlaying) pause(); else play(); }

  function goTo(newIndex, forcePlay){
    var wasPlaying = forcePlay || isPlaying;
    loadTrack(newIndex, wasPlaying);
  }
  function nextTrack(){ goTo(currentIndex + 1); }
  function prevTrack(){ goTo(currentIndex - 1); }

  function seekToFraction(frac){
    if (!isFinite(duration) || duration <= 0) return;
    frac = Math.max(0, Math.min(1, frac));
    var target = frac * duration;
    audio.currentTime = target;
    // Reading audio.currentTime back synchronously can momentarily report a stale value
    // while the browser is still fetching/decoding the seek target, so the immediate UI
    // update below uses the requested target directly — the next 'timeupdate' event
    // reconciles it with the real position once the seek actually completes.
    currentTime = target;
    redraw(); syncA11y();
  }

  // ------------------------------------------------------ visibility / cleanup
  document.addEventListener('visibilitychange', function(){
    if (document.hidden && isPlaying) pause();
  });
  function cleanup(){
    try { audio.pause(); } catch (e){}
    if (audioCtx && audioCtx.state !== 'closed'){
      try { audioCtx.close(); } catch (e){}
    }
    if (waveRafId) cancelAnimationFrame(waveRafId);
    removeAutoplayGestureListeners();
  }
  window.addEventListener('beforeunload', cleanup);
  window.addEventListener('pagehide', cleanup);

  // ---------------------------------------------------------------- canvas redraw
  function redraw(){
    var cov = coverCache[currentIndex] || {};
    playerCanvas.draw({
      track: tracks[currentIndex],
      coverImage: cov.image || null,
      coverFailed: !!cov.failed,
      isPlaying: isPlaying,
      isLoading: isLoading,
      hasError: hasError,
      currentTime: currentTime,
      duration: duration,
      waveform: ctx.reduceMotion ? waveformRestBars : waveformBars,
      loadingPhase: (performance.now() / 600) % 1
    });
    texture.needsUpdate = true;
  }

  // ---------------------------------------------------------------- waveform loop
  // Reuses waveformBars/freqData every frame (no per-frame allocation), throttled to
  // ~25fps independent of the main render loop, and fully static under reduceMotion.
  var lastWaveTick = 0;
  var waveRafId = null;
  function startWaveformLoop(){
    function tick(now){
      waveRafId = requestAnimationFrame(tick);
      if (ctx.reduceMotion) return;
      if (now - lastWaveTick < 40) return;
      lastWaveTick = now;

      if (isPlaying && analyserNode){
        analyserNode.getByteFrequencyData(freqData);
        var bins = freqData.length;
        var perBar = Math.max(1, Math.floor(bins / WAVE_BARS));
        for (var i = 0; i < WAVE_BARS; i++){
          var sum = 0, count = 0;
          for (var j = i * perBar; j < Math.min(bins, (i + 1) * perBar); j++){ sum += freqData[j]; count++; }
          var avg = count ? sum / count / 255 : 0;
          waveformBars[i] += (Math.max(0.06, avg) - waveformBars[i]) * 0.5;
        }
      } else {
        for (var k = 0; k < WAVE_BARS; k++){
          waveformBars[k] += (0.06 - waveformBars[k]) * 0.2;
        }
      }
      redraw();
    }
    waveRafId = requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- UV hit-testing
  // Converts a raycaster hit.uv (native mesh UV, inside uvBounds) into canvas pixel
  // space using the SAME normalization as texture.repeat/offset above, then tests it
  // against the canvas module's own hit regions (which are already padded larger than
  // the drawn icons for touch/click forgiveness).
  function hitTestUV(u, v){
    if (!uvBounds) return null;
    var nu = (u - uvBounds.uMin) / (uvBounds.uMax - uvBounds.uMin);
    var nv = (v - uvBounds.vMin) / (uvBounds.vMax - uvBounds.vMin);
    var cx = nu * playerCanvas.width;
    var cy = nv * playerCanvas.height;
    var regions = playerCanvas.hitRegions();
    function inCircle(pt){ var dx = cx - pt.cx, dy = cy - pt.cy; return dx * dx + dy * dy <= pt.r * pt.r; }
    if (inCircle(regions.prev)) return { type: 'prev' };
    if (inCircle(regions.playPause)) return { type: 'playPause' };
    if (inCircle(regions.next)) return { type: 'next' };
    var pr = regions.progress;
    if (cx >= pr.x - 4 && cx <= pr.x + pr.w + 4 && cy >= pr.y - pr.hitPadding && cy <= pr.y + pr.h + pr.hitPadding){
      return { type: 'seek', fraction: Math.max(0, Math.min(1, (cx - pr.x) / pr.w)) };
    }
    return null;
  }

  // ---------------------------------------------------------------- a11y DOM sync
  function syncA11y(){
    if (a11y.playBtn){
      var label = isPlaying ? 'Pause' : 'Play';
      a11y.playBtn.setAttribute('aria-label', label);
      a11y.playBtn.textContent = label;
    }
    if (a11y.seek && !seekDragging){
      var frac = duration > 0 ? currentTime / duration : 0;
      a11y.seek.value = Math.round(frac * 1000);
    }
  }
  function announce(){
    if (!a11y.live) return;
    var t = tracks[currentIndex];
    a11y.live.textContent = 'Now playing: ' + t.title + ' by ' + t.artist;
  }

  if (a11y.prevBtn) a11y.prevBtn.addEventListener('click', prevTrack);
  if (a11y.nextBtn) a11y.nextBtn.addEventListener('click', nextTrack);
  if (a11y.playBtn) a11y.playBtn.addEventListener('click', togglePlay);
  if (a11y.seek){
    a11y.seek.addEventListener('pointerdown', function(){ seekDragging = true; });
    a11y.seek.addEventListener('input', function(){ seekToFraction(a11y.seek.value / 1000); });
    a11y.seek.addEventListener('change', function(){ seekDragging = false; });
  }

  // ---------------------------------------------------------------- public API
  // Consumed by src/interaction.js: handleScreenHit() on 'click' (after raycasting
  // ctx.phoneHitbox), isSeekUV()/seekAtUV() on pointerdown/pointermove for progress-bar
  // dragging. Never touches ctx.camera or ctx.state.zooming — the phone never zooms.
  ctx.phonePlayer = {
    handleScreenHit: function(uv){
      handleAction(hitTestUV(uv.x, uv.y));
      return true; // the phone screen itself was hit; caller should not also boot()
    },
    isSeekUV: function(uv){
      var a = hitTestUV(uv.x, uv.y);
      return !!(a && a.type === 'seek');
    },
    seekAtUV: function(uv){
      var a = hitTestUV(uv.x, uv.y);
      if (a && a.type === 'seek') seekToFraction(a.fraction);
    },
    prev: prevTrack,
    next: nextTrack,
    togglePlay: togglePlay,
    getState: function(){
      return { index: currentIndex, title: tracks[currentIndex].title, isPlaying: isPlaying, isLoading: isLoading, hasError: hasError, currentTime: currentTime, duration: duration, audioCurrentTime: audio.currentTime, audioDuration: audio.duration, audioPaused: audio.paused, audioReadyState: audio.readyState };
    }
  };

  function handleAction(action){
    if (!action) return;
    if (action.type === 'prev') prevTrack();
    else if (action.type === 'next') nextTrack();
    else if (action.type === 'playPause') togglePlay();
    else if (action.type === 'seek') seekToFraction(action.fraction);
  }
})();
