/*
 * Klondike — the solitaire everyone means when they say "solitaire".
 */
(function (global) {
  'use strict';

  var Cards = global.SC.Cards;

  /**
   * Whether `upper` may sit on `lower` in a column. Normally that means
   * descending in alternating colours, but a one-suit deck has no colours
   * to alternate, so rank alone decides.
   */
  function stacks(config, lower, upper) {
    if (lower.rank !== upper.rank + 1) return false;
    if ((config.suits || 4) === 1) return true;
    return Cards.isRed(lower.suit) !== Cards.isRed(upper.suit);
  }

  function isRun(config, cards) {
    for (var i = 1; i < cards.length; i++) {
      if (!cards[i].faceUp) return false;
      if (!stacks(config, cards[i - 1], cards[i])) return false;
    }
    return true;
  }

  /* Always 52 cards; the thinner decks just repeat the suits they do use. */
  function deckFor(suitCount) {
    if (suitCount === 1) return Cards.buildDeck(4, [Cards.SPADES]);
    if (suitCount === 2) return Cards.buildDeck(2, [Cards.SPADES, Cards.HEARTS]);
    return Cards.buildDeck(1, Cards.SUITS);
  }

  var Klondike = {
    id: 'klondike',
    name: 'Klondike',
    blurb: 'The classic. Build four suits from ace to king.',
    mode: 'stack',

    options: [{
      id: 'suits',
      name: 'Suits',
      blurb: 'Thin the deck out and the columns get much kinder.',
      default: 4,
      choices: [
        {
          value: 1, name: 'One suit', short: '1 suit', multiplier: 0.5,
          blurb: 'Spades only. Rank alone decides what stacks.'
        },
        {
          value: 2, name: 'Two suits', short: '2 suits', multiplier: 0.75,
          blurb: 'Spades and hearts, twice over. Colours still alternate.'
        },
        {
          value: 4, name: 'Four suits', short: '4 suits', multiplier: 1,
          blurb: 'The full deck, the way it is meant to be played.'
        }
      ]
    }],

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

    deal: function (table, random, config) {
      var deck = Cards.shuffle(deckFor(config.suits), random);
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
      if (pile.type === 'tableau') return isRun(table.config, pile.from(index));
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
        return t.faceUp && stacks(table.config, t, first);
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

    /**
     * Redeals left, shown in the status bar — prefixed with the suit count
     * when it is not the usual four, since the header truncates on a phone
     * and it should stay obvious which deck you are playing.
     */
    status: function (table) {
      var suits = table.config.suits || 4;
      var lead = suits === 4 ? '' : (suits === 1 ? 'One suit · ' : 'Two suits · ');
      if (table.config.redeals === Infinity) return lead + 'Unlimited redeals';
      var left = table.config.redeals - table.redealsUsed;
      return lead + left + (left === 1 ? ' redeal left' : ' redeals left');
    }
  };

  global.SC.Variants = global.SC.Variants || {};
  global.SC.Variants.klondike = Klondike;
})(typeof window !== 'undefined' ? window : self);
