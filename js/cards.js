/*
 * Solitaire Collection — cards, decks and deterministic shuffling.
 *
 * Every deal is produced from a numbered seed, so a deal can be replayed,
 * shared, or reproduced exactly in a test.
 */
(function (global) {
  'use strict';

  var SPADES = 0, HEARTS = 1, DIAMONDS = 2, CLUBS = 3;
  var SUITS = [SPADES, HEARTS, DIAMONDS, CLUBS];
  var SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
  var SUIT_GLYPHS = ['♠', '♥', '♦', '♣'];
  var RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  function isRed(suit) { return suit === HEARTS || suit === DIAMONDS; }

  /** mulberry32 — small, fast, well-distributed seeded PRNG. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Card(rank, suit, id) {
    this.rank = rank;          // 1 = ace … 13 = king
    this.suit = suit;
    this.id = id;
    this.faceUp = false;
  }

  Card.prototype.red = function () { return isRed(this.suit); };
  Card.prototype.label = function () { return RANK_LABELS[this.rank]; };
  Card.prototype.glyph = function () { return SUIT_GLYPHS[this.suit]; };
  Card.prototype.toString = function () { return RANK_LABELS[this.rank] + SUIT_GLYPHS[this.suit]; };

  /**
   * Build a deck.
   * @param {number} decks  how many 52-card decks (Spider uses 2)
   * @param {number[]} suits which suits to use — Spider's easier modes repeat
   *                         the same suit so the deck is still 104 cards
   */
  function buildDeck(decks, suits) {
    decks = decks || 1;
    suits = suits || SUITS;
    var cards = [];
    var id = 0;
    for (var d = 0; d < decks; d++) {
      for (var s = 0; s < suits.length; s++) {
        for (var r = 1; r <= 13; r++) {
          cards.push(new Card(r, suits[s], 'c' + (id++)));
        }
      }
    }
    return cards;
  }

  /** Fisher–Yates, driven by a seeded generator. */
  function shuffle(cards, random) {
    for (var i = cards.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = cards[i]; cards[i] = cards[j]; cards[j] = tmp;
    }
    return cards;
  }

  function randomSeed() {
    return Math.floor(Math.random() * 1000000) + 1;
  }

  global.SC = global.SC || {};
  global.SC.Cards = {
    Card: Card,
    SPADES: SPADES, HEARTS: HEARTS, DIAMONDS: DIAMONDS, CLUBS: CLUBS,
    SUITS: SUITS, SUIT_NAMES: SUIT_NAMES, SUIT_GLYPHS: SUIT_GLYPHS,
    RANK_LABELS: RANK_LABELS,
    isRed: isRed, rng: rng, buildDeck: buildDeck, shuffle: shuffle,
    randomSeed: randomSeed
  };
})(typeof window !== 'undefined' ? window : self);
