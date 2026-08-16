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
const OUT = path.join(__dirname, "..", "docs", "data-trees.json");

if (!fs.existsSync(SRC)) {
  console.error("Cannot find " + SRC + "\nPass the mhgu-weapon-trees index.html path as an argument.");
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

const classes = Object.keys(WDATA);
const out = classes.map(slug => {
  const c = WDATA[slug];
  const STR = c.str || [];
  const trees = c.trees.map(t => ({
    i: t.i,
    n: t.n,
    r: t.r,
    p: t.p || 0,          // [parentTreeId, unlockLevel], or 0 for a root tree
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
}

fs.writeFileSync(OUT, JSON.stringify(out) + "\n");

// Report the starter-tree gaps (classes missing Iron and/or Bone roots) so this
// stays visible every time the generator runs, not just at initial build time.
console.log(`wrote ${OUT} — ${out.length} classes, ${out.reduce((n, c) => n + c.trees.length, 0)} trees total`);
for (const c of out) {
  const roots = c.trees.filter(t => !t.p).map(t => t.n);
  const hasIron = roots.some(n => n.startsWith("Iron"));
  const hasBone = roots.some(n => n.startsWith("Bone"));
  if (!hasIron || !hasBone) {
    console.log(`  ${c.label}: missing ${[!hasIron && "Iron", !hasBone && "Bone"].filter(Boolean).join(" & ")} root ` +
      `(substitute tree TBD — see CLAUDE.md)`);
  }
}
