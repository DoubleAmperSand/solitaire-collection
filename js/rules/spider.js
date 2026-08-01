/*
 * Spider — two decks, ten columns. Build descending runs and a complete
 * king-to-ace run of one suit is lifted off the table.
 */
(function (global) {
  'use strict';

  var Cards = global.SC.Cards;

  function descendingSameSuit(cards) {
    for (var i = 1; i < cards.length; i++) {
      var prev = cards[i - 1], cur = cards[i];
      if (!cur.faceUp) return false;
      if (prev.suit !== cur.suit || prev.rank !== cur.rank + 1) return false;
    }
    return true;
  }

  /* Spider always uses 104 cards; the easier modes just repeat suits. */
  function deckFor(suitCount) {
    if (suitCount === 1) return Cards.buildDeck(8, [Cards.SPADES]);
    if (suitCount === 2) return Cards.buildDeck(4, [Cards.SPADES, Cards.HEARTS]);
    return Cards.buildDeck(2, Cards.SUITS);
  }

  var Spider = {
    id: 'spider',
    name: 'Spider',
    blurb: 'Ten columns, two decks. Clear eight full runs.',
    mode: 'stack',

    difficulties: [
      {
        id: 'one', name: 'One suit', blurb: 'Spades only. A gentle way in.',
        multiplier: 1, config: { suits: 1 }
      },
      {
        id: 'two', name: 'Two suits', blurb: 'Spades and hearts. The sweet spot.',
        multiplier: 2.2, config: { suits: 2 }
      },
      {
        id: 'four', name: 'Four suits', blurb: 'The full deck. Genuinely hard.',
        multiplier: 3.6, config: { suits: 4 }
      }
    ],

    layout: function () {
      var piles = [{ id: 'stock', type: 'stock', col: 9, row: 0, label: 'Stock' }];
      // completed runs stack up in a quiet fan; empty slots stay invisible
      for (var f = 0; f < 8; f++) {
        piles.push({
          id: 'f' + f, type: 'foundation', col: f * 0.34, row: 0,
          data: { quiet: true }
        });
      }
      for (var t = 0; t < 10; t++) {
        piles.push({ id: 't' + t, type: 'tableau', col: t, row: 1, fan: 'down' });
      }
      return { grid: { cols: 10, rows: 2 }, piles: piles };
    },

    deal: function (table, random, config) {
      var deck = Cards.shuffle(deckFor(config.suits), random);
      var at = 0;
      // 54 cards go out: six to the first four columns, five to the rest
      for (var t = 0; t < 10; t++) {
        var count = t < 4 ? 6 : 5;
        var pile = table.pile('t' + t);
        for (var i = 0; i < count; i++) {
          var card = deck[at++];
          card.faceUp = (i === count - 1);
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
      if (pile.type !== 'tableau') return false;
      if (!pile.cards[index].faceUp) return false;
      return descendingSameSuit(pile.from(index));
    },

    canDrop: function (table, cards, fromPile, toPile) {
      if (toPile.type !== 'tableau') return false;
      var top = toPile.top();
      if (!top) return true;                       // any run may fill a gap
      return top.faceUp && top.rank === cards[0].rank + 1;
    },

    /**
     * Spider lets a run sit on any card one rank higher, so most moves only
     * shuffle cards between equally good hosts. What counts as progress is
     * turning a card over, clearing a column, or gathering a run onto its own
     * suit — everything else is rearrangement.
     */
    progresses: function (table, move, from, to) {
      if (from.type !== 'tableau' || to.type !== 'tableau') return undefined;
      var under = from.cards[move.index - 1];
      if (move.index > 0 && under && !under.faceUp) return true;
      if (move.index === 0) return !to.isEmpty();

      var moving = from.cards[move.index];
      var top = to.top();
      if (!top || top.suit !== moving.suit) return false;
      // gathering onto its own suit only counts if it was not on its own suit
      // already — otherwise a run hops between two identical hosts for ever
      return !(under && under.faceUp && under.suit === moving.suit);
    },

    afterMove: function (table, fromPile, toPile) {
      var events = [];
      if (fromPile.type === 'tableau') {
        var exposed = fromPile.top();
        if (exposed && !exposed.faceUp) {
          exposed.faceUp = true;
          events.push({ type: 'reveal', card: exposed, pile: fromPile });
        }
      }
      events = events.concat(Spider.collectRuns(table, toPile));
      return events;
    },

    /** A finished king-to-ace run of one suit leaves the table. */
    collectRuns: function (table, pile) {
      if (!pile || pile.type !== 'tableau' || pile.cards.length < 13) return [];
      var tail = pile.from(pile.cards.length - 13);
      if (tail[0].rank !== 13 || tail[12].rank !== 1) return [];
      if (!descendingSameSuit(tail)) return [];

      var foundation = table.pilesOfType('foundation').filter(function (f) {
        return f.isEmpty();
      })[0];
      if (!foundation) return [];

      pile.cards.length = pile.cards.length - 13;
      for (var i = 0; i < tail.length; i++) foundation.cards.push(tail[i]);

      var events = [{ type: 'sequence', cards: tail, pile: foundation, suit: tail[0].suit }];
      var exposed = pile.top();
      if (exposed && !exposed.faceUp) {
        exposed.faceUp = true;
        events.push({ type: 'reveal', card: exposed, pile: pile });
      }
      return events;
    },

    stockAction: function (table) {
      var stock = table.pile('stock');
      if (!stock.cards.length) return { ok: false, events: [] };

      var tableaux = table.pilesOfType('tableau');
      for (var i = 0; i < tableaux.length; i++) {
        if (tableaux[i].isEmpty()) {
          return { ok: false, events: [{ type: 'blocked', reason: 'Fill every empty column first' }] };
        }
      }

      var dealt = [];
      for (var t = 0; t < tableaux.length && stock.cards.length; t++) {
        var card = stock.cards.pop();
        card.faceUp = true;
        tableaux[t].cards.push(card);
        dealt.push(card);
      }
      var events = [{ type: 'deal-row', cards: dealt }];
      for (var j = 0; j < tableaux.length; j++) {
        events = events.concat(Spider.collectRuns(table, tableaux[j]));
      }
      return { ok: true, events: events };
    },

    isWon: function (table) {
      var foundations = table.pilesOfType('foundation');
      for (var i = 0; i < foundations.length; i++) {
        if (foundations[i].cards.length !== 13) return false;
      }
      return true;
    },

    canAutoFinish: function () { return false; },

    status: function (table) {
      var left = Math.ceil(table.pile('stock').cards.length / 10);
      var done = table.pilesOfType('foundation').filter(function (f) { return !f.isEmpty(); }).length;
      return done + '/8 runs · ' + left + ' deals left';
    }
  };

  global.SC.Variants = global.SC.Variants || {};
  global.SC.Variants.spider = Spider;
})(typeof window !== 'undefined' ? window : self);
