// Builds the craftables section of docs/data.js — every combination recipe,
// as "result = ingredient A + ingredient B". Backs the "no buying craftable
// items" rule: if it's in this list, you can make it, so don't buy it.
//
//   node scripts/build-craftables.js [pathToKiranicoComboListHtml] [pathToMhguDb]
//
// Source: Kiranico's saved "Combo List" page. That's the whole source — this
// script no longer touches mhgu.db for shop prices, because the list doesn't
// carry a buyable flag any more. The db path is still accepted as an
// OPTIONAL second argument, used only to cross-check that the page and the
// database still agree on what's craftable (they did exactly, 177/177, when
// this was written); skipped silently if it isn't there.
//
// Only the RESULT of each recipe is a list entry. Ingredients are shown as
// part of the recipe text but are never entries in their own right — an item
// is listed because you can make it, not because it goes into something.
// (Plenty are both: Potion is a result of Herb + Blue Mushroom and an
// ingredient of Mega Potion. It's listed once, for the former.)
const fs = require("fs"), path = require("path");

const COMBO_PATH = process.argv[2] ||
  "C:/Users/humph/Downloads/Combo List - MHGU - Kiranico - Monster Hunter Generations Ultimate Database.html";
const DB_PATH = process.argv[3] ||
  "C:/Coding Repos/mhgu-collection-tracker/data-src/mhgu.db";
const OUT = path.join(__dirname, "..", "docs", "data-craftables.json");

if (!fs.existsSync(COMBO_PATH)) {
  console.error("Cannot find the Kiranico Combo List HTML at " + COMBO_PATH +
    "\nPass its path as the first argument. Not committed — it's Kiranico's page.");
  process.exit(1);
}

// ── Parse ─────────────────────────────────────────────────────────────────
// Each row: <result> = <ingredient A> + <ingredient B> <rate%> x<qty>.
const html = fs.readFileSync(COMBO_PATH, "utf8");
const stripTags = (s) => s.replace(/<[^>]*>/g, "")
  .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const combos = [];
for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) || []) {
  const tds = (tr.match(/<td[\s\S]*?<\/td>/g) || []).map(stripTags);
  if (tds.length < 7) continue;
  const [result, , a, , b] = tds;
  if (!result || !a || !b) continue;
  combos.push({ n: result, a, b });
}
console.log(`parsed ${combos.length} combos, ${new Set(combos.map(c => c.n)).size} distinct results`);

// ── Bowgun ammo and Bow coatings are exempt ───────────────────────────────
// Buying those is explicitly allowed by the run rules, so they must not
// appear in a list whose entire meaning is "don't buy this".
//
// Name-matched, because the source has no category to filter on. The ammo
// pattern is anchored to a whitelist of real ammo types rather than a bare
// trailing " S" — that looser version also swallowed "Barrel Bomb S", which
// is a bomb and stays craftable. ALCHEMY_EXEMPT keeps "Alchemy Coating" and
// "Alchemy Bullet", which come from the Alchemy Barrel, not a bow or bowgun.
// Every exclusion is printed on each run; that print is what caught the
// Barrel Bomb bug, so keep it.
const ALCHEMY_EXEMPT = new Set(["Alchemy Coating", "Alchemy Bullet"]);
const AMMO_TYPES = [
  "Normal", "Pierce", "Pellet", "Crag", "Clust", "Flaming", "Water", "Thunder",
  "Freeze", "Dragon", "Poison", "Para", "Paralysis", "Sleep", "Exhaust",
  "Recover", "Paint", "Tranq", "Demon", "Armor", "Stone", "Slicing", "Wyvern",
];
const AMMO_RE = new RegExp(`^(?:${AMMO_TYPES.join("|")}) S(?: Lv\\d+)?$`);
const isAmmoOrCoating = (name) => {
  if (ALCHEMY_EXEMPT.has(name)) return false;
  if (AMMO_RE.test(name)) return true;
  if (/Coating(?: Lv\d+)?$/.test(name)) return true;
  return false;
};

const excluded = new Set();
const out = combos.filter(c => {
  if (!isAmmoOrCoating(c.n)) return true;
  excluded.add(c.n);
  return false;
});
// Stable, readable order: by result, then by first ingredient so an item
// with two recipes always lists them the same way round.
out.sort((x, y) => x.n.localeCompare(y.n) || x.a.localeCompare(y.a));

// ── Sanity gates — fail loudly rather than shipping bad data ──────────────
if (!combos.length) { console.error("ABORT: parsed no combos from the page"); process.exit(1); }
if (!out.length) { console.error("ABORT: every combo was excluded"); process.exit(1); }
const potion = out.find(r => r.n === "Potion");
if (!potion) { console.error("ABORT: expected \"Potion\" in the craftable list"); process.exit(1); }
if (!potion.a || !potion.b) {
  console.error("ABORT: Potion has no ingredients — " + JSON.stringify(potion));
  process.exit(1);
}
if (!excluded.size) { console.error("ABORT: no ammo/coatings were excluded — check isAmmoOrCoating"); process.exit(1); }
for (const n of ALCHEMY_EXEMPT) {
  if (excluded.has(n)) {
    console.error(`ABORT: "${n}" was excluded, but it's an Alchemy Barrel item, not bowgun ammo or a bow coating`);
    process.exit(1);
  }
}
// Every row must be a real three-part recipe; a blank ingredient means the
// column layout shifted and the parse is silently wrong.
const malformed = out.filter(r => !r.n || !r.a || !r.b);
if (malformed.length) {
  console.error("ABORT: " + malformed.length + " malformed rows, e.g. " + JSON.stringify(malformed[0]));
  process.exit(1);
}

// Optional cross-check against mhgu.db's own recipe table.
if (fs.existsSync(DB_PATH)) {
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(DB_PATH, { readOnly: true });
    const ids = new Set(db.prepare("SELECT DISTINCT created_item_id FROM combining").all().map(r => r.created_item_id));
    const dbNames = new Set(db.prepare("SELECT _id, name FROM items").all()
      .filter(i => ids.has(i._id)).map(i => i.name));
    const pageNames = new Set(combos.map(c => c.n));
    const onlyPage = [...pageNames].filter(n => !dbNames.has(n));
    const onlyDb = [...dbNames].filter(n => !pageNames.has(n));
    if (onlyPage.length || onlyDb.length) {
      console.warn(`WARNING: sources disagree — ${onlyPage.length} only on the page ` +
        `(${onlyPage.slice(0, 5).join(", ")}), ${onlyDb.length} only in mhgu.db ` +
        `(${onlyDb.slice(0, 5).join(", ")}). The page wins; check whether that's right.`);
    } else {
      console.log(`cross-check: mhgu.db agrees on all ${pageNames.size} craftable items`);
    }
  } catch (e) {
    console.warn("cross-check skipped: " + e.message);
  }
} else {
  console.log("cross-check skipped: mhgu.db not present (optional)");
}

fs.writeFileSync(OUT, JSON.stringify(out) + "\n");
console.log(`wrote ${OUT} — ${out.length} combos across ` +
  `${new Set(out.map(r => r.n)).size} craftable items`);
console.log(`  ${excluded.size} ammo/coating results excluded (buying those is allowed):`);
console.log("    " + [...excluded].sort().join(", "));
