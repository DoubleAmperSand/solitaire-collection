/*
 * Solitaire Collection — the shared table.
 *
 * Every variant is expressed as a set of piles plus a handful of rule
 * callbacks, so one move engine, one renderer and one input layer serve
 * Klondike, Spider, FreeCell and Pyramid alike.
 *
 * Undo works from full snapshots rather than inverse moves. With at most
 * 104 cards a snapshot is tiny, and it stays correct no matter how unusual
 * a variant's move is (Spider's completed runs, Pyramid's pair removals).
 */
(function (global) {
  'use strict';

  var Cards = global.SC.Cards;

  /* ------------------------------------------------------------------ pile */

  function Pile(spec) {
    this.id = spec.id;
    this.type = spec.type;          // stock | waste | foundation | tableau | cell | reserve
    this.cards = [];
    this.fan = spec.fan || 'none';  // none | down | right
    this.col = spec.col || 0;
    this.row = spec.row || 0;
    this.suit = spec.suit === undefined ? null : spec.suit;
    this.label = spec.label || '';
    this.data = spec.data || {};
  }

  Pile.prototype.top = function () {
    return this.cards.length ? this.cards[this.cards.length - 1] : null;
  };
  Pile.prototype.isEmpty = function () { return this.cards.length === 0; };
  Pile.prototype.from = function (index) { return this.cards.slice(index); };

  /* --------------------------------------------------------------- options */

  /*
   * Beyond its difficulty a variant may expose extra axes. Klondike and
   * FreeCell can be dealt from one, two or four suits, and that is a
   * different question from how hard the level is — a one-suit strict
   * Klondike is a perfectly sensible thing to want. So options are chosen
   * independently of difficulty, and a gentler choice scales the score
   * multiplier down rather than pretending it was the same game.
   */

  function optionSpecs(variant) { return variant.options || []; }

  function choiceFor(spec, value) {
    return spec.choices.filter(function (c) { return c.value === value; })[0] || spec.choices[0];
  }

  function defaultOptions(variant) {
    var out = {};
    optionSpecs(variant).forEach(function (spec) { out[spec.id] = spec.default; });
    return out;
  }

  /** Coerce whatever the caller passed — a URL, storage — into valid choices. */
  function normaliseOptions(variant, raw) {
    var out = defaultOptions(variant);
    if (!raw) return out;
    optionSpecs(variant).forEach(function (spec) {
      var match = spec.choices.filter(function (c) { return c.value === raw[spec.id]; })[0];
      if (match) out[spec.id] = match.value;
    });
    return out;
  }

  function optionMultiplier(variant, options) {
    var m = 1;
    optionSpecs(variant).forEach(function (spec) {
      m *= choiceFor(spec, options[spec.id]).multiplier;
    });
    return m;
  }

  /**
   * Storage suffix separating one set of options from another, so a
   * one-suit run never lands on the four-suit leaderboard. Defaults produce
   * an empty string, which is what scores saved before options existed use.
   */
  function optionKey(variant, options) {
    var parts = [];
    optionSpecs(variant).forEach(function (spec) {
      if (options[spec.id] !== spec.default) parts.push(spec.id + '=' + options[spec.id]);
    });
    return parts.length ? ':' + parts.join(',') : '';
  }

  /** Short label for anything non-default, e.g. 'One suit'. */
  function optionLabel(variant, options) {
    return optionSpecs(variant).filter(function (spec) {
      return options[spec.id] !== spec.default;
    }).map(function (spec) {
      return choiceFor(spec, options[spec.id]).name;
    }).join(' · ');
  }

  /* ----------------------------------------------------------------- table */

  function Table(variant, difficultyId, seed, options) {
    this.variant = variant;
    this.difficulty = variant.difficulties.filter(function (d) {
      return d.id === difficultyId;
    })[0] || variant.difficulties[0];
    this.options = normaliseOptions(variant, options);
    // options win over the difficulty's config, so an axis can override it
    this.config = Object.assign({}, this.difficulty.config || {}, this.options);
    this.multiplier = Math.round(
      this.difficulty.multiplier * optionMultiplier(variant, this.options) * 100
    ) / 100;
    this.optionKey = optionKey(variant, this.options);
    this.optionLabel = optionLabel(variant, this.options);
    this.seed = seed || Cards.randomSeed();
    this.reset();
  }

  Table.prototype.reset = function (seed) {
    if (seed !== undefined) this.seed = seed;
    this.piles = [];
    this.byId = {};
    this.cardsById = {};
    this.history = [];
    this.redealsUsed = 0;
    this.stats = { moves: 0, undos: 0, hints: 0, recycles: 0 };
    this.won = false;

    var layout = this.variant.layout(this.config);
    this.grid = layout.grid;
    for (var i = 0; i < layout.piles.length; i++) {
      var pile = new Pile(layout.piles[i]);
      this.piles.push(pile);
      this.byId[pile.id] = pile;
    }

    var random = Cards.rng(this.seed);
    this.variant.deal(this, random, this.config);

    var self = this;
    this.piles.forEach(function (p) {
      p.cards.forEach(function (c) { self.cardsById[c.id] = c; });
    });
    return this;
  };

  Table.prototype.pile = function (id) { return this.byId[id]; };

  Table.prototype.pilesOfType = function (type) {
    return this.piles.filter(function (p) { return p.type === type; });
  };

  /* -------------------------------------------------------------- snapshot */

  Table.prototype.snapshot = function () {
    var state = { piles: [], redealsUsed: this.redealsUsed };
    for (var i = 0; i < this.piles.length; i++) {
      var p = this.piles[i];
      var entry = new Array(p.cards.length);
      for (var j = 0; j < p.cards.length; j++) {
        entry[j] = p.cards[j].id + (p.cards[j].faceUp ? '+' : '-');
      }
      state.piles.push(entry);
    }
    return state;
  };

  Table.prototype.restore = function (state) {
    for (var i = 0; i < this.piles.length; i++) {
      var pile = this.piles[i];
      var entry = state.piles[i];
      pile.cards.length = 0;
      for (var j = 0; j < entry.length; j++) {
        var token = entry[j];
        var card = this.cardsById[token.slice(0, -1)];
        card.faceUp = token.charAt(token.length - 1) === '+';
        pile.cards.push(card);
      }
    }
    this.redealsUsed = state.redealsUsed;
    this.won = false;
  };

  /* ------------------------------------------------------------ move logic */

  /** Cards that would be picked up by grabbing pile[index], or null. */
  Table.prototype.grab = function (pileId, index) {
    var pile = this.byId[pileId];
    if (!pile || index < 0 || index >= pile.cards.length) return null;
    if (!this.variant.canPickUp(this, pile, index)) return null;
    return pile.from(index);
  };

  Table.prototype.canDrop = function (cards, fromPile, toPile) {
    if (!cards || !cards.length || !toPile) return false;
    if (fromPile === toPile) return false;
    return this.variant.canDrop(this, cards, fromPile, toPile);
  };

  /**
   * Apply a move. Returns { ok, events } — events drive scoring and effects.
   */
  Table.prototype.move = function (fromPileId, index, toPileId) {
    var fromPile = this.byId[fromPileId];
    var toPile = this.byId[toPileId];
    var cards = this.grab(fromPileId, index);
    if (!cards || !this.canDrop(cards, fromPile, toPile)) return { ok: false, events: [] };

    var before = this.snapshot();
    fromPile.cards.length = index;
    for (var i = 0; i < cards.length; i++) toPile.cards.push(cards[i]);

    var events = [{ type: 'move', from: fromPile, to: toPile, cards: cards }];
    if (toPile.type === 'foundation') events.push({ type: 'foundation', cards: cards, pile: toPile });

    // let the variant flip newly exposed cards, collect finished runs, etc.
    var extra = this.variant.afterMove
      ? (this.variant.afterMove(this, fromPile, toPile, cards) || [])
      : [];
    events = events.concat(extra);

    this.history.push({ state: before, events: events });
    this.stats.moves++;
    this.checkWin(events);
    return { ok: true, events: events };
  };

  /** Stock click — draw, deal a row, or recycle, depending on the variant. */
  Table.prototype.stockAction = function () {
    if (!this.variant.stockAction) return { ok: false, events: [] };
    var before = this.snapshot();
    var result = this.variant.stockAction(this) || { ok: false, events: [] };
    if (!result.ok) return result;
    this.history.push({ state: before, events: result.events || [] });
    this.stats.moves++;
    this.checkWin(result.events || []);
    return result;
  };

  Table.prototype.undo = function () {
    if (!this.history.length) return null;
    var entry = this.history.pop();
    this.restore(entry.state);
    this.stats.undos++;
    return entry;
  };

  Table.prototype.canUndo = function () { return this.history.length > 0; };

  Table.prototype.checkWin = function (events) {
    if (this.won) return false;
    if (this.variant.isWon(this)) {
      this.won = true;
      if (events) events.push({ type: 'win' });
      return true;
    }
    return false;
  };

  /* ------------------------------------------------------ helpers for UI */

  /**
   * Where would this card go if the player just tapped it?
   * Foundations are preferred, then any legal tableau/cell target.
   */
  Table.prototype.autoTarget = function (pileId, index) {
    if (this.variant.autoTarget) return this.variant.autoTarget(this, pileId, index);
    var fromPile = this.byId[pileId];
    var cards = this.grab(pileId, index);
    if (!cards) return null;

    var order = ['foundation', 'tableau', 'cell'];
    for (var o = 0; o < order.length; o++) {
      var candidates = this.pilesOfType(order[o]);
      for (var i = 0; i < candidates.length; i++) {
        var target = candidates[i];
        if (target === fromPile) continue;
        // moving a lone card between empty piles achieves nothing
        if (target.isEmpty() && fromPile.cards.length === cards.length &&
          fromPile.type === 'tableau' && target.type === 'tableau') continue;
        if (this.canDrop(cards, fromPile, target)) return target.id;
      }
    }
    return null;
  };

  /** Every legal move on the table, used for hints and auto-finish. */
  Table.prototype.legalMoves = function () {
    var moves = [];
    for (var p = 0; p < this.piles.length; p++) {
      var pile = this.piles[p];
      if (pile.type === 'stock') continue;
      for (var i = 0; i < pile.cards.length; i++) {
        var cards = this.grab(pile.id, i);
        if (!cards) continue;
        for (var t = 0; t < this.piles.length; t++) {
          var target = this.piles[t];
          if (target === pile || target.type === 'stock') continue;
          if (this.canDrop(cards, pile, target)) {
            moves.push({ from: pile.id, index: i, to: target.id, count: cards.length });
          }
        }
      }
    }
    return moves;
  };

  /* -------------------------------------------------- progress vs shuffle */

  /*
   * Being legal and getting somewhere are different things. A card can very
   * nearly always slide onto some other card that would take it just as well,
   * and then slide straight back — legal, endless, and worth nothing. Telling
   * the two apart is what stops the hints going round in circles and lets a
   * finished game admit that it is finished.
   */

  /** Does this move actually get somewhere? */
  Table.prototype.progresses = function (move) {
    var from = this.byId[move.from], to = this.byId[move.to];
    if (!from || !to) return false;

    if (this.variant.progresses) {
      var say = this.variant.progresses(this, move, from, to);
      if (say !== undefined) return say;
    }

    // order matters: a card already home that shuffles between two empty
    // foundations is not being sent home again
    if (from.type === 'foundation') return false;     // pulling one back out
    if (to.type === 'foundation') return true;        // a card sent home
    if (to.type === 'cell') return false;             // parking it, not playing it
    if (from.type === 'cell' || from.type === 'waste' || from.type === 'reserve') return true;

    if (from.type === 'tableau') {
      var under = from.cards[move.index - 1];
      if (move.index > 0 && under && !under.faceUp) return true;   // turns a card over
      // empties a column — unless it only moves the empty column elsewhere
      if (move.index === 0) return !to.isEmpty();
    }
    return false;
  };

  /**
   * Moving onto a host no better than the one just left. This is the move
   * that comes back to haunt you: it is always available, it undoes itself,
   * and it is the reason counting legal moves says a dead game is alive.
   */
  Table.prototype.isLateral = function (move) {
    var from = this.byId[move.from], to = this.byId[move.to];
    if (!from || !to || from.type !== 'tableau' || to.type !== 'tableau') return false;
    if (move.index === 0) return false;               // empties or relocates a column
    var under = from.cards[move.index - 1];
    if (!under || !under.faceUp) return false;        // turns a card over
    var host = to.top();
    if (!host) return false;                          // taking a gap is a real choice
    if (host.rank !== under.rank) return false;
    // landing on your own suit beats landing on a stranger of the same rank
    var moving = from.cards[move.index];
    if (host.suit === moving.suit && under.suit !== moving.suit) return false;
    return true;
  };

  /**
   * Would this move put a progressing move within reach next turn?
   *
   * Putting the same cards straight back does not count. Undoing a move
   * often looks like progress on its own terms — it re-empties the column
   * you just filled, or frees the cell you just used — and taking that at
   * face value is exactly how a hint ends up recommending a move and then
   * recommending its reverse.
   */
  Table.prototype.opensProgress = function (move) {
    var self = this;
    var count = move.count || 1;
    return this.peek(move, function () {
      var landed = self.byId[move.to].cards.length - count;
      return self.legalMoves().some(function (m) {
        if (m.from === move.to && m.to === move.from && m.index === landed) return false;
        return self.progresses(m);
      });
    });
  };

  /** Play a move, ask a question, then put everything back exactly as it was. */
  Table.prototype.peek = function (move, ask) {
    var before = this.snapshot();
    var depth = this.history.length;
    var moves = this.stats.moves, won = this.won;
    var result = this.move(move.from, move.index, move.to);
    var answer = result.ok ? ask() : false;
    this.history.length = depth;
    this.restore(before);
    this.stats.moves = moves;
    this.won = won;
    return answer;
  };

  /** Every position this game has already been in, including the current one. */
  Table.prototype.visitedStates = function () {
    var seen = {};
    for (var i = 0; i < this.history.length; i++) {
      seen[stateKey(this.history[i].state)] = 1;
    }
    seen[stateKey(this.snapshot())] = 1;
    return seen;
  };

  /** Where this move would leave the board, as a comparable key. */
  Table.prototype.resultKey = function (move) {
    var self = this;
    return this.peek(move, function () { return stateKey(self.snapshot()); }) || '';
  };

  /**
   * Every worthwhile move, best first, so asking again shows the next idea
   * rather than repeating the first.
   *
   * The ranking leads on whether a move takes the game somewhere it has not
   * already been. Judging a move only on its own merits is what produced the
   * advice to shuffle a card back and forth: emptying a column and filling it
   * again are each progress on their own terms, and so are taking a card out
   * of a cell and putting it back. Against the positions already played they
   * are plainly a circle, and the board has kept every one of them for undo,
   * so the answer was already there to be asked for.
   */
  Table.prototype.hints = function () {
    if (this.variant.hints) return this.variant.hints(this) || [];
    if (this.variant.hint) {
      var single = this.variant.hint(this);
      return single ? [single] : [];
    }

    var self = this;
    var visited = this.visitedStates();

    var ranked = this.legalMoves().filter(function (m) {
      // taking a card back off a foundation is never advice worth giving —
      // including sliding one between two empty foundations, which is legal
      // and achieves nothing at all
      if (self.byId[m.from].type === 'foundation') return false;
      // nor is moving onto a host no better than the one just left
      return !self.isLateral(m);
    }).filter(function (m) {
      // never advise a move back into a position this game has already been
      // in: that is the circle, however sensible the single move looks
      return !visited[self.resultKey(m)];
    }).map(function (m) {
      var progress = self.progresses(m);
      return {
        move: m,
        score: self.hintScore(m),
        progress: progress,
        opens: progress ? true : self.opensProgress(m)
      };
    });

    ranked.sort(function (a, b) {
      if (a.progress !== b.progress) return a.progress ? -1 : 1; // gets somewhere
      if (!!a.opens !== !!b.opens) return a.opens ? -1 : 1;      // opens something up
      return b.score - a.score;
    });

    return ranked.map(function (r) { return r.move; });
  };

  Table.prototype.hint = function () {
    return this.hints()[0] || null;
  };

  Table.prototype.hintScore = function (move) {
    var from = this.byId[move.from], to = this.byId[move.to];
    var score = 0;
    if (to.type === 'foundation') score += 100;
    if (from.type === 'tableau' && move.index > 0 && !from.cards[move.index - 1].faceUp) score += 60;
    if (from.type === 'waste') score += 20;
    if (to.type === 'tableau' && to.isEmpty()) score -= 10;
    if (to.type === 'cell') score -= 40;
    if (from.type === 'foundation') score -= 120;
    return score;
  };

  /**
   * Moves that send everything home once the game is effectively solved.
   * Returns one foundation move at a time so the UI can animate them.
   */
  Table.prototype.autoFinishMove = function () {
    var foundations = this.pilesOfType('foundation');
    var sources = this.piles.filter(function (p) {
      return p.type === 'tableau' || p.type === 'cell' || p.type === 'waste';
    });
    for (var s = 0; s < sources.length; s++) {
      var pile = sources[s];
      if (pile.isEmpty()) continue;
      var index = pile.cards.length - 1;
      var cards = this.grab(pile.id, index);
      if (!cards || cards.length !== 1) continue;
      for (var f = 0; f < foundations.length; f++) {
        if (this.canDrop(cards, pile, foundations[f])) {
          return { from: pile.id, index: index, to: foundations[f].id };
        }
      }
    }
    return null;
  };

  /** True when nothing is face-down and the stock is spent. */
  Table.prototype.canAutoFinish = function () {
    if (this.won) return false;
    if (this.variant.canAutoFinish) return this.variant.canAutoFinish(this);
    var stock = this.pilesOfType('stock')[0];
    var waste = this.pilesOfType('waste')[0];
    if (stock && stock.cards.length) return false;
    if (waste && waste.cards.length > 1) return false;
    var tableaux = this.pilesOfType('tableau');
    for (var i = 0; i < tableaux.length; i++) {
      var cards = tableaux[i].cards;
      for (var j = 0; j < cards.length; j++) if (!cards[j].faceUp) return false;
    }
    return this.autoFinishMove() !== null;
  };

  /** Nothing to draw, nothing to recycle, and nowhere left to get to. */
  Table.prototype.isStuck = function () {
    if (this.won) return false;
    var stock = this.pilesOfType('stock')[0];
    if (stock && stock.cards.length) {
      // Spider can be blocked from dealing while a column is empty
      if (!this.variant.stockAction) return false;
      var probe = this.snapshot();
      var result = this.variant.stockAction(this);
      this.restore(probe);
      if (result && result.ok) return false;
    }
    if (this.variant.canRecycle && this.variant.canRecycle(this)) return false;
    return this.deadEnd(2500);
  };

  function stateKey(state) {
    var parts = [];
    for (var i = 0; i < state.piles.length; i++) parts.push(state.piles[i].join(''));
    return parts.join('/');
  }

  /**
   * True when no amount of rearranging what is already face up reaches a move
   * that gets somewhere.
   *
   * Counting legal moves cannot answer this. Spider in particular nearly
   * always leaves a card that can slide onto an equally good host and back
   * again, so a game that is plainly over goes on offering moves for ever.
   * Instead, walk the positions those pointless shuffles lead to and look for
   * a way out.
   *
   * If the walk runs out of budget before it runs out of positions the honest
   * answer is "don't know", and the player gets the benefit of the doubt:
   * ending a game that was still alive is far worse than letting a dead one
   * run on a little longer.
   */
  Table.prototype.deadEnd = function (budget) {
    var start = this.snapshot();
    var depth = this.history.length;
    var moves = this.stats.moves, undos = this.stats.undos, won = this.won;

    var seen = {};
    var queue = [start];
    seen[stateKey(start)] = 1;
    var visited = 0, alive = false, exhausted = true;

    while (queue.length) {
      if (visited >= budget) { exhausted = false; break; }
      var state = queue.shift();
      this.restore(state);
      visited++;

      var options = this.legalMoves();
      var i;
      for (i = 0; i < options.length && !alive; i++) {
        if (this.progresses(options[i])) alive = true;
      }
      if (alive) break;

      for (i = 0; i < options.length; i++) {
        this.restore(state);
        if (!this.move(options[i].from, options[i].index, options[i].to).ok) continue;
        var next = this.snapshot();
        var key = stateKey(next);
        if (!seen[key]) { seen[key] = 1; queue.push(next); }
      }
    }

    this.history.length = depth;
    this.restore(start);
    this.stats.moves = moves;
    this.stats.undos = undos;
    this.won = won;

    return !alive && exhausted;
  };

  /** Sanity check used by the tests: every card accounted for exactly once. */
  Table.prototype.audit = function () {
    var seen = {}, total = 0;
    for (var i = 0; i < this.piles.length; i++) {
      var cards = this.piles[i].cards;
      for (var j = 0; j < cards.length; j++) {
        if (seen[cards[j].id]) return 'duplicate card ' + cards[j].id;
        seen[cards[j].id] = true;
        total++;
      }
    }
    var expected = Object.keys(this.cardsById).length;
    if (total !== expected) return 'card count ' + total + ' expected ' + expected;
    return null;
  };

  global.SC.Game = {
    Table: Table, Pile: Pile,
    optionSpecs: optionSpecs, choiceFor: choiceFor,
    defaultOptions: defaultOptions, normaliseOptions: normaliseOptions,
    optionMultiplier: optionMultiplier, optionKey: optionKey, optionLabel: optionLabel
  };
})(typeof window !== 'undefined' ? window : self);
