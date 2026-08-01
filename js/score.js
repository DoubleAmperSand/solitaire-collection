/*
 * Solitaire Collection — scoring, streaks and persisted high scores.
 *
 * Progress pays, hesitation costs. Chaining productive moves builds a
 * multiplier; undoing, recycling the deck or asking for help breaks it.
 */
(function (global) {
  'use strict';

  var STORE_KEY = 'solitaire-collection.scores.v1';
  var PREFS_KEY = 'solitaire-collection.prefs.v1';

  var POINTS = {
    foundation: 50,     // a card sent home
    sequence: 500,      // a complete Spider run
    match: 60,          // a Pyramid pair
    king: 40,           // a lone Pyramid king
    reveal: 25,         // a face-down card turned over
    fromWaste: 15,      // waste into play
    takeBack: -30,      // pulling a card back off a foundation
    recycle: -40,
    undo: -25,
    hint: -50
  };

  var WIN_BASE = 1500;
  var RANKS = [
    { min: 0, title: 'Beginner' },
    { min: 1500, title: 'Player' },
    { min: 4000, title: 'Card Sharp' },
    { min: 8000, title: 'Strategist' },
    { min: 14000, title: 'High Roller' },
    { min: 22000, title: 'Grandmaster' }
  ];

  function Score(multiplier) {
    this.reset(multiplier);
  }

  Score.prototype.reset = function (multiplier) {
    this.multiplier = multiplier || 1;
    this.total = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.moves = 0;
    this.foundations = 0;
    this.undos = 0;
    this.hints = 0;
    this.startedAt = Date.now();
    this.finishedAt = null;
    return this;
  };

  Score.prototype.combo = function () {
    return Math.min(1 + Math.max(0, this.streak - 1) * 0.25, 3);
  };

  Score.prototype.award = function (points, label) {
    points = Math.round(points);
    if (!points) return null;
    this.total = Math.max(0, this.total + points);
    return { points: points, label: label, total: this.total };
  };

  /**
   * Convert a move's events into score changes.
   * Returns the awards so the UI can float them over the table.
   */
  Score.prototype.applyEvents = function (events) {
    var awards = [];
    var progressed = false;
    var broke = false;

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      switch (ev.type) {
        case 'foundation':
          this.foundations += ev.cards.length;
          progressed = true;
          awards.push(this.scoreProgress(POINTS.foundation * ev.cards.length, 'Foundation'));
          break;
        case 'sequence':
          progressed = true;
          awards.push(this.scoreProgress(POINTS.sequence, 'Run complete!'));
          break;
        case 'match':
          progressed = true;
          awards.push(this.scoreProgress(ev.king ? POINTS.king : POINTS.match, ev.king ? 'King' : 'Thirteen'));
          break;
        case 'reveal':
          progressed = true;
          awards.push(this.scoreProgress(POINTS.reveal, 'Revealed'));
          break;
        case 'move':
          if (ev.from.type === 'waste' && ev.to.type === 'tableau') {
            progressed = true;
            awards.push(this.scoreProgress(POINTS.fromWaste, 'Into play'));
          } else if (ev.from.type === 'foundation') {
            broke = true;
            awards.push(this.award(POINTS.takeBack, 'Taken back'));
          }
          break;
        case 'recycle':
          broke = true;
          awards.push(this.award(POINTS.recycle * this.multiplier, 'Redeal'));
          break;
        default:
          break;
      }
    }

    if (broke || (!progressed && this.streak)) this.streak = 0;
    return awards.filter(Boolean);
  };

  Score.prototype.scoreProgress = function (base, label) {
    this.streak++;
    if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    return this.award(base * this.multiplier * this.combo(), label);
  };

  Score.prototype.onUndo = function () {
    this.undos++;
    this.streak = 0;
    return this.award(POINTS.undo, 'Undo');
  };

  Score.prototype.onHint = function () {
    this.hints++;
    this.streak = 0;
    return this.award(POINTS.hint, 'Hint');
  };

  Score.prototype.onWin = function () {
    this.finishedAt = Date.now();
    var awards = [];
    awards.push(this.award(WIN_BASE * this.multiplier, 'Solved!'));

    var seconds = this.elapsed();
    var speed = Math.max(0, 1200 - seconds * 2) * this.multiplier;
    if (speed > 0) awards.push(this.award(speed, 'Quick finish'));

    var tidy = Math.max(0, 900 - this.moves * 3) * this.multiplier;
    if (tidy > 0) awards.push(this.award(tidy, 'Efficient'));

    if (!this.undos && !this.hints) {
      awards.push(this.award(800 * this.multiplier, 'Unaided'));
    }
    return awards.filter(Boolean);
  };

  Score.prototype.elapsed = function () {
    return Math.floor(((this.finishedAt || Date.now()) - this.startedAt) / 1000);
  };

  Score.prototype.rank = function () {
    var title = RANKS[0].title;
    for (var i = 0; i < RANKS.length; i++) if (this.total >= RANKS[i].min) title = RANKS[i].title;
    return title;
  };

  /* --------------------------------------------------------- persistence */

  function readJSON(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  function key(variantId, difficultyId) { return variantId + ':' + difficultyId; }

  function highScores(variantId, difficultyId) {
    var all = readJSON(STORE_KEY, {});
    return (all[key(variantId, difficultyId)] || []).slice(0, 5);
  }

  function bestScore(variantId, difficultyId) {
    var list = highScores(variantId, difficultyId);
    return list.length ? list[0].score : 0;
  }

  /** Best across every difficulty of one game — shown on the game cards. */
  function bestForVariant(variantId, difficulties) {
    var best = 0;
    for (var i = 0; i < difficulties.length; i++) {
      best = Math.max(best, bestScore(variantId, difficulties[i].id));
    }
    return best;
  }

  function submitScore(variantId, difficultyId, entry) {
    var all = readJSON(STORE_KEY, {});
    var k = key(variantId, difficultyId);
    var list = all[k] || [];
    list.push(entry);
    list.sort(function (a, b) { return b.score - a.score; });
    all[k] = list.slice(0, 5);
    writeJSON(STORE_KEY, all);
    return all[k].indexOf(entry);
  }

  function wins(variantId, difficulties) {
    var count = 0;
    for (var i = 0; i < difficulties.length; i++) {
      count += highScores(variantId, difficulties[i].id).filter(function (s) {
        return s.won;
      }).length;
    }
    return count;
  }

  global.SC.Score = {
    Score: Score, POINTS: POINTS, RANKS: RANKS,
    highScores: highScores, bestScore: bestScore, bestForVariant: bestForVariant,
    submitScore: submitScore, wins: wins,
    loadPrefs: function () { return readJSON(PREFS_KEY, {}); },
    savePrefs: function (p) { writeJSON(PREFS_KEY, p); }
  };
})(typeof window !== 'undefined' ? window : self);
