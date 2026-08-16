# MHGU Challenge Run

A permadeath challenge-run tracker for Monster Hunter Generations Ultimate.

**Live:** (not yet deployed)

## What it is

Start with one weapon — root-tier from a Petrified, Iron, or Bone tree. Fail a
quest and you sell that weapon, permanently, no replacement. Gain a new weapon
every time your Hunter Rank goes up, driven by a real HR1→HR12→Victory chain
of urgent quests. The run ends when you'd have to sell your last weapon.

Clear every Hub and Pub Key Quest along the way (Village is left out for now —
only Hub/Pub rank-ups grant a life). Completing the last urgent quest in the
chain ("Castle on the Run") *is* the Ahtal-Ka hunt, so finishing the chain
claims Victory automatically.

## Pages

A **Quests** tab (Hunter Rank Progress panel, Key Quest checklist) and a
**Weapons** tab — a persistent sidebar shows class, Hunter Rank, and lives
alive/total across both. The Weapons tab shows your current life's weapon
tree as an interactive 2.5D map: drag to pan, scroll to zoom, click a
highlighted node ahead to climb it. Branches you pass without taking stay
visible, faded, in case they matter later. Switch which life is current to
see that life's own tree.

## What it isn't

It doesn't track game-save state directly — everything is self-reported, same
as the [Zenny Gauntlet](https://ArmoredRaven17.github.io/MHGU-Zenny-Gauntlet/).
The tree view shows names and levels only, no stats — for full attack/
affinity/slots/element browsing, see
[mhgu-weapon-trees](https://armoredraven17.github.io/mhgu-weapon-trees/),
whose renderer this one's is ported from.

## Rules

- **Setup**: pick any weapon class. Your first weapon must be root-tier from a
  Petrified, Iron, or Bone tree — whichever of those exist for that class
  (every class has Petrified; some classes lack Iron and/or Bone).
- **Weapon lives**: start with 1. +1 every time Hunter Rank goes up via **Hub**
  content specifically (Village doesn't count). A new life can be any tree for
  your class, starting at its root.
- **Failure**: sell the weapon that failed, permanently, no replacement. Run
  ends when you'd have to sell your last one. Gathered items are kept; zenny
  isn't tracked.
- **Hunter Rank Progress**: a real, hand-verified chain of urgent quests
  (sourced from Kiranico, cross-checked against in-game knowledge) drives
  HR1 through HR12 and finally Victory. Most steps need one specific quest
  cleared; one step (HR5→HR6) needs both of its two.
- **Key Quests**: clear all Hub and Pub ones. Village is excluded from this
  checklist for now, since only Hub/Pub rank-ups grant a weapon life.
  Grouped here by rank tier — these are informational tracking only and
  don't drive rank-up (that's the urgent chain above).
- **No Harvest Tours.** No completing a quest via an optional subquest
  shortcut. No buying craftable items from the shop (check the lookup first).
- **Victory**: completing the urgent chain's last step *is* the Ahtal-Ka
  hunt. Chosen once at the start of a run, Basic Quest Rules ends Victory
  there; Advanced also requires all three Fatalis, tracked via a checklist
  that appears once Ahtal-Ka is down.

One thing is deliberately left open for now, documented in `CLAUDE.md`: which
substitute tree to use for the handful of weapon classes missing Iron or Bone.

## Development

Static site, no build step for the deployed app:

```bash
python -m http.server 5581 --directory docs
```

`docs/data.js` is **generated** — don't hand-edit it:

```bash
node scripts/build-quests.js       # Key Quests, from the Randomizer's QuestData.json
node scripts/build-trees.js        # weapon tree data, from mhgu-weapon-trees +
                                    # collection-tracker's materials (which trees
                                    # are forgeable) + mhgu.db (the HR each one
                                    # unlocks at, via its key material)
node scripts/build-craftables.js   # buyable/craftable items, from mhgu-collection-tracker's mhgu.db
node scripts/merge-data.js         # combines the three into docs/data.js
node scripts/verify-trees.js       # checks data-trees.json's branch links against
                                    # mhgu-collection-tracker's own parents data — run
                                    # this after build-trees.js, since nothing else
                                    # catches a stale or dropped branch link
```

GitHub Pages serves from `docs/`. Bump the `?v=N` on `styles.css`/`app.js`/
`data.js` tags in `index.html` on every push that touches them.

## Credits

Quest data, weapon trees, icons and the theme mechanism (one hex, every
shade derived by HSL lightness shift) come from the MHGU Quest Randomizer,
mhgu-weapon-trees, and mhgu-collection-tracker (same author). The actual
theme palette — the 18 Deviants — is the MHGU Zenny Gauntlet's own identity,
reused here rather than the Randomizer's classic-monster set. Monster
Hunter is © Capcom.
