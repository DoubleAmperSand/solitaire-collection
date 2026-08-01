/*
 * Pyramid — clear the pyramid by pairing cards that add to thirteen.
 * Aces are 1, jacks 11, queens 12; a king is thirteen on its own.
 */
(function (global) {
  'use strict';

  var Cards = global.SC.Cards;

  var ROWS = 7;

  function slotId(row, index) { return 'p' + row + '_' + index; }

  /** The two slots sitting on top of this one. */
  function coveredBy(table, pile) {
    if (pile.type !== 'pyramid') return [];
    var row = pile.data.row, index = pile.data.index;
    if (row >= ROWS - 1) return [];
    return [
      table.pile(slotId(row + 1, index)),
      table.pile(slotId(row + 1, index + 1))
    ].filter(Boolean);
  }

  function isAvailable(table, pile) {
    if (pile.isEmpty()) return false;
    if (pile.type === 'waste') return true;
    if (pile.type !== 'pyramid') return false;
    var covers = coveredBy(table, pile);
    for (var i = 0; i < covers.length; i++) if (!covers[i].isEmpty()) return false;
    return true;
  }

  var Pyramid = {
    id: 'pyramid',
    name: 'Pyramid',
    blurb: 'Pair cards that add to thirteen and clear the tomb.',
    mode: 'match',

    difficulties: [
      {
        id: 'relaxed', name: 'Relaxed', blurb: 'Three passes through the deck.',
        multiplier: 1, config: { redeals: 2 }
      },
      {
        id: 'standard', name: 'Standard', blurb: 'Two passes. The usual game.',
        multiplier: 2, config: { redeals: 1 }
      },
      {
        id: 'strict', name: 'Strict', blurb: 'One pass. No second chances.',
        multiplier: 3, config: { redeals: 0 }
      }
    ],

    layout: function () {
      var piles = [];
      for (var row = 0; row < ROWS; row++) {
        for (var i = 0; i <= row; i++) {
          piles.push({
            id: slotId(row, i), type: 'pyramid',
            col: (ROWS - 1 - row) * 0.5 + i,
            row: row * 0.52,
            data: { row: row, index: i }
          });
        }
      }
      // centred beneath the pyramid, which spans columns 0–7
      piles.push({ id: 'stock', type: 'stock', col: 1.4, row: 4.15, label: 'Stock' });
      piles.push({ id: 'waste', type: 'waste', col: 2.6, row: 4.15, fan: 'right', label: 'Waste' });
      piles.push({ id: 'f0', type: 'foundation', col: 4.6, row: 4.15, label: 'Discarded' });
      return { grid: { cols: 7, rows: 5.15 }, piles: piles };
    },

    deal: function (table, random) {
      var deck = Cards.shuffle(Cards.buildDeck(1), random);
      var at = 0;
      for (var row = 0; row < ROWS; row++) {
        for (var i = 0; i <= row; i++) {
          var card = deck[at++];
          card.faceUp = true;
          table.pile(slotId(row, i)).cards.push(card);
        }
      }
      var stock = table.pile('stock');
      while (at < deck.length) {
        deck[at].faceUp = false;
        stock.cards.push(deck[at++]);
      }
    },

    canPickUp: function (table, pile, index) {
      if (index !== pile.cards.length - 1) return false;
      return isAvailable(table, pile);
    },

    canDrop: function (table, cards, fromPile, toPile) {
      var card = cards[0];
      if (cards.length !== 1) return false;
      if (toPile.type === 'foundation') return card.rank === 13;
      if (toPile.type !== 'pyramid' && toPile.type !== 'waste') return false;
      if (!isAvailable(table, toPile)) return false;
      return card.rank + toPile.top().rank === 13;
    },

    /** A matched pair (or a lone king) leaves the table immediately. */
    afterMove: function (table, fromPile, toPile, cards) {
      var foundation = table.pile('f0');
      if (toPile === foundation) {
        return [{ type: 'match', cards: cards.slice(), king: true }];
      }
      var pair = toPile.cards.splice(toPile.cards.length - 2, 2);
      for (var i = 0; i < pair.length; i++) foundation.cards.push(pair[i]);
      return [{ type: 'match', cards: pair, pile: foundation }];
    },

    stockAction: function (table) {
      var stock = table.pile('stock');
      var waste = table.pile('waste');
      if (stock.cards.length) {
        var card = stock.cards.pop();
        card.faceUp = true;
        waste.cards.push(card);
        return { ok: true, events: [{ type: 'draw', cards: [card], to: waste }] };
      }
      if (!waste.cards.length) return { ok: false, events: [] };
      if (table.redealsUsed >= table.config.redeals) {
        return { ok: false, events: [{ type: 'blocked', reason: 'No passes left' }] };
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
      return table.pile('waste').cards.length > 0 && table.redealsUsed < table.config.redeals;
    },

    isWon: function (table) {
      var slots = table.pilesOfType('pyramid');
      for (var i = 0; i < slots.length; i++) if (!slots[i].isEmpty()) return false;
      return true;
    },

    canAutoFinish: function () { return false; },

    status: function (table) {
      var left = table.pilesOfType('pyramid').filter(function (p) { return !p.isEmpty(); }).length;
      var passes = table.config.redeals - table.redealsUsed;
      return left + ' left · ' + passes + (passes === 1 ? ' pass' : ' passes') + ' remaining';
    },

    isAvailable: isAvailable
  };

  global.SC.Variants = global.SC.Variants || {};
  global.SC.Variants.pyramid = Pyramid;
})(typeof window !== 'undefined' ? window : self);
