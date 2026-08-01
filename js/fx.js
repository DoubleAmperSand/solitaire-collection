/*
 * Solitaire Collection — particle effects.
 * One full-screen canvas above the table, drawn in viewport pixels so
 * callers can hand over an element's bounding rect directly.
 */
(function (global) {
  'use strict';

  var canvas, ctx, dpr = 1;
  var particles = [];
  var waves = [];
  var running = false;
  var lastTime = 0;
  var enabled = true;

  var PALETTES = {
    gold: ['#fff2cf', '#ffd77a', '#f5b243', '#e08a2b'],
    mint: ['#e6fff4', '#8ef0c4', '#3fd39a', '#1aa877'],
    rose: ['#ffe8ee', '#ffa8bd', '#f5738f', '#e04d70'],
    sky: ['#e8f4ff', '#a6d4ff', '#5aa6f5', '#2f78d6'],
    confetti: ['#ffd77a', '#8ef0c4', '#ff9db4', '#8fb8ff', '#c9a6ff', '#ffffff']
  };

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    resize();
    global.addEventListener('resize', resize, { passive: true });
    start();
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(global.innerWidth * dpr);
    canvas.height = Math.floor(global.innerHeight * dpr);
    canvas.style.width = global.innerWidth + 'px';
    canvas.style.height = global.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function start() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(tick);
  }

  function tick(now) {
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    ctx.clearRect(0, 0, global.innerWidth, global.innerHeight);
    updateWaves(dt);
    updateParticles(dt);
    requestAnimationFrame(tick);
  }

  function updateParticles(dt) {
    if (!particles.length) return;
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.vx *= (1 - p.drag * dt);
      p.vy *= (1 - p.drag * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;

      var t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, Math.min(1, t * 1.4));
      ctx.fillStyle = p.colour;

      if (p.shape === 'chip') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // a flat rectangle spinning in 3D reads as a falling card
        var w = p.size, h = p.size * 1.5 * Math.abs(Math.cos(p.rot * 1.7));
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.35 + t * 0.65), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function updateWaves(dt) {
    if (!waves.length) return;
    for (var i = waves.length - 1; i >= 0; i--) {
      var w = waves[i];
      w.life -= dt;
      if (w.life <= 0) { waves.splice(i, 1); continue; }
      var t = 1 - w.life / w.maxLife;
      ctx.globalAlpha = (1 - t) * w.alpha;
      ctx.lineWidth = w.width * (1 - t * 0.6);
      ctx.strokeStyle = w.colour;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.from + (w.to - w.from) * (1 - Math.pow(1 - t, 3)), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ------------------------------------------------------------ emitters */

  function burst(x, y, opts) {
    if (!enabled) return;
    opts = opts || {};
    var palette = PALETTES[opts.palette || 'gold'];
    for (var i = 0; i < (opts.count || 18); i++) {
      var angle = opts.angle !== undefined ? opts.angle + rand(-0.6, 0.6) : rand(0, Math.PI * 2);
      var speed = rand(opts.minSpeed || 60, opts.maxSpeed || 300);
      var life = rand(0.35, 0.85);
      particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        gravity: opts.gravity === undefined ? 420 : opts.gravity,
        drag: opts.drag === undefined ? 1.4 : opts.drag,
        size: rand(1.6, 3.8),
        colour: opts.colour || pick(palette),
        life: life, maxLife: life,
        rot: rand(0, 6.3), spin: rand(-8, 8),
        shape: opts.shape || 'spark'
      });
    }
  }

  function shockwave(x, y, opts) {
    if (!enabled) return;
    opts = opts || {};
    waves.push({
      x: x, y: y,
      from: opts.from || 4, to: opts.to || 90,
      life: opts.life || 0.45, maxLife: opts.life || 0.45,
      width: opts.width || 3, alpha: opts.alpha || 0.7,
      colour: opts.colour || '#ffd77a'
    });
  }

  /** The win celebration: cards raining from the top of the screen. */
  function celebrate(duration) {
    if (!enabled) return;
    var end = performance.now() + (duration || 2600);
    (function drop() {
      if (performance.now() > end) return;
      for (var i = 0; i < 5; i++) {
        var life = rand(1.8, 3.4);
        particles.push({
          x: rand(0, global.innerWidth),
          y: -20,
          vx: rand(-70, 70), vy: rand(60, 190),
          gravity: 120, drag: 0.1,
          size: rand(7, 14),
          colour: pick(PALETTES.confetti),
          life: life, maxLife: life,
          rot: rand(0, 6.3), spin: rand(-7, 7),
          shape: 'chip'
        });
      }
      setTimeout(drop, 70);
    })();
  }

  var shakeTimer = null;
  function shake(el, intensity, duration) {
    if (!enabled || !el) return;
    el.style.setProperty('--shake-power', (intensity || 4) + 'px');
    el.classList.remove('is-shaking');
    void el.offsetWidth;
    el.classList.add('is-shaking');
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(function () { el.classList.remove('is-shaking'); }, duration || 340);
  }

  function centreOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
  }

  function clear() { particles.length = 0; waves.length = 0; }
  function setEnabled(v) { enabled = v; if (!v) clear(); }

  global.SC.FX = {
    init: init, burst: burst, shockwave: shockwave, celebrate: celebrate,
    shake: shake, centreOf: centreOf, clear: clear, setEnabled: setEnabled,
    PALETTES: PALETTES
  };
})(typeof window !== 'undefined' ? window : self);
