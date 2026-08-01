/*
 * Solitaire Collection — synthesised sound.
 * Generated with the Web Audio API, so there are no audio files to ship.
 */
(function (global) {
  'use strict';

  var ctx = null, master = null, enabled = true;

  function ensure() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function tone(opts) {
    var c = ensure();
    if (!c || !enabled) return;
    var t0 = c.currentTime + (opts.delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + opts.dur);
    var peak = opts.gain === undefined ? 0.16 : opts.gain;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + (opts.attack || 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(gain); gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  function noise(opts) {
    var c = ensure();
    if (!c || !enabled) return;
    var t0 = c.currentTime + (opts.delay || 0);
    var dur = opts.dur || 0.2;
    var frames = Math.max(1, Math.floor(c.sampleRate * dur));
    var buffer = c.createBuffer(1, frames, c.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, opts.decay || 2.4);
    }
    var src = c.createBufferSource();
    src.buffer = buffer;
    var filter = c.createBiquadFilter();
    filter.type = opts.filterType || 'bandpass';
    filter.frequency.setValueAtTime(opts.freq || 1600, t0);
    if (opts.slideTo) filter.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    filter.Q.value = opts.q === undefined ? 0.9 : opts.q;
    var gain = c.createGain();
    gain.gain.setValueAtTime(opts.gain === undefined ? 0.2 : opts.gain, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter); filter.connect(gain); gain.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  var SFX = {
    lift: function () {
      noise({ dur: 0.07, freq: 2200, gain: 0.05, decay: 3 });
    },
    place: function () {
      noise({ dur: 0.11, freq: 1100, slideTo: 380, gain: 0.16, decay: 3.2 });
      tone({ freq: 180, slideTo: 92, dur: 0.1, type: 'triangle', gain: 0.1 });
    },
    flip: function () {
      noise({ dur: 0.13, freq: 900, slideTo: 2600, gain: 0.1, q: 0.6, decay: 2 });
    },
    draw: function () {
      noise({ dur: 0.16, freq: 700, slideTo: 1900, gain: 0.11, q: 0.5, decay: 2.2 });
    },
    shuffle: function () {
      for (var i = 0; i < 7; i++) {
        noise({ dur: 0.09, freq: 800 + Math.random() * 1600, gain: 0.06, delay: i * 0.045, decay: 3 });
      }
    },
    foundation: function (step) {
      var base = 523.25 * Math.pow(1.0595, Math.min(step || 0, 12));
      tone({ freq: base, dur: 0.26, type: 'triangle', gain: 0.13 });
      tone({ freq: base * 2, dur: 0.2, type: 'sine', gain: 0.05, delay: 0.03 });
    },
    match: function (step) {
      var base = 440 * Math.pow(1.06, Math.min(step || 0, 14));
      tone({ freq: base, dur: 0.2, type: 'sine', gain: 0.12 });
      tone({ freq: base * 1.5, dur: 0.22, type: 'sine', gain: 0.06, delay: 0.04 });
    },
    sequence: function () {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        tone({ freq: f, dur: 0.5, type: 'triangle', gain: 0.14, delay: i * 0.08 });
      });
    },
    deny: function () {
      tone({ freq: 200, slideTo: 130, dur: 0.16, type: 'square', gain: 0.07 });
    },
    undo: function () {
      tone({ freq: 420, slideTo: 240, dur: 0.18, type: 'triangle', gain: 0.09 });
    },
    hint: function () {
      tone({ freq: 880, dur: 0.14, type: 'sine', gain: 0.08 });
      tone({ freq: 1320, dur: 0.16, type: 'sine', gain: 0.05, delay: 0.07 });
    },
    win: function () {
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach(function (f, i) {
        tone({ freq: f, dur: 0.8, type: 'triangle', gain: 0.15, delay: i * 0.1 });
        tone({ freq: f / 2, dur: 0.85, type: 'sine', gain: 0.08, delay: i * 0.1 });
      });
    },
    stuck: function () {
      [392, 330, 262].forEach(function (f, i) {
        tone({ freq: f, dur: 0.6, type: 'sawtooth', gain: 0.07, delay: i * 0.14 });
      });
    },
    tap: function () {
      tone({ freq: 760, dur: 0.06, type: 'sine', gain: 0.05 });
    }
  };

  function play(name, arg) {
    if (!enabled) return;
    var fn = SFX[name];
    if (fn) { try { fn(arg); } catch (e) { /* audio is best-effort */ } }
  }

  global.SC.Sound = {
    play: play, unlock: unlock,
    setEnabled: function (v) { enabled = v; if (v) unlock(); },
    isEnabled: function () { return enabled; }
  };
})(typeof window !== 'undefined' ? window : self);
