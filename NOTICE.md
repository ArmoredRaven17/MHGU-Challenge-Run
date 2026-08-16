# Notices and Attributions

This project bundles game data and icons derived from third-party sources.
The original source code of this project is MIT-licensed (see
[LICENSE](LICENSE)). The following third-party materials retain their own
licenses and require attribution.

---

## Game IP

**Monster Hunter Generations Ultimate** and all related characters, item
names, monster names, weapons, and other in-game assets are trademarks and
© Capcom Co., Ltd. This project is an **unofficial fan-made challenge-run
tracker**. It is not affiliated with, endorsed by, or sponsored by Capcom.

---

## Game Data

### Quest list and Key Quest flags

The quest list and its `Key` (Key Quest) flag, used to build this app's
key-quest checklist, come from the
[MHGU Quest Randomizer](https://github.com/ArmoredRaven17)'s `QuestData.json`
(same author).

### Weapon trees

Weapon tree and level-name data, used to build this app's starter-weapon
picker and life tracking, is embedded at build time from
[mhgu-weapon-trees](https://github.com/ArmoredRaven17/mhgu-weapon-trees)'s
own `window.WDATA`, itself sourced from
[Kiranico](https://mhgu.kiranico.com/) and
[JoeLago/MHGUDB-iOS](https://github.com/JoeLago/MHGUDB-iOS) (MIT) — see that
project's own `NOTICE.md` for the full chain.

### Hunting Horn melodies

The Hunting Horn song list (note combination → songs and their effects) is
generated from the same
[mhgu-collection-tracker](https://github.com/ArmoredRaven17/mhgu-collection-tracker)
`mhgu.db`'s `horn_melodies` table (SQLite, from JoeLago/MHGUDB-iOS, MIT),
which traces to Kiranico per that project's `NOTICE.md`. Only the English
name and effect columns are re-emitted.

### Crafting recipes

The combination list — each result and its two ingredients — is taken from
[Kiranico](https://mhgu.kiranico.com/)'s "Combo List" page, read from a
locally saved copy at build time. Only the factual item names are
re-emitted (success rates and yields are not), and the page itself is not
redistributed with this project.

### mhgu.db (Hunting Horn melodies, and a build-time cross-check)

[mhgu-collection-tracker](https://github.com/ArmoredRaven17/mhgu-collection-tracker)'s
downloaded `mhgu.db` (SQLite, from JoeLago/MHGUDB-iOS, MIT, itself tracing
to Kiranico per that project's `NOTICE.md`) supplies the Hunting Horn
melody table, and is read at build time to verify the crafting list against
its own recipe table. No shop-price data from it is shipped: an earlier
version of the craftables lookup emitted a buyable flag derived from
`items.buy`, and that was removed.

---

## Icons and Visual Assets

### Monster and weapon icons, theme-picker assets, backgrounds, font

Carried over from the [MHGU Quest Randomizer](https://github.com/ArmoredRaven17)
(same author): `assets/MonsterIcons/`, the generic (non-rarity) weapon-type
icons in `assets/WeaponIcons/`, background textures, and the MHFU display
font. The monster icons trace to the **Monster Hunter Fandom wiki**
(monsterhunter.fandom.com), licensed
**[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)** — see the
Randomizer's own notes for provenance detail.

### Hunting Horn note icons

The eighth-note icons in `assets/NoteIcons/` (`note-<colour>.svg`, eight
colours) are carried over from
[mhgu-editor](https://github.com/ArmoredRaven17)'s
`public/icons/hh_notes/` (same author, MIT), where they are original
artwork rather than extracted game assets.

### Per-rarity weapon icons

The weapon tree view's node icons (`icon_<class>_r1..r10.png`,
`icon_<class>_rX.png` in `assets/WeaponIcons/`) are carried over from
[mhgu-collection-tracker](https://github.com/ArmoredRaven17/mhgu-collection-tracker)'s
`docs/assets/icons/`, which sources them from
[Category:MHGU Equipment Icons](https://monsterhunterwiki.org/wiki/Category:MHGU_Equipment_Icons)
on the independent **Monster Hunter Wiki** (monsterhunterwiki.org),
licensed **[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**.
By the share-alike clause, these bundled copies remain under that license.

---

## Colour system

The theme engine (one chosen colour, every surface's shade derived by
shifting lightness in HSL) is adapted from the
[MHGU Quest Randomizer](https://github.com/ArmoredRaven17)'s `app.js` and
`styles.css` (same author). The colour palette itself — the 18 Deviants —
is carried over from the
[MHGU Zenny Gauntlet](https://github.com/ArmoredRaven17/MHGU-Zenny-Gauntlet)'s
own theme, including its hand-tuned hex values (same author).

---

## Development — AI assistance

A large share of this project's source code was written with
**[Claude Code](https://claude.com/claude-code)** (Anthropic), directed and
reviewed by the author.

This is disclosed for transparency rather than to satisfy a licence term.
The project's code remains MIT-licensed (see [LICENSE](LICENSE)).

---

## Reporting Misattribution

If a person, project, or organization is misattributed or omitted from this
notice, please open an issue on the project repository and the file will be
updated.
