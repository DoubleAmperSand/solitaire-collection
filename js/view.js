/*
 * Solitaire Collection — the table view.
 *
 * Owns the card elements, works out a layout that fits the viewport, and
 * translates pointer input into move requests. Knows nothing about scoring
 * or screens; it reports intent through the callbacks handed to init().
 */
(function (global) {
  'use strict';

  var Cards = global.SC.Cards;

  var View = {
    root: null,
    table: null,
    callbacks: {},
    cardEls: {},
    pileEls: {},
    selected: null,      // { pileId, index }
    metrics: { cardW: 60, cardH: 87, gap: 8, gapY: 12 },
    drag: null,
    locked: false
  };

  /* ---------------------------------------------------------------- setup */

  View.init = function (root, callbacks) {
    this.root = root;
    this.callbacks = callbacks || {};
    this.bindInput();
    global.addEventListener('resize', function () { View.layout(); View.sync(false); }, { passive: true });
  };

  View.setTable = function (table) {
    this.table = table;
    this.selected = null;
    this.build();
  };

  /* --------------------------------------------------------------- markup */

  function cardMarkup(card) {
    var rank = card.label();
    var glyph = card.glyph();
    var face = card.rank >= 11
      ? '<span class="court">' + rank + '</span><span class="pip">' + glyph + '</span>'
      : '<span class="pip">' + glyph + '</span>';
    return '<div class="card-inner">' +
      '<div class="card-face">' +
      '<span class="corner tl"><b>' + rank + '</b><i>' + glyph + '</i></span>' +
      face +
      '<span class="corner br"><b>' + rank + '</b><i>' + glyph + '</i></span>' +
      '</div>' +
      '<div class="card-back"><span></span></div>' +
      '</div>';
  }

  View.build = function () {
    var table = this.table;
    this.root.innerHTML = '';
    this.cardEls = {};
    this.pileEls = {};

    var slots = document.createElement('div');
    slots.className = 'slots';
    var cardLayer = document.createElement('div');
    cardLayer.className = 'card-layer';

    table.piles.forEach(function (pile) {
      var slot = document.createElement('div');
      slot.className = 'slot slot-' + pile.type + (pile.data.quiet ? ' is-quiet' : '');
      slot.dataset.pile = pile.id;
      if (pile.label) slot.dataset.label = pile.label;
      slots.appendChild(slot);
      View.pileEls[pile.id] = slot;

      pile.cards.forEach(function (card) {
        var el = document.createElement('div');
        el.className = 'card' + (Cards.isRed(card.suit) ? ' red' : ' black') + (card.faceUp ? '' : ' down');
        el.dataset.id = card.id;
        el.innerHTML = cardMarkup(card);
        cardLayer.appendChild(el);
        View.cardEls[card.id] = el;
      });
    });

    this.root.appendChild(slots);
    this.root.appendChild(cardLayer);
    this.layer = cardLayer;
    this.layout();
    this.sync(false);
  };

  /* --------------------------------------------------------------- layout */

  var MAX_CARD_W = 104;
  var MIN_CARD_W = 30;

  View.layout = function () {
    var table = this.table;
    if (!table) return;
    var grid = table.grid;
    var available = this.root.clientWidth || this.root.getBoundingClientRect().width;
    if (!available) return;

    var gap = Math.max(3, Math.min(12, available * 0.014));
    var deepest = 0;
    table.pilesOfType('tableau').forEach(function (p) { deepest = Math.max(deepest, p.cards.length); });

    var budget = this.heightBudget();

    // Start from the width, but never let a card grow past a comfortable size.
    var cardW = Math.min((available - gap * (grid.cols - 1)) / grid.cols, MAX_CARD_W);
    var m;

    // Two passes: size the fan for this card, then shrink the card if the
    // whole board still will not fit the space we have.
    for (var pass = 0; pass < 2; pass++) {
      m = measure(cardW, gap, grid, deepest, budget);
      if (pass === 0 && m.height > budget) {
        cardW = Math.max(MIN_CARD_W, cardW * (budget / m.height));
      } else {
        break;
      }
    }

    m.offsetX = Math.max(0, (available - (grid.cols * (m.cardW + gap) - gap)) / 2);
    this.metrics = m;
    this.root.style.setProperty('--card-w', m.cardW + 'px');
    this.root.style.setProperty('--card-h', m.cardH + 'px');

    var maxBottom = 0;
    table.piles.forEach(function (pile) {
      var pos = View.pilePosition(pile);
      var slot = View.pileEls[pile.id];
      if (!slot) return;
      slot.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px)';
      slot.style.width = m.cardW + 'px';
      slot.style.height = m.cardH + 'px';
      var extent = pos.y + m.cardH + View.fanExtent(pile);
      if (extent > maxBottom) maxBottom = extent;
    });
    this.root.style.height = Math.ceil(maxBottom) + 'px';
  };

  /**
   * Vertical room for the board, measured from the chrome around it rather
   * than from the board's own position — the board is vertically centred, so
   * measuring itself would chase its own tail.
   */
  View.heightBudget = function () {
    var screen = document.getElementById('game');
    if (!screen || screen.hidden) return Math.max(200, global.innerHeight - 220);
    var head = screen.querySelector('.game-head');
    var status = screen.querySelector('.game-status');
    var dock = screen.querySelector('.dock');
    var used = (head ? head.offsetHeight : 0) +
      (status ? status.offsetHeight : 0) +
      (dock ? dock.offsetHeight : 0);
    return Math.max(200, screen.clientHeight - used - 44);
  };

  /** Work out card size, fan steps and the resulting board height. */
  function measure(cardW, gap, grid, deepest, budget) {
    var cardH = cardW * 1.45;
    var gapY = Math.max(6, gap * 1.5);
    var stepUp = cardH * 0.28;
    var stepDown = cardH * 0.14;

    if (deepest > 1) {
      var room = budget - ((grid.rows - 1) * (cardH + gapY)) - cardH;
      var needed = (deepest - 1) * stepUp;
      if (room > 30 && needed > room) {
        var scale = Math.max(0.32, room / needed);
        stepUp *= scale;
        stepDown *= scale;
      }
    }
    stepUp = Math.max(cardH * 0.085, stepUp);
    stepDown = Math.max(cardH * 0.05, stepDown);

    var height = (grid.rows - 1) * (cardH + gapY) + cardH + Math.max(0, deepest - 1) * stepUp;
    return {
      cardW: cardW, cardH: cardH, gap: gap, gapY: gapY,
      stepUp: stepUp, stepDown: stepDown, stepRight: cardW * 0.3,
      height: height, offsetX: 0
    };
  }

  View.pilePosition = function (pile) {
    var m = this.metrics;
    return {
      x: (m.offsetX || 0) + pile.col * (m.cardW + m.gap),
      y: pile.row * (m.cardH + m.gapY)
    };
  };

  View.fanExtent = function (pile) {
    if (pile.fan === 'none') return 0;
    var offsets = this.fanOffsets(pile);
    return offsets.length ? offsets[offsets.length - 1].dy : 0;
  };

  /** Per-card offsets within a pile, honouring the fan direction. */
  View.fanOffsets = function (pile) {
    var m = this.metrics;
    var out = [];
    var dx = 0, dy = 0;
    for (var i = 0; i < pile.cards.length; i++) {
      out.push({ dx: dx, dy: dy });
      var card = pile.cards[i];
      if (pile.fan === 'down') {
        dy += card.faceUp ? m.stepUp : m.stepDown;
      } else if (pile.fan === 'right') {
        // only the last few of a waste pile fan out
        var remaining = pile.cards.length - 1 - i;
        dx += remaining < 3 ? m.stepRight : 0;
      }
    }
    return out;
  };

  /* ------------------------------------------------------------ rendering */

  View.sync = function (animate) {
    var table = this.table;
    if (!table) return;
    if (animate === false) this.root.classList.add('no-anim');

    table.piles.forEach(function (pile, pileIndex) {
      var base = View.pilePosition(pile);
      var offsets = View.fanOffsets(pile);
      pile.cards.forEach(function (card, i) {
        var el = View.cardEls[card.id];
        if (!el) return;
        if (View.drag && View.drag.ids.indexOf(card.id) >= 0) return;
        el.style.transform = 'translate(' + (base.x + offsets[i].dx) + 'px,' + (base.y + offsets[i].dy) + 'px)';
        el.style.zIndex = 10 + pileIndex * 120 + i;
        el.classList.toggle('down', !card.faceUp);
        el.classList.toggle('playable', !!table.grab(pile.id, i));
      });
    });

    this.paintSlots();
    if (animate === false) {
      void this.root.offsetWidth;
      this.root.classList.remove('no-anim');
    }
  };

  View.paintSlots = function () {
    var table = this.table;
    Object.keys(this.pileEls).forEach(function (id) {
      var pile = table.pile(id);
      View.pileEls[id].classList.toggle('is-empty', pile.isEmpty());
    });
  };

  /** Deal the opening hand from the stock position. */
  View.dealIn = function () {
    var table = this.table;
    var origin = { x: this.metrics.cardW * 3, y: 0 };
    var stock = table.pilesOfType('stock')[0];
    if (stock) origin = this.pilePosition(stock);

    this.root.classList.add('no-anim');
    var order = [];
    table.piles.forEach(function (pile) {
      pile.cards.forEach(function (card) { order.push(card); });
    });
    order.forEach(function (card) {
      var el = View.cardEls[card.id];
      if (el) el.style.transform = 'translate(' + origin.x + 'px,' + origin.y + 'px) scale(.9)';
    });
    void this.root.offsetWidth;
    this.root.classList.remove('no-anim');

    order.forEach(function (card, i) {
      var el = View.cardEls[card.id];
      if (el) el.style.transitionDelay = Math.min(i * 9, 520) + 'ms';
    });
    this.sync(true);
    setTimeout(function () {
      order.forEach(function (card) {
        var el = View.cardEls[card.id];
        if (el) el.style.transitionDelay = '';
      });
    }, 900);
  };

  /* ------------------------------------------------------------ selection */

  View.select = function (pileId, index) {
    this.clearSelection();
    var cards = this.table.grab(pileId, index);
    if (!cards) return false;
    this.selected = { pileId: pileId, index: index };
    cards.forEach(function (c) {
      var el = View.cardEls[c.id];
      if (el) el.classList.add('is-selected');
    });
    // light up every pile that would accept the selection
    var fromPile = this.table.pile(pileId);
    this.table.piles.forEach(function (target) {
      if (View.table.canDrop(cards, fromPile, target)) {
        View.pileEls[target.id].classList.add('is-target');
        var top = target.top();
        if (top && View.cardEls[top.id]) View.cardEls[top.id].classList.add('is-target-card');
      }
    });
    return true;
  };

  View.clearSelection = function () {
    this.selected = null;
    Object.keys(this.cardEls).forEach(function (id) {
      View.cardEls[id].classList.remove('is-selected', 'is-target-card');
    });
    Object.keys(this.pileEls).forEach(function (id) {
      View.pileEls[id].classList.remove('is-target');
    });
  };

  View.flashInvalid = function (pileId) {
    var el = this.pileEls[pileId];
    if (!el) return;
    el.classList.remove('is-invalid');
    void el.offsetWidth;
    el.classList.add('is-invalid');
    setTimeout(function () { el.classList.remove('is-invalid'); }, 420);
  };

  View.hintFlash = function (move) {
    var from = this.pileEls[move.from], to = this.pileEls[move.to];
    [from, to].forEach(function (el) {
      if (!el) return;
      el.classList.add('is-hint');
      setTimeout(function () { el.classList.remove('is-hint'); }, 2200);
    });
    var pile = this.table.pile(move.from);
    var card = pile.cards[move.index];
    if (card && this.cardEls[card.id]) {
      var el = this.cardEls[card.id];
      el.classList.add('is-hint-card');
      setTimeout(function () { el.classList.remove('is-hint-card'); }, 2200);
    }
  };

  /* ---------------------------------------------------------------- input */

  /** Which pile and index does this element belong to? */
  View.locate = function (el) {
    var cardEl = el && el.closest ? el.closest('.card') : null;
    if (cardEl) {
      var id = cardEl.dataset.id;
      var piles = this.table.piles;
      for (var p = 0; p < piles.length; p++) {
        for (var i = 0; i < piles[p].cards.length; i++) {
          if (piles[p].cards[i].id === id) return { pileId: piles[p].id, index: i, card: piles[p].cards[i] };
        }
      }
    }
    var slot = el && el.closest ? el.closest('.slot') : null;
    if (slot) return { pileId: slot.dataset.pile, index: -1 };
    return null;
  };

  View.bindInput = function () {
    var startPoint = null;

    this.root.addEventListener('pointerdown', function (ev) {
      if (View.locked || !View.table) return;
      var hit = View.locate(ev.target);
      if (!hit) return;
      startPoint = {
        x: ev.clientX, y: ev.clientY, hit: hit, moved: false,
        pointerId: ev.pointerId, time: Date.now()
      };
      var pile = View.table.pile(hit.pileId);
      if (pile && pile.type !== 'stock' && hit.index >= 0 && View.table.grab(hit.pileId, hit.index)) {
        startPoint.canDrag = true;
        // Touching a card is a game gesture, never a page gesture. The CSS
        // touch-action does the real work; this covers older WebKit.
        if (ev.cancelable) ev.preventDefault();
        try { View.root.setPointerCapture(ev.pointerId); } catch (e) { /* not supported */ }
      }
    });

    global.addEventListener('pointermove', function (ev) {
      if (!startPoint || !startPoint.canDrag || View.locked) return;
      var dist = Math.hypot(ev.clientX - startPoint.x, ev.clientY - startPoint.y);
      if (!startPoint.moved && dist < 6) return;
      if (!startPoint.moved) {
        startPoint.moved = true;
        View.beginDrag(startPoint.hit, ev);
      }
      View.moveDrag(ev);
    }, { passive: true });

    global.addEventListener('pointerup', function (ev) {
      if (!startPoint) return;
      var sp = startPoint;
      startPoint = null;
      releaseCapture(sp.pointerId);
      if (View.locked) { View.cancelDrag(); return; }
      if (sp.moved) View.dropDrag(ev);
      else View.handleTap(sp.hit);
    });

    global.addEventListener('pointercancel', function (ev) {
      if (startPoint) releaseCapture(startPoint.pointerId);
      startPoint = null;
      View.cancelDrag();
    });

    function releaseCapture(pointerId) {
      if (pointerId === undefined) return;
      try {
        if (View.root.hasPointerCapture(pointerId)) View.root.releasePointerCapture(pointerId);
      } catch (e) { /* not supported */ }
    }
  };

  View.handleTap = function (hit) {
    var cb = this.callbacks;
    var pile = this.table.pile(hit.pileId);
    if (!pile) return;

    if (pile.type === 'stock') {
      this.clearSelection();
      if (cb.onStock) cb.onStock();
      return;
    }

    // second tap: try to land the current selection here
    if (this.selected) {
      var sel = this.selected;
      if (sel.pileId === hit.pileId && sel.index === hit.index) {
        this.clearSelection();
        return;
      }
      var cards = this.table.grab(sel.pileId, sel.index);
      if (cards && this.table.canDrop(cards, this.table.pile(sel.pileId), pile)) {
        this.clearSelection();
        if (cb.onMove) cb.onMove(sel.pileId, sel.index, hit.pileId);
        return;
      }
    }

    if (hit.index < 0) { this.clearSelection(); return; }

    // a single tap sends a card home when it obviously belongs there
    var auto = this.table.autoTarget(hit.pileId, hit.index);
    if (auto && this.table.pile(auto).type === 'foundation') {
      this.clearSelection();
      if (cb.onMove) cb.onMove(hit.pileId, hit.index, auto);
      return;
    }

    if (!this.select(hit.pileId, hit.index)) {
      this.clearSelection();
      if (cb.onInvalid) cb.onInvalid(hit.pileId);
    } else if (cb.onSelect) {
      cb.onSelect();
    }
  };

  View.beginDrag = function (hit, ev) {
    var cards = this.table.grab(hit.pileId, hit.index);
    if (!cards) return;
    this.clearSelection();
    var origin = this.pilePosition(this.table.pile(hit.pileId));
    var offsets = this.fanOffsets(this.table.pile(hit.pileId));
    var rootRect = this.root.getBoundingClientRect();

    this.drag = {
      from: hit.pileId, index: hit.index,
      ids: cards.map(function (c) { return c.id; }),
      grabX: ev.clientX, grabY: ev.clientY,
      baseX: origin.x + offsets[hit.index].dx,
      baseY: origin.y + offsets[hit.index].dy,
      rootLeft: rootRect.left, rootTop: rootRect.top,
      spread: []
    };
    for (var i = 0; i < cards.length; i++) {
      this.drag.spread.push(offsets[hit.index + i].dy - offsets[hit.index].dy);
      var el = this.cardEls[cards[i].id];
      el.classList.add('is-dragging');
      el.style.zIndex = 9000 + i;
    }
    var fromPile = this.table.pile(hit.pileId);
    this.table.piles.forEach(function (target) {
      if (View.table.canDrop(cards, fromPile, target)) {
        View.pileEls[target.id].classList.add('is-target');
      }
    });
    if (this.callbacks.onSelect) this.callbacks.onSelect();
  };

  View.moveDrag = function (ev) {
    var d = this.drag;
    if (!d) return;
    var dx = ev.clientX - d.grabX;
    var dy = ev.clientY - d.grabY;
    for (var i = 0; i < d.ids.length; i++) {
      var el = this.cardEls[d.ids[i]];
      el.style.transform = 'translate(' + (d.baseX + dx) + 'px,' + (d.baseY + dy + d.spread[i]) + 'px) scale(1.04)';
    }
  };

  View.dropDrag = function (ev) {
    var d = this.drag;
    if (!d) return;
    var target = this.pileUnder(ev.clientX, ev.clientY, d);
    this.endDrag();
    if (target && target !== d.from) {
      var cards = this.table.grab(d.from, d.index);
      if (cards && this.table.canDrop(cards, this.table.pile(d.from), this.table.pile(target))) {
        if (this.callbacks.onMove) this.callbacks.onMove(d.from, d.index, target);
        return;
      }
    }
    this.sync(true);
    if (target && target !== d.from && this.callbacks.onInvalid) this.callbacks.onInvalid(target);
  };

  View.cancelDrag = function () {
    if (!this.drag) return;
    this.endDrag();
    this.sync(true);
  };

  View.endDrag = function () {
    var d = this.drag;
    if (!d) return;
    d.ids.forEach(function (id) {
      var el = View.cardEls[id];
      if (el) { el.classList.remove('is-dragging'); el.style.zIndex = ''; }
    });
    Object.keys(this.pileEls).forEach(function (id) {
      View.pileEls[id].classList.remove('is-target');
    });
    this.drag = null;
  };

  /** The pile whose slot area is closest to the dropped stack. */
  View.pileUnder = function (clientX, clientY, drag) {
    var best = null, bestDist = Infinity;
    var m = this.metrics;
    // measure from where the dragged card's top-left actually sits
    var px = clientX - (drag.grabX - drag.baseX - drag.rootLeft) - drag.rootLeft;
    var cx = px + m.cardW / 2;
    var cy = clientY - (drag.grabY - drag.baseY - drag.rootTop) - drag.rootTop + m.cardH / 2;

    var table = this.table;
    for (var i = 0; i < table.piles.length; i++) {
      var pile = table.piles[i];
      if (pile.type === 'stock') continue;
      var pos = this.pilePosition(pile);
      var extent = this.fanExtent(pile);
      var tx = pos.x + m.cardW / 2;
      var ty = pos.y + extent + m.cardH / 2;
      var dist = Math.hypot(cx - tx, cy - ty);
      if (dist < bestDist && dist < m.cardW * 1.5) { bestDist = dist; best = pile.id; }
    }
    return best;
  };

  View.setLocked = function (v) { this.locked = v; };

  global.SC.View = View;
})(typeof window !== 'undefined' ? window : self);
