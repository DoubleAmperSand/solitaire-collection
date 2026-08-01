/*
 * FreeCell — everything face up from the start. Almost every deal is
 * winnable, so a loss is genuinely your own fault.
 */
(function (global) {
  'use strict';

  var Cards = global.SC.Cards;

  function descendingAlternating(cards) {
    for (var i = 1; i < cards.length; i++) {
      var prev = cards[i - 1], cur = cards[i];
      if (prev.rank !== cur.rank + 1) return false;
      if (Cards.isRed(prev.suit) === Cards.isRed(cur.suit)) return false;
    }
    return true;
  }

  /**
   * How many cards may travel together: one for the card itself, plus one
   * per free cell, doubled for every empty column. A column you are moving
   * *into* cannot also be used as a staging area.
   */
  function maxMove(table, toPile) {
    var freeCells = table.pilesOfType('cell').filter(function (c) { return c.isEmpty(); }).length;
    var emptyCols = table.pilesOfType('tableau').filter(function (t) { return t.isEmpty(); }).length;
    if (toPile && toPile.type === 'tableau' && toPile.isEmpty()) emptyCols--;
    emptyCols = Math.max(0, emptyCols);
    return (freeCells + 1) * Math.pow(2, Math.min(emptyCols, 12));
  }

  var FreeCell = {
    id: 'freecell',
    name: 'FreeCell',
    blurb: 'No hidden cards. Pure calculation.',
    mode: 'stack',

    difficulties: [
      {
        id: 'four', name: 'Four cells', blurb: 'The standard game.',
        multiplier: 1, config: { cells: 4 }
      },
      {
        id: 'three', name: 'Three cells', blurb: 'One less place to think.',
        multiplier: 1.9, config: { cells: 3 }
      },
      {
        id: 'two', name: 'Two cells', blurb: 'Brutally tight. Plan every move.',
        multiplier: 3, config: { cells: 2 }
      }
    ],

    layout: function (config) {
      var cells = config.cells || 4;
      var piles = [];
      for (var c = 0; c < cells; c++) {
        piles.push({ id: 'cell' + c, type: 'cell', col: c, row: 0, label: 'Free' });
      }
      for (var f = 0; f < 4; f++) {
        piles.push({ id: 'f' + f, type: 'foundation', col: 4 + f, row: 0 });
      }
      for (var t = 0; t < 8; t++) {
        piles.push({ id: 't' + t, type: 'tableau', col: t, row: 1, fan: 'down' });
      }
      return { grid: { cols: 8, rows: 2 }, piles: piles };
    },

    deal: function (table, random) {
      var deck = Cards.shuffle(Cards.buildDeck(1), random);
      for (var i = 0; i < deck.length; i++) {
        deck[i].faceUp = true;
        table.pile('t' + (i % 8)).cards.push(deck[i]);
      }
    },

    canPickUp: function (table, pile, index) {
      if (pile.type === 'cell' || pile.type === 'foundation') {
        return index === pile.cards.length - 1;
      }
      if (pile.type !== 'tableau') return false;
      var run = pile.from(index);
      if (!descendingAlternating(run)) return false;
      return run.length <= maxMove(table, null);
    },

    canDrop: function (table, cards, fromPile, toPile) {
      var first = cards[0];
      if (toPile.type === 'cell') {
        return cards.length === 1 && toPile.isEmpty();
      }
      if (toPile.type === 'foundation') {
        if (cards.length !== 1) return false;
        var top = toPile.top();
        if (!top) return first.rank === 1;
        return top.suit === first.suit && first.rank === top.rank + 1;
      }
      if (toPile.type === 'tableau') {
        if (cards.length > maxMove(table, toPile)) return false;
        var t = toPile.top();
        if (!t) return true;
        return t.rank === first.rank + 1 && Cards.isRed(t.suit) !== Cards.isRed(first.suit);
      }
      return false;
    },

    isWon: function (table) {
      var foundations = table.pilesOfType('foundation');
      for (var i = 0; i < foundations.length; i++) {
        if (foundations[i].cards.length !== 13) return false;
      }
      return true;
    },

    status: function (table) {
      var free = table.pilesOfType('cell').filter(function (c) { return c.isEmpty(); }).length;
      return free + ' free · move up to ' + maxMove(table, null) + ' cards';
    },

    maxMove: maxMove
  };

  global.SC.Variants = global.SC.Variants || {};
  global.SC.Variants.freecell = FreeCell;
})(typeof window !== 'undefined' ? window : self);
