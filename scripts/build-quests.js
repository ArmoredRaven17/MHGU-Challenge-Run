// Builds the quest section of docs/data.js — Key Quests grouped by rank tier, plus
// the Ahtal-Ka / all-three-Fatalis quest identities used by the victory panel.
//
//   node scripts/build-quests.js [pathToQuestData.json]
//
// Source: the Randomizer's own QuestData.json (Type, Name, Level, Key, Monster).
const fs = require("fs"), path = require("path");

const SRC = process.argv[2] ||
  "C:/Coding Repos/MHGU Quest Randomizer/QuestData.json";
const OUT = path.join(__dirname, "..", "docs", "data-quests.json");

if (!fs.existsSync(SRC)) {
  console.error("Cannot find " + SRC + "\nPass the QuestData.json path as an argument.");
  process.exit(1);
}
const quests = JSON.parse(fs.readFileSync(SRC, "utf8"));
console.log("quests read:", quests.length);

// ── Key Quests, grouped by Type + Level ────────────────────────────────────
// Village excluded for now — only Hub/Pub rank-ups grant a weapon life, so
// Village key quests aren't part of this tracker's checklist. Revisit if
// "clear all Key Quests" turns out to mean Village too.
const TRACKED_TYPES = ["Hub", "Pub"];
const keyQuests = quests.filter(q => q.Key === true && TRACKED_TYPES.includes(q.Type));
const tiers = new Map(); // "Type|Level" -> { t, lvl, quests: [{n}] }
for (const q of keyQuests) {
  const k = q.Type + "|" + q.Level;
  if (!tiers.has(k)) tiers.set(k, { t: q.Type, lvl: q.Level, quests: [] });
  tiers.get(k).quests.push({ n: q.Name });
}
// Stable order: Hub, then Pub, each ascending by star level.
const typeOrder = { Hub: 0, Pub: 1 };
const keyTiers = [...tiers.values()].sort((a, b) =>
  (typeOrder[a.t] - typeOrder[b.t]) || (a.lvl - b.lvl));

// ── Urgent quest chain: the real HR1→HR12→Victory progression ─────────────
// None of these are Key:true in the data — they're a separate category
// entirely (Kiranico badges them "Urgent", distinct from "Key"). Sourced by
// hand from https://mhgu.kiranico.com/quest (Andrew's own research, cross-
// referenced against a saved copy of that page) — this cannot be derived
// from QuestData.json alone, which has no field distinguishing an urgent
// quest from a regular one. Each step names the exact Type+Level+quest so
// duplicate titles across ranks (e.g. two different "The New Tenant"
// quests, at Hub 2★ and Hub 5★) resolve to the right one.
//
// `gate` is which tier's Key Quests must ALL be cleared before that step's
// urgent becomes checkable — stated explicitly per step, NOT derived from
// the step's own type/level tag (which is only used to find the quest by
// name) and no longer derived positionally either. It was `keyTiers[i]` for
// a while, which happened to line up until two hand-confirmed corrections
// broke it: HR8's urgent is ungated, and the Pub gates each shift back one
// tier as a result. A formula with a carve-out for that is harder to read
// and to check against the game than just writing the eleven gates down.
//
// `gate: null` = no prerequisite at all. HR8 is the odd rank: there are no
// Hub 8★ Key Quests in this tracker (Hub tops out at 7★) and Pub isn't open
// yet, so nothing gates "Legendary Skills?" — reaching HR8 is the only
// requirement.
const URGENT_CHAIN = [
  { toHr: 2, type: "Hub", level: 2, names: ["The New Tenant"], gate: ["Hub", 1] },
  { toHr: 3, type: "Hub", level: 3, names: ["A Shocking Scoundrel"], gate: ["Hub", 2] },
  { toHr: 4, type: "Hub", level: 3, names: ["Two-headed Carcass"], gate: ["Hub", 3] },
  { toHr: 5, type: "Hub", level: 5, names: ["A Plesioth in the Misty Peaks"], gate: ["Hub", 4] },
  { toHr: 6, type: "Hub", level: 6, names: ["A Bewitching Dance", "The Unshakable Mountain God"], gate: ["Hub", 5] },
  { toHr: 7, type: "Hub", level: 7, names: ["Seer of Swords"], gate: ["Hub", 6] },
  { toHr: 8, type: "Hub", level: 7, names: ["Hellfire Star"], gate: ["Hub", 7] },
  { toHr: 9, type: "Hub", level: 8, names: ["Legendary Skills?"], gate: null },
  { toHr: 10, type: "Pub", level: 2, names: ["Dirty Deals"], gate: ["Pub", 1] },
  { toHr: 11, type: "Pub", level: 3, names: ["Giant Dragon Invasion"], gate: ["Pub", 2] },
  { toHr: 12, type: "Pub", level: 4, names: ["Sky Render"], gate: ["Pub", 3] },
  { toHr: "victory", type: "Pub", level: 4, names: ["Castle on the Run"], gate: ["Pub", 4] },
];
const urgentChain = URGENT_CHAIN.map(step => {
  const stepQuests = step.names.map(name => {
    const hits = quests.filter(q => q.Type === step.type && q.Level === step.level && q.Name.includes(name));
    if (hits.length !== 1) {
      console.error(`ABORT: expected exactly 1 match for "${name}" (${step.type} L${step.level}), found ${hits.length}`);
      process.exit(1);
    }
    return { n: hits[0].Name };
  });
  // t/lvl here is where QuestData.json happens to tag the quest itself —
  // used only to find it by name above. It is NOT which tier gates it; the
  // gate is the explicit `gate` field, emitted as gateT/gateLvl (both null
  // when the step has no prerequisite).
  return {
    toHr: step.toHr, t: step.type, lvl: step.level, quests: stepQuests,
    gateT: step.gate ? step.gate[0] : null,
    gateLvl: step.gate ? step.gate[1] : null,
  };
});

// ── When each tier's own Key Quest checklist opens ────────────────────────
//
// Separate mechanism from the urgent gates above: "which tier gates this
// urgent" and "at what HR does this tier's checklist become editable" are
// two different questions, and an early version that conflated them
// unlocked every tier one HR too early.
//
// Hub tiers map straight to their own number — Hub 3★ opens at HR3, full
// stop. Pub is offset by one: HR8 has no tier of its own (Hub stops at 7★,
// Pub hasn't opened), so Pub G1★ opens at HR9, not HR8 — hand-confirmed,
// and it's the same HR8 oddity that leaves that rank's urgent ungated.
// Hence Pub Gn★ → HR (8 + n): G1★=9, G2★=10, G3★=11, G4★=12.
const TIER_UNLOCK_HR = { Hub: (lvl) => lvl, Pub: (lvl) => 8 + lvl };
keyTiers.forEach(tier => { tier.unlockHr = TIER_UNLOCK_HR[tier.t](tier.lvl); });

// ── Victory targets: Ahtal-Ka, and all three Fatalis ────────────────────────
// Each appears twice in the data (once under Pub, once under Events) — same
// monster, different quest entry. Keep both names so the UI can show either.
const VICTORY_MONSTERS = {
  ahtalKa: "Ahtal-Ka",
  fatalis: "Fatalis",
  crimson: "Crimson Fatalis",
  old: "Old Fatalis",
};
const victory = {};
for (const [key, monster] of Object.entries(VICTORY_MONSTERS)) {
  const hits = quests.filter(q => q.Monster === monster || (q.Monsters || []).includes(monster));
  victory[key] = { monster, quests: hits.map(q => ({ t: q.Type, n: q.Name })) };
}

// ── Sanity gates — fail loudly rather than shipping bad data ──────────────
if (keyQuests.length === 0) { console.error("ABORT: no Key:true quests found"); process.exit(1); }
for (const [key, v] of Object.entries(victory)) {
  if (v.quests.length === 0) { console.error(`ABORT: no quests found for victory target "${key}" (${v.monster})`); process.exit(1); }
}

if (urgentChain.length !== URGENT_CHAIN.length) { console.error("ABORT: urgent chain step count mismatch"); process.exit(1); }
if (keyTiers.some(t => t.unlockHr == null)) { console.error("ABORT: a tier is missing unlockHr"); process.exit(1); }
// A gate is optional (HR8's urgent has none) but must be REAL when present —
// a typo'd tier would silently gate a step on something that never completes,
// permanently walling off the rest of the chain. Half-set gates are always a
// bug, so those are caught too.
for (const s of urgentChain) {
  if ((s.gateT == null) !== (s.gateLvl == null)) {
    console.error(`ABORT: chain step -> ${s.toHr} has a half-specified gate (${s.gateT}, ${s.gateLvl})`);
    process.exit(1);
  }
  if (s.gateT != null && !keyTiers.some(t => t.t === s.gateT && t.lvl === s.gateLvl)) {
    console.error(`ABORT: chain step -> ${s.toHr} is gated on ${s.gateT} ${s.gateLvl}★, which is not a real tier`);
    process.exit(1);
  }
}
// A step's gate must open no later than the rank the player is on when they
// need it: step "-> N" is attempted at HR N-1, so its gate tier must unlock
// at or before N-1, or the urgent can never become checkable.
for (const s of urgentChain) {
  if (s.gateT == null || s.toHr === "victory") continue;
  const tier = keyTiers.find(t => t.t === s.gateT && t.lvl === s.gateLvl);
  const atHr = s.toHr - 1;
  if (tier.unlockHr > atHr) {
    console.error(`ABORT: step -> ${s.toHr} is run at HR${atHr} but its gate ${s.gateT} ${s.gateLvl}★ ` +
      `does not unlock until HR${tier.unlockHr} — unreachable`);
    process.exit(1);
  }
}

const out = { keyTiers, urgentChain, victory };
fs.writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`wrote ${OUT} — ${keyQuests.length} key quests across ${keyTiers.length} tiers, ` +
  `${urgentChain.length}-step urgent chain (HR1 -> victory), ` +
  `victory targets: ${Object.keys(victory).join(", ")}`);
console.log("  tier unlockHr: " + keyTiers.map(t => `${t.t}${t.lvl}=${t.unlockHr}`).join(", "));
console.log("  chain gates: " + urgentChain.map(s =>
  `${s.toHr}<-${s.gateT == null ? "(none)" : s.gateT + s.gateLvl}`).join(", "));
