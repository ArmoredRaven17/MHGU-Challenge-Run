// Builds the weapon-tree section of docs/data.js — the node graph the
// Weapons page's 2.5D tree view navigates, plus the core stats its node
// tooltip shows (attack/affinity/defense/slots/element/sharpness). The
// per-class extras mhgu-weapon-trees' own fuller detail panel has (phial
// type, shelling, ammo tables, kinsect, mats) are still dropped — this
// app's tooltip covers what every class shares, not class-specific detail.
//
//   node scripts/build-trees.js [pathToWeaponTreesIndexHtml]
//
// Source: mhgu-weapon-trees' docs/index.html, which embeds the full tree data as
// `window.WDATA[classSlug] = {label, mats, str, trees}`, each tree
// `{i, n, r, p, L}` (id, name, rarity, parent-link-or-0, level array). Each
// level entry is a fixed-position array — [0]=level, [1]=name, [2]=attack,
// [3]=affinity%, [4]=defense, [5]=slots, [6]=element (already spelled-out
// `[[kind, value], ...]`, no lookup table needed), [7]=class-specific
// payload (dropped), [8]=crafting mats (dropped), [9]=sharpness (blademaster
// only — 3 rows of 7 ints, Base/S+1/S+2 bands across Red..Purple).
// `p`, when present, is `[parentTreeId, unlockLevel]` — the node in another
// tree this one branches off. Kept verbatim so the client can build the same
// parent/kids graph mhgu-weapon-trees itself navigates.
const fs = require("fs"), path = require("path");

const SRC = process.argv[2] ||
  "C:/Coding Repos/mhgu-weapon-trees/docs/index.html";
// Second source: mhgu-weapon-trees carries the tree shape but not whether a
// tree can be forged from scratch, and that distinction is what decides
// whether a life can start on it. mhgu-collection-tracker's materials files
// keep it as create[treeId].d (a direct Create recipe) vs .f (only reachable
// by upgrading something else) — see its build-data.mjs. Read straight from
// there rather than inferring it from `p`: "is a branch" and "can't be
// forged" are different questions, and 231 trees are both a branch AND
// directly forgeable (Halberd, Lagiacrus Blade, Red Wing...).
const CT_MATERIALS = process.argv[3] ||
  "C:/Coding Repos/mhgu-collection-tracker/docs/data/materials";
// Third source: the HR a tree first becomes available at, which needs quest
// and recipe tables neither of the other two carry. See the HR section below.
const DB_PATH = process.argv[4] ||
  "C:/Coding Repos/mhgu-collection-tracker/data-src/mhgu.db";
const OUT = path.join(__dirname, "..", "docs", "data-trees.json");

if (!fs.existsSync(SRC)) {
  console.error("Cannot find " + SRC + "\nPass the mhgu-weapon-trees index.html path as an argument.");
  process.exit(1);
}
if (!fs.existsSync(CT_MATERIALS)) {
  console.error("Cannot find " + CT_MATERIALS + "\nPass mhgu-collection-tracker's docs/data/materials path as the second argument.");
  process.exit(1);
}
if (!fs.existsSync(DB_PATH)) {
  console.error("Cannot find " + DB_PATH + "\nPass mhgu-collection-tracker's data-src/mhgu.db path as the third argument.");
  process.exit(1);
}
const html = fs.readFileSync(SRC, "utf8");
const m = html.match(/window\.WDATA\s*=\s*(\{.*?\});/s);
if (!m) { console.error("ABORT: could not find `window.WDATA = {...};` in " + SRC); process.exit(1); }

let WDATA;
try { WDATA = eval("(" + m[1] + ")"); }
catch (e) { console.error("ABORT: WDATA did not parse as JS — " + e.message); process.exit(1); }

// ── Class-specific payload (L[7]) ─────────────────────────────────────────
// Everything before L[7] is shared across all 14 classes; L[7] is a
// per-class tuple whose shape depends on the weapon, indexed into that
// class's own `str` table. Only the parts this app displays are unpacked —
// every class that has one is now unpacked: Hunting Horn notes, bowgun
// ammo/handling, Bow arc/charges/coatings, Switch Axe / Charge Blade
// phials, Gunlance shelling, Insect Glaive kinsect. The plain blademaster
// classes (GS/LS/SnS/DB/Hammer/Lance) carry nothing in L[7] and stay null —
// sharpness, which is all they have beyond the shared stats, rides in L[9]
// and is handled with the other shared fields.
//
// Note letters (W/C/R/P/Y/G/B/O) are what horn_melodies keys its songs on,
// so they're emitted alongside the colour names rather than derived in the
// client. "Sky Blue" -> B is the one non-obvious pair; verified by mapping
// all 801 horn levels and confirming every resulting 3-letter combo exists
// in that table (50 distinct combos, zero unmatched).
const NOTE_LETTER = {
  White: "W", Cyan: "C", Red: "R", Purple: "P",
  Yellow: "Y", Green: "G", "Sky Blue": "B", Orange: "O",
};
function unpackExtra(slug, L, STR) {
  const x = L[7];
  if (!x) return null;
  if (slug === "hunting_horn") {
    const notes = (x[0] || []).map(i => STR[i]).filter(Boolean);
    if (!notes.length) return null;
    return { notes, noteKey: notes.map(n => NOTE_LETTER[n] || "?").join("") };
  }
  if (slug === "switch_axe" || slug === "charge_blade") {
    // x[0] is the whole phial as one string. Switch Axe carries a value
    // ("Dragon 18", "Paralysis 10"); Charge Blade never does — it's only
    // ever "Impact" or "Element". Kept as the raw string and split for
    // display rather than here, so the data stays exactly what the source
    // has and the type/value split lives in one place.
    const phial = STR[x[0]];
    return phial ? { phial } : null;
  }
  if (slug === "gunlance") {
    // x[0] is the whole shelling string, "<Normal|Long|Wide> Lv<1-5>".
    const shell = x[0] >= 0 ? STR[x[0]] : null;
    return shell ? { shell } : null;
  }
  if (slug === "insect_glaive") {
    // x[0] kinsect name, x[1] its damage type (Cutting / Blunt) — two
    // separate strings rather than one, unlike every other scalar payload.
    const kinsect = STR[x[0]], kinsectType = STR[x[1]];
    if (!kinsect) return null;
    return kinsectType ? { kinsect, kinsectType } : { kinsect };
  }
  if (slug === "bow") {
    //   x[0] arc shot type index (Focus / Wide / Blast), -1 if none
    //   x[1] charges  [shotIdx, loadUpFlag]  — one per charge level, in order
    //   x[2] coatings [strIdx, ...]
    // loadUp is per charge level, not per bow: it marks a level only reachable
    // with the Load Up skill, which is exactly the thing worth surfacing.
    const o = {};
    const charges = (x[1] || []).map(c => ({ shot: STR[c[0]], lu: !!c[1] })).filter(c => c.shot);
    const coatings = (x[2] || []).map(i => STR[i]).filter(Boolean);
    if (x[0] >= 0 && STR[x[0]]) o.arc = STR[x[0]];
    if (charges.length) o.charges = charges;
    if (coatings.length) o.coatings = coatings;
    return Object.keys(o).length ? o : null;
  }
  if (slug === "light_bowgun" || slug === "heavy_bowgun") {
    // Four separate ammo tables, all keyed into the same STR pool:
    //   x[3] main    [nameIdx, capacityPerAmmoLevel[]]  (Lv1/Lv2/Lv3 clips)
    //   x[4] rapid   [nameIdx, shots, power, waitIdx]   (LBG rapid fire)
    //   x[5] internal[nameIdx, clip, total]             (built-in ammo)
    //   x[6] siege   [nameIdx, capacity]                (HBG siege mode)
    // rapid is LBG-only and siege HBG-only in practice, but both are read
    // the same way for either class rather than branching on slug — the
    // data already leaves the irrelevant one empty.
    const o = {};
    const ammo = (x[3] || []).map(a => ({ n: STR[a[0]], caps: a[1] || [] })).filter(a => a.n);
    const rapid = (x[4] || []).map(r => ({ n: STR[r[0]], cap: r[1], pow: r[2], wait: STR[r[3]] })).filter(r => r.n);
    const internal = (x[5] || []).map(i => ({ n: STR[i[0]], clip: i[1], total: i[2] })).filter(i => i.n);
    const siege = (x[6] || []).map(v => ({ n: STR[v[0]], cap: v[1] })).filter(v => v.n);
    if (ammo.length) o.ammo = ammo;
    if (rapid.length) o.rapid = rapid;
    if (internal.length) o.internal = internal;
    if (siege.length) o.siege = siege;
    if (STR[x[0]]) o.reload = STR[x[0]];
    if (STR[x[1]]) o.recoil = STR[x[1]];
    if (STR[x[2]]) o.deviation = STR[x[2]];
    return Object.keys(o).length ? o : null;
  }
  return null;
}

/* ── When does a tree become available? ───────────────────────────────────
   A weapon shows up in the smithy once you hold its *key material* — one
   component per recipe, flagged `key`=1 in mhgu.db's components table. So a
   tree's HR is the HR at which its level-1 key material first becomes
   obtainable. That material is traced through three tables: quest_rewards
   (quest gives it), hunting_rewards (carved off a monster) and gathering
   (picked up in an area).

   Guild quests map onto the run's HR exactly, because they ARE the ladder
   the run climbs: Guild LR/HR stars 1-7 are Hub 1-7 (HR 1-7), and Guild G
   stars 11-14 are Pub G1-G4 (HR 9-12). Verified against this app's own
   urgent chain — Dirty Deals is db Guild G 12 and Pub G2 here, Hellfire
   Star is db Guild HR 7 and Hub 7 here.

   Village/Event/Permit/Arena quests aren't on that ladder, and their star
   counts don't line up with it (Village runs to 10 and stops at high rank),
   so those contribute only their rank band. Same for a carve or a gather
   whose monster/area has no Guild quest. Hence: use a precise Guild star
   when the material has one, and fall back to the band otherwise — NOT the
   earliest of the two. Taking the earliest sounds right but is worse: a
   Village LR source floors to 1 and beats a precise Guild 3, which
   collapses most of the list onto 1/4/9. */
const RANK_FLOOR = { LR: 1, HR: 4, G: 9 };   // Hub 4* opens high rank, Pub G1 is HR9

/* Materials with no source row anywhere in the db. Tickets are earned by
   using a facility (Bistro, Airship, Wycademy, the village chiefs) rather
   than by clearing a quest, so nothing in the quest/carve/gather tables can
   date them — they're all opened up from the start for now, and the picker
   carries a note that being listed isn't the same as being craftable yet.
   The rest were identified by hand; see MHGU-TASKS.md. */
const HR_BY_MATERIAL = {
  // Meownster Hunter's trophy tier. meow_rewards covers the ordinary
  // gatherable returns only (102 items) and omits these entirely.
  "Toxic Kumori": 1,            // LR rare, Tundra (a Meownster area, not a map)
  "Broken Statue": 1,           // LR rare, Forest/Desert
  "Sinister Cloth": 1,          // LR rare, Wetlands
  "Extravagant Artifact": 1,    // LR rare, Coast
  "Opulent Artifact": 4,        // HR rare, Coast
  "Speartuna": 1,               // LR Verdant Hills, whose first Guild quest is 1*
  "Weapon Codex": 2,            // Hub 2* "Ahoy! Royal Ludroth!" — db confirms Guild LR 2
  "Bowgun Codex": 1,            // Village 6* "The Perilous Pair" — Village LR, so the band
};
const TICKET_HR = 1;
const isTicket = name => /\bTicket\b/.test(name);
/* Anything still unplaced is a fish, bug or mushroom (Bumblepumpkin, Great
   Hornfly, Bindshroom...). All are low-rank gathers of the same kind as
   Speartuna, which resolved to 1, so they default there rather than being
   dropped — the picker note covers the imprecision. Logged at the end so
   the guess never goes silent. */
const HR_DEFAULT = 1;

const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(DB_PATH, { readOnly: true });

const WTYPE = {
  great_sword: "Great Sword", long_sword: "Long Sword", sword_and_shield: "Sword and Shield",
  dual_blades: "Dual Blades", hammer: "Hammer", hunting_horn: "Hunting Horn",
  lance: "Lance", gunlance: "Gunlance", switch_axe: "Switch Axe",
  charge_blade: "Charge Blade", insect_glaive: "Insect Glaive",
  light_bowgun: "Light Bowgun", heavy_bowgun: "Heavy Bowgun", bow: "Bow",
};
// "<wtype> <levelName> <level>" is how mhgu.db names each upgrade step, and
// the only join between it and the Kiranico-derived tree data.
const itemIdOf = new Map();
for (const r of db.prepare("SELECT w._id id, w.wtype, i.name FROM weapons w JOIN items i ON i._id=w._id").all())
  itemIdOf.set(`${r.wtype} ${r.name}`, r.id);

const keyMatStmt = db.prepare(
  "SELECT i.name FROM components c JOIN items i ON i._id=c.component_item_id " +
  "WHERE c.created_item_id=? AND c.type='Create' AND c.`key`=1 LIMIT 1");
const qRewardStmt = db.prepare(
  "SELECT q.hub, q.rank, q.stars FROM quest_rewards qr JOIN quests q ON q._id=qr.quest_id " +
  "JOIN items i ON i._id=qr.item_id WHERE i.name=?");
const carveStmt = db.prepare(
  "SELECT hr.monster_id mid, hr.rank FROM hunting_rewards hr JOIN items i ON i._id=hr.item_id WHERE i.name=?");
const carveQuestStmt = db.prepare(
  "SELECT q.hub, q.rank, q.stars FROM monster_to_quest mq JOIN quests q ON q._id=mq.quest_id " +
  "WHERE mq.monster_id=? AND q.rank=?");
const gatherStmt = db.prepare(
  "SELECT g.location_id lid, g.rank FROM gathering g JOIN items i ON i._id=g.item_id WHERE i.name=?");
const gatherQuestStmt = db.prepare(
  "SELECT hub, rank, stars FROM quests WHERE location_id=? AND rank=?");

const guildHr = (hub, rank, stars) => {
  if (hub !== "Guild") return null;
  if ((rank === "LR" || rank === "HR") && stars >= 1 && stars <= 7) return stars;
  if (rank === "G" && stars >= 11 && stars <= 14) return stars - 2;
  return null;
};

const hrCache = new Map();
const guessed = [];
function hrForMaterial(name) {
  if (hrCache.has(name)) return hrCache.get(name);
  let hr;
  if (HR_BY_MATERIAL[name] != null) hr = HR_BY_MATERIAL[name];
  else if (isTicket(name)) hr = TICKET_HR;
  else {
    const guild = [], band = [];
    for (const r of qRewardStmt.all(name)) {
      const g = guildHr(r.hub, r.rank, r.stars);
      if (g) guild.push(g); else if (RANK_FLOOR[r.rank]) band.push(RANK_FLOOR[r.rank]);
    }
    for (const c of carveStmt.all(name)) {
      const gs = carveQuestStmt.all(c.mid, c.rank).map(q => guildHr(q.hub, q.rank, q.stars)).filter(Boolean);
      if (gs.length) guild.push(...gs); else if (RANK_FLOOR[c.rank]) band.push(RANK_FLOOR[c.rank]);
    }
    for (const g0 of gatherStmt.all(name)) {
      const gs = gatherQuestStmt.all(g0.lid, g0.rank).map(q => guildHr(q.hub, q.rank, q.stars)).filter(Boolean);
      if (gs.length) guild.push(...gs); else if (RANK_FLOOR[g0.rank]) band.push(RANK_FLOOR[g0.rank]);
    }
    if (guild.length) hr = Math.min(...guild);
    else if (band.length) hr = Math.min(...band);
    else { hr = HR_DEFAULT; guessed.push(name); }
  }
  hrCache.set(name, hr);
  return hr;
}

function hrForTree(slug, t) {
  const first = t.L[0];                      // [level, name, ...]
  const id = itemIdOf.get(`${WTYPE[slug]} ${first[1]} ${first[0]}`);
  if (id == null) return null;
  const km = keyMatStmt.get(id);
  return km ? hrForMaterial(km.name) : null;
}

const classes = Object.keys(WDATA);
const out = classes.map(slug => {
  const c = WDATA[slug];
  const STR = c.str || [];
  const matsPath = path.join(CT_MATERIALS, slug + ".json");
  if (!fs.existsSync(matsPath)) {
    console.error(`ABORT: no ${slug}.json in ${CT_MATERIALS} — cannot tell which trees are forgeable`);
    process.exit(1);
  }
  const { create = {} } = JSON.parse(fs.readFileSync(matsPath, "utf8"));
  const trees = c.trees.map(t => ({
    i: t.i,
    n: t.n,
    r: t.r,
    p: t.p || 0,          // [parentTreeId, unlockLevel], or 0 for a root tree
    // 1 when this tree's first level has its own Create recipe, i.e. you can
    // forge it outright. Absent means upgrade-only (or, for the 22 Rusted/Worn
    // relic lines, dug up rather than made) — reachable by climbing into, but
    // not something a new life can start on.
    ...(create[t.i] && create[t.i].d ? { f: 1 } : {}),
    // HR this tree first becomes startable at (see the HR section above).
    // Only meaningful for forgeable roots — that's all the picker offers —
    // so it's omitted elsewhere rather than shipping 800 unused numbers.
    ...(create[t.i] && create[t.i].d && !t.p ? { hr: hrForTree(slug, t) || 1 } : {}),
    // [level, name, attack, affinity%, defense, slots, element[], sharpness, extra]
    levels: t.L.map(l => [l[0], l[1], l[2] || 0, l[3] || 0, l[4] || 0, l[5] || 0, l[6] || [],
                          l[9] || null, unpackExtra(slug, l, STR)]),
  }));
  return { slug, label: c.label, trees };
});

// ── Sanity gates — fail loudly rather than shipping bad data ──────────────
if (out.length !== 14) {
  console.error(`ABORT: expected 14 weapon classes, found ${out.length}`);
  process.exit(1);
}
for (const c of out) {
  const hasPetrified = c.trees.some(t => !t.p && t.n.startsWith("Petrified"));
  if (!hasPetrified) {
    console.error(`ABORT: class "${c.slug}" has no root tree starting with "Petrified"`);
    process.exit(1);
  }
  // Every class must have forgeable trees, or its new-life picker renders empty.
  if (!c.trees.some(t => t.f)) {
    console.error(`ABORT: class "${c.slug}" has no forgeable trees — the create data did not line up`);
    process.exit(1);
  }
  // Every startable tree needs a usable HR, and every class needs at least one
  // at HR1 — a run starts there, so a class with none would open unpickable.
  const startable = c.trees.filter(t => t.f && !t.p);
  const badHr = startable.filter(t => !(t.hr >= 1 && t.hr <= 12));
  if (badHr.length) {
    console.error(`ABORT: class "${c.slug}" has ${badHr.length} startable trees with an out-of-range hr` +
      ` (e.g. ${badHr[0].n} -> ${badHr[0].hr})`);
    process.exit(1);
  }
  if (!startable.some(t => t.hr === 1)) {
    console.error(`ABORT: class "${c.slug}" has no HR1 tree — a new run would have nothing to pick`);
    process.exit(1);
  }
}

fs.writeFileSync(OUT, JSON.stringify(out) + "\n");

// Report the starter-tree gaps (classes missing Iron and/or Bone roots) so this
// stays visible every time the generator runs, not just at initial build time.
console.log(`wrote ${OUT} — ${out.length} classes, ${out.reduce((n, c) => n + c.trees.length, 0)} trees total`);
{
  const startable = out.flatMap(c => c.trees.filter(t => t.f && !t.p));
  const byHr = new Map();
  for (const t of startable) byHr.set(t.hr, (byHr.get(t.hr) || 0) + 1);
  console.log(`  ${startable.length} startable trees by HR: ` +
    [...byHr.keys()].sort((a, b) => a - b).map(h => `HR${h}:${byHr.get(h)}`).join("  "));
  if (guessed.length) {
    console.log(`  ${guessed.length} key material(s) had no datable source and defaulted to HR${HR_DEFAULT}: ` +
      [...new Set(guessed)].join(", "));
  }
}
for (const c of out) {
  const roots = c.trees.filter(t => !t.p).map(t => t.n);
  const hasIron = roots.some(n => n.startsWith("Iron"));
  const hasBone = roots.some(n => n.startsWith("Bone"));
  if (!hasIron || !hasBone) {
    console.log(`  ${c.label}: missing ${[!hasIron && "Iron", !hasBone && "Bone"].filter(Boolean).join(" & ")} root ` +
      `(substitute tree TBD — see CLAUDE.md)`);
  }
}
