/*
 * Klondike — the solitaire everyone means when they say "solitaire".
 */
(function (global) {
  'use strict';

  var Cards = global.SC.Cards;

  function descendingAlternating(cards) {
    for (var i = 1; i < cards.length; i++) {
      var prev = cards[i - 1], cur = cards[i];
      if (!cur.faceUp || prev.rank !== cur.rank + 1) return false;
      if (Cards.isRed(prev.suit) === Cards.isRed(cur.suit)) return false;
    }
    return true;
  }

  var Klondike = {
    id: 'klondike',
    name: 'Klondike',
    blurb: 'The classic. Build four suits from ace to king.',
    mode: 'stack',

    difficulties: [
      {
        id: 'relaxed', name: 'Relaxed', blurb: 'Draw one, redeal as often as you like.',
        multiplier: 1, config: { draw: 1, redeals: Infinity }
      },
      {
        id: 'standard', name: 'Standard', blurb: 'Draw three — the usual challenge.',
        multiplier: 1.8, config: { draw: 3, redeals: Infinity }
      },
      {
        id: 'strict', name: 'Strict', blurb: 'Draw three and one pass through the deck.',
        multiplier: 2.8, config: { draw: 3, redeals: 1 }
      }
    ],

    layout: function () {
      var piles = [
        { id: 'stock', type: 'stock', col: 0, row: 0, label: 'Stock' },
        { id: 'waste', type: 'waste', col: 1, row: 0, fan: 'right', label: 'Waste' }
      ];
      for (var f = 0; f < 4; f++) {
        piles.push({ id: 'f' + f, type: 'foundation', col: 3 + f, row: 0, suit: null });
      }
      for (var t = 0; t < 7; t++) {
        piles.push({ id: 't' + t, type: 'tableau', col: t, row: 1, fan: 'down' });
      }
      return { grid: { cols: 7, rows: 2 }, piles: piles };
    },

    deal: function (table, random) {
      var deck = Cards.shuffle(Cards.buildDeck(1), random);
      var at = 0;
      for (var t = 0; t < 7; t++) {
        var pile = table.pile('t' + t);
        for (var i = 0; i <= t; i++) {
          var card = deck[at++];
          card.faceUp = (i === t);
          pile.cards.push(card);
        }
      }
      var stock = table.pile('stock');
      while (at < deck.length) {
        deck[at].faceUp = false;
        stock.cards.push(deck[at++]);
      }
    },

    canPickUp: function (table, pile, index) {
      var card = pile.cards[index];
      if (!card.faceUp) return false;
      if (pile.type === 'waste' || pile.type === 'foundation') {
        return index === pile.cards.length - 1;
      }
      if (pile.type === 'tableau') return descendingAlternating(pile.from(index));
      return false;
    },

    canDrop: function (table, cards, fromPile, toPile) {
      var first = cards[0];
      if (toPile.type === 'foundation') {
        if (cards.length !== 1) return false;
        var top = toPile.top();
        if (!top) return first.rank === 1;
        return top.suit === first.suit && first.rank === top.rank + 1;
      }
      if (toPile.type === 'tableau') {
        var t = toPile.top();
        if (!t) return first.rank === 13;
        return t.faceUp && t.rank === first.rank + 1 &&
          Cards.isRed(t.suit) !== Cards.isRed(first.suit);
      }
      return false;
    },

    afterMove: function (table, fromPile) {
      var events = [];
      if (fromPile.type === 'tableau') {
        var top = fromPile.top();
        if (top && !top.faceUp) {
          top.faceUp = true;
          events.push({ type: 'reveal', card: top, pile: fromPile });
        }
      }
      return events;
    },

    stockAction: function (table) {
      var stock = table.pile('stock');
      var waste = table.pile('waste');
      var draw = table.config.draw || 1;

      if (stock.cards.length) {
        var moved = [];
        for (var i = 0; i < draw && stock.cards.length; i++) {
          var card = stock.cards.pop();
          card.faceUp = true;
          waste.cards.push(card);
          moved.push(card);
        }
        return { ok: true, events: [{ type: 'draw', cards: moved, to: waste }] };
      }

      if (!waste.cards.length) return { ok: false, events: [] };
      var allowed = table.config.redeals;
      if (allowed !== Infinity && table.redealsUsed >= allowed) {
        return { ok: false, events: [{ type: 'blocked', reason: 'No redeals left' }] };
      }
      while (waste.cards.length) {
        var c = waste.cards.pop();
        c.faceUp = false;
        stock.cards.push(c);
      }
      table.redealsUsed++;
      return { ok: true, events: [{ type: 'recycle' }] };
    },

    canRecycle: function (table) {
      if (!table.pile('waste').cards.length) return false;
      return table.config.redeals === Infinity || table.redealsUsed < table.config.redeals;
    },

    isWon: function (table) {
      var foundations = table.pilesOfType('foundation');
      for (var i = 0; i < foundations.length; i++) {
        if (foundations[i].cards.length !== 13) return false;
      }
      return true;
    },

    /** Redeals left, shown in the status bar. */
    status: function (table) {
      if (table.config.redeals === Infinity) return 'Unlimited redeals';
      var left = table.config.redeals - table.redealsUsed;
      return left + (left === 1 ? ' redeal left' : ' redeals left');
    }
  };

  global.SC.Variants = global.SC.Variants || {};
  global.SC.Variants.klondike = Klondike;
})(typeof window !== 'undefined' ? window : self);
