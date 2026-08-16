# CLAUDE.md

Guidance for Claude Code working in this repo.

## Project

**MHGU Challenge Run** — a static GitHub Pages site tracking a permadeath
challenge run in Monster Hunter Generations Ultimate: root-tier starting
weapon, one life per weapon, +1 life per HR rank-up (driven by a real,
hand-sourced HR1→HR12→Victory urgent-quest chain), all Hub/Pub Key Quests.
No build step, no framework, no dependencies for the deployed app.

**To develop:** `python -m http.server 5581 --directory docs`, or use the
`mhgu-challenge-run` entry in this repo's own `.claude/launch.json` (also
mirrored into the Randomizer's, alongside its other sibling entries). Open
over `http://`, not `file://` — localStorage is isolated on `file://`.

## Files

| File | |
|---|---|
| `docs/index.html` | Markup: titlebar, sidebar, the Quests/Weapons page tabs, modals |
| `docs/styles.css` | All styling; theme CSS variables set at runtime |
| `docs/app.js` | All logic (one IIFE, no modules) |
| `docs/data.js` | Generated — `window.MHGU_CHALLENGE_DATA = {keyTiers, urgentChain, victory, classes, craftables}` |

**Every `.modal` closes on a backdrop click**, not just its own Close/Cancel
button — one delegated listener per `.modal` element checks `e.target ===
modal` (true only when the click didn't land on a descendant like
`.modal-card`, i.e. the dimmed area around the card), same convention the
Quest Randomizer uses. `#confirmModal` is special-cased to trigger
`$("confirmCancel").click()` rather than hiding itself directly — a
`confirmAction()` call attaches fresh OK/Cancel listeners each time and
removes them in its own `cleanup()`, so hiding the modal without going
through Cancel would leak that pair onto the next call, and Cancel is also
just the correct outcome for backing out of a confirm dialog this way.
Adding a new modal only needs the `.modal` class on it — no extra wiring.

**Stacking order, and why `.tree-canvas` carries `isolation: isolate`.**
`renderWeaponTree()` gives every tree node an inline `z-index` of `1000 + i`
to control paint order *among the nodes themselves* (so `cur` stacks over
`ghost`, etc.). `.tree-canvas` is `position: relative` with `z-index: auto`,
which does **not** create a stacking context — so those 1000+ values were
competing in the root stacking context and painting straight over modals,
which sat at `z-index: 100`. `isolation: isolate` scopes them to the canvas
without changing anything about how the nodes order internally. The modal
layer was also raised to `3000`, above `.stat-tip`'s `2000`, so a hover
tooltip left over from the tree can't float across a modal either. Order is
now: page content → `.stat-tip` (2000) → `.modal` (3000), with all tree-node
z-indexes contained inside the canvas. **Don't give `.tree-canvas` a
`z-index` or remove the isolation** — either reopens this, and it presents
as "tree elements render on top of modals," which looks like a modal bug
rather than a stacking-context one.

**Two content pages, one persistent sidebar.** `#questsPage` (Hunter Rank
Progress panel + Key Quest checklist) and `#weaponsPage` (weapon lives) are
separate divs toggled by `activeTab` in `app.js` — see `renderTabs()`. The
sidebar (`#runStatus`: starting class, weapon rules, quest rules, HR, lives
alive/total, plus the End Run button) stays visible across both tabs. There
is deliberately no HR stepper — see "Hunter Rank Progress" below. There is
no *standalone* Victory panel — an early version (always-visible Ahtal-Ka +
3 Fatalis checkboxes) did nothing useful and was removed. The Fatalis
checklist that exists now lives inside the Hunter Rank Progress panel
itself, only appears once relevant (Advanced quest rules, Ahtal-Ka down,
not yet fully won), and checking a box has a real effect — see "Quest
Rules and Victory" below.

**Critical:** the Pages CDN caches by full URL. Every push touching
`styles.css`, `app.js` or `data.js` **must** bump the `?v=N` on its tag in
`index.html`, or users keep the stale copy until they hard-refresh.

## Core concept

The unit of loss is a **weapon life** — `run.lives[]`, each
`{classSlug, rootTreeId, currentKey, status: "alive"|"sold"}`. `currentKey`
(`"treeId:level"`) fully determines a life's position; the whole path it
climbed back to its root is always derivable by walking `node.parent`, so
nothing else needs storing (see "Weapon tree view" below). Start with 1
life. +1 life every time Hunter Rank goes up — HR advancement is driven
entirely by the real urgent-quest chain, not a manual stepper — see
"Hunter Rank Progress" below.

Failing a quest sells the weapon in play, permanently — `status: "sold"`, no
replacement. The run ends once `aliveLives().length === 0`; `settleRunEnd()`
latches that into `run.ended`/`run.endReason` so a reloaded finished run
recognizes itself without a fresh mutation, the same pattern the Zenny
Gauntlet uses for its own run-over state.

A new life (from a Hub rank-up) may be **any** tree, not just a starter —
that restriction only applies to the very first weapon. Every new life
still has to start at that tree's root/base level, never skipping ahead.

**Every class offers exactly three starting trees, but only Petrified is
universal.** Six classes have no Iron root (Sword & Shield, Dual Blades,
Charge Blade, Heavy Bowgun) and two of those have no Bone either (Bow,
Light Bowgun). `STARTER_SUBSTITUTES` in `app.js` fills the gaps with
hand-picked stand-ins, named by the app's owner from game knowledge rather
than derived from the data: Bow → Hunter's Bow + Hunter's Stoutbow, Light
Bowgun → Cross Bowgun + Hunter's Rifle, Heavy Bowgun → Arbalest, Sword &
Shield → Hunter's Knife, Dual Blades → Twin Daggers, Charge Blade → Elite
Blade. All eight are real rarity-1 roots in the tree data. **Don't
"correct" one for not matching the Petrified/Iron/Bone naming** — that's
exactly why the list is hand-written. `startersFor()` concatenates
prefix-matched roots with a class's substitutes, so the picker shows three
everywhere.

**`run.weaponRulesMode` ("basic" | "advanced") controls whether a new life
can change weapon class, chosen once on the start screen (a `.page-tabs`
toggle, mirroring the Quests/Weapons tab styling) and fixed for the whole
run — a lever, not a hardcoded choice, the same pattern as every other
rule in this app family that could reasonably go either way.** It's one of
two independent start-screen toggles now (see "Quest Rules and Victory"
below for the other, `run.questRulesMode`) — kept as two separate fields
and two separate `.page-tabs` blocks rather than one generalized "rules"
concept, since they govern unrelated things and there are only two of
them. Basic
(default): a rank-up's new life can be any of the 14 classes, not just the
one the run started with. Advanced: every life must stay `run.class` (the
starting class) — the original, only behavior before this existed. This is
why every life stores its own `classSlug` instead of relying on `run.class`
globally: `currentNodeInfo()`, `buildLifeGraph()`, and the node icon
(`weaponRarityIcon()`) all key off `life.classSlug`, not `run.class` —
`run.class` now means specifically "the class the run started with," used
only for the sidebar label and the very first life. **A save from before
this existed has no `classSlug` on its lives; `load()` backfills it to
`run.class`, which is exactly correct since every life actually was that
class back then.**

The new-life picker (`#newLifePicker`, Weapons page) gets a class `<select>`
(`#lifeClassRow`) under Basic rules, hidden under Advanced — see `pickerClass`
in `renderNewLifePicker()`/`renderLifeTreeResults()`. It defaults to
`run.class` on first open but persists whatever the player last browsed to
across multiple pending picks (`run.pendingNewLives > 1`) rather than
resetting after each one. Life cards show a small class tag only under
Basic rules (`.lc-class`) — under Advanced every life is already the same
class shown in the sidebar, so the tag would just be redundant noise.

**A tree already used as some life's root doesn't show up again.**
`renderLifeTreeResults()` excludes any tree whose id matches
`life.rootTreeId` for *any* life in `run.lives` of the browsed class — sold
lives included, not just alive ones, since the point is "you've already
had a life on this line this run," not "you currently have one." Scoped by
`life.classSlug === c.slug`: under Basic weapon rules a life can be any
class, and tree ids aren't unique across classes, so an unscoped check
would wrongly exclude an unrelated tree in a different class that just
happens to share a numeric id. If the filtered list comes up empty because
every tree in that class is used (not because of the search query), the
empty-state message says so explicitly rather than the generic "No trees
match." — distinguished via `usedTreeIds.size >= c.trees.length`.

### Quest Rules and Victory

**`run.questRulesMode` ("basic" | "advanced") is the second start-screen
toggle, independent of weapon rules, controlling what "Victory" means.**
Basic (default): slaying Ahtal-Ka is Victory. Advanced: Ahtal-Ka is a
milestone, not the finish line — Victory also needs all three Fatalis
(`run.fatalisCleared: {fatalis, crimson, old}`), in the same run.
`victoryAchieved()` is the single source of truth both `renderRankPanel()`
and `renderQuestProgress()` read, specifically so the two panels can't
drift into disagreeing about whether the run is actually won:
```js
function victoryAchieved() {
  if (!run.ahtalKaCleared) return false;
  if (run.questRulesMode !== "advanced") return true;
  return FATALIS_KEYS.every(k => run.fatalisCleared[k]);
}
```

**`run.ahtalKaCleared` still means exactly what it always did — the urgent
chain's last step ("Castle on the Run," which *is* the Ahtal-Ka hunt) is
done.** That doesn't change between modes; only whether it's *sufficient*
for `victoryAchieved()` does. `triggerRankUp()` still sets it unconditionally
on that step, and still shows a confirm dialog either way, just with
different copy: Basic still says "this marks Victory," Advanced says
Ahtal-Ka is down but Victory needs the three Fatalis too.

**The three Fatalis checkboxes live in their own "HR13+" panel in
`#tierList` (`renderTierList()`), not inside the Hunter Rank Progress
panel.** They first shipped inside `renderRankPanel()`'s "chain complete"
branch (`currentUrgentStep()` returns null) — appearing once relevant
(`questRulesMode === "advanced" && ahtalKaCleared && !victoryAchieved()`)
so checking a box had a real effect, unlike an even earlier standalone
Victory panel (always-visible Ahtal-Ka + 3 Fatalis checkboxes) that did
nothing and was removed. Moved out to its own panel once asked for one:
"HR13+" isn't a real Hunter Rank (the tracked chain tops out at HR12/
Victory) — it's a label for what comes after, matching the visual/
behavioral language of every other tier panel (locked/frozen/COMPLETED,
same markup) rather than inventing a different UI for the same three
booleans. Unlike the other 11, it isn't built from `DATA.keyTiers` — it's
hand-assembled in `renderTierList()` after that loop, reading
`DATA.victory.{fatalis,crimson,old}.quests`, specifically the `t === "Pub"`
entry for each (every Fatalis monster also has a same-hunt duplicate under
`Events` — `t === "Events"` — deliberately not shown here; "list the
Fatalis quests from G4" meant the Pub G4★ ones). Locked until
`run.ahtalKaCleared`; frozen (checkboxes disabled) once locked OR once all
three are checked, same `frozen` logic as every other tier. Checking a box
writes straight to `run.fatalisCleared[k]`, the same field `victoryAchieved()`
already read — no new state, just a proper home for editing it. The
now-redundant checklist markup was removed from `renderRankPanel()`,
replaced with a one-line pointer ("see the HR13+ panel below") — two live
checkbox UIs bound to the same three booleans would just be confusing, not
a feature.

**The whole HR13+ panel only renders under Advanced quest rules** — under
Basic, Victory ends at Ahtal-Ka and `fatalisCleared` never factors into
`victoryAchieved()` at all (see its early return), so the panel would be
inert clutter with no effect on anything. `renderTierList()` wraps the
entire block in `if (run.questRulesMode === "advanced")`; the other 11
tier panels aren't gated this way since Key Quests matter under both
modes.

**"Quests to Victory" (see "Quest page progress panel" below) has a third
branch for this**: once `ahtalKaCleared` but not yet `victoryAchieved()`
(only reachable under Advanced), it switches from counting Key/urgent
quests to counting unchecked Fatalis (3 → 0), a different unit but still
landing on 0 exactly when `victoryAchieved()` flips true.

**Picking a new life's tree is inline on the Weapons page, not a modal.**
`triggerRankUp()` sets `run.hr` and increments `run.pendingNewLives` in the
same step — the rank-up has already happened by the time the picker shows,
so there's nothing left to "cancel". `renderNewLifePicker()` (called from
`renderLives()`, so it stays in sync everywhere that's called) shows/hides
`#newLifePicker` based on that count; picking a row calls the same
`newLife()` used everywhere else and decrements it. This replaced an
earlier `#newLifeModal` with a Cancel button that closed the picker while
leaving the pending state conceptually true but nothing tracking it — the
player kept the HR gain but lost the weapon life it was supposed to grant,
with no way back short of a fresh rank-up. Making the picker part of the
page instead of a dismissable overlay means switching tabs, reloading, or
just looking around no longer has a "lose the weapon" side effect — the
only way to clear a pending life is to actually pick a tree.

**`pendingNewLives` is a count, not a flag, on purpose.** Nothing gates the
urgent-quest chain on the picker being cleared first — the tracker doesn't
force a shop trip between rank-ups any more than the real game does — so a
player can clear a second urgent quest (and a second rank-up) before ever
picking a tree for the first. An early version used a boolean here:
`triggerRankUp()` set it to `true` on every rank-up, and picking a tree set
it back to `false` — so stacking two rank-ups before ever opening the
picker silently dropped the second life (HR advanced twice, only one
weapon ever got granted, no error). Fixed by incrementing on every rank-up
and decrementing on every pick instead of set/clear, with
`renderNewLifePicker()`'s hint text showing the outstanding count
("Pick 2 new weapons") whenever it's more than one, and the picker staying
open after a pick until the count reaches zero.

## Data generation

Three independent generators, each writing an intermediate JSON file, plus a
merge step that combines them into `docs/data.js`:

```bash
node scripts/build-quests.js       # -> docs/data-quests.json
node scripts/build-trees.js        # -> docs/data-trees.json
node scripts/build-craftables.js   # -> docs/data-craftables.json
node scripts/build-horn-songs.js   # -> docs/data-horn-songs.json
node scripts/merge-data.js         # -> docs/data.js
```

The three intermediate JSON files are gitignored — only `docs/data.js`
(the merged output) is committed.

- **`build-quests.js`** reads the Randomizer's `QuestData.json`, filters to
  `Key === true` **and `Type` in `Hub`/`Pub`** (Village excluded — see
  placeholder below), groups by `Type + Level` into `keyTiers`. Also builds
  `urgentChain` from a hand-sourced `URGENT_CHAIN` table (see "Hunter Rank
  Progress" below) and extracts the Ahtal-Ka / all-three-Fatalis quest
  identities (by `Monster` name) into `victory`, kept around for whatever
  the eventual result screen needs even though nothing reads it today.
- **`build-trees.js`** reads `mhgu-weapon-trees/docs/index.html`'s embedded
  `window.WDATA` and strips every tree down to `{i, n, r, p, levels}` —
  `levels` is `[lv, name, attack, affinity, defense, slots, element[],
  sharpness, extra]` per entry, where `extra` unpacks the class-specific
  `L[7]` tuple — Hunting Horn `{notes, noteKey}` and bowgun
  `{ammo, internal, rapid, siege, reload, recoil, deviation}`, Bow
  `{arc, charges, coatings}`, and Switch Axe / Charge Blade `{phial}` —
  `null` for every other class. The four bowgun ammo
  tables come from separate `L[7]` slots: `x[3]` main (magazine per ammo level),
  `x[4]` rapid fire, `x[5]` internal, `x[6]` siege. **Rapid is LBG-only and
  siege HBG-only in the data** (LBG: 626/703 levels have rapid, 0 siege;
  HBG: 715/718 siege, 0 rapid) — both are read the same way for either
  class rather than branching on slug, since the irrelevant one is simply
  empty, and empty tables are omitted rather than rendered as bare
  headings. Bow reads `x[0]` arc shot, `x[1]` charges (`[shotIdx,
  loadUpFlag]` per level, in order) and `x[2]` coatings. Switch Axe and
  Charge Blade read `x[0]` as the whole phial string, kept raw rather than
  pre-split — Switch Axe carries a value ("Dragon 18"), Charge Blade never
  does (only "Impact" / "Element"), and doing the split at display time
  keeps that one rule in one place. Still dropped from `L[7]`: shelling
  (GL) and kinsect (IG) — nothing displays them. `r` (rarity) and `p` (branch-unlock link) are kept
  for the tree view's own node graph and per-rarity icon; the stats tuple is
  for the node tooltip (see "Weapon tree view" below). Still dropped: the
  per-class payload (phial/shelling/ammo/kinsect — `L[7]` in the source) and
  crafting mats (`L[8]`), since those aren't shared across every class the
  way attack/affinity/defense/slots/element/sharpness are.
- **`build-horn-songs.js`** queries the same `mhgu.db` for `horn_melodies`
  → `{noteString: [{n, e1, e2}]}`. **Keyed by the horn's 3-note colour
  string, not by weapon** — in MHGU the songs a horn can play are purely a
  function of its notes, so 50 combinations cover all ~800 horn levels and
  it ships as one shared few-KB lookup instead of a song list repeated on
  every level. The key letters (`W C R P Y G B O`) must stay in sync with
  `NOTE_LETTER` in `build-trees.js`, which converts a horn's own colour
  names into that key; `"Sky Blue" → B` is the one non-obvious pair.
  Validated by mapping all 801 horn levels and confirming every resulting
  combo exists in the table — 50 distinct, zero unmatched — so a mapping
  slip would show up as horns with no songs rather than wrong songs. Each
  song also carries `s`, the note **sequence** played to perform it (the
  DB's `song` column) — distinct from the key, which is the notes the horn
  *has*. Gated: every letter of every sequence must be one its horn owns,
  so a bad join fails the build rather than rendering unplayable songs.
- **`build-craftables.js`** reads Kiranico's saved "Combo List" page and
  emits **one entry per recipe** — `{n: result, a: ingredientA, b:
  ingredientB}` — which the lookup renders as `result = A + B`. 141 combos
  across 135 items; six Armor Spheres legitimately have two recipes each and
  both are listed. **Only recipe RESULTS are entries.** Ingredients appear in
  the recipe text but never as rows of their own — an item is listed because
  you can make it, not because it goes into something (Potion is both: a
  result of Herb + Blue Mushroom, an ingredient of Mega Potion; listed once,
  for the former). The lookup searches ingredients as well as results, so
  "Honey" answers "what can I make with this?" too.

  **No buyable flag, and no `mhgu.db` dependency for it.** An earlier version
  carried `buy` from the DB's `items.buy` price column and badged "Sold in
  shops"; that's gone — every row is craftable, which is the only thing the
  rule cares about. The DB is now used *optionally*, purely to cross-check
  that page and database still agree on what's craftable (they do, 177/177);
  the script runs fine without it.

  **Bowgun ammo and Bow coatings are deliberately excluded** — buying those
  is allowed by the rules, so flagging them would tell the player the
  opposite. There's nothing structured to filter on (every consumable has an
  empty `type`/`sub_type` in the DB), so it's name-matched: `AMMO_RE`
  requires the name to be `<KnownAmmoType> S[ Lv<n>]`, and a second pattern
  catches `...Coating[ Lv<n>]`. Two traps, both already hit: a bare
  `/\bS$/` also swallows **Barrel Bomb S**, which is a bomb and stays
  craftable — hence the anchored ammo-type whitelist; and `ALCHEMY_EXEMPT`
  keeps **Alchemy Coating**/**Alchemy Bullet** craftable, since those come
  from the Alchemy Barrel, not a bow or bowgun. The script prints every
  exclusion on each run, which is how the Barrel Bomb bug was caught —
  **keep that print**, and a gate fails the build if the Alchemy items ever
  get swept up.

  The Kiranico page isn't committed — it's their page, not ours to
  redistribute — so it must be present locally to regenerate. Argv order is
  **combo list first, db second** (the db being the optional one).

All the generators have sanity gates that exit non-zero rather than writing
suspect data (14 classes, every class has a Petrified root, Potion shows as
craftable, etc.) — same discipline as the Zenny Gauntlet's own build scripts.

## Explicit placeholders — not oversights

**Village Key Quests are excluded from the checklist.** Only Hub and Pub
rank-ups grant a weapon life, so the checklist only tracks Hub/Pub Key
Quests (`TRACKED_TYPES` in `build-quests.js`) — 60 quests across 11 tiers,
down from 118 across 21. "Must clear all Key Quests" in the original
ruleset may still mean Village too; this was narrowed deliberately for now
because ranking up is what this app actually tracks, not because Village
was ruled out. Revisit if that turns out wrong — it's a one-line change to
`TRACKED_TYPES`, re-run `build-quests.js` and `merge-data.js`.

## Hunter Rank Progress — the real urgent-quest chain

Real MHGU has one **urgent quest** per rank-up, entirely distinct from Key
Quests — every quest in this chain is `Key: false` in `QuestData.json`, so
it was never going to be findable by flagging one of the regular checklist
items (an earlier version of this app tried exactly that and was wrong).
There's also no field anywhere distinguishing "this is an urgent quest," so
this could not be derived from `QuestData.json` alone.

**Source: Kiranico's quest list** (`https://mhgu.kiranico.com/quest`,
worked from a saved local copy), which badges urgent quests distinctly
(`badge-danger "Urgent"`) from Key Quests (`badge-success "Key"`). Even
that data needed real MHGU knowledge to interpret correctly — Kiranico
groups quests into tabs by their own nominal star rank, which does **not**
line up 1:1 with which HR transition a given urgent quest actually gates:

- Some tabs bucket the urgents for *several consecutive* transitions
  together. Hub 7★'s tab alone contains the urgents for HR6→7, HR7→8,
  *and* HR8→9 (the last of which, "Legendary Skills?", is even tagged
  `Level: 8` in our own data despite living in the "7★" tab — there is no
  "Hub 8★" tier bucket at all).
- One transition (HR5→HR6) genuinely requires **both** of its tab's two
  quests, not either/or — everything else in the chain is single-quest.
- Three tabs (Hub 1★, Hub 4★, Pub 1★) have no urgent at all, confirmed by
  checking the raw HTML for any `badge-danger` in those tabs' markup, not
  a parsing gap.

The result — `URGENT_CHAIN` in `build-quests.js`, verified against
`QuestData.json` by exact `Type`+`Level`+name match (sanity-gated: exits
non-zero if any step doesn't resolve to exactly one quest) — is the
authoritative HR1→HR12→Victory table. It cannot be regenerated from
Kiranico's page mechanically; if it ever needs revisiting, that means going
back to a human with real game knowledge, not re-scraping.

**In `app.js`**: `run.urgentStepIndex` is how far through the 12-step chain
the run has gotten; `run.urgentChecked` is a flat array of checked quest
names (flat because the chain is strictly linear, unlike the per-tier
`keyQuestsChecked`). `renderRankPanel()` shows only the *current* step's
quest(s); checking all of a step's quests calls `triggerRankUp()`, which
confirms, advances `run.hr` (or, on the final step, sets
`run.ahtalKaCleared = true` instead — that last quest, "Castle on the Run,"
*is* the Ahtal-Ka hunt), and opens the new-weapon picker (skipped on the
final step — there's no HR13 to gain a life for). Whether that alone
*is* Victory, or just a milestone toward it, is `run.questRulesMode`'s call
— see "Quest Rules and Victory" below.

### Two gates — explicit per step, not the urgent's own data tag

Both the tier-lock and the urgent-checkbox-lock originally used the tier a
quest is tagged with in `QuestData.json` (e.g. "The New Tenant" is tagged
Hub 2★). That was wrong, caught by hand: **"The New Tenant" is Hub 1's
urgent** — clearing Hub 1★'s Key Quests is what makes it available, even
though the game data happens to tag the quest itself Hub 2★.

That correction generalized for a while into a *positional* rule (step *i*
is gated by `keyTiers[i]`), which read elegantly and was wrong at the
edges. **Gates are now written out explicitly**, one `gate: ["Hub", 1]` (or
`gate: null`) per `URGENT_CHAIN` entry in `build-quests.js`, emitted as
`gateT`/`gateLvl` — separate from `t`/`lvl`, which stays what the quest is
tagged and is only used to find it by name. Two hand-confirmed facts broke
the formula and are the reason it's a table now:

- **HR8's urgent is ungated** (`gate: null`). HR8 is the odd rank — Hub
  Key Quests stop at 7★ and Pub isn't open yet, so nothing precedes
  "Legendary Skills?"; reaching HR8 is the whole requirement. Positional
  gating had it waiting on Pub G1★, which isn't even unlocked then.
- **Every Pub gate shifts back one** as a result: HR9→10 needs Pub G1★
  (not G2★), and so on through Victory ← Pub G4★.

Sanity gates in `build-quests.js` now check each gate names a real tier,
that `gateT`/`gateLvl` are both-or-neither, and — the useful one — that a
step's gate tier unlocks no later than the HR the step is attempted at, so
an unreachable gate can never ship silently.

**A tier's own Key Quests unlock at exactly its own HR for Hub, one later
for Pub.** Gating an urgent and unlocking a tier's own checklist are two
*separate* mechanisms; an early version conflated them and opened every
tier one HR too soon (Hub 3★ live at HR2). Hub Nx★ → HR N. **Pub Gn★ →
HR (8 + n)**: G1★=HR9, G2★=HR10, G3★=HR11, G4★=HR12 — *not* HR8 for G1★,
which was the second half of the same HR8 oddity above (HR8 has no tier of
its own at all). Encoded as `TIER_UNLOCK_HR` in `build-quests.js`.
`renderTierList()` disables a locked tier's checkboxes and shows "Locked"
instead of its progress count, with an "Unlocks at HR N" hint.

**A step's urgent quest isn't checkable until its *gate* tier's Key Quests
are all cleared** — unless it has no gate, in which case it's checkable on
arrival. `tierFor()` + `tierKeyQuestsDone()` in `app.js` look up
`step.gateT`/`step.gateLvl` (not `step.t`/`step.lvl`) and disable the
urgent checkbox(es) with a "Locked until every ⟨gate tier⟩ Key Quest is
cleared" note until it's done. The null-gate case falls out for free:
`tierFor(null, null)` → `null`, and `tierKeyQuestsDone(null)` → `true`. The
gate note is still rendered for an ungated step (with an empty tier name)
but always `visibility:hidden`, so it reserves the same height without ever
showing "Locked until every  Key Quest is cleared" — see the fixed-gutter
note above for why it isn't simply omitted. `tierUrgentQuests()`, used for the
"COMPLETED" tier badge, matches the same way — a tier's associated
urgent(s) are whichever chain steps it *gates*, not whichever step it's
tagged on.

**That "Locked until…" note is always rendered, never conditionally
omitted** — `gateOpen` only toggles its `visibility` (hidden once unlocked),
not whether it exists in the markup. Omitting it outright used to shrink
the Hunter Rank Progress panel the instant its gate tier finished, a
visible resize at exactly the moment the player's attention is on that
panel (checking the box that unlocked it). Same text before and after
means the line keeps reserving the same height either way — a fixed
gutter, not a placeholder needing its own height tuned to match.

**Pub's real in-game label is "G1★".."G4★", not a bare number** — `Pub`
internally still uses `lvl` 1-4 (matches `QuestData.json`'s `Level` field
and keeps `tierKey()`/lookups simple), but every place a tier is *displayed*
goes through `tierLabel(t, lvl)` in `app.js`, which renders `Pub` as
`Pub G{lvl}★`. Don't format a Pub tier's label inline anywhere new — call
`tierLabel()` instead, or the G will silently go missing again.

Both checklist changes re-render each other (`renderTierList()` also calls
`renderRankPanel()` and vice versa) so a gate lifting is reflected
immediately, not just after a tab switch.

**Tier panels aren't user-collapsible, and never auto-collapse either —
every tier is always open** (`panel.dataset.open = "true"`, unconditionally),
so the whole checklist stays visible at a glance. An earlier version closed
a panel once its tier hit `completed`, as a "done, not needing attention"
signal — reverted; `completed` still drives the COMPLETED badge and
disables the checkboxes, it just no longer hides the panel's content. No
`openTiers`-style state to carry across re-renders (an earlier-earlier
version needed exactly that, since a naive rebuild-on-every-checkbox-change
would otherwise forget which panels a user had opened) — nothing to carry
now that it's always the same value. The `.panel-head` click handler that
used to toggle it is gone entirely, not just disabled. Checkboxes go
`disabled` (`.chk.na`) for two opposite reasons: `locked` (too early to
apply) or `completed` (already locked in) — both collapse to one `frozen`
flag so a completed tier's boxes can't be accidentally unchecked once its
urgent has fired.

**`#tierList` is a CSS grid that stretches every panel in a row to match
its tallest row-mate** (grid's default `align-items: stretch`, not
flex-wrap — that was tried first specifically to avoid this stretching,
then reversed once "make each panel the same size" turned out to be the
actual ask). A closed panel next to a tall open one now shows blank space
below its own header inside that stretched box. `.panel`'s own background
carries the texture that used to live only on `.panel-body` (visible only
when open, sized to its own content) specifically so that blank space
reads as "more of the same panel," not a mismatched flat-color gap —
`.panel` is a flex column with `.panel-body{flex:1}` so the body itself
also claims any extra stretched height when it *is* visible, rather than
leaving a seam between its own bottom edge and the panel's.

### Quest page progress panel

A right-hand `.quest-progress` column (`#questsPage` becomes a
`.quest-layout` flex row: `.quest-main` + this `<aside>`, stacking below on
narrow screens under 700px) shows four always-current stats via
`renderQuestProgress()`: Key Quests done/total (all 11 tiers, not just
unlocked ones), Quests to Victory, Weapons Active, Weapons Lost. Reuses the
sidebar's own `.run-status`/`.rs-row` markup rather than inventing a
second stat-row style.

**"Quests to Victory" is every remaining checkbox of either kind — Key
Quests AND urgent quests — not just one pool.** First shipped counting
*only* the 13 urgent quests across the whole chain (technically the real
rank-up trigger), via `urgentQuestsLeft()`: sums `step.quests.length` for
every step after the current one, plus whatever's still unchecked on the
current step, mirroring `currentUrgentStep()`/`urgentStepReady()`'s own
reading of `urgentStepIndex`/`urgentChecked` so it can't drift from what
the rank panel itself considers done. That shipped version sat right next
to "Key Quests X/60" but didn't move when a normal Key Quest was checked,
and reported the user's real-run 22 Key Quests done as unrelated to its
own small number — confusing, since the two stats read as parts of the
same total. Fixed: `renderQuestProgress()` now adds `urgentQuestsLeft()` to
`keyTotal - keyDone`, since reaching Victory genuinely requires clearing
every one of the 60 Key Quests too (each tier gates the next chain step,
so by the time the last step is reachable every tier before it is already
full) — this lands on 73 at a fresh HR1 run (60 + 13) and now decreases on
every relevant checkbox, key or urgent alike. `urgentQuestsLeft()` itself
is still correct and kept as-is; only what `renderQuestProgress()` does
with it changed. Reads "Victory!" once `victoryAchieved()` is true rather
than 0, since 0 reads as "nothing left to check" — see "Quest Rules and
Victory" above for the Advanced-mode third branch (Fatalis count) this
falls through to between `ahtalKaCleared` and full `victoryAchieved()`.

**No dedicated render call exists for this panel — it piggybacks on every
place that already re-renders the quest checklist or lives list.** Key
Quests and Weapons stats change in different handlers than the urgent
chain does, so `renderQuestProgress()` is called from all of: the key-quest
checkbox handler (inside `renderTierList()`), the urgent-quest checkbox
handler (inside `renderRankPanel()`), `triggerRankUp()`'s confirm callback,
and `renderAll()`'s dashboard branch (covers new-life picks and failures,
which already route through `renderAll()`). Adding a new place that
mutates `run.keyQuestsChecked`, `run.urgentChecked`, `run.urgentStepIndex`,
`run.ahtalKaCleared`, or `run.lives` without also calling this will make
the panel silently stale until the next full re-render.

## Weapons page layout

Two columns (`.weapons-layout`): a fixed 300px `.weapons-panel` on the left
and the tree taking the rest. The panel is a flex column whose inner
`#livesList` scrolls — `max-height` matches `.tree-canvas`'s
`min(72vh,620px)` so the columns line up, and **`min-height: 0` on the list
is required**, since a flex child otherwise refuses to shrink below its
content height and the panel grows instead of scrolling. Below 820px the
two stack and the panel caps at 420px.

**Life cards carry full stats**, not just name and level — attack,
affinity, slots, and conditionally defense/element/sharpness/bowgun
handling, rendered by the *same* `nodeStatRowsHtml()` the tree's hover
tooltip uses. Class extras go through `nodeExtraHtml()`, also shared:
**Hunting Horn notes + the songs those notes unlock (each with the note
sequence you play it with), the bowguns' four ammo tables, and Bow charge
levels + coatings.** The bowgun tables are main magazine-by-level,
Internal, and Rapid Fire (LBG) or Siege (HBG). Those are
real `<table>`s (`.x-table`), not flex lists, so the numeric columns line
up down the page once ammo names vary in length. The main table always
shows all three level columns with `—` for a level the gun can't load,
rather than dropping them, so the Lv1/2/3 headings stay meaningful across
every row. Worst case in the data is 19 rows across three tables
(Kamaeleon HBG) and it fits the panel without overflow.

**Switch Axe / Charge Blade** get a single Phial row in the left column and
no extras column at all — one scalar doesn't warrant one, and
`nodeStatBlockHtml` already collapses to a single column when
`nodeExtraHtml()` comes back empty. `phialHtml()` colours only the *type*
part (`PHIAL_COLORS`, ported from mhgu-weapon-trees' `PAL.phial`), leaving
any value neutral: "Dragon 18" reads as coloured "Dragon" + plain "18".

**Bow** puts arc shot in the left column (it's a scalar) and gets a Charge
levels table — Lv / Shot / Load Up — plus a coatings row. **Load Up is per
charge level, not per bow**: it marks a level only reachable with that
skill, so those rows are dimmed and tagged rather than hidden or silently
listed as available. Shot types are coloured by MHFU's shot rule
(`shotColor()`, pattern picks the channel, level deepens it) and coatings
by `COATING_COLORS`, both ported from mhgu-weapon-trees. Coating labels
drop the repeated word "Coating" since the heading already says it, but
keep the full name in `title` — "Power" and "Power 2" stay distinct.

**Layout is a two-column split** (`nodeStatBlockHtml` → `.stat-split`):
stat rows on the left, the class's song/ammo **list** to their right, one
item per line with its value right-aligned. Collapses to a single column
for classes with no extras. "Horizontal" meant exactly this side-by-side
split — a first pass read it as chips wrapping within a row, which is a
different thing entirely; don't revert to that. The weapons panel is
`clamp(300px,34vw,470px)` and `.stat-tip` widens to 400px only when it
actually has an extras column, both so the two columns have real room.
Bowgun reload/recoil/deviation stay ordinary left-column rows (scalars).

**Notes render as real eighth-note icons**, not coloured dots —
`assets/NoteIcons/note-<colour>.svg`, carried over from mhgu-editor (see
NOTICE.md), one per note colour. `NOTE_ICON_SLUG` maps colour name → file;
`LETTER_NOTE` is the inverse of `build-trees.js`'s `NOTE_LETTER`, needed
because song sequences arrive as letters (`"CCRW"`) and have to get back to
a colour to pick an icon. Ammo names are coloured by type
(`AMMO_COLORS`, ported from mhgu-weapon-trees' `AMMO_COL`).
`currentNodeInfo()` returns a `stats` object shaped exactly like a
tree-graph node's stat fields specifically so it can be passed straight in;
that's what keeps the two surfaces from formatting the same numbers
differently. Sold weapons keep their stats (the card is the only remaining
record of what was lost) — the `line-through` that used to apply to the
whole `.life-card` is now scoped to the name/level, since striking out the
stat rows made them unreadable.

## Weapon tree view (vertical, base at bottom, node-by-node)

The Weapons page shows the *current* life's tree as an interactive map —
ported from **mhgu-weapon-trees**' own tree renderer (same author, same
mechanism), trimmed to what this app needs: no attack/affinity/slots/
element/sharpness detail panel, just names, levels, rarity-tier icons, and
navigation. That app was built partly
*for* this reuse — see its `layout()`/`projectPersp()`/`route()`/
`path`+`advance`+`undo`/`classOf()` for the untrimmed original if this ever
needs to grow back toward full stats.

**Scoped to one life, not the whole class.** mhgu-weapon-trees lays out an
entire class (100+ trees) at once and filters by `activeRoot` for display.
This app doesn't need that: a life only ever climbs forward from wherever
it started, so `buildLifeGraph(classSlug, rootTreeId, rootLv)` builds just
that life's own reachable subtree — every tree hanging off any node it
could ever reach — fresh on each render (classes are small enough that
caching isn't worth the complexity). Note this deliberately **ignores**
`p` on the life's own starting tree even when that tree happens to have one
globally (i.e. is itself a "branch" of some other tree in
mhgu-weapon-trees' sense) — this app allows starting a new life at *any*
tree's base, not just true global roots (only the very first weapon is
restricted to Petrified/Iron/Bone), so a life's chosen starting tree is
always treated as its own local root regardless of what it branches off of
elsewhere.

**No path array is stored.** A life's climbed path back to its root is
always derivable by walking `node.parent` from `life.currentKey` — see
`classifyNodes()`, which walks that chain for the "past"/"cur" highlight
states, forward-BFSes for "next"/"far", and walks forward from any
on-path node's *untaken* branches for "ghost" (dashed, faint — a branch
you climbed past without taking, "still there" the same way
mhgu-weapon-trees marks it).

**A skipped branch stays choosable forever, not just at the moment it
unlocks** — climbing past its unlock level without taking it doesn't close
the in-game shop recipe, so the tracker shouldn't treat it as closed
either. `classifyNodes()` also returns `ghostRoots`: the *immediate* kid of
each on-path node that's ghost rather than on-path/ahead — i.e. just the
branch's entry point, not everything deeper into it (once you step onto a
ghost root, ordinary "next" node-by-node traversal takes over from there,
same as any other line). `renderWeaponTree()` wires a click handler onto
ghost-root nodes the same as "next" nodes (`advanceLife()`), tagged with a
`.clickable` class for its own soft hover state (muted ghost tone, not the
cyan "next" glow — still reads as "available," not "the obvious next
step"). `renderTreeChoices()` lists them too, under a separate "Still
open" heading below the ordinary next-step cards, since a small dashed dot
back down the map is easy to miss entirely.

**"Soft lines" means dotted *reachability connectors*, one drawn straight
from the current node to each still-open branch entry point — NOT dashed
styling on the branch's own edges.** Structure lines are all solid,
including a skipped branch's: the tree's shape doesn't change because you
walked past a fork, so its lines shouldn't either. The connectors cut
across the layout rather than following it (current node → somewhere you
could jump to), which is exactly what earns them a distinct dotted
treatment — solid means "this is how the tree is shaped," dotted means
"you can still get there from here." Drawn after the gold path in
`renderWeaponTree()`, one per `cls.ghostRoots`, colour-matched (`#e8c98a`)
to the warm border on the clickable ghost-root dots so the dot and its
line read as a pair.

This took three wrong passes to land, all from not asking what "soft
lines" meant before building: first dashing every skipped edge, then
un-capping the ghost BFS so deep branches stayed dashed throughout, then
raising dash opacity — each fixing a symptom of a feature that wasn't the
one requested. **If a visual instruction is open to more than one reading,
ask before implementing.**

**Nothing in the tree view is ever culled — every node and every
parent→child edge renders on every frame.** A node's class only changes
how its edge *looks*, never whether it's drawn. Several things used to
remove or appear to remove lines, all reported as "lines being culled" /
"I don't want the hard lines removed at all": (1) the tier grid drew a
moving 14-column window around `cam.u` over a fixed ±900 of x, so markers
popped in and out while panning — now spans the whole tree's actual
bounds; (2) both edge loops and the node loop `continue`d past anything
`project()` returned null for, a leftover from the old perspective
projection where nodes could sit behind the camera — orthographic never
returns null, so those skips were dead code that only invited the bug
back. **Don't reintroduce viewport culling here** — the SVG viewport
already clips off-screen geometry for free, and a few dozen extra `<line>`
elements is far cheaper than the bookkeeping to cull them correctly.

**(3) — and the actual cause of most of it — edge strokes must be explicit
literals, never `var(--line)`.** That token is `rgba(11,8,8,0.12)`:
near-black at 12% alpha. It's correct as a panel border, and completely
invisible against the tree canvas's dark navy (`rgb(6,16,48)`). `ghost`
and `past` edges fell through to it as the default, so they were drawn
every frame and simply could not be seen — indistinguishable from culling,
and it survived several rounds of "verified, the lines are there" because
`querySelectorAll('line').length` counted them happily. A screenshot is
what finally caught it. **When a line/text/border is reported missing,
check its computed colour against its actual backdrop before assuming the
element isn't being created.**

**The default camera frames the entire tree, not the current node.** It
used to sit at a fixed `dist: 560` centred on `curNode`, which put most of
the tree — including every soft-lined skipped branch — hundreds of px
off-canvas: the lines were drawn and correctly attached (verified: endpoint
within 1px of the target node's centre) but effectively invisible without
hand-panning to find them, which is why "still don't see soft lines" came
back even after they were rendering fine. Now it centres on the node
bounding box and solves for the zoom that fits it (`dist = 260 / sFit`,
padded, clamped to `[120, 2600]` and floored at `s ≤ 0.55` so a two-node
tree doesn't balloon). Same fit runs on Recenter (`cam = null`) and
whenever the current node changes. **When verifying anything about this
view, check what's actually on-screen at default zoom** — counting DOM
nodes or SVG lines says nothing about whether the player can see them.

**Layout** (`layoutGraph()`) is `place()` ported near-verbatim: the primary
(non-branch) child lays out directly above its parent, branch children fan
out left/right alternately with a fixed gap, packed against whatever's
already placed so nothing overlaps — the same code handles a straight-line
tree and a heavily-branching one uniformly, since a line just never
exercises the branch-offset half of the algorithm. **Spacing constants
(`USTEP = 300`, `XGAP = 220`, default `cam.dist = 560`) match the source
app's own tuning.** The first port had compressed these to `USTEP = 130,
XGAP = 78, dist = 420` without real justification, which read as names
overlapping — restored to the source's values rather than re-tuning from
scratch.

**Projection** (`project()`) is orthographic, not perspective — a genuine
departure from the source app's tilted "looking up a hillside" view (nodes
on a flat (x, u) plane, foreshortened by `FOV/zv`), not a variant of it. No
depth-based shrink: `cam.dist` is purely a zoom factor
(`s = 260 / cam.dist`), identical for every node regardless of depth.

**The axis mapping has changed three times** — tilted perspective →
horizontal left-to-right ("bird's eye") → vertical bottom-to-top, the
current one. All three read the *same* layout data; `layoutGraph()` has
never needed to know which is in use, and neither has the grid loop. Today:
`u` (progression) maps to screen-Y **negated** so the tree's base sits at
the bottom and climbing reads upward, and `x` (branch spread) maps to
screen-X. Pan follows: horizontal drag moves `cam.x`, vertical drag moves
`cam.u` with a **`+` sign** (not `-`) to cancel that negation, so content
keeps following the cursor. Wheel adjusts `cam.dist`. All direct, no
easing/animation loop unlike the source.

**Three things must stay in sync whenever this mapping changes**, and none
of them error when they disagree — they just render subtly wrong:
`project()` itself, the `sFit` fit calculation (which axis is measured
against canvas width vs height), and the pan handler's `dx`/`dy` → `cam`
assignment plus signs.

**Upgrading a weapon preserves zoom and pan.** `cam._life` is keyed on the
life's *identity* — `classSlug + ":" + rootTreeId`, stable for its whole
climb — not on `life.currentKey`, which changes with every upgrade and so
made each advance look like a new life and re-fit the camera, discarding
whatever zoom the player had set. Class+root is unique per life because a
tree can only be used once per run. Switching to a *different* life still
reframes, which is the point. Pan is left alone too, except that the
just-reached node is nudged back inside an 80px margin if it would have
landed off-canvas (possible when zoomed well in, where one step is a long
way in screen pixels) — the smallest shift that keeps it visible, rather
than a re-frame.

**The camera refits when the canvas SIZE changes, not just the life.**
`renderWeaponTree()` reads `canvas.clientWidth || 600` / `clientHeight ||
400` — and a hidden `#weaponsPage` makes those `0`, so the first render
after a run starts (which happens while the Quests tab is showing) builds a
camera framed for a 600×400 canvas that doesn't exist. The tree then sat
noticeably off-centre and over-zoomed, with the giveaway being a tree
centre landing near (300, 200) instead of the real canvas centre. Two
guards, deliberately belt-and-braces: `renderTabs()` calls
`renderWeaponTree()` after un-hiding the page, and `cam` stores `_w`/`_h`
so any size change (tab switch, window resize) triggers a refit on its own
rather than depending on one caller remembering. **Don't drop the `_w`/`_h`
check** — the explicit call alone would leave window resizes stale.

**Camera state is not persisted** — `cam` is a bare module variable, reset
(`cam = null`) whenever the current life changes or Recenter is pressed, so
switching lives or reloading always reframes on that life's current node
rather than restoring wherever the view was left.

**Node visual language ported for real, not approximated** — the first
version was a single pill with text in it, which read as noticeably
flatter than the source app. Real structure now: a `.tdot` (icon square,
state carried by border colour and glow, `@keyframes tpulse` for the
current node) + `.tlbl` (name) + `.tsub` (level), matching the source's own
`.dot`/`.lbl`/`.sub`.

**Node icons are per-rarity, not per-class.** Each node already carries `r`
(a tree's rarity — constant across the whole line, per `build-trees.js`),
so `weaponRarityIcon(slug, r)` picks `assets/WeaponIcons/icon_<slug>_r{1-10
or X}.png` per node — pulled from `mhgu-collection-tracker`'s icon set (see
NOTICE.md), 154 files (14 classes × 11 rarities) copied in wholesale since
they're small (~2.1MB total) and this app has no build step to fetch them
on demand. Rarity 0 (a handful of unused "(DUMMY)" trees in the source
data — not something this app needs to otherwise care about) falls back to
the plain class icon via `weaponIcon()`, same as any unrecognized value.
This is data the app already had (rarity was carried on every node from
the start) — only the *display* was deliberately minimal, not the
underlying data.

**A node's full stats show in a hover tooltip** (`#statTip`, a single
viewport-fixed `position:fixed` div, not part of the tree canvas — the
canvas's own `overflow:hidden` would clip anything anchored inside it).
This is the one deliberate walk-back of "name/level/rarity-icon only,
nothing else": the map and choices panel still show just name and level at
rest, but hovering a `.tnode` or a `.choice-card` calls `showStatTip()`,
which positions `#statTip` off the hovered element's own
`getBoundingClientRect()` (flips to the left if it would overflow the
right edge) and fills it via `nodeStatsHtml(n)` — attack, affinity
(green/red by sign), slots (`◯`/`–`), defense (only if nonzero), element
(only if present, coloured per `ELE_COLORS`, ported from mhgu-weapon-trees'
own `PAL.ele`/`PAL.status`), and a sharpness bar (blademaster only,
Base/S+1/S+2 rows, ported `SHARP_COLORS`/`sharpBarHtml()`). The per-class
payload (phial/shelling/ammo/kinsect/mats — `L[7]`/`L[8]` in the source)
still isn't carried into this app's data at all, so it can't show up here
either — see `build-trees.js`. Because `renderWeaponTree()` fully rebuilds
`#treeNodes` on every pan/zoom frame, `hideStatTip()` is called at drag-
start and on `wheel` too, so a tooltip anchored to an element that's about
to be replaced doesn't linger pointing at nothing.

**Labels are decluttered the same way the source does it**: a tree keeps
one name across many levels (e.g. "Petrified Blade" spans Lv1-7), so
labelling every node just repeats it up the line. A node only gets a label
if its name differs from its parent's (a rename point) or it's the current
node — everything else shows an empty `.tlbl` (collapsed by
`:empty{display:none}`). The `.tsub` level number still shows on every
node above a small scale threshold. **`cur` and `next` nodes are exempt
from that scale threshold** — they always show label and level regardless
of projected distance, and get a higher scale floor (0.85 vs 0.55 for
everything else). This was needed once spacing widened to the source's
real constants: farther-off "next" nodes were dropping below the label
visibility threshold by default, hiding the exact nodes a player is about
to click.

**Edges are two layers, not one** — plain structure (dim, next-step edges
lifted to cyan `#79d2ff`) drawn first, then the path actually walked (root
to current, derived by walking `parent` — see above) drawn *over* it in
solid gold `#f0c264` at full opacity. Matches the source's own separation:
structure says what the tree *is*, the gold overlay says where you've
*been*, and conflating them into one pass was what made the first version
read as flat.

**Faint vertical column markers** (`gridSvg` in `renderWeaponTree()`), one
per upgrade tier — under the old tilted projection these were horizontal
"ground" lines receding toward a horizon; now that `u` maps to screen-X
instead of depth, the *exact same* sweep-x-at-fixed-u loop draws vertical
lines instead, with no change needed to the loop itself. A reminder this
started as a "floor cue" ported from the source's own tilted-view grid,
not a feature designed from scratch for a top-down map — it happens to
still make sense here, drawn differently only because the axes swapped
under it.

**Nodes paint in RANK order** (ghost < far < next < past < cur), both for
z-index (`1000 + i` after sorting, source's own scheme) and so that if
projected positions ever overlap, whatever's more important to see stacks
on top.

**Undo steps back one node**, mirroring the source's own `undo()` — but
since this app never stored a `path` array to begin with (see above),
there's nothing to pop: `undoLife()` just reads `node.parent` off the
current node (via `nodesForCurrentGraph`, set on the last render) and
writes that back as `life.currentKey`. Works identically across a branch
boundary — undoing off a just-taken branch returns to the trunk node it
branched from, not to some notion of "previous branch state." The Undo
button (`#treeUndo`) disables itself whenever the current node has no
parent (you're at the life's own root — nothing to undo to). No
confirmation dialog, same reasoning as advancing: this corrects a
tracking mis-click, it has no bearing on the run's real permadeath
stakes (those are quest failures), and re-advancing afterward costs
nothing.

**Clicking only ever advances a `next`-class node** — one step, direct, no
confirmation dialog (unlike failing a weapon or ranking up, which are
genuinely consequential). Advancing within your own tree is just
bookkeeping; there's nothing to protect against. `advanceLife(life, key)`
is the one function both the map click and the choices-panel click go
through, so they can never drift apart.

**A "choices" side panel mirrors the source app's own** — `renderTreeChoices()`
lists the current node's immediate options (`curNode.kids`, which already
*are* exactly the "next" set) as readable cards, tagged "Branch" when the
option isn't the primary continuation. Finding the right small dot on a
dense map isn't always obvious; the card list is always right there. Both
the map and the panel call the same `advanceLife()`.

**Real bug, not just a missing feature: clicks on map nodes didn't fire at
all**, caught by the user with real mouse clicks (my own testing had used
`element.click()`, which bypasses the whole pointer-event pipeline and
never exercised the bug). Root cause: the pan handler called
`canvas.setPointerCapture()` on *every* `pointerdown` unconditionally,
including ones that landed on a node — and capturing the pointer disrupts
the browser's click-event synthesis, which depends on `pointerup` landing
on the same, uncaptured element as `pointerdown`. The source app avoids
this deliberately ("only starts an actual drag once movement exceeds a 5px
threshold — avoids eating clicks"), which the initial port read but didn't
actually implement. Fixed: `pointerdown` now only records a `pending`
start point; capture (and `dragging = true`) only happens once
`pointermove` exceeds a 5px threshold. `setPointerCapture`/
`releasePointerCapture` are also both wrapped in `try/catch` now — a
`NotFoundError` there (seen with synthetic test events lacking a real
active pointer) must never abort the camera update that follows it.

## Theme

Uses the Zenny Gauntlet's own 18-Deviant palette (`COLORS` in `app.js`),
carried over verbatim including its hand-tuned hex values — requested
explicitly, in place of the Randomizer's classic-monster set this app
started with. Default theme is Nightcloak Malfestio (`#07143C`), matching
the Zenny Gauntlet's own default. No per-tile variant pips (that app's
separate `VARIANTS` system, e.g. Bloodbath navy/blood) — not brought over,
not needed here unless asked for.

`applyTheme(hex)` derives every CSS variable from one hex via HSL lightness
shifts, same formula as the siblings. Init validates the saved hex against
`COLORS_HEX` before applying it and falls back to the default if it's not
there — same guard the Zenny Gauntlet uses, needed here specifically
because a save from before this swap (or any future palette swap) could
otherwise hold a hex that's no longer in the palette: the background color
would still half-apply (`applyTheme` doesn't validate its input), just with
no swatch showing selected and the title icon silently falling back to the
question mark.

## Related repos

Siblings sharing assets and the theme system, but no state: MHGU Quest
Randomizer (Key Quest source), mhgu-weapon-trees (tree data source),
mhgu-collection-tracker (craftables source via `mhgu.db`), MHGU Zenny
Gauntlet (closest sibling in shape — cfg/run split, derived-not-latched
run-over).

## Not built yet

- The header reads "MHGU Challenge Run **WIP**" deliberately while the app
  is still being built out; drop the suffix when it's ready to be shown off.
- The "Other MHGU Apps" modal in the seven sibling repos doesn't yet link
  back to this app — needs the canonical list update once this one has a
  live URL.
