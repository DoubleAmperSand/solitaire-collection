/*
 * Solitaire Collection — application shell.
 * Screens, game flow, scoring glue, settings and persistence.
 */
(function (global) {
  'use strict';

  var Cards = global.SC.Cards;
  var Game = global.SC.Game;
  var View = global.SC.View;
  var FX = global.SC.FX;
  var Snd = global.SC.Sound;
  var ScoreLib = global.SC.Score;
  var Variants = global.SC.Variants;

  var ORDER = ['klondike', 'spider', 'freecell', 'pyramid'];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var App = {
    variant: null,
    table: null,
    score: null,
    pendingVariant: null,
    timerId: null,
    finishing: false,
    prefs: { theme: 'auto', sound: true, effects: true }
  };

  var el = {};

  function cache() {
    el.home = $('#home');
    el.game = $('#game');
    el.games = $('#gameGrid');
    el.tableRoot = $('#table');
    el.tableWrap = $('#tableWrap');
    el.floats = $('#floats');
    el.scoreValue = $('#scoreValue');
    el.comboChip = $('#comboChip');
    el.comboValue = $('#comboValue');
    el.timeValue = $('#timeValue');
    el.gameTitle = $('#gameTitle');
    el.gameStatus = $('#gameStatus');
    el.dealLabel = $('#dealLabel');
    el.btnUndo = $('#btnUndo');
    el.btnAuto = $('#btnAuto');
  }

  /* ---------------------------------------------------------------- theme */

  function applyTheme() {
    var root = document.documentElement;
    if (App.prefs.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', App.prefs.theme);
    $$('.seg-btn[data-theme]').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.theme === App.prefs.theme);
      b.setAttribute('aria-pressed', String(b.dataset.theme === App.prefs.theme));
    });
  }

  function applyPrefs() {
    applyTheme();
    Snd.setEnabled(App.prefs.sound);
    FX.setEnabled(App.prefs.effects);
    var s = $('#optSound'), e2 = $('#optEffects');
    if (s) s.checked = App.prefs.sound;
    if (e2) e2.checked = App.prefs.effects;
    var btn = $('#btnSound');
    if (btn) {
      btn.classList.toggle('is-off', !App.prefs.sound);
      btn.setAttribute('aria-pressed', String(App.prefs.sound));
    }
    ScoreLib.savePrefs(App.prefs);
  }

  /* ----------------------------------------------------------------- home */

  function renderHome() {
    el.games.innerHTML = '';
    ORDER.forEach(function (id) {
      var variant = Variants[id];
      var best = ScoreLib.bestForVariant(id, variant.difficulties);
      var won = ScoreLib.wins(id, variant.difficulties);
      var card = document.createElement('button');
      card.className = 'game-card game-' + id;
      card.innerHTML =
        '<span class="game-art" aria-hidden="true">' + gameArt(id) + '</span>' +
        '<span class="game-body">' +
        '<span class="game-name">' + variant.name + '</span>' +
        '<span class="game-blurb">' + variant.blurb + '</span>' +
        '<span class="game-stats">' +
        '<span>' + (best ? best.toLocaleString() : '—') + '<em>best</em></span>' +
        '<span>' + won + '<em>' + (won === 1 ? 'win' : 'wins') + '</em></span>' +
        '<span>' + variant.difficulties.length + '<em>levels</em></span>' +
        '</span>' +
        '</span>';
      card.addEventListener('click', function () { openDifficulty(id); });
      el.games.appendChild(card);
    });
  }

  /* Miniature card fans, drawn per game so each tile reads differently. */
  function gameArt(id) {
    var art = {
      klondike: [['A', '♠', 0], ['K', '♥', 1], ['Q', '♣', 2]],
      spider: [['K', '♠', 0], ['Q', '♠', 1], ['J', '♠', 2]],
      freecell: [['7', '♦', 0], ['6', '♣', 1], ['5', '♥', 2]],
      pyramid: [['9', '♥', 0], ['4', '♠', 1], ['K', '♦', 2]]
    }[id];
    return art.map(function (c, i) {
      return '<span class="mini ' + (c[1] === '♥' || c[1] === '♦' ? 'red' : 'black') +
        '" style="--i:' + i + '"><b>' + c[0] + '</b><i>' + c[1] + '</i></span>';
    }).join('');
  }

  function openDifficulty(variantId) {
    App.pendingVariant = variantId;
    var variant = Variants[variantId];
    $('#difficultyTitle').textContent = variant.name;
    $('#difficultySub').textContent = variant.blurb;
    var list = $('#difficultyList');
    list.innerHTML = '';
    variant.difficulties.forEach(function (d) {
      var best = ScoreLib.bestScore(variantId, d.id);
      var btn = document.createElement('button');
      btn.className = 'level-card';
      btn.innerHTML =
        '<span class="level-name">' + d.name + '</span>' +
        '<span class="level-blurb">' + d.blurb + '</span>' +
        '<span class="level-foot"><em>×' + d.multiplier + ' score</em>' +
        '<em>' + (best ? 'best ' + best.toLocaleString() : 'no score yet') + '</em></span>';
      btn.addEventListener('click', function () {
        closeModal('#difficultyModal');
        startGame(variantId, d.id);
      });
      list.appendChild(btn);
    });
    openModal('#difficultyModal');
  }

  /* ----------------------------------------------------------------- game */

  function startGame(variantId, difficultyId, seed) {
    App.variant = Variants[variantId];
    App.table = new Game.Table(App.variant, difficultyId, seed || Cards.randomSeed());
    App.score = new ScoreLib.Score(App.table.difficulty.multiplier);
    App.finishing = false;

    showScreen('game');
    el.gameTitle.textContent = App.variant.name;
    el.dealLabel.textContent = 'Deal #' + App.table.seed + ' · ' + App.table.difficulty.name;

    View.setTable(App.table);
    View.setLocked(false);
    View.dealIn();
    Snd.play('shuffle');

    updateHud();
    startTimer();
  }

  function showScreen(name) {
    el.home.hidden = name !== 'home';
    el.game.hidden = name !== 'game';
    document.body.dataset.screen = name;
    if (name === 'home') {
      stopTimer();
      renderHome();
    } else {
      // the table needs a real width before it can lay itself out
      requestAnimationFrame(function () { View.layout(); View.sync(false); });
    }
  }

  function startTimer() {
    stopTimer();
    App.timerId = setInterval(function () {
      if (!App.score || App.table.won) return;
      el.timeValue.textContent = formatTime(App.score.elapsed());
    }, 1000);
    el.timeValue.textContent = '0:00';
  }
  function stopTimer() {
    if (App.timerId) clearInterval(App.timerId);
    App.timerId = null;
  }

  function formatTime(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ------------------------------------------------------------- HUD/glue */

  function updateHud() {
    if (!App.score) return;
    el.scoreValue.textContent = App.score.total.toLocaleString();
    var combo = App.score.combo();
    el.comboValue.textContent = '×' + (Math.round(combo * 100) / 100);
    el.comboChip.classList.toggle('is-hot', App.score.streak >= 2);
    el.gameStatus.textContent = App.variant.status ? App.variant.status(App.table) : '';
    el.btnUndo.disabled = !App.table.canUndo();
    var canAuto = App.table.canAutoFinish();
    el.btnAuto.hidden = !canAuto;
  }

  function pileCentre(pile) {
    var pos = View.pilePosition(pile);
    var m = View.metrics;
    return { x: pos.x + m.cardW / 2, y: pos.y + View.fanExtent(pile) + m.cardH / 2 };
  }

  function floatAt(pile, text, kind) {
    if (!pile) return;
    var c = pileCentre(pile);
    var node = document.createElement('div');
    node.className = 'float-text ' + (kind || '');
    node.textContent = text;
    node.style.left = c.x + 'px';
    node.style.top = c.y + 'px';
    el.floats.appendChild(node);
    setTimeout(function () { node.remove(); }, 1300);
  }

  function viewportCentre(pile) {
    var rect = el.tableRoot.getBoundingClientRect();
    var c = pileCentre(pile);
    return { x: rect.left + c.x, y: rect.top + c.y };
  }

  /** Turn a move's events into score, sound and sparkle. */
  function handleEvents(events) {
    if (!events || !events.length) return;
    var awards = App.score.applyEvents(events);
    var anchor = null;

    events.forEach(function (ev) {
      switch (ev.type) {
        case 'foundation':
          anchor = ev.pile;
          Snd.play('foundation', ev.pile.cards.length);
          var c = viewportCentre(ev.pile);
          FX.burst(c.x, c.y, { palette: 'gold', count: 16 });
          FX.shockwave(c.x, c.y, { to: View.metrics.cardW, colour: '#ffd77a' });
          break;
        case 'sequence':
          anchor = ev.pile;
          Snd.play('sequence');
          var s = viewportCentre(ev.pile);
          FX.burst(s.x, s.y, { palette: 'mint', count: 40, maxSpeed: 460 });
          FX.shockwave(s.x, s.y, { to: View.metrics.cardW * 3, width: 5, colour: '#3fd39a' });
          break;
        case 'match':
          anchor = ev.pile || anchor;
          Snd.play('match', App.score.streak);
          if (ev.pile) {
            var mc = viewportCentre(ev.pile);
            FX.burst(mc.x, mc.y, { palette: 'sky', count: 18 });
          }
          break;
        case 'reveal':
          anchor = anchor || ev.pile;
          Snd.play('flip');
          break;
        case 'move':
          anchor = anchor || ev.to;
          Snd.play('place');
          break;
        case 'draw':
          Snd.play('draw');
          break;
        case 'recycle':
          Snd.play('shuffle');
          break;
        case 'blocked':
          Snd.play('deny');
          toast(ev.reason);
          break;
        default:
          break;
      }
    });

    var total = awards.reduce(function (n, a) { return n + a.points; }, 0);
    if (total && anchor) {
      floatAt(anchor, (total > 0 ? '+' : '') + total, total > 0 ? 'gain' : 'loss');
    }
    if (App.score.streak >= 3 && total > 0) {
      floatAt(anchor, 'Streak ×' + (Math.round(App.score.combo() * 100) / 100), 'combo');
    }
  }

  function toast(message) {
    var node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    $('#toasts').appendChild(node);
    setTimeout(function () { node.classList.add('is-out'); }, 1600);
    setTimeout(function () { node.remove(); }, 2100);
  }

  /* -------------------------------------------------------------- actions */

  function tryMove(fromId, index, toId) {
    if (App.table.won) return;
    var result = App.table.move(fromId, index, toId);
    if (!result.ok) {
      Snd.play('deny');
      View.flashInvalid(toId);
      return;
    }
    View.sync(true);
    handleEvents(result.events);
    updateHud();
    afterAction(result.events);
  }

  function tapStock() {
    if (App.table.won) return;
    var result = App.table.stockAction();
    if (!result.ok) {
      handleEvents(result.events);
      if (!result.events || !result.events.length) Snd.play('deny');
      updateHud();
      return;
    }
    View.sync(true);
    handleEvents(result.events);
    updateHud();
    afterAction(result.events);
  }

  function afterAction(events) {
    var won = events && events.some(function (e) { return e.type === 'win'; });
    if (won) return finishGame();
    if (App.table.isStuck()) return showStuck();
  }

  function undo() {
    if (!App.table.canUndo() || App.table.won) return;
    App.table.undo();
    App.score.onUndo();
    Snd.play('undo');
    View.clearSelection();
    View.sync(true);
    updateHud();
  }

  function hint() {
    if (App.table.won) return;
    var move = App.table.hint();
    if (!move) {
      Snd.play('deny');
      toast('No moves available');
      return;
    }
    App.score.onHint();
    Snd.play('hint');
    View.hintFlash(move);
    updateHud();
  }

  /** Send everything home once the outcome is no longer in doubt. */
  function autoFinish() {
    if (App.finishing || App.table.won) return;
    App.finishing = true;
    View.setLocked(true);
    View.clearSelection();
    (function step() {
      var move = App.table.autoFinishMove();
      if (!move) {
        App.finishing = false;
        View.setLocked(false);
        updateHud();
        return;
      }
      var result = App.table.move(move.from, move.index, move.to);
      View.sync(true);
      handleEvents(result.events);
      updateHud();
      if (result.events.some(function (e) { return e.type === 'win'; })) {
        App.finishing = false;
        View.setLocked(false);
        return finishGame();
      }
      setTimeout(step, 110);
    })();
  }

  /* ------------------------------------------------------------- endgames */

  function finishGame() {
    stopTimer();
    View.setLocked(true);
    var awards = App.score.onWin();
    updateHud();
    Snd.play('win');
    FX.celebrate(2800);

    var entry = {
      score: App.score.total,
      date: new Date().toISOString().slice(0, 10),
      won: true,
      time: App.score.elapsed(),
      moves: App.table.stats.moves,
      seed: App.table.seed
    };
    var placement = ScoreLib.submitScore(App.variant.id, App.table.difficulty.id, entry);

    $('#resultTitle').textContent = 'Solved!';
    $('#resultTitle').className = 'result-title win';
    $('#resultSub').textContent = App.variant.name + ' · ' + App.table.difficulty.name +
      ' · deal #' + App.table.seed;
    $('#resultStats').innerHTML = [
      stat('Score', App.score.total.toLocaleString()),
      stat('Rank', App.score.rank()),
      stat('Time', formatTime(App.score.elapsed())),
      stat('Moves', App.table.stats.moves),
      stat('Best streak', '×' + (Math.round(Math.min(1 + Math.max(0, App.score.bestStreak - 1) * 0.25, 3) * 100) / 100)),
      stat('Undos', App.score.undos)
    ].join('');
    $('#resultBreakdown').innerHTML = awards.map(function (a) {
      return '<li><span>' + a.label + '</span><b>+' + a.points.toLocaleString() + '</b></li>';
    }).join('');
    $('#resultPlacement').textContent = placement === 0 ? 'A new personal best!'
      : placement > 0 ? 'Number ' + (placement + 1) + ' on this table.' : '';
    renderScoreTable('#resultScores', App.variant.id, App.table.difficulty.id);
    $('#btnResultRetry').textContent = 'New deal';
    setTimeout(function () { openModal('#resultModal'); }, 900);
  }

  function showStuck() {
    stopTimer();
    Snd.play('stuck');
    var entry = {
      score: App.score.total,
      date: new Date().toISOString().slice(0, 10),
      won: false,
      time: App.score.elapsed(),
      moves: App.table.stats.moves,
      seed: App.table.seed
    };
    ScoreLib.submitScore(App.variant.id, App.table.difficulty.id, entry);

    $('#resultTitle').textContent = 'No moves left';
    $('#resultTitle').className = 'result-title stuck';
    $('#resultSub').textContent = 'Undo a few moves, or take a fresh deal.';
    $('#resultStats').innerHTML = [
      stat('Score', App.score.total.toLocaleString()),
      stat('Time', formatTime(App.score.elapsed())),
      stat('Moves', App.table.stats.moves),
      stat('Deal', '#' + App.table.seed)
    ].join('');
    $('#resultBreakdown').innerHTML = '';
    $('#resultPlacement').textContent = '';
    renderScoreTable('#resultScores', App.variant.id, App.table.difficulty.id);
    $('#btnResultRetry').textContent = 'New deal';
    openModal('#resultModal');
  }

  function stat(label, value) {
    return '<div class="stat"><span>' + label + '</span><strong>' + value + '</strong></div>';
  }

  function renderScoreTable(sel, variantId, difficultyId) {
    var list = ScoreLib.highScores(variantId, difficultyId);
    var node = $(sel);
    if (!node) return;
    if (!list.length) { node.innerHTML = '<li class="empty">No scores yet.</li>'; return; }
    node.innerHTML = list.map(function (s, i) {
      return '<li><span class="pos">' + (i + 1) + '</span>' +
        '<span class="pts">' + s.score.toLocaleString() + '</span>' +
        '<span class="meta">' + (s.won ? 'solved' : 'stuck') + ' · ' + formatTime(s.time || 0) + '</span></li>';
    }).join('');
  }

  /* --------------------------------------------------------------- modals */

  function openModal(sel) {
    var m = $(sel);
    m.hidden = false;
    requestAnimationFrame(function () { m.classList.add('is-open'); });
  }
  function closeModal(sel) {
    var m = $(sel);
    if (!m) return;
    m.classList.remove('is-open');
    setTimeout(function () { m.hidden = true; }, 200);
  }

  function showRules() {
    var v = App.variant;
    if (!v) return;
    $('#rulesTitle').textContent = 'How to play ' + v.name;
    $('#rulesBody').innerHTML = RULES[v.id];
    openModal('#rulesModal');
  }

  var RULES = {
    klondike:
      '<p>Build the four foundations up from ace to king, one suit each.</p>' +
      '<p>In the columns, cards stack <strong>down in alternating colours</strong> — a red six on a black seven. ' +
      'Only a king may move into an empty column.</p>' +
      '<p>Tap the stock to turn cards over. Tap any card to send it straight to a foundation when it fits; ' +
      'otherwise tap it to select, then tap where it should go. You can drag instead.</p>',
    spider:
      '<p>Build columns <strong>down in one suit</strong>, from king to ace. Complete a run and it leaves the table — ' +
      'clear all eight to win.</p>' +
      '<p>You can drop a card on any card one rank higher regardless of suit, but only same-suit runs move together.</p>' +
      '<p>Tap the stock to deal a new row across every column. You cannot deal while a column sits empty.</p>',
    freecell:
      '<p>Every card is face up from the start, so nothing is hidden — only awkward.</p>' +
      '<p>Columns build <strong>down in alternating colours</strong>. The free cells each hold one card. ' +
      'Any column may take any card into a gap.</p>' +
      '<p>How many cards you can move at once depends on what is free: one, plus one per empty cell, ' +
      'doubled for every empty column.</p>',
    pyramid:
      '<p>Remove pairs of exposed cards that add up to <strong>thirteen</strong>. Aces count 1, jacks 11, queens 12. ' +
      'A king is thirteen by itself — tap it to discard it alone.</p>' +
      '<p>A card is only playable once nothing overlaps it. Tap the stock for a new card when you are stuck.</p>' +
      '<p>Clear all 28 pyramid cards to win.</p>'
  };

  /* ------------------------------------------------------------------ UI */

  function bind() {
    $('#btnBack').addEventListener('click', function () {
      stopTimer();
      showScreen('home');
    });
    $('#btnNewDeal').addEventListener('click', function () {
      if (!App.variant) return;
      startGame(App.variant.id, App.table.difficulty.id);
    });
    el.btnUndo.addEventListener('click', undo);
    $('#btnHint').addEventListener('click', hint);
    el.btnAuto.addEventListener('click', autoFinish);
    $('#btnRules').addEventListener('click', showRules);
    $('#btnLevels').addEventListener('click', function () {
      if (App.variant) openDifficulty(App.variant.id);
    });

    $('#btnSound').addEventListener('click', function () {
      App.prefs.sound = !App.prefs.sound;
      applyPrefs();
      if (App.prefs.sound) Snd.play('tap');
    });
    $$('#btnSettings, #btnSettingsHome').forEach(function (b) {
      b.addEventListener('click', function () { openModal('#settingsModal'); });
    });

    $$('.seg-btn[data-theme]').forEach(function (b) {
      b.addEventListener('click', function () {
        App.prefs.theme = b.dataset.theme;
        applyPrefs();
        Snd.play('tap');
      });
    });
    ['optSound', 'optEffects'].forEach(function (id) {
      var node = $('#' + id);
      if (!node) return;
      node.addEventListener('change', function () {
        App.prefs.sound = $('#optSound').checked;
        App.prefs.effects = $('#optEffects').checked;
        applyPrefs();
      });
    });

    $$('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () { closeModal('#' + b.dataset.close); });
    });

    $('#btnResultRetry').addEventListener('click', function () {
      closeModal('#resultModal');
      startGame(App.variant.id, App.table.difficulty.id);
    });
    $('#btnResultSame').addEventListener('click', function () {
      closeModal('#resultModal');
      startGame(App.variant.id, App.table.difficulty.id, App.table.seed);
    });
    $('#btnResultHome').addEventListener('click', function () {
      closeModal('#resultModal');
      showScreen('home');
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        $$('.modal').forEach(function (m) { if (!m.hidden) closeModal('#' + m.id); });
        View.clearSelection();
      }
      if (document.body.dataset.screen !== 'game') return;
      if (ev.key === 'u' || (ev.key === 'z' && (ev.metaKey || ev.ctrlKey))) { ev.preventDefault(); undo(); }
      if (ev.key === 'h') hint();
      if (ev.key === ' ') { ev.preventDefault(); tapStock(); }
    });

    ['pointerdown', 'keydown'].forEach(function (evt) {
      global.addEventListener(evt, function once() {
        Snd.unlock();
        global.removeEventListener(evt, once);
      }, { once: true });
    });
  }

  /* ----------------------------------------------------------------- boot */

  function boot() {
    cache();
    FX.init($('#fx'));

    var saved = ScoreLib.loadPrefs();
    if (saved && saved.theme) App.prefs = Object.assign(App.prefs, saved);
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      App.prefs.effects = false;
    }
    applyPrefs();

    View.init(el.tableRoot, {
      onMove: tryMove,
      onStock: tapStock,
      onSelect: function () { Snd.play('lift'); },
      onInvalid: function (pileId) { Snd.play('deny'); View.flashInvalid(pileId); }
    });

    bind();
    renderHome();
    showScreen('home');

    // ?game=spider&level=two&deal=1234 jumps straight into a deal
    var params = new URLSearchParams(global.location.search);
    var gameParam = params.get('game');
    if (gameParam && Variants[gameParam]) {
      var levelParam = params.get('level');
      var difficulties = Variants[gameParam].difficulties;
      var match = difficulties.filter(function (d) { return d.id === levelParam; })[0];
      var deal = parseInt(params.get('deal'), 10);
      startGame(gameParam, (match || difficulties[0]).id, isNaN(deal) ? undefined : deal);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.SC.App = App;
  App.startGame = startGame;
  App.tryMove = tryMove;
})(typeof window !== 'undefined' ? window : self);
