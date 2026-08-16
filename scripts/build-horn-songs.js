// Builds the Hunting Horn song table — docs/data-horn-songs.json.
//
//   node scripts/build-horn-songs.js [pathToMhguDb]
//
// Source: mhgu-collection-tracker's downloaded mhgu.db (SQLite, gitignored
// there — must be present locally to regenerate), same database
// build-craftables.js reads. Its `horn_melodies` table lists every melody
// keyed by the 3-note colour string a horn must have to play it, e.g.
// "WRB" = White/Red/Sky Blue.
//
// Keyed by note string, NOT by weapon: in MHGU the songs a horn can play are
// entirely a function of its three notes, so 50 distinct note combinations
// cover all ~800 horn levels. Emitting it as one shared lookup keeps it a
// few KB instead of repeating a song list on every level.
//
// Note letters must match NOTE_LETTER in build-trees.js, which is where a
// horn's own notes get turned into the key used here.
const fs = require("fs"), path = require("path");
const { DatabaseSync } = require("node:sqlite");

const SRC = process.argv[2] ||
  "C:/Coding Repos/mhgu-collection-tracker/data-src/mhgu.db";
const OUT = path.join(__dirname, "..", "docs", "data-horn-songs.json");

if (!fs.existsSync(SRC)) {
  console.error("Cannot find " + SRC + "\nPass the mhgu.db path as an argument.");
  process.exit(1);
}

const db = new DatabaseSync(SRC, { readOnly: true });
const rows = db.prepare(
  "SELECT notes, song, name, effect1, effect2 FROM horn_melodies ORDER BY _id"
).all();

// notes -> [{n: songName, s: notesToPlay, e1, e2}]. Same melody can appear
// under several note strings (that's the point of the table); within one note
// string the rows are already in the game's own display order, so _id order
// is preserved.
//
// `s` (the DB's `song` column) is the note SEQUENCE you actually play to
// perform that melody, in the same letter alphabet as the key — e.g. on a
// WCR horn, Hearing Protection (S) is "CCRW". It is NOT the same as the key:
// the key is which three notes the horn HAS, this is which of them, in what
// order, produce the song.
const songs = {};
for (const r of rows) {
  if (!r.notes || !r.name) continue;
  (songs[r.notes] = songs[r.notes] || []).push({
    n: r.name,
    s: r.song || "",
    e1: r.effect1 || "",
    e2: r.effect2 || "",
  });
}

// ── Sanity gates — fail loudly rather than shipping bad data ──────────────
const keys = Object.keys(songs);
if (!keys.length) { console.error("ABORT: no horn melodies found"); process.exit(1); }
// Every key is exactly three notes drawn from the known letter set. A stray
// length or letter means the letter mapping in build-trees.js would silently
// fail to match and horns would show no songs at all.
const LETTERS = /^[WCRPYGBO]{3}$/;
const badKeys = keys.filter(k => !LETTERS.test(k));
if (badKeys.length) {
  console.error("ABORT: unexpected note keys: " + badKeys.slice(0, 10).join(", "));
  process.exit(1);
}
const empty = keys.filter(k => !songs[k].length);
if (empty.length) { console.error("ABORT: note keys with no songs: " + empty.join(", ")); process.exit(1); }
// Every note in a song's sequence must be one the horn actually has —
// otherwise the sequence is unplayable on that horn and something is wrong
// with the join, not just the display.
for (const k of keys) {
  for (const s of songs[k]) {
    if (!s.s) { console.error(`ABORT: ${k} / "${s.n}" has no note sequence`); process.exit(1); }
    const stray = [...s.s].filter(c => !k.includes(c));
    if (stray.length) {
      console.error(`ABORT: ${k} / "${s.n}" plays ${s.s}, which needs note(s) ${stray.join("")} the horn lacks`);
      process.exit(1);
    }
  }
}

fs.writeFileSync(OUT, JSON.stringify(songs) + "\n");
console.log(`wrote ${OUT} — ${keys.length} note combinations, ` +
  `${rows.length} melody rows, ` +
  `${Math.min(...keys.map(k => songs[k].length))}-${Math.max(...keys.map(k => songs[k].length))} songs each`);
