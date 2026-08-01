# Solitaire Collection

Four solitaire games in the browser — **Klondike**, **Spider**, **FreeCell** and
**Pyramid** — with three difficulty levels each, a streak-based scoring system,
and a card room that works in light or dark.

No build step, no dependencies, no assets to download. The cards are drawn in
CSS, the sound is synthesised with the Web Audio API, and every deal is
numbered so a good one can be played again.

## Running it

```sh
git clone https://github.com/DoubleAmperSand/solitaire-collection.git
cd solitaire-collection
npx http-server . -p 8080
# then visit http://127.0.0.1:8080
```

Opening `index.html` directly works too. Because everything is static, GitHub
Pages will host it as-is: enable Pages on the `main` branch from the repository
root — no workflow required.

## Playing

- **Tap** a card to send it to a foundation when it obviously belongs there.
  Otherwise tap it to pick it up, then tap where it should go. Drag works too.
- **Tap the stock** to turn cards over, deal a row, or start another pass.
- Keyboard: `u` or `⌘/Ctrl-Z` undoes, `h` asks for a hint, `r` restarts the
  deal, `space` taps the stock, `Esc` closes a dialog.
- Asking for a hint again from the same position shows the next idea rather
  than repeating the first, and only the first one costs points.
- The layout reflows for phones in both orientations, cards resize to fit the
  screen, and long columns tighten their fan rather than running off the board.

## The games

| Game | Difficulties | What changes |
| --- | --- | --- |
| **Klondike** | Relaxed / Standard / Strict | Draw one or three; unlimited redeals or a single pass |
| **Spider** | One / Two / Four suits | How many suits are in the two decks |
| **FreeCell** | Four / Three / Two cells | How many free cells you get, which also caps how many cards move at once |
| **Pyramid** | Relaxed / Standard / Strict | Three, two or one pass through the stock |

### Suits

Klondike and FreeCell can be dealt from **one, two or four suits**, chosen
separately from the difficulty. The deck is always 52 cards — the thinner ones
simply repeat the suits they use, so a one-suit deck is four runs of spades.
With a single suit there are no colours left to alternate, so rank alone
decides what stacks; with two, colours still alternate but there are twice as
many cards that fit anywhere.

Fewer suits scales the score down (×0.5 for one, ×0.75 for two) and keeps its
own high scores and statistics, so an easier deck never lands on the four-suit
table. Spider is unchanged: its difficulty already *is* the suit count.

Every rule is the standard one, including the fiddly parts: only kings fill an
empty Klondike column, Spider refuses to deal a row while a column sits empty,
FreeCell's supermove limit is `(free cells + 1) × 2^(empty columns)` with the
destination column excluded, and a Pyramid card is only playable once nothing
overlaps it.

## Scoring

| Event | Points |
| --- | --- |
| Card to a foundation | 50 |
| Completed Spider run | 500 |
| Pyramid pair / lone king | 60 / 40 |
| Face-down card revealed | 25 |
| Waste into play | 15 |
| Taking a card back off a foundation | −30 |
| Redeal | −40 |
| Undo / hint | −25 / −50 |

Each productive move raises your **streak**, which multiplies everything up to
×3. Undoing, redealing or asking for a hint resets it. Solving pays 1,500 plus
bonuses for finishing quickly, in few moves, and without help. Every award is
multiplied by the difficulty, from ×1 up to ×3.6 for four-suit Spider.

The top five scores per board are kept in `localStorage`, along with your rank
— Beginner up to Grandmaster. A board is a game, a difficulty and any
non-default options, so one-suit Klondike keeps its own table.

## Statistics

Games played and won, win rate, current and best win streak, fastest win and
fewest moves are counted per board, per game and overall, and shown from
**Statistics** on the home screen. A game counts when it ends: solved, stuck,
or walked away from part-way through, which counts as a loss. Opening a deal
and changing your mind before moving anything is not a game and counts
nothing.

## URL parameters

- `?game=klondike|spider|freecell|pyramid`
- `?level=<difficulty id>` — e.g. `standard`, `two`, `four`, `strict`
- `?suits=1|2|4` — Klondike and FreeCell only
- `?deal=1234` — replay an exact deal

For example `?game=klondike&level=strict&suits=2&deal=1234`.

## Layout

```
index.html            markup and dialogs
css/style.css         the token-based design system, light and dark
js/cards.js           deck building and seeded shuffling
js/game.js            piles, moves, snapshot undo, hints, auto-finish, options
js/rules/*.js         one module per game: layout, deal and rules
js/view.js            card elements, responsive layout, tap and drag input
js/score.js           scoring, streaks, high scores and lifetime statistics
js/fx.js              particles and the winning card shower
js/sound.js           synthesised sound effects
js/app.js             screens, game flow, settings
```

Every variant is expressed as a set of piles plus a handful of rule callbacks,
so one move engine, one renderer and one input layer serve all four games.
Undo works from full snapshots rather than inverse moves — with at most 104
cards a snapshot is tiny, and it stays correct no matter how unusual a
variant's move is.

## Licence

MIT — see [LICENSE](LICENSE).
