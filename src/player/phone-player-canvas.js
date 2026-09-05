// Pure canvas-drawing module for the 3D phone screen. Owns only the 2D canvas —
// no Audio/AudioContext/Three.js references live here, so this file can be unit-eyeballed
// via the standalone test harness without any audio graph running.
// Visual reference: https://codepen.io/sandrotonal/pen/019fcef0-c198-7847-a00b-22df18830a31
// (layout/interaction idea only — no code, copy, fonts, images or audio from that pen
// were reused; palette/typography instead pulled from this project's own
// styles/intro.css and styles/desktop.css custom properties).
(function(){
  window.__phonePlayerCanvasModule = {
    create: create
  };

  function create(w, h){
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var c = canvas.getContext('2d');

    // layout constants (canvas-space px), tuned for a 512x1024 portrait screen
    var PAD = 40;
    var COVER_SIZE = w - PAD * 2;
    var COVER_Y = 92;
    var TITLE_Y = COVER_Y + COVER_SIZE + 56;
    var ARTIST_Y = TITLE_Y + 34;
    var WAVE_Y = ARTIST_Y + 56;
    var WAVE_H = 110;
    var PROGRESS_Y = WAVE_Y + WAVE_H + 46;
    var TIME_Y = PROGRESS_Y + 26;
    var CONTROLS_Y = TIME_Y + 88;

    var COLOR_BG_TOP = '#1c1a2e';
    var COLOR_BG_BOTTOM = '#2c1f38';
    var COLOR_INK = '#e9e6dc';
    var COLOR_MUTED = '#9b93ab';
    var COLOR_CYAN = '#5fd6c2';
    var COLOR_CORAL = '#d9713a';

    function roundRect(ctx2d, x, y, width, height, r){
      ctx2d.beginPath();
      ctx2d.moveTo(x + r, y);
      ctx2d.arcTo(x + width, y, x + width, y + height, r);
      ctx2d.arcTo(x + width, y + height, x, y + height, r);
      ctx2d.arcTo(x, y + height, x, y, r);
      ctx2d.arcTo(x, y, x + width, y, r);
      ctx2d.closePath();
    }

    function truncateToWidth(ctx2d, text, maxWidth){
      if (ctx2d.measureText(text).width <= maxWidth) return text;
      var t = text;
      while (t.length > 1 && ctx2d.measureText(t + '…').width > maxWidth){
        t = t.slice(0, -1);
      }
      return t + '…';
    }

    function formatTime(sec){
      if (!isFinite(sec) || sec < 0) sec = 0;
      var m = Math.floor(sec / 60);
      var s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function drawBackground(){
      var grad = c.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, COLOR_BG_TOP);
      grad.addColorStop(1, COLOR_BG_BOTTOM);
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
    }

    function drawHeader(){
      c.fillStyle = COLOR_MUTED;
      c.font = '600 18px "IBM Plex Mono", monospace';
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      var label = 'NOW PLAYING';
      var spaced = label.split('').join('  ');
      c.fillText(spaced, w / 2, 46);
    }

    function drawCoverPlaceholder(x, y, size){
      var grad = c.createLinearGradient(x, y, x + size, y + size);
      grad.addColorStop(0, COLOR_CYAN);
      grad.addColorStop(1, COLOR_CORAL);
      c.fillStyle = grad;
      roundRect(c, x, y, size, size, 20);
      c.fill();
      c.fillStyle = 'rgba(10,10,20,0.35)';
      c.font = '700 20px "Space Grotesk", sans-serif';
      c.textAlign = 'center';
      c.fillText('NO COVER', x + size / 2, y + size / 2 + 8);
    }

    function drawCover(state){
      var x = PAD, y = COVER_Y, size = COVER_SIZE;
      c.save();
      roundRect(c, x, y, size, size, 20);
      c.clip();
      if (state.coverImage && !state.coverFailed){
        c.drawImage(state.coverImage, x, y, size, size);
      } else {
        drawCoverPlaceholder(x, y, size);
      }
      c.restore();
      c.strokeStyle = 'rgba(255,255,255,0.08)';
      c.lineWidth = 1;
      roundRect(c, x + 0.5, y + 0.5, size - 1, size - 1, 20);
      c.stroke();
    }

    function drawText(state){
      c.textAlign = 'center';
      c.fillStyle = COLOR_INK;
      c.font = '700 30px "Space Grotesk", sans-serif';
      var title = state.track ? state.track.title : '';
      c.fillText(truncateToWidth(c, title, w - PAD * 2), w / 2, TITLE_Y);

      c.fillStyle = COLOR_MUTED;
      c.font = '500 20px "Space Grotesk", sans-serif';
      var artist = state.track ? state.track.artist : '';
      c.fillText(truncateToWidth(c, artist, w - PAD * 2), w / 2, ARTIST_Y);
    }

    function drawWaveform(state){
      var bars = state.waveform || [];
      var n = bars.length;
      if (!n) return;
      var innerW = w - PAD * 2;
      var gap = 6;
      var barW = (innerW - gap * (n - 1)) / n;
      var midY = WAVE_Y + WAVE_H / 2;
      for (var i = 0; i < n; i++){
        var amp = Math.max(0.06, Math.min(1, bars[i]));
        var barH = amp * WAVE_H;
        var x = PAD + i * (barW + gap);
        var y = midY - barH / 2;
        c.fillStyle = state.isPlaying ? COLOR_CYAN : 'rgba(155,147,171,0.55)';
        roundRect(c, x, y, barW, barH, Math.min(barW, barH) / 2);
        c.fill();
      }
    }

    function drawProgress(state){
      var x = PAD, y = PROGRESS_Y, trackW = w - PAD * 2, trackH = 6;
      c.fillStyle = 'rgba(255,255,255,0.12)';
      roundRect(c, x, y, trackW, trackH, trackH / 2);
      c.fill();

      var dur = state.duration > 0 ? state.duration : 0;
      var frac = dur > 0 ? Math.max(0, Math.min(1, state.currentTime / dur)) : 0;
      if (frac > 0){
        c.fillStyle = COLOR_CYAN;
        roundRect(c, x, y, Math.max(trackH, trackW * frac), trackH, trackH / 2);
        c.fill();
      }
      // scrubber knob — also marks the visual center of the seek hit-area
      var knobX = x + trackW * frac;
      c.beginPath();
      c.arc(knobX, y + trackH / 2, 10, 0, Math.PI * 2);
      c.fillStyle = COLOR_INK;
      c.fill();

      c.font = '500 16px "IBM Plex Mono", monospace';
      c.fillStyle = COLOR_MUTED;
      c.textAlign = 'left';
      c.fillText(formatTime(state.currentTime), x, TIME_Y);
      c.textAlign = 'right';
      c.fillText(formatTime(state.duration), x + trackW, TIME_Y);
    }

    function drawPrevNextIcon(cx, cy, dir){
      var s = 14;
      c.beginPath();
      if (dir < 0){
        c.moveTo(cx + s * 0.5, cy - s);
        c.lineTo(cx - s * 0.5, cy);
        c.lineTo(cx + s * 0.5, cy + s);
      } else {
        c.moveTo(cx - s * 0.5, cy - s);
        c.lineTo(cx + s * 0.5, cy);
        c.lineTo(cx - s * 0.5, cy + s);
      }
      c.closePath();
      c.fillStyle = COLOR_INK;
      c.fill();
      // bar next to the triangle, matching a standard prev/next glyph
      c.fillRect(dir < 0 ? cx - s * 0.5 - 5 : cx + s * 0.5 + 1, cy - s, 4, s * 2);
    }

    function drawPlayPauseIcon(cx, cy, isPlaying){
      c.fillStyle = '#1c1a2e';
      if (isPlaying){
        c.fillRect(cx - 12, cy - 16, 8, 32);
        c.fillRect(cx + 4, cy - 16, 8, 32);
      } else {
        c.beginPath();
        c.moveTo(cx - 10, cy - 16);
        c.lineTo(cx + 16, cy);
        c.lineTo(cx - 10, cy + 16);
        c.closePath();
        c.fill();
      }
    }

    function drawControls(state){
      var cy = CONTROLS_Y;
      var prevX = w * 0.28, playX = w * 0.5, nextX = w * 0.72;

      c.beginPath();
      c.arc(prevX, cy, 34, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.fill();
      drawPrevNextIcon(prevX, cy, -1);

      c.beginPath();
      c.arc(playX, cy, 46, 0, Math.PI * 2);
      c.fillStyle = COLOR_CYAN;
      c.fill();
      if (state.isLoading){
        c.strokeStyle = '#1c1a2e';
        c.lineWidth = 4;
        c.beginPath();
        var spin = (state.loadingPhase || 0) * Math.PI * 2;
        c.arc(playX, cy, 22, spin, spin + Math.PI * 1.2);
        c.stroke();
      } else {
        drawPlayPauseIcon(playX, cy, state.isPlaying);
      }

      c.beginPath();
      c.arc(nextX, cy, 34, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.fill();
      drawPrevNextIcon(nextX, cy, 1);
    }

    function drawStatus(state){
      if (!state.hasError && !state.isLoading) return;
      c.font = '600 15px "IBM Plex Mono", monospace';
      c.textAlign = 'center';
      var y = CONTROLS_Y + 74;
      if (state.hasError){
        c.fillStyle = COLOR_CORAL;
        c.fillText('AUDIO ERROR', w / 2, y);
      } else if (state.isLoading){
        c.fillStyle = COLOR_MUTED;
        c.fillText('LOADING', w / 2, y);
      }
    }

    function draw(state){
      drawBackground();
      drawHeader();
      drawCover(state);
      drawText(state);
      drawWaveform(state);
      drawProgress(state);
      drawControls(state);
      drawStatus(state);
    }

    // Exposes the pixel-space hit regions so phone-player.js can convert a normalized
    // canvas-space (0..1,0..1) hit point into "which control was hit" without this
    // module needing to know anything about UV/raycasting.
    function hitRegions(){
      var cy = CONTROLS_Y;
      return {
        prev: { cx: 512 === w ? w * 0.28 : w * 0.28, cy: cy, r: 44 },
        playPause: { cx: w * 0.5, cy: cy, r: 56 },
        next: { cx: w * 0.72, cy: cy, r: 44 },
        progress: { x: PAD, y: PROGRESS_Y, w: w - PAD * 2, h: 6, hitPadding: 26 }
      };
    }

    return {
      canvas: canvas,
      ctx: c,
      draw: draw,
      hitRegions: hitRegions,
      width: w,
      height: h
    };
  }
})();
