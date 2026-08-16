(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const DATA = window.MHGU_CHALLENGE_DATA;
  // [{slug,label,trees:[{i,n,r,p,levels:[[lv,name,attack,affinity,defense,slots,element[],sharpness],...]}]}]
  const CLASSES = DATA.classes;
  const classBySlug = Object.fromEntries(CLASSES.map(c => [c.slug, c]));

  // Pub is G-Rank Hub — its real in-game star label is "G1★".."G4★", not
  // a bare number the way Village/Hub are.
  const tierLabel = (t, lvl) => t === "Pub" ? `Pub G${lvl}★` : `${t} ${lvl}★`;

  const weaponIcon = (slug) => "assets/WeaponIcons/icon_" + slug + "_tinted.png";
  // Rarity runs 1-11 in this data and never changes within a tree/line (a
  // tree's own `r`, not per-level) — 1-10 map straight to _r{n}, 11 to _rX.
  // Sourced from mhgu-collection-tracker's icon set (Kiranico-derived, see
  // NOTICE.md). Rarity 0 only appears on a handful of unused "(DUMMY)" trees
  // in the source data — falls back to the plain class icon, same as any
  // other unrecognized value.
  const weaponRarityIcon = (slug, r) => (r >= 1 && r <= 10)
    ? `assets/WeaponIcons/icon_${slug}_r${r}.png`
    : (r === 11 ? `assets/WeaponIcons/icon_${slug}_rX.png` : weaponIcon(slug));
  const monsterIcon = (name) => name
    ? "assets/MonsterIcons/MHGU-" + name.replace(/ /g, "_") + "_Icon.webp"
    : FALLBACK_ICON;
  const FALLBACK_ICON = "assets/MonsterIcons/MHGU-Question_Mark_Icon.webp";

  // ── Node stats tooltip ───────────────────────────────────────────────
  // Colours ported from mhgu-weapon-trees (PAL.ele/status + its own sharpness
  // bar), so a weapon reads the same here as in the fuller tracker. Only the
  // stats every class shares (attack/affinity/defense/slots/element/
  // sharpness) are shown — the per-class extras (phial, shelling, ammo,
  // kinsect) live in build-trees.js's dropped L[7] payload, not carried here.
  const ELE_COLORS = {
    Fire: "#ff8a5c", Water: "#6cb8ff", Thunder: "#ffd85c", Ice: "#9adcff", Dragon: "#b48aff",
    Poison: "#c6a3ce", Paralysis: "#f8cf63", Sleep: "#9cdef8", Blast: "#b5d772",
  };
  const SHARP_COLORS = ["#c0392b", "#e08a2b", "#d9cf1f", "#4caf50", "#4a90d0", "#eeeeee", "#a05ad0"];
  const SHARP_BANDS = ["Base", "S+1", "S+2"];
  function sharpBarHtml(row) {
    const total = row.reduce((a, b) => a + b, 0) || 1;
    return `<div class="stat-sharp-bar">${row.map((v, i) => v
      ? `<span class="stat-sharp-seg" style="width:${(v / total * 100).toFixed(2)}%;background:${SHARP_COLORS[i]}"></span>` : "").join("")}</div>`;
  }
  // Hunting Horn note colours, ported from mhgu-weapon-trees' NOTE_COL. The
  // data spells the colours out ("Sky Blue"), so this is direct lookup, not
  // a derivation.
  const NOTE_COLORS = {
    White: "#eeeeee", Purple: "#a05ad0", Cyan: "#4ad0d0", "Sky Blue": "#6ab0f0",
    Yellow: "#e8d020", Red: "#e04040", Green: "#4caf50", Orange: "#e08a2b",
  };
  // Phial colours, ported from mhgu-weapon-trees' PAL.phial. Impact and
  // Power are that app author's own choices; the rest reuse the element and
  // status hues so a Dragon phial reads like Dragon everywhere.
  const PHIAL_COLORS = {
    Impact: "#b9c2cc", Power: "#de4c5a", Element: "#7fd4c4",
    Dragon: "#b48aff", Poison: "#c6a3ce", Paralysis: "#f8cf63", Exhaust: "#9cbafe",
  };
  // "Dragon 18" -> type "Dragon", value "18"; "Impact" -> type only. Switch
  // Axe phials carry a value, Charge Blade's never do, and only the type
  // part should take the colour.
  function phialHtml(p) {
    const m = /^(\D+?)\s*(\d+)?$/.exec(String(p || "").trim());
    const type = m ? m[1].trim() : String(p || "");
    const value = m && m[2] ? m[2] : "";
    const col = PHIAL_COLORS[type];
    return `<span${col ? ` style="color:${col}"` : ""}>${escapeHtml(type)}</span>` +
      (value ? ` ${value}` : "");
  }

  // Bow coating colours, ported from mhgu-weapon-trees' COATS table (which
  // sampled them from mhgu-editor's own coating icons). Keyed by full name
  // because "Power Coating" and "Power Coating 2" share a colour.
  const COATING_COLORS = {
    "Power Coating": "#de4c5a", "Power Coating 2": "#de4c5a",
    "Close Range Coating": "#f7f3f6", "Poison Coating": "#c6a3ce",
    "Paralysis Coating": "#f8cf63", "Sleep Coating": "#9cdef8",
    "Exhaust Coating": "#9cbafe", "Blast Coating": "#b5d772",
    "Element Coating": "#f8869c", "Element Coating 2": "#f8869c",
  };
  // MHFU's "<Pattern> Lv<n>" rule, shared by Bow shot types and Gunlance
  // shelling: the pattern picks a colour channel and the level deepens it
  // (200 → 88 across Lv1-5). Ported from mhgu-weapon-trees' shotCol/shellCol,
  // which are the same maths with different channel maps.
  function patternColor(s, channels, defaultLv) {
    const m = /^(\w+)(?:\s*Lv(\d+))?/.exec(String(s || ""));
    if (!m) return "#d4d4d4";
    const t = (Math.max(1, Math.min(5, +m[2] || defaultLv)) - 1) / 4;
    const off = Math.round(200 + (88 - 200) * t);
    const rgb = channels[m[1]];
    return rgb ? `rgb(${rgb(off).join(",")})` : "#d4d4d4";
  }
  const shotColor = (s) => patternColor(s, {
    Rapid: (o) => [o, o, 255], Spread: (o) => [o, 255, o],
    Pierce: (o) => [255, o, o], Heavy: (o) => [255, o, 255],
  }, 3);
  // MHGU's third shelling type is "Wide" where MHFU says "Spread" for the
  // same AoE role, so it takes that green channel.
  const shellColor = (s) => patternColor(s, {
    Normal: (o) => [o, o, 255], Long: (o) => [255, o, o], Wide: (o) => [o, 255, o],
  }, 1);
  // Bowgun ammo colours, also ported: pattern ammo follow MHFU's shot rule,
  // the rest read as their element or status (reusing ELE_COLORS above).
  const AMMO_COLORS = {
    "Normal S": "#6A9CFF", "Pierce S": "#FF6A6A", "Pellet S": "#66CC66",
    "Crag S": "#1FC8B4", "Clust S": "#7B68EE",
    "Flaming S": ELE_COLORS.Fire, "Water S": ELE_COLORS.Water,
    "Thunder S": ELE_COLORS.Thunder, "Freeze S": ELE_COLORS.Ice,
    "Dragon S": ELE_COLORS.Dragon, "Poison S": ELE_COLORS.Poison,
    "Paralysis S": ELE_COLORS.Paralysis, "Sleep S": ELE_COLORS.Sleep,
    "Exhaust S": "#9cbafe", "Recover S": "#5FB85F",
  };

  // Note colour name -> the icon file for it. Real eighth-note art rather
  // than a coloured dot, carried over from mhgu-editor (see NOTICE.md).
  const NOTE_ICON_SLUG = {
    White: "white", Cyan: "cyan", Red: "red", Purple: "purple",
    Yellow: "yellow", Green: "green", "Sky Blue": "sky-blue", Orange: "orange",
  };
  // Song sequences arrive as letters (build-horn-songs.js's alphabet), so
  // they need the inverse of build-trees.js's NOTE_LETTER to reach an icon.
  const LETTER_NOTE = {
    W: "White", C: "Cyan", R: "Red", P: "Purple",
    Y: "Yellow", G: "Green", B: "Sky Blue", O: "Orange",
  };
  const noteIconHtml = (colour) => {
    const slug = NOTE_ICON_SLUG[colour];
    if (!slug) return "";
    return `<img class="note-ico" src="assets/NoteIcons/note-${slug}.svg" alt="${escapeHtml(colour)}" title="${escapeHtml(colour)}">`;
  };
  const noteSeqHtml = (letters) =>
    [...(letters || "")].map(ch => noteIconHtml(LETTER_NOTE[ch])).join("");

  // Class-specific extras — Hunting Horn notes/songs and bowgun ammo.
  // Rendered as a vertical LIST that sits in its own column beside the stat
  // rows (see nodeStatBlockHtml) — "horizontal" here means stats | list
  // side by side, not chips wrapping within a row, which is what this
  // originally and wrongly did.
  function nodeExtraHtml(n) {
    const x = n.extra;
    if (!x) return "";
    let html = "";
    if (x.notes) {
      html += `<div class="stat-sub">Notes</div>` +
        `<div class="note-row">${x.notes.map(noteIconHtml).join("")}</div>`;
      // Songs are a pure function of the note trio — see build-horn-songs.js.
      // Each carries the sequence you play to perform it, which is the whole
      // point of showing them on a specific horn.
      const songs = (DATA.hornSongs || {})[x.noteKey] || [];
      if (songs.length) {
        html += `<div class="stat-sub">Songs</div><div class="x-list">` +
          songs.map(s => `<div class="x-item" title="${escapeHtml([s.e1, s.e2].filter(Boolean).join(" · "))}">` +
            `<span class="x-name">${escapeHtml(s.n)}</span>` +
            `<span class="x-val">${noteSeqHtml(s.s)}</span></div>`).join("") + `</div>`;
      }
    }
    // Bowgun ammo, as real <table>s so the numeric columns actually align.
    // Four separate tables because they answer different questions and have
    // different columns — magazine sizes per ammo level, built-in ammo with a
    // finite total, and whichever of rapid-fire (LBG) / siege (HBG) that
    // class has. Only tables with rows are emitted, so an LBG never shows an
    // empty Siege heading and vice versa.
    const ammoName = (n) => `<td class="a-n" style="color:${AMMO_COLORS[n] || "#d4d4d4"}">${escapeHtml(n)}</td>`;
    const table = (label, head, rows) =>
      `<div class="stat-sub">${label}</div><table class="x-table"><thead><tr>` +
      head.map((h, i) => `<th${i ? ' class="num"' : ""}>${h}</th>`).join("") +
      `</tr></thead><tbody>${rows}</tbody></table>`;
    if (x.ammo && x.ammo.length) {
      // Full per-level magazine sizes, all three columns always shown — a level
      // the weapon can't load reads as "—" rather than being dropped, so the
      // Lv1/Lv2/Lv3 columns stay meaningful down the whole table.
      const rows = x.ammo.map(a => ammoName(a.n) +
        [0, 1, 2].map(i => {
          const c = (a.caps || [])[i];
          return `<td class="num">${c > 0 ? c : "<i>—</i>"}</td>`;
        }).join("")).map(r => `<tr>${r}</tr>`).join("");
      html += table("Ammo — magazine by level", ["Type", "1", "2", "3"], rows);
    }
    if (x.internal && x.internal.length) {
      html += table("Internal", ["Type", "Magazine", "Total"], x.internal.map(a =>
        `<tr>${ammoName(a.n)}<td class="num">${a.clip}</td><td class="num">${a.total}</td></tr>`).join(""));
    }
    if (x.rapid && x.rapid.length) {
      html += table("Rapid Fire", ["Type", "Shots", "Pwr", "Wait"], x.rapid.map(a =>
        `<tr>${ammoName(a.n)}<td class="num">${a.cap}</td><td class="num">${a.pow}%</td>` +
        `<td class="num">${escapeHtml(a.wait || "—")}</td></tr>`).join(""));
    }
    if (x.siege && x.siege.length) {
      html += table("Siege", ["Type", "Capacity"], x.siege.map(a =>
        `<tr>${ammoName(a.n)}<td class="num">${a.cap}</td></tr>`).join(""));
    }
    // ── Bow ────────────────────────────────────────────────────────────
    // Charge levels are ordered and numbered, so they get the same table
    // treatment as ammo. Load Up is per LEVEL, not per bow — it marks a
    // charge only reachable with that skill equipped, which is the whole
    // reason to show it rather than just listing the shots.
    if (x.charges && x.charges.length) {
      html += table("Charge levels", ["Lv", "Shot", "Load Up"], x.charges.map((c, i) =>
        `<tr${c.lu ? ' class="lu"' : ""}><td class="num lv">${i + 1}</td>` +
        `<td class="a-n" style="color:${shotColor(c.shot)}">${escapeHtml(c.shot)}</td>` +
        `<td class="num">${c.lu ? '<span class="lu-tag">Load Up</span>' : "<i>—</i>"}</td></tr>`).join(""));
    }
    if (x.coatings && x.coatings.length) {
      // "Power Coating" / "Power Coating 2" -> "Power" / "Power 2": the word
      // is repeated on every row and the heading already says Coatings.
      html += `<div class="stat-sub">Coatings</div><div class="coat-row">` +
        x.coatings.map(c => {
          const col = COATING_COLORS[c] || "#d4d4d4";
          const label = c.replace(/\s*Coating\s*/, " ").trim() || c;
          return `<span class="coat" style="color:${col};border-color:${col}55" ` +
            `title="${escapeHtml(c)}">${escapeHtml(label)}</span>`;
        }).join("") + `</div>`;
    }
    return html;
  }

  // Stats on the left, class extras (songs/ammo) listed to the right.
  // Shared by the life cards and the tree tooltip so both keep the same
  // shape; collapses to a single column when a weapon has no extras.
  function nodeStatBlockHtml(n) {
    const extra = nodeExtraHtml(n);
    if (!extra) return nodeStatRowsHtml(n);
    return `<div class="stat-split"><div class="stat-main">${nodeStatRowsHtml(n)}</div>` +
      `<div class="stat-extra">${extra}</div></div>`;
  }

  // Just the stat rows, no name header — shared verbatim by the tree's hover
  // tooltip and the Weapons-page life cards so the two can't drift into
  // formatting the same numbers differently.
  function nodeStatRowsHtml(n) {
    const slotStr = "◯".repeat(n.slots) + "–".repeat(Math.max(0, 3 - n.slots));
    const affClass = n.aff > 0 ? "up" : n.aff < 0 ? "dn" : "";
    const eleStr = (n.ele || []).map(([k, v]) =>
      `<span style="color:${ELE_COLORS[k] || "var(--accent-hover)"}">${escapeHtml(k)} ${v}</span>`).join(" / ");
    let html =
      `<div class="stat-row"><span>Attack</span><b>${n.raw}</b></div>` +
      `<div class="stat-row"><span>Affinity</span><b class="${affClass}">${n.aff > 0 ? "+" : ""}${n.aff}%</b></div>` +
      `<div class="stat-row"><span>Slots</span><b>${slotStr}</b></div>`;
    if (n.def) html += `<div class="stat-row"><span>Defense</span><b>+${n.def}</b></div>`;
    if (eleStr) html += `<div class="stat-row"><span>Element</span><b>${eleStr}</b></div>`;
    // Bowgun handling — scalars, so they stay as ordinary rows; the ammo
    // table itself is horizontal, in nodeExtraHtml().
    const x = n.extra;
    if (x && x.phial) html += `<div class="stat-row"><span>Phial</span><b>${phialHtml(x.phial)}</b></div>`;
    if (x && x.shell) html += `<div class="stat-row"><span>Shelling</span>` +
      `<b style="color:${shellColor(x.shell)}">${escapeHtml(x.shell)}</b></div>`;
    // Cutting/Blunt isn't coloured by any house source — this reuses the two
    // hues shot/shelling already give Pierce and Heavy, per the same choice
    // mhgu-weapon-trees made, rather than inventing a third scheme.
    if (x && x.kinsect) html += `<div class="stat-row"><span>Kinsect</span><b>${escapeHtml(x.kinsect)}` +
      (x.kinsectType ? ` <span style="color:${x.kinsectType === "Cutting" ? "#79c8b0" : "#c98fb8"}">` +
        `(${escapeHtml(x.kinsectType)})</span>` : "") + `</b></div>`;
    if (x && x.arc) html += `<div class="stat-row"><span>Arc Shot</span><b>${escapeHtml(x.arc)}</b></div>`;
    if (x && x.reload) html += `<div class="stat-row"><span>Reload</span><b>${escapeHtml(x.reload)}</b></div>`;
    if (x && x.recoil) html += `<div class="stat-row"><span>Recoil</span><b>${escapeHtml(x.recoil)}</b></div>`;
    if (x && x.deviation) html += `<div class="stat-row"><span>Deviation</span><b>${escapeHtml(x.deviation)}</b></div>`;
    if (n.sharp) html += `<div class="stat-sharp">${n.sharp.map((row, i) =>
      `<div class="stat-sharp-row"><span>${SHARP_BANDS[i]}</span>${sharpBarHtml(row)}</div>`).join("")}</div>`;
    return html;
  }
  function nodeStatsHtml(n) {
    return `<div class="stat-name">${escapeHtml(n.name)} <span class="stat-lv">Lv${n.lv}</span></div>` +
      nodeStatBlockHtml(n);
  }
  // One shared floating tooltip, positioned in the viewport (not the canvas)
  // so it isn't clipped by the tree canvas's own overflow:hidden.
  function showStatTip(targetEl, n) {
    const tip = $("statTip");
    tip.innerHTML = nodeStatsHtml(n);
    tip.classList.remove("hidden");
    const r = targetEl.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.right + 10, y = r.top + r.height / 2 - th / 2;
    if (x + tw > window.innerWidth - 8) x = r.left - tw - 10;
    x = Math.max(8, x);
    y = Math.max(8, Math.min(window.innerHeight - th - 8, y));
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function hideStatTip() { $("statTip").classList.add("hidden"); }

  // ── Theme (the Zenny Gauntlet's 18 Deviants, not the Randomizer's classic
  // monster palette — requested explicitly; that app's own identity fits this
  // one too). Carried over verbatim, including hex choices and reasoning —
  // see that repo's app.js for the full derivation notes on which hexes are
  // sampled from the in-game pigment plate vs. hand-picked. [label, hex,
  // full name] — the full name drives the icon file and tooltip.
  const COLORS = [
    ["Redhelm",     "#CE2A20", "Redhelm Arzuros"],
    ["Snowbaron",   "#8E6BC4", "Snowbaron Lagombi"],
    ["Stonefist",   "#E8776E", "Stonefist Hermitaur"],
    ["Dreadqueen",  "#4A2A66", "Dreadqueen Rathian"],
    ["Drilltusk",   "#D07A20", "Drilltusk Tetsucabra"],
    ["Silverwind",  "#7A858E", "Silverwind Nargacuga"],
    ["Crystalbeard","#CFAE44", "Crystalbeard Uragaan"],
    ["Deadeye",     "#3F7A2E", "Deadeye Yian Garuga"],
    ["Dreadking",   "#3E0C05", "Dreadking Rathalos"],
    ["Thunderlord", "#C79A1C", "Thunderlord Zinogre"],
    ["Grimclaw",    "#3070D0", "Grimclaw Tigrex"],
    ["Hellblade",   "#D25A18", "Hellblade Glavenus"],
    ["Nightcloak",  "#07143C", "Nightcloak Malfestio"],
    ["Rustrazor",   "#5E9CC8", "Rustrazor Ceanataur"],
    ["Soulseer",    "#DC6F9E", "Soulseer Mizutsune"],
    ["Boltreaver",  "#22D3DB", "Boltreaver Astalos"],
    ["Elderfrost",  "#B8C6CE", "Elderfrost Gammoth"],
    ["Bloodbath",   "#1E2440", "Bloodbath Diablos"],
  ];
  const COLORS_HEX = Object.fromEntries(COLORS.map(([n, h]) => [h.toUpperCase(), n]));
  const COLORS_ICON = Object.fromEntries(COLORS.filter(c => c[2]).map(([n, , i]) => [n, i]));

  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const hexRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  function rgbToHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
    const l = (mx + mn) / 2;
    return [h / 6, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
  }
  function hslToRgb([h, s, l]) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h * 6) % 2 - 1)), m = l - c / 2;
    const hi = Math.floor(h * 6) % 6;
    const [r, g, b] = hi === 0 ? [c, x, 0] : hi === 1 ? [x, c, 0] : hi === 2 ? [0, c, x]
      : hi === 3 ? [0, x, c] : hi === 4 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m].map(v => clamp(v * 255));
  }
  const shade = (rgb, lo, hi) => {
    const [h, s, l] = rgbToHsl(rgb);
    return hslToRgb([h, s, clamp01(lo + (hi - lo) * l)]);
  };
  const lighten = (rgb, b, minL) => {
    const [h, s, l] = rgbToHsl(rgb);
    return hslToRgb([h, s, clamp01(Math.max(l + (1 - l) * b, minL == null ? 0 : minL))]);
  };
  const css = (rgb) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

  function applyTheme(hex) {
    const rgb = hexRgb(hex);
    const r = document.documentElement.style;
    r.setProperty("--bg", css(shade(rgb, .10, .28)));
    r.setProperty("--bg1", css(shade(rgb, .085, .23)));
    r.setProperty("--bg2", css(shade(rgb, .07, .19)));
    r.setProperty("--hover", css(shade(rgb, .17, .35)));
    r.setProperty("--accent", css(shade(rgb, .10, .28)));
    r.setProperty("--accent-hover", css(lighten(rgb, .40, .62)));
    r.setProperty("--text", "#ffffff");
    r.setProperty("--text-dim", "#fffffff5");
    r.setProperty("--line", "rgba(11,8,8,0.12)");
    r.setProperty("--card", "rgba(255,255,255,0.05)");
    try { localStorage.setItem("mhgu-challenge-run-theme", hex); } catch (e) {}
    document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("sel", s.dataset.hex === hex));
    const ti = document.querySelector(".title-icon");
    if (ti) {
      const name = COLORS_HEX[hex.toUpperCase()];
      ti.src = name ? monsterIcon(COLORS_ICON[name] || name) : FALLBACK_ICON;
      ti.onerror = () => { ti.onerror = null; ti.src = FALLBACK_ICON; };
    }
  }
  function buildSwatches() {
    const wrap = $("swatches"); wrap.innerHTML = "";
    COLORS.forEach(([name, hex]) => {
      const full = COLORS_ICON[name] || name;
      const d = document.createElement("div");
      d.className = "swatch"; d.dataset.hex = hex; d.style.background = hex; d.title = full;
      d.innerHTML = `<img class="swatch-icon" src="${monsterIcon(full)}" alt=""><span>${escapeHtml(name)}</span>`;
      d.querySelector("img").onerror = function () { this.onerror = null; this.src = FALLBACK_ICON; };
      d.addEventListener("click", () => applyTheme(hex));
      wrap.appendChild(d);
    });
  }

  // ── State ──────────────────────────────────────────────────────────────
  const STORE_KEY = "mhgu-challenge-run";
  const DEFAULT_CFG = { themeHex: "#07143C" }; // Nightcloak Malfestio — same default as the Zenny Gauntlet
  let cfg = Object.assign({}, DEFAULT_CFG);
  let run = emptyRun();

  function emptyRun() {
    return {
      active: false,
      class: null,
      // "basic" = a new life from a rank-up can be any weapon class.
      // "advanced" = every life must stay the class the run started with.
      // Chosen once on the start screen, fixed for the whole run.
      weaponRulesMode: "basic",
      // "basic" = Victory is slaying Ahtal-Ka. "advanced" = Ahtal-Ka is a
      // milestone, not Victory itself — all three Fatalis (see
      // fatalisCleared below) are also required. Same chosen-once-fixed-
      // for-the-run pattern as weaponRulesMode.
      questRulesMode: "basic",
      hr: 1,
      lives: [],
      currentLifeIndex: 0,
      keyQuestsChecked: {},
      // Position in DATA.urgentChain — the real HR1->HR12->Victory
      // progression (hand-sourced from Kiranico, see build-quests.js).
      // Index into the chain of the step not yet completed.
      urgentStepIndex: 0,
      urgentChecked: [],
      // Incremented every rank-up that grants a new life, decremented once
      // per tree picked on the Weapons page. A count, not a flag — nothing
      // stops the player from clearing a second urgent quest before ever
      // visiting the picker for the first (the tracker doesn't force a shop
      // trip between rank-ups any more than the game does), so more than
      // one life can be owed at once. No cancel path exists for this on
      // purpose — a rank-up already happened, so there's nothing to cancel
      // back to; see the inline picker below.
      pendingNewLives: 0,
      ahtalKaCleared: false,
      // Only ever checkable once ahtalKaCleared, and only matters under
      // Advanced quest rules — see victoryAchieved() and renderRankPanel().
      fatalisCleared: { fatalis: false, crimson: false, old: false },
      // questName -> index of the life that was current when it was ticked.
      // Storing WHICH weapon got the credit (rather than just bumping a
      // counter) is what makes un-ticking correct: the count comes back off
      // the weapon that earned it, even if the player has since switched or
      // sold weapons. Quest names are unique across Key, urgent and Fatalis
      // lists, so one flat map covers all three.
      questCredits: {},
      ended: false,
      endReason: null,
    };
  }

  // Every checkbox that represents "I hunted a quest" routes through here so
  // the tally can't drift between the three separate checklists.
  function creditQuest(questName, checked) {
    if (checked) {
      const idx = run.currentLifeIndex;
      const life = run.lives[idx];
      // No weapon in play (last one sold, pick still banked) — nothing to
      // credit. The quest still checks off; it just earns nobody a use.
      if (!life || life.status !== "alive") return;
      run.questCredits[questName] = idx;
      life.uses = (life.uses || 0) + 1;
    } else {
      const idx = run.questCredits[questName];
      if (idx == null) return;
      const life = run.lives[idx];
      if (life) life.uses = Math.max(0, (life.uses || 0) - 1);
      delete run.questCredits[questName];
    }
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, cfg, run })); } catch (e) {}
  }
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) {}
    if (d && d.cfg) {
      cfg = Object.assign({}, DEFAULT_CFG);
      Object.keys(DEFAULT_CFG).forEach(k => { if (k in d.cfg) cfg[k] = d.cfg[k]; });
    }
    if (d && d.run) run = Object.assign(emptyRun(), d.run);
    // A life's shape changed mid-development (tree/treeId/level/levelName ->
    // rootTreeId/currentKey) — a save from before that change would crash
    // every render trying to read fields that no longer exist. There's
    // nothing meaningful to migrate (the underlying tree data's own shape
    // changed too), so an incompatible save is discarded rather than
    // half-loaded into a broken state.
    if (run.lives.some(l => typeof l.currentKey !== "string")) {
      run = emptyRun();
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    }
    // Lives didn't used to carry their own class — every life was always
    // run.class before Basic-rules divergence existed, so that's exactly
    // the right backfill for a save from before this field existed.
    run.lives.forEach(l => { if (!l.classSlug) l.classSlug = run.class; });
    settleRunEnd();
  }

  // Run-over is derived from lives, but latched into ended/endReason once true,
  // so a reloaded finished run recognizes itself without a fresh mutation.
  function aliveLives() { return run.lives.filter(l => l.status === "alive"); }
  // A banked pick (run.pendingNewLives — a rank-up's weapon that hasn't been
  // chosen yet) counts as a weapon you still have. Selling your last ALIVE
  // weapon while holding one isn't the end of the run: you can still go and
  // pick that weapon, and the picker is already showing. The run ends only
  // when there's nothing alive AND nothing banked left to draw on.
  function weaponsRemaining() { return aliveLives().length + (run.pendingNewLives || 0); }
  function settleRunEnd() {
    if (run.active && !run.ended && run.lives.length > 0 && weaponsRemaining() === 0) {
      run.ended = true;
      run.endReason = "no-lives";
    }
  }

  function treeFor(classSlug, treeId) {
    const c = classBySlug[classSlug];
    return c ? c.trees.find(t => t.i === treeId) : null;
  }

  // ── Start screen ───────────────────────────────────────────────────────
  // Two independent toggles, both fixed for the whole run once Start Run is
  // pressed. Same UI pattern (a .page-tabs segmented control) for both —
  // kept as separate functions/ids rather than one generalized "toggle"
  // helper since they read very differently (weapon class vs. victory
  // condition) and there are only two of them.
  let weaponRulesMode = "basic"; // only affects new lives from a rank-up, not the first weapon
  function renderWeaponRulesToggle() {
    $("weaponRulesToggle").querySelectorAll(".page-tab").forEach(btn => {
      btn.classList.toggle("on", btn.dataset.mode === weaponRulesMode);
    });
    $("weaponRulesModeHint").textContent = weaponRulesMode === "basic"
      ? "A new weapon from a rank-up can be any class, not just your starting one."
      : "A new weapon from a rank-up must stay the same class as your starting weapon.";
  }
  $("weaponRulesToggle").querySelectorAll(".page-tab").forEach(btn => {
    btn.addEventListener("click", () => { weaponRulesMode = btn.dataset.mode; renderWeaponRulesToggle(); });
  });

  let questRulesMode = "basic"; // what counts as Victory — see victoryAchieved()
  function renderQuestRulesToggle() {
    $("questRulesToggle").querySelectorAll(".page-tab").forEach(btn => {
      btn.classList.toggle("on", btn.dataset.mode === questRulesMode);
    });
    $("questRulesModeHint").textContent = questRulesMode === "basic"
      ? "Victory is slaying Ahtal-Ka."
      : "Victory is slaying Ahtal-Ka, then all three Fatalis, in the same run.";
  }
  $("questRulesToggle").querySelectorAll(".page-tab").forEach(btn => {
    btn.addEventListener("click", () => { questRulesMode = btn.dataset.mode; renderQuestRulesToggle(); });
  });

  let pickedClass = null;

  // Guild card order, matching the Quest Randomizer's own WEAPONS list so
  // the family reads the same everywhere. DATA.classes arrives in whatever
  // order mhgu-weapon-trees' WDATA happens to use (bow first), which is not
  // an order any player recognises.
  const GUILD_ORDER = [
    "great_sword", "long_sword", "sword_and_shield", "dual_blades",
    "hammer", "hunting_horn", "lance", "gunlance", "switch_axe",
    "charge_blade", "insect_glaive", "light_bowgun", "heavy_bowgun", "bow",
  ];
  const CLASSES_ORDERED = GUILD_ORDER.map(s => classBySlug[s]).filter(Boolean);
  // Anything GUILD_ORDER doesn't name still shows, rather than vanishing
  // silently if a slug is ever renamed upstream.
  CLASSES.forEach(c => { if (!GUILD_ORDER.includes(c.slug)) CLASSES_ORDERED.push(c); });

  function renderClassGrid() {
    const wrap = $("classGrid"); wrap.innerHTML = "";
    CLASSES_ORDERED.forEach(c => {
      const d = document.createElement("div");
      d.className = "pick-card" + (pickedClass === c.slug ? " sel" : "");
      d.innerHTML = `<img src="${weaponIcon(c.slug)}" alt="">
        <span class="pc-name">${escapeHtml(c.label)}</span>`;
      d.addEventListener("click", () => { pickedClass = c.slug; pickedStarter = null; renderClassGrid(); renderStarterGrid(); });
      wrap.appendChild(d);
    });
  }

  let pickedStarter = null;
  const STARTER_PREFIXES = ["Petrified", "Iron", "Bone"];
  // Six classes have no Iron root (and Bow/LBG no Bone either) — every class
  // has Petrified, nothing else is universal. These are the hand-picked
  // stand-ins so every class still offers three starting trees. Named by the
  // app's owner from game knowledge, not derived: don't "fix" one that looks
  // odd against the Petrified/Iron/Bone naming, that's the point of the list.
  const STARTER_SUBSTITUTES = {
    bow: ["Hunter's Bow", "Hunter's Stoutbow"],
    light_bowgun: ["Cross Bowgun", "Hunter's Rifle"],
    heavy_bowgun: ["Arbalest"],
    sword_and_shield: ["Hunter's Knife"],
    dual_blades: ["Twin Daggers"],
    charge_blade: ["Elite Blade"],
  };

  function startersFor(c) {
    const byPrefix = c.trees.filter(t => !t.p && STARTER_PREFIXES.some(p => t.n.startsWith(p)));
    const subs = (STARTER_SUBSTITUTES[c.slug] || [])
      .map(name => c.trees.find(t => !t.p && t.n === name))
      .filter(Boolean);
    return byPrefix.concat(subs);
  }

  function renderStarterGrid() {
    const section = $("starterSection");
    if (!pickedClass) { section.classList.add("hidden"); $("startRunBtn").disabled = true; return; }
    section.classList.remove("hidden");
    const c = classBySlug[pickedClass];
    const starters = startersFor(c);
    const wrap = $("starterGrid"); wrap.innerHTML = "";
    starters.forEach(t => {
      const d = document.createElement("div");
      d.className = "pick-card" + (pickedStarter === t.i ? " sel" : "");
      d.innerHTML = `<span class="pc-name">${escapeHtml(t.n)}</span>
        <span class="pc-sub">Rarity ${t.r}</span>`;
      d.addEventListener("click", () => { pickedStarter = t.i; renderStarterGrid(); });
      wrap.appendChild(d);
    });
    if (!starters.length) {
      const note = document.createElement("p");
      note.className = "hint";
      note.style.gridColumn = "1/-1";
      note.textContent = `No starting tree found for ${c.label} in this data set.`;
      wrap.appendChild(note);
    }
    $("startRunBtn").disabled = !pickedStarter;
  }

  $("startRunBtn").addEventListener("click", () => {
    if (!pickedClass || !pickedStarter) return;
    const tree = treeFor(pickedClass, pickedStarter);
    run = emptyRun();
    run.active = true;
    run.class = pickedClass;
    run.weaponRulesMode = weaponRulesMode;
    run.questRulesMode = questRulesMode;
    run.lives = [newLife(pickedClass, tree.i, tree.levels[0][0])];
    run.currentLifeIndex = 0;
    activeTab = "quests";
    save();
    renderAll();
  });

  // ── Weapon lives ───────────────────────────────────────────────────────
  // A life is {classSlug, rootTreeId, currentKey, status}. currentKey
  // ("treeId:level") fully determines the life's position — the whole
  // climbed path back to its root is derivable by walking node.parent, so
  // nothing else needs to be stored. rootTreeId is kept only to reopen this
  // life's tree view (which trees are reachable) without re-deriving it
  // from currentKey. classSlug exists because Basic rules let a life's class
  // diverge from run.class (the run's starting class) — every lookup for a
  // specific life's own tree/graph/icon must key off life.classSlug, not
  // run.class, or Basic-rules lives render with the wrong class's data.
  const K = (t, lv) => t + ":" + lv;
  function newLife(classSlug, rootTreeId, rootLv) {
    const key = K(rootTreeId, rootLv);
    return { classSlug, rootTreeId, currentKey: key, status: "alive" };
  }
  // `stats` is shaped exactly like a tree-graph node's stat fields, so it can
  // be handed straight to nodeStatRowsHtml() — the life cards and the tree's
  // hover tooltip then render identical numbers from one code path. Null if
  // the level can't be resolved (shouldn't happen, but the card must not
  // throw over it).
  function currentNodeInfo(life) {
    const [t, lv] = life.currentKey.split(":").map(Number);
    const tree = treeFor(life.classSlug, t);
    const level = tree && tree.levels.find(l => l[0] === lv);
    const [, , raw, aff, def, slots, ele, sharp, extra] = level || [];
    return {
      treeId: t, lv, treeName: tree ? tree.n : "?", levelName: level ? level[1] : "?",
      stats: level ? { name: level[1], lv, r: tree.r, raw, aff, def, slots, ele, sharp, extra } : null,
    };
  }

  // Which weapon the tree view is pointed at. Deliberately separate from
  // run.currentLifeIndex: planning an upgrade path is a different act from
  // deciding what you're hunting with, and tying them together meant you had
  // to make a weapon current — a real, quest-crediting change — just to look
  // at where it could go. UI state only, so it isn't persisted; a reload
  // falls back to the current weapon, which is the right default anyway.
  let viewLifeIndex = null;

  // Validated on every read rather than cleaned up on sale/new-run: if the
  // viewed weapon is gone or sold, this silently falls back to the current
  // one instead of leaving a dangling index for some caller to trip over.
  function viewedIndex() {
    const l = viewLifeIndex == null ? null : run.lives[viewLifeIndex];
    return l && l.status === "alive" ? viewLifeIndex : run.currentLifeIndex;
  }
  function viewedLife() { return run.lives[viewedIndex()]; }

  function renderLives() {
    renderNewLifePicker();
    // Anything that changes which weapon is current, or what it is, comes
    // through here — upgrading, undoing, switching current, selling, picking
    // a banked weapon — so the Quests page's Current Weapon panel is kept in
    // sync from one place rather than each caller remembering.
    renderCurrentWeapon();
    const wrap = $("livesList"); wrap.innerHTML = "";
    run.lives.forEach((life, idx) => {
      const card = document.createElement("div");
      const isCurrent = idx === run.currentLifeIndex && life.status === "alive";
      const isViewed = idx === viewedIndex() && life.status === "alive";
      card.className = "life-card" + (life.status === "sold" ? " sold" : "") +
        (isCurrent ? " current" : "") + (isViewed ? " viewing" : "");
      const info = currentNodeInfo(life);
      // Only shown under Basic rules — under Advanced every life is the
      // same class as run.class (already shown in the sidebar), so this
      // would just be redundant noise on every card.
      const classTag = run.weaponRulesMode === "basic"
        ? `<span class="lc-class">${escapeHtml((classBySlug[life.classSlug] || {}).label || "?")}</span>` : "";
      let body = `<div class="lc-top">${classTag}<span class="lc-tree">${escapeHtml(info.treeName)}</span>` +
        (isCurrent ? `<span class="lc-badge">Current</span>` : "") + `</div>`;
      body += `<div class="lc-head">` +
        `<img class="lc-icon" src="${weaponRarityIcon(life.classSlug, info.stats ? info.stats.r : 0)}" alt="">` +
        `<span class="lc-level">${escapeHtml(info.levelName)} <em>Lv${info.lv}</em></span></div>`;
      // Full stats on every card, sold ones included — a sold weapon's card
      // is a record of what was lost, so blanking its numbers would throw
      // away the only place that's still visible.
      if (info.stats) body += `<div class="lc-stats">${nodeStatBlockHtml(info.stats)}</div>`;
      if (life.status === "alive") {
        body += `<div class="lc-actions">`;
        body += `<button class="btn tiny" data-set-current="${idx}" ${isCurrent ? "disabled" : ""}>Set current</button>`;
        body += `<button class="btn tiny" data-fail="${idx}">Log failure</button>`;
        body += `</div>`;
      } else {
        body += `<div class="lc-sold">Sold</div>`;
      }
      card.innerHTML = body;
      // Clicking anywhere on an alive card points the tree at that weapon.
      // The buttons inside stop propagation, so "Set current" and "Log
      // failure" still mean only themselves.
      if (life.status === "alive") {
        card.addEventListener("click", () => {
          viewLifeIndex = idx;
          renderLives();
        });
      }
      wrap.appendChild(card);
    });
    wrap.querySelectorAll("[data-set-current]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        run.currentLifeIndex = parseInt(btn.dataset.setCurrent, 10);
        // Making a weapon current is also a statement about which one you
        // care about right now, so bring the tree along rather than leaving
        // it parked on whatever was being browsed.
        viewLifeIndex = run.currentLifeIndex;
        save(); renderLives();
      });
    });
    wrap.querySelectorAll("[data-fail]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.fail, 10);
        const info = currentNodeInfo(run.lives[idx]);
        confirmAction("Log a failure?",
          `This sells "${escapeHtml(info.treeName)}" permanently. This can't be undone.`,
          () => {
            run.lives[idx].status = "sold";
            if (run.currentLifeIndex === idx) {
              const nextAlive = run.lives.findIndex(l => l.status === "alive");
              run.currentLifeIndex = nextAlive >= 0 ? nextAlive : idx;
            }
            settleRunEnd();
            save(); renderAll();
          });
      });
    });
    renderWeaponTree();
  }

  // ── Weapon tree (2.5D navigable view) ───────────────────────────────────
  // Scoped to one life's own reachable subtree, not the whole class: a life
  // starts at some tree's root level and only ever climbs forward from
  // there, so the tree it needs is "everything reachable from this root
  // going up", built fresh each time (classes are small enough that this
  // is cheap — no caching needed).
  function buildLifeGraph(classSlug, rootTreeId, rootLv) {
    const c = classBySlug[classSlug];
    const treeById = new Map(c.trees.map(t => [t.i, t]));
    const branchesOf = new Map(); // parentTreeId -> [{unlockLv, childTreeId}]
    for (const t of c.trees) {
      if (t.p) {
        if (!branchesOf.has(t.p[0])) branchesOf.set(t.p[0], []);
        branchesOf.get(t.p[0]).push({ unlockLv: t.p[1], childTreeId: t.i });
      }
    }
    const nodes = new Map();
    function addTree(treeId, parentKey) {
      const t = treeById.get(treeId);
      if (!t) return;
      let prevKey = parentKey;
      t.levels.forEach(([lv, name, raw, aff, def, slots, ele, sharp, extra], idx) => {
        const key = K(treeId, lv);
        const node = {
          key, t: treeId, lv, name, r: t.r,
          raw, aff, def, slots, ele, sharp, extra,
          kids: [], parent: prevKey, branch: idx === 0 && parentKey != null,
          depth: 0, x: 0, u: 0,
        };
        nodes.set(key, node);
        if (prevKey) nodes.get(prevKey).kids.push(key);
        for (const b of (branchesOf.get(treeId) || [])) {
          if (b.unlockLv === lv) addTree(b.childTreeId, key);
        }
        prevKey = key;
      });
    }
    addTree(rootTreeId, null);
    return { nodes, rootKey: K(rootTreeId, rootLv) };
  }

  // Matches the source app's own tuning (USTEP 300, XGAP 250) — this port
  // had compressed both without real justification, which is exactly what
  // was crowding node labels into each other.
  const USTEP = 300, XGAP = 220;
  function layoutGraph(nodes, rootKey) {
    const bfsQ = [[rootKey, 0]], seen = new Set([rootKey]);
    while (bfsQ.length) {
      const [key, d] = bfsQ.shift();
      const n = nodes.get(key);
      n.depth = d; n.u = d * USTEP;
      for (const k of n.kids) if (!seen.has(k)) { seen.add(k); bfsQ.push([k, d + 1]); }
    }
    const off = new Map([[rootKey, 0]]);
    function place(key) {
      const n = nodes.get(key);
      const prim = n.kids.find(k => !nodes.get(k).branch);
      const brs = n.kids.filter(k => nodes.get(k).branch);
      let min = 0, max = 0;
      if (prim) { const e = place(prim); off.set(prim, 0); min = e.min; max = e.max; }
      let side = 1;
      for (const b of brs) {
        const e = place(b);
        const o = side > 0 ? (max - e.min + XGAP) : (min - e.max - XGAP);
        if (side > 0) max = o + e.max; else min = o + e.min;
        off.set(b, o); side = -side;
      }
      return { min, max };
    }
    place(rootKey);
    const posQ = [rootKey]; nodes.get(rootKey).x = 0;
    const posSeen = new Set([rootKey]);
    while (posQ.length) {
      const key = posQ.shift();
      const n = nodes.get(key);
      for (const k of n.kids) {
        if (posSeen.has(k)) continue;
        posSeen.add(k);
        nodes.get(k).x = n.x + (off.get(k) || 0);
        posQ.push(k);
      }
    }
  }

  // path/ahead/ghost classification, ported from mhgu-weapon-trees: "cur"/
  // "past" walk backward from the life's current node via parent links (no
  // separate path array needs storing — it's always derivable); "next"/
  // "far" is a forward BFS of what's reachable; "ghost" is a branch you
  // climbed past without taking.
  //
  // In-game, climbing past a branch's unlock level without taking it
  // doesn't close it off — it's still buildable later from the shop, same
  // as the day it unlocked. ghostRoots is exactly those still-open entry
  // points (the immediate, first-level kid of each onPath node that isn't
  // itself onPath/ahead) — advanceLife() treats them as clickable the same
  // as a "next" node. Only the entry point, not deeper into that branch:
  // once you step onto it, normal node-by-node "next" traversal takes over
  // from there, same as any other line.
  function classifyNodes(nodes, currentKey) {
    const onPath = new Set(); let k = currentKey;
    while (k) { onPath.add(k); k = nodes.get(k).parent; }
    const ahead = new Map(); const q = [[currentKey, 0]]; const seenA = new Set([currentKey]);
    while (q.length) {
      const [key, d] = q.shift();
      if (key !== currentKey) ahead.set(key, d);
      if (d >= 8) continue;
      for (const kid of nodes.get(key).kids) if (!seenA.has(kid)) { seenA.add(kid); q.push([kid, d + 1]); }
    }
    const ghost = new Set();
    const ghostRoots = new Set();
    // No depth cap here (unlike the `ahead` BFS above) — the whole skipped
    // branch stays soft-lined for as far as it goes, not just its first few
    // levels. Capping it used to make the dashed styling quietly give way
    // to plain "far" partway down a long branch, which read as the line
    // itself getting cut off rather than a deliberate style choice.
    for (const pk of onPath) {
      const n = nodes.get(pk);
      for (const kid of n.kids) {
        if (onPath.has(kid) || ahead.has(kid)) continue;
        ghostRoots.add(kid);
        const q2 = [kid]; const seenG = new Set([kid]);
        while (q2.length) {
          const key = q2.shift();
          ghost.add(key);
          for (const gk of nodes.get(key).kids) if (!seenG.has(gk)) { seenG.add(gk); q2.push(gk); }
        }
      }
    }
    return { onPath, ahead, ghost, ghostRoots };
  }
  function classOf(key, currentKey, cls) {
    if (key === currentKey) return "cur";
    if (cls.onPath.has(key)) return "past";
    const a = cls.ahead.get(key);
    if (a === 1) return "next";
    if (a != null) return "far";
    if (cls.ghost.has(key)) return "ghost";
    return "far";
  }

  // Camera is intentionally not persisted — it's ephemeral view state, reset
  // to frame the current node fresh whenever the tree view (re)opens.
  let cam = null, dragging = false, camStart = null;
  let nodesForCurrentGraph = new Map(); // set each render — backs the choices panel's key->node lookup
  // Orthographic (no perspective shrink — every node scales identically
  // regardless of depth; only cam.dist/zoom changes scale), laid out
  // VERTICALLY with the tree's base at the bottom: u (progression) maps to
  // screen-Y *negated*, so climbing the tree reads bottom-to-top the way a
  // tree actually grows, and x (branch spread) maps to screen-X.
  //
  // This axis mapping has changed twice — first the source app's tilted
  // perspective, then horizontal left-to-right, now vertical bottom-up. All
  // three are the same layout data (layoutGraph's x/u) read through a
  // different projection; layoutGraph itself has never needed to know.
  function project(x, u) {
    const s = 260 / cam.dist;
    return { x: cam.cx + (x - cam.x) * s, y: cam.cy - (u - cam.u) * s, s };
  }

  function renderWeaponTree() {
    const treeWrap = $("treeWrap");
    const life = viewedLife();
    if (!life || life.status !== "alive") { treeWrap.classList.add("hidden"); return; }
    treeWrap.classList.remove("hidden");

    const [rootT, rootLv0] = [life.rootTreeId, treeFor(life.classSlug, life.rootTreeId).levels[0][0]];
    const { nodes, rootKey } = buildLifeGraph(life.classSlug, rootT, rootLv0);
    layoutGraph(nodes, rootKey);
    const cls = classifyNodes(nodes, life.currentKey);
    nodesForCurrentGraph = nodes;

    const info = currentNodeInfo(life);
    // Say plainly whose tree this is. Once the tree can show a weapon that
    // isn't the one in play, an unlabelled title is a trap — you'd upgrade
    // what you thought was your active weapon.
    $("treeTitle").innerHTML = escapeHtml(`${info.treeName} — ${info.levelName} (Lv ${info.lv})`) +
      (viewedIndex() === run.currentLifeIndex ? "" : ` <em class="tree-title-note">not current</em>`);

    const canvas = $("treeCanvas");
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 400;
    const curNode = nodes.get(life.currentKey);
    $("treeUndo").disabled = !curNode.parent;
    // Default view frames the ENTIRE tree, not just the current node.
    // Framing tightly on the current node (the old `dist: 560` fixed zoom)
    // left most of the tree — including every soft-lined skipped branch —
    // sitting hundreds of px off-canvas, so those lines were drawn
    // correctly but effectively invisible without hunting around by hand.
    // Centre on the tree's bounding box and pick the zoom that fits it,
    // with a little padding; the player can still pan/zoom from there.
    // Refit when the canvas size changes too, not just when the life does:
    // the first render often happens while #weaponsPage is hidden (canvas
    // 0x0 -> the 600x400 fallback above), and a camera fitted to those
    // fallback dimensions is wrong for the real canvas. Comparing _w/_h
    // makes that self-correcting instead of depending on one caller
    // remembering to re-render at the right moment.
    // Keyed on the life's IDENTITY (its class + root tree), not on
    // life.currentKey — currentKey changes on every upgrade, so keying on it
    // made each advance look like a brand-new life and re-fit the camera,
    // throwing away whatever zoom the player had set. class+root is stable
    // for a life's whole climb, and unique across lives since a tree can
    // only be used once per run.
    const camKey = life.classSlug + ":" + life.rootTreeId;
    if (!cam || cam._life !== camKey || cam._w !== w || cam._h !== h) {
      const ns = [...nodes.values()];
      const uLo = Math.min(...ns.map(n => n.u)), uHi = Math.max(...ns.map(n => n.u));
      const xLo = Math.min(...ns.map(n => n.x)), xHi = Math.max(...ns.map(n => n.x));
      // project() is s = 260/dist, so dist = 260/s — solve for the s that
      // fits both axes, floored so a tiny tree doesn't zoom in absurdly.
      // x spans the canvas WIDTH and u its HEIGHT now that the tree is
      // vertical — these were the other way round under the horizontal
      // layout, and getting them backwards silently mis-zooms rather than
      // erroring, so keep them paired with project()'s axis mapping.
      const PAD = 90;
      const sFit = Math.min((w - PAD * 2) / Math.max(1, xHi - xLo), (h - PAD * 2) / Math.max(1, uHi - uLo));
      const dist = Math.max(120, Math.min(6000, 260 / Math.min(sFit, 0.55)));
      cam = { x: (xLo + xHi) / 2, u: (uLo + uHi) / 2, dist,
              cx: w / 2, cy: h / 2, _life: camKey, _w: w, _h: h, _node: life.currentKey };
    } else {
      cam.cx = w / 2; cam.cy = h / 2;
      // Zoom and pan both survive an upgrade. If the node you just moved TO
      // would land off-canvas (possible when zoomed well in, where one step
      // is a long way in screen pixels), nudge the view the smallest amount
      // that brings it back inside a margin.
      //
      // Only when the current node actually CHANGED. renderWeaponTree() runs
      // on every pan and zoom frame too, and applying this unconditionally
      // turned it into a hard boundary — the drag moved a little, then the
      // clamp yanked the camera straight back, so the tree simply refused to
      // pan past the point where the current node reached the margin.
      if (cam._node !== life.currentKey) {
        const s = 260 / cam.dist, M = 80;
        const p = project(curNode.x, curNode.u);
        if (p.x < M) cam.x -= (M - p.x) / s;
        else if (p.x > w - M) cam.x += (p.x - (w - M)) / s;
        if (p.y < M) cam.u += (M - p.y) / s;
        else if (p.y > h - M) cam.u -= (p.y - (h - M)) / s;
      }
    }
    cam._node = life.currentKey;

    const svg = $("treeSvg");
    const nodesWrap = $("treeNodes");

    // One marker per upgrade tier. The loop below sweeps x at a fixed u,
    // which has now drawn all three orientations without being touched:
    // receding "ground" lines under the original tilted projection, vertical
    // columns under the horizontal layout, and horizontal rungs here in the
    // vertical one. It only ever describes "a line across the tree at this
    // depth" — project() decides what that looks like on screen.
    //
    // Spans the WHOLE tree, both axes, rather than a moving window around
    // the camera. It used to draw 14 tiers starting near cam.u, over a
    // fixed ±900 of x — so panning made markers pop in and out at the
    // edges, which read as lines being removed. Nothing here is culled now:
    // the SVG viewport clips whatever's off-screen anyway, and a few dozen
    // extra <line>s is far cheaper than the bookkeeping to cull them right.
    const allNodes = [...nodes.values()];
    const maxDepth = Math.max(...allNodes.map(n => n.depth));
    const xMin = Math.min(...allNodes.map(n => n.x)) - 120;
    const xMax = Math.max(...allNodes.map(n => n.x)) + 120;
    let gridSvg = "";
    for (let d = 0; d <= maxDepth; d++) {
      const a = project(xMin, d * USTEP), b = project(xMax, d * USTEP);
      gridSvg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#8fa6c8" stroke-width="1" opacity="0.07"></line>`;
    }

    // Plain tree structure first (dim; next-step edges lift to cyan), then
    // the path actually walked drawn OVER everything in solid gold — the
    // structure and "where you've been" read as two clearly separate layers,
    // the same way mhgu-weapon-trees keeps them.
    // EVERY parent->child edge is drawn, every render, with no culling —
    // the only thing a node's class changes is how its edge *looks*, never
    // whether it exists. (The old perspective projection could return null
    // for nodes behind the camera, so both loops used to `continue` past
    // those; orthographic never does, and leaving the skip in place just
    // invited "sometimes a line is missing" back in.)
    let edgeSvg = "";
    for (const n of nodes.values()) {
      if (!n.parent) continue;
      const parent = nodes.get(n.parent);
      const a = project(parent.x, parent.u), b = project(n.x, n.u);
      const c = classOf(n.key, life.currentKey, cls);
      // Every stroke here is an explicit literal, NOT var(--line). That
      // token is rgba(11,8,8,0.12) — near-black at 12% alpha, fine as a
      // border against a panel but invisible on the canvas's dark navy
      // (rgb(6,16,48)). Ghost and past edges defaulted to it and so were
      // drawn-but-unseeable, which looked exactly like culling and sent
      // three rounds of debugging after phantom "removed lines."
      // Structure lines are all SOLID, including a skipped branch's own —
      // the tree's shape doesn't change just because you walked past a
      // fork, so its lines shouldn't look different either. "Soft" belongs
      // only on the reachability connectors drawn further below, not here.
      let stroke = "#7f8ea3", width = 1.4, op = 0.55;
      if (c === "next") { stroke = "#79d2ff"; width = 2.2; op = 0.9; }
      else if (c === "far") { stroke = "var(--accent-hover)"; width = 1.5; op = 0.55; }
      else if (c === "ghost") { stroke = "#8d99ab"; width = 1.4; op = 0.5; }
      else if (c === "past") { stroke = "#c9a961"; width = 1.6; op = 0.5; }
      edgeSvg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="${width}" opacity="${op}"></line>`;
    }
    let pathKeys = []; { let k = life.currentKey; while (k) { pathKeys.push(k); k = nodes.get(k).parent; } }
    pathKeys.reverse();
    for (let i = 1; i < pathKeys.length; i++) {
      const a = project(nodes.get(pathKeys[i - 1]).x, nodes.get(pathKeys[i - 1]).u);
      const b = project(nodes.get(pathKeys[i]).x, nodes.get(pathKeys[i]).u);
      edgeSvg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#f0c264" stroke-width="2.8" opacity="0.95" stroke-linecap="round"></line>`;
    }

    // Reachability connectors: one dotted line straight from the current
    // node to each branch entry point still open to it. These are NOT tree
    // structure — they cut across the layout, from where you're standing to
    // somewhere you could jump — which is exactly what makes dotted the
    // right treatment: it reads as "you can still get there," distinct from
    // every solid line, which means "this is how the tree is shaped."
    const curP = project(curNode.x, curNode.u);
    for (const gk of cls.ghostRoots) {
      const g = nodes.get(gk);
      const gp = project(g.x, g.u);
      edgeSvg += `<line x1="${curP.x}" y1="${curP.y}" x2="${gp.x}" y2="${gp.y}" ` +
        `stroke="#e8c98a" stroke-width="1.6" opacity="0.55" stroke-dasharray="2 7" stroke-linecap="round"></line>`;
    }
    svg.innerHTML = gridSvg + edgeSvg;

    // Painted in RANK order so higher-priority nodes (cur last) stack above
    // anything they happen to overlap.
    const RANK = { ghost: 0, far: 1, next: 2, past: 3, cur: 4 };
    const visible = [...nodes.values()].sort((x, y) =>
      RANK[classOf(x.key, life.currentKey, cls)] - RANK[classOf(y.key, life.currentKey, cls)]);

    nodesWrap.innerHTML = "";
    visible.forEach((n, i) => {
      const p = project(n.x, n.u);
      const c = classOf(n.key, life.currentKey, cls);
      const div = document.createElement("div");
      div.className = "tnode " + c;
      div.style.left = p.x + "px";
      div.style.top = p.y + "px";
      div.style.zIndex = String(1000 + i);
      // Current/next stay comfortably legible regardless of distance — the
      // things you can actually act on shouldn't shrink away just because
      // the map zoomed out to fit more of the tree.
      const scaleFloor = (c === "cur" || c === "next") ? 0.85 : 0.55;
      const scale = Math.max(scaleFloor, Math.min(1.25, p.s / 0.62));
      div.style.transform = `translate(-50%,-50%) scale(${scale.toFixed(2)})`;
      // A weapon keeps its name across several levels (e.g. "Petrified Blade"
      // spans Lv1-7) — labelling every node just repeats it up the line, so
      // only the node where the name actually changes gets one, plus
      // wherever you currently stand.
      const parent = n.parent && nodes.get(n.parent);
      const renamed = !parent || parent.name !== n.name;
      // Your current node, your immediate options, and any still-open
      // skipped branch (ghostRoots — see classifyNodes()) are always
      // labelled, whatever scale they land at — those are exactly the
      // things worth reading to decide the next click, clickable or not.
      // Everything else still follows the declutter-by-rename rule, gated
      // on scale so it doesn't get crowded once nodes are big enough to
      // read anyway.
      const isGhostRoot = cls.ghostRoots.has(n.key);
      const important = c === "cur" || c === "next" || isGhostRoot;
      const showLabel = important || (renamed && scale > 0.62);
      const showSub = important || scale > 0.62;
      div.innerHTML = `<div class="tdot"><img src="${weaponRarityIcon(life.classSlug, n.r)}" alt=""></div>` +
        `<div class="tlbl">${showLabel ? escapeHtml(n.name) : ""}</div>` +
        `<div class="tsub">${showSub ? "Lv" + n.lv : ""}</div>`;
      div.addEventListener("mouseenter", () => showStatTip(div, n));
      div.addEventListener("mouseleave", hideStatTip);
      // A skipped branch's entry point stays choosable indefinitely — in
      // the real game climbing past its unlock level without taking it
      // doesn't close the shop recipe. Soft/dashed "ghost" styling (see the
      // edge-drawing loop above) is what marks it as available-but-not-the-
      // obvious-next-step, same visual language as before; this just makes
      // it actually clickable instead of decorative-only.
      if (c === "next" || isGhostRoot) {
        div.addEventListener("click", () => advanceLife(life, n.key));
        div.classList.add("clickable");
      }
      nodesWrap.appendChild(div);
    });

    renderTreeChoices(curNode, cls.ghostRoots);
  }

  function advanceLife(life, key) {
    life.currentKey = key;
    save(); renderLives();
  }

  // Mirrors mhgu-weapon-trees' #choices panel: a readable list of the
  // current node's immediate options, since finding the right dot on the
  // map isn't always obvious — kids are already exactly the next-step set.
  // Also lists any still-open skipped branch (ghostRoots) under its own
  // heading — those aren't curNode.kids (they branch off an *ancestor*),
  // but they're just as clickable, and easy to miss as a small dashed dot
  // somewhere back down the map.
  function renderTreeChoices(curNode, ghostRoots) {
    const box = $("treeChoices");
    const opts = curNode.kids.map(k => nodesForCurrentGraph.get(k));
    const skipped = [...ghostRoots].map(k => nodesForCurrentGraph.get(k)).filter(Boolean);
    if (!opts.length && !skipped.length) {
      box.innerHTML = `<h4>End of the line</h4><p class="hint">Final form — nothing upgrades out of it.</p>`;
      return;
    }
    let html = "";
    if (opts.length) {
      html += `<h4>${opts.length > 1 ? opts.length + " paths ahead" : "Next step"}</h4>` +
        opts.map(o => `<div class="choice-card${o.branch ? " branch" : ""}" data-k="${escapeHtml(o.key)}">
          <span class="cc-name">${escapeHtml(o.name)}</span><span class="cc-lv">Lv${o.lv}</span>
          ${o.branch ? '<div class="cc-tag">Branch</div>' : ""}
        </div>`).join("");
    }
    if (skipped.length) {
      html += `<h4>Still open</h4>` +
        skipped.map(o => `<div class="choice-card ghost" data-k="${escapeHtml(o.key)}">
          <span class="cc-name">${escapeHtml(o.name)}</span><span class="cc-lv">Lv${o.lv}</span>
          <div class="cc-tag">Skipped branch</div>
        </div>`).join("");
    }
    box.innerHTML = html;
    box.querySelectorAll(".choice-card").forEach(el => {
      const n = nodesForCurrentGraph.get(el.dataset.k);
      el.addEventListener("click", () => advanceLife(viewedLife(), el.dataset.k));
      el.addEventListener("mouseenter", () => showStatTip(el, n));
      el.addEventListener("mouseleave", hideStatTip);
    });
  }

  function recenterTree() { cam = null; renderWeaponTree(); }
  $("treeRecenter").addEventListener("click", recenterTree);

  // Steps back one node at a time via the same parent link everything else
  // derives the path from — no separate history to keep in sync. Direct,
  // no confirmation: this corrects a mis-click in the tracker, it doesn't
  // touch anything with real run stakes (those are quest failures, not
  // which tree node is recorded), and re-advancing costs nothing either.
  function undoLife() {
    const life = viewedLife();
    if (!life) return;
    const node = nodesForCurrentGraph.get(life.currentKey);
    if (!node || !node.parent) return;
    life.currentKey = node.parent;
    save(); renderLives();
  }
  $("treeUndo").addEventListener("click", undoLife);

  (function setupTreePanZoom() {
    const canvas = $("treeCanvas");
    // A real click is a pointerdown+pointerup with near-zero movement. Only
    // committing to a drag (and only THEN capturing the pointer) once
    // movement crosses a small threshold is what lets a click on a node
    // still fire normally — capturing on every pointerdown unconditionally
    // was swallowing clicks entirely, since the browser's synthesized click
    // event depends on pointerup landing on the same element uncaptured.
    let pending = null, captured = false;
    canvas.addEventListener("pointerdown", (e) => {
      if (!cam) return;
      pending = { id: e.pointerId, x: e.clientX, y: e.clientY };
      camStart = { x: cam.x, u: cam.u };
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!pending || !cam) return;
      const dx = e.clientX - pending.x, dy = e.clientY - pending.y;
      if (!dragging) {
        if (Math.hypot(dx, dy) < 5) return;
        dragging = true; canvas.classList.add("grabbing");
        hideStatTip(); // panning rebuilds nodes under the cursor — a stale tip would outlive its node
        try { canvas.setPointerCapture(pending.id); captured = true; } catch (err) {}
      }
      // Matches project()'s vertical mapping: x is screen-X, u is screen-Y
      // NEGATED. The sign on cam.u is therefore + (not -) so content still
      // follows the cursor — drag down and the tree moves down with it.
      const s = 260 / cam.dist;
      cam.x = camStart.x - dx / s;
      cam.u = camStart.u + dy / s;
      renderWeaponTree();
    });
    const stop = (e) => {
      if (captured && e) { try { canvas.releasePointerCapture(e.pointerId); } catch (err) {} }
      pending = null; dragging = false; captured = false;
      canvas.classList.remove("grabbing");
    };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointerleave", stop);
    canvas.addEventListener("wheel", (e) => {
      if (!cam) return;
      e.preventDefault();
      hideStatTip(); // zooming rescales/rebuilds nodes — same staleness risk as panning
      // Upper bound is generous (was 1400) so a big class tree can be
      // pulled back far enough to take in whole at once; node scale has its
      // own floor in the render loop, so zooming way out thins the layout
      // rather than shrinking icons into unreadable specks.
      cam.dist = Math.max(120, Math.min(6000, cam.dist * (e.deltaY > 0 ? 1.12 : 0.89)));
      renderWeaponTree();
    }, { passive: false });
  })();

  // ── Run status (sidebar) ──────────────────────────────────────────────
  function renderRunStatus() {
    const c = classBySlug[run.class];
    $("runStatus").innerHTML = `
      <div class="rs-row"><span>Starting Class</span><b>${c ? escapeHtml(c.label) : ""}</b></div>
      <div class="rs-row"><span>Weapon Rules</span><b>${run.weaponRulesMode === "basic" ? "Basic" : "Advanced"}</b></div>
      <div class="rs-row"><span>Quest Rules</span><b>${run.questRulesMode === "basic" ? "Basic" : "Advanced"}</b></div>
      <div class="rs-row"><span>Hunter Rank</span><b>${run.hr}</b></div>` +
      // No "Lives" row — the Progress block right below now carries Weapons
      // Active / Weapons Lost, which said the same thing twice.
      //
      // Banked stays: it's the one piece not covered down there, and without
      // it a run sitting at 0 active looks wiped rather than waiting on a
      // pick.
      (run.pendingNewLives > 0
        ? `<div class="rs-row"><span>Banked</span><b>${run.pendingNewLives} to pick</b></div>`
        : "");
  }

  // ── Current weapon (Quests page, beside Hunter Rank Progress) ──────────
  // The weapon you're actually hunting with, shown on the Quests page so you
  // don't have to switch tabs mid-quest to check what you're holding. Uses
  // the same nodeStatBlockHtml() as the life cards and the tree tooltip, so
  // there's still one implementation of "how a weapon's stats look".
  function renderCurrentWeapon() {
    const wrap = $("currentWeaponPanel");
    const life = run.lives[run.currentLifeIndex];
    if (!life || life.status !== "alive") {
      wrap.innerHTML = `<p class="hint">No weapon in play.` +
        (run.pendingNewLives > 0 ? ` You have ${run.pendingNewLives} pick${run.pendingNewLives > 1 ? "s" : ""} banked — see Weapon Selection.` : "") +
        `</p>`;
      return;
    }
    const info = currentNodeInfo(life);
    const cls = classBySlug[life.classSlug];
    wrap.innerHTML =
      `<div class="cw-head">` +
        `<img class="cw-icon" src="${weaponRarityIcon(life.classSlug, info.stats ? info.stats.r : 0)}" alt="">` +
        `<div class="cw-id">` +
          `<div class="cw-name">${escapeHtml(info.levelName)}</div>` +
          `<div class="cw-sub">${escapeHtml(cls ? cls.label : "")} &middot; ${escapeHtml(info.treeName)} Lv${info.lv}</div>` +
        `</div>` +
      `</div>` +
      (info.stats ? `<div class="cw-stats">${nodeStatBlockHtml(info.stats)}</div>` : "");
  }

  // ── Victory ──────────────────────────────────────────────────────────
  // Single source of truth for "is this run actually won" — shared by the
  // rank panel and the quest progress panel so Basic/Advanced can't drift
  // into disagreeing about it. Basic: Ahtal-Ka alone. Advanced: Ahtal-Ka is
  // a milestone, not the finish line — all three Fatalis too.
  const FATALIS_KEYS = ["fatalis", "crimson", "old"];
  // Shown at whichever quest is actually the run's last — Ahtal-Ka under
  // Basic quest rules, the third Fatalis under Advanced.
  const VICTORY_CONFIRM = "This will be the last quest of the run. Marking it complete will " +
    "take you to the Victory Results screen. Are you ready to end the run?";
  // Ends the run as WON, distinct from running out of weapons. renderAll()
  // swaps to the result screen off run.ended, so this just sets the state
  // and re-renders rather than juggling visibility itself.
  function endRunVictorious() {
    run.ended = true;
    run.endReason = "victory";
    save();
    renderAll();
  }
  function victoryAchieved() {
    if (!run.ahtalKaCleared) return false;
    if (run.questRulesMode !== "advanced") return true;
    return FATALIS_KEYS.every(k => run.fatalisCleared[k]);
  }

  // ── Quest page progress panel (right-hand column) ──────────────────────
  // Individual urgent quests not yet cleared, current step's own partial
  // progress included — future steps count in full since nothing on them
  // can be checked yet. Mirrors currentUrgentStep()/urgentStepReady()'s own
  // reading of urgentStepIndex/urgentChecked so this can't drift from what
  // the rank panel itself considers "done".
  function urgentQuestsLeft() {
    if (run.ahtalKaCleared) return 0;
    let n = 0;
    for (let i = run.urgentStepIndex; i < DATA.urgentChain.length; i++) {
      const step = DATA.urgentChain[i];
      n += i === run.urgentStepIndex
        ? step.quests.filter(q => !run.urgentChecked.includes(q.n)).length
        : step.quests.length;
    }
    return n;
  }
  // "Quests to Victory" first shipped counting *only* the 13 urgent quests
  // across the whole chain — technically the real trigger, but a small,
  // disconnected-looking number sitting right next to "Key Quests X/60"
  // that didn't move when a normal Key Quest got checked. The user reported
  // it as nonsensical (22 Key Quests done, "9 to Victory" — two numbers
  // from unrelated pools that invite exactly the wrong comparison). Fixed
  // to count every remaining checkbox of either kind, since reaching
  // Victory genuinely requires clearing all 60 Key Quests too (each tier
  // gates the next chain step, so getting to the last step means every
  // tier before it is already full) — this way the number always moves
  // when the player checks anything relevant, and pairs sensibly with the
  // Key Quests stat right above it.
  // Every quest in the urgent chain, across all its steps. Shared by the
  // sidebar counter and the result screen so the two can't disagree.
  function urgentQuestTotal() {
    return DATA.urgentChain.reduce((n, s) => n + s.quests.length, 0);
  }

  function renderQuestProgress() {
    const keyDone = Object.values(run.keyQuestsChecked).reduce((n, a) => n + a.length, 0);
    const keyTotal = DATA.keyTiers.reduce((n, t) => n + t.quests.length, 0);
    const lost = run.lives.filter(l => l.status === "sold").length;
    // Once Ahtal-Ka is down, Basic is already at victoryAchieved() and never
    // reaches this branch. Advanced switches from "quests remaining" to
    // "Fatalis remaining" — a different unit, but still a count
    // that hits zero exactly when victoryAchieved() flips true.
    // The urgent chain is its own pool — the 13 quests that actually drive
    // Hunter Rank — so it gets its own cleared/total row next to Key Quests
    // rather than being folded into either of the other numbers.
    const urgentTotal = urgentQuestTotal();
    const won = victoryAchieved();
    const toVictory = won ? 0
      : run.ahtalKaCleared ? FATALIS_KEYS.filter(k => !run.fatalisCleared[k]).length
      : (keyTotal - keyDone) + urgentQuestsLeft();
    $("questProgress").innerHTML = `
      <div class="rs-row"><span>Key Quests</span><b>${keyDone}/${keyTotal}</b></div>
      <div class="rs-row"><span>Urgent Quests</span><b>${run.urgentChecked.length}/${urgentTotal}</b></div>
      <div class="rs-row"><span>Quests to Victory</span><b>${won ? "Victory!" : toVictory}</b></div>
      <div class="rs-row"><span>Weapons Active</span><b>${aliveLives().length}</b></div>
      <div class="rs-row"><span>Weapons Lost</span><b>${lost}</b></div>`;
  }

  // ── Hunter Rank Progress (the real urgent chain, HR1 -> HR12 -> Victory) ─
  function currentUrgentStep() { return DATA.urgentChain[run.urgentStepIndex] || null; }
  function urgentStepReady(step) { return step.quests.every(q => run.urgentChecked.includes(q.n)); }
  function tierFor(t, lvl) { return DATA.keyTiers.find(tier => tier.t === t && tier.lvl === lvl) || null; }
  // A step's urgent isn't available in-game until its GATE tier's Key
  // Quests are cleared (see gateT/gateLvl in build-quests.js — not
  // necessarily the tier the urgent is itself tagged with in the data).
  function tierKeyQuestsDone(tier) {
    if (!tier) return true;
    const checked = run.keyQuestsChecked[tierKey(tier.t, tier.lvl)] || [];
    return tier.quests.every(q => checked.includes(q.n));
  }

  function renderRankPanel() {
    const wrap = $("rankPanel");
    const won = victoryAchieved();
    $("rankState").textContent = won ? "Victory" : "";
    $("rankState").classList.toggle("ready", won);

    const step = currentUrgentStep();
    if (!step) {
      // The urgent chain itself is always fully done here (Ahtal-Ka's
      // urgent, "Castle on the Run", is the final step) — under Advanced
      // quest rules that alone isn't victoryAchieved() yet. The three
      // Fatalis checkboxes used to live here too; moved to their own
      // "HR13+" panel in #tierList (renderTierList()) so there's one place
      // that tracks run.fatalisCleared, not two separate live checklists
      // bound to the same three booleans.
      if (run.questRulesMode === "advanced" && !won) {
        wrap.innerHTML = `<p class="rank-victory">Ahtal-Ka defeated — HR ${run.hr}.</p>
          <p class="hint">Advanced Victory: slay all three Fatalis too, in the same run — see the HR13+ panel below.</p>`;
      } else {
        wrap.innerHTML = `<p class="rank-victory">Victory achieved — HR ${run.hr}.` +
          (run.questRulesMode === "advanced" ? " All three Fatalis are down." : " The urgent quest chain is complete.") +
          `</p>`;
      }
      return;
    }
    const label = step.toHr === "victory" ? "Victory (Ahtal-Ka)" : "HR " + step.toHr;
    const tier = tierFor(step.gateT, step.gateLvl);
    const gateOpen = tierKeyQuestsDone(tier);
    // Always the same markup/text, just visibility:hidden once unlocked —
    // not conditionally omitted — so this line keeps reserving its own
    // height either way. Omitting it outright when gateOpen used to shrink
    // the panel the moment its gate tier finished, a visible resize right
    // when the player's attention is on this panel.
    // An ungated step (HR8's — see build-quests.js) has no tier to name, so
    // it always renders the hidden placeholder rather than "Locked until
    // every null ★ Key Quest is cleared". Still rendered, still hidden, so
    // the panel's height is identical either way.
    const gateLabel = step.gateT == null ? "" : tierLabel(step.gateT, step.gateLvl);
    const gateHidden = gateOpen || step.gateT == null;
    const gateNote = `<p class="hint"${gateHidden ? ' style="visibility:hidden"' : ""}>Locked until every ` +
      `${escapeHtml(gateLabel)} Key Quest is cleared.</p>`;
    wrap.innerHTML = `<div class="rank-hero"><b>HR ${run.hr}</b><span>&rarr; ${label}</span></div>
      ${gateNote}
      <div class="tier-quests">
        ${step.quests.map(q => `<label class="chk${gateOpen ? "" : " na"}"><input type="checkbox" data-q="${escapeHtml(q.n)}" ` +
          `${run.urgentChecked.includes(q.n) ? "checked" : ""} ${gateOpen ? "" : "disabled"}> ${escapeHtml(q.n)}</label>`).join("")}
      </div>`;
    wrap.querySelectorAll("input[type=checkbox]").forEach(input => {
      input.addEventListener("change", (e) => {
        const name = e.target.dataset.q;
        const i = run.urgentChecked.indexOf(name);
        if (e.target.checked && i === -1) run.urgentChecked.push(name);
        else if (!e.target.checked && i !== -1) run.urgentChecked.splice(i, 1);
        creditQuest(name, e.target.checked);
        save(); renderRankPanel(); renderTierList(); renderQuestProgress(); renderCurrentWeapon();
        if (urgentStepReady(step)) triggerRankUp();
      });
    });
  }

  function triggerRankUp() {
    const step = currentUrgentStep();
    if (!step) return;
    const isVictory = step.toHr === "victory";
    const advancedQuests = run.questRulesMode === "advanced";
    confirmAction(
      isVictory ? (advancedQuests ? "Ahtal-Ka Down!" : "Claim Victory?") : "Rank up?",
      isVictory
        ? (advancedQuests
          ? "Ahtal-Ka's urgent quest is done. Under Advanced quest rules, Victory still needs all three Fatalis — track them on the Quests page."
          : VICTORY_CONFIRM)
        : "Once you rank up, you will earn another weapon. You do not need to select one " +
          "right away as weapon selections bank. Once you know which weapon you wish to add, " +
          "visit the Weapons Page",
      () => {
        if (isVictory) run.ahtalKaCleared = true;
        else { run.hr = step.toHr; run.pendingNewLives = (run.pendingNewLives || 0) + 1; }
        run.urgentStepIndex++;
        // Under Basic rules Ahtal-Ka IS the finish, so confirming it ends the
        // run then and there. Under Advanced it's only a milestone — the
        // three Fatalis still follow, and the run ends when the last of them
        // is checked off (see renderRankPanel).
        if (isVictory && victoryAchieved()) { endRunVictorious(); return; }
        save(); renderRunStatus(); renderRankPanel(); renderTierList(); renderQuestProgress();
        // Stay on the Quests page. Picks bank, so there's no reason to yank
        // someone out of what they were doing — the Weapons tab carries a
        // count of what's owed, which is how they find their way over.
        if (!isVictory) { renderLives(); renderTabs(); }
      });
  }

  // Inline picker on the Weapons page, not a modal — a rank-up already
  // happened by the time this shows, so there's no "cancel" action that
  // could leave the player down a weapon (the old modal's Cancel button did
  // exactly that: closed the picker with the pending flag still set and no
  // life ever pushed). Staying on this page, switching tabs, or reloading
  // all leave run.pendingNewLives set until as many trees have been picked
  // as rank-ups are owed — a second rank-up before the first pick just adds
  // to the count rather than replacing it, so nothing gets lost if a player
  // stacks two urgent-quest clears before ever opening this panel.
  // Which class the picker is currently browsing. Only meaningful under
  // Basic rules (Advanced always forces run.class — see renderNewLifePicker)
  // but kept as a plain module var, not per-pick state, so switching class
  // mid-browse doesn't get reset by an unrelated re-render.
  let pickerClass = null;
  function renderNewLifePicker() {
    const picker = $("newLifePicker");
    const pending = run.pendingNewLives || 0;
    picker.classList.toggle("hidden", pending <= 0);
    // The picker is the whole Weapon Selection page, so when there's nothing
    // to spend the page would otherwise be blank — say why rather than
    // showing an empty screen.
    $("noPicksNote").classList.toggle("hidden", pending > 0);
    if (pending <= 0) return;
    const basic = run.weaponRulesMode === "basic";
    // Lead with the count — picks bank, so someone arriving here may be owed
    // several and needs to see that without counting rows. Reads "1 weapon
    // pick banked" even for one, rather than hiding the number in that case:
    // the whole point is that the number is the thing being tracked.
    $("newLifePickerHint").innerHTML =
      `<strong>${pending} weapon pick${pending > 1 ? "s" : ""} banked.</strong> Choose ` +
      (basic ? "any class and tree" : "any tree for your class") +
      " you've reached the Hunter Rank for, starting at its base." +
      (pending > 1 ? " Pick them one at a time — the rest keep." : "");
    // Advanced rules: no choice, always the run's own class. Basic: defaults
    // to it too (the natural first guess) but stays whatever the player last
    // browsed to across multiple pending picks, rather than snapping back.
    if (!basic) pickerClass = run.class;
    else if (!pickerClass) pickerClass = run.class;
    $("lifeClassRow").classList.toggle("hidden", !basic);
    if (basic) {
      const sel = $("lifeClassSelect");
      if (sel.options.length !== CLASSES.length) {
        sel.innerHTML = CLASSES.map(c => `<option value="${c.slug}">${escapeHtml(c.label)}</option>`).join("");
      }
      sel.value = pickerClass;
    }
    renderLifeTreeResults($("lifeTreeSearch").value);
  }
  $("lifeClassSelect").addEventListener("change", (e) => {
    pickerClass = e.target.value;
    renderLifeTreeResults($("lifeTreeSearch").value);
  });
  function renderLifeTreeResults(q) {
    const c = classBySlug[pickerClass || run.class];
    const query = q.trim().toLowerCase();
    // A tree already used as some life's root — sold lives included, not
    // just alive ones, since the point is "you've already had a life on
    // this line this run," not "you currently have one" — is off the table
    // for future picks. Scoped to this class: under Basic weapon rules a
    // life can be any class, and tree ids aren't unique across classes.
    const usedTreeIds = new Set(run.lives.filter(l => l.classSlug === c.slug).map(l => l.rootTreeId));
    const trees = c.trees
      // A life starts at levels[0] and the tree view is built from there, so a
      // life may only start at the base of a whole tree — otherwise you get a
      // partial tree, showing the climb from halfway up rather than the line
      // entire. That rules out two kinds of pick:
      //   !t.p  — anything that hangs off another line. Jawblade (upgrade-only,
      //           a branch off Bone Cleaver 3) and Halberd alike: Halberd does
      //           have its own forge recipe, but starting there would still
      //           lop off everything below it, so its Create path is ignored.
      //   t.f   — the 22 Rusted/Worn relic lines, which are roots but excavated
      //           rather than forged, so a run can't choose to make one.
      .filter(t => t.f && !t.p)
      // Gated on the run's own Hunter Rank: t.hr is the HR at which the tree's
      // key material — the one that puts it in the smithy list — first becomes
      // obtainable, so a tree above the current HR isn't reachable yet.
      .filter(t => (t.hr || 1) <= run.hr)
      .filter(t => !usedTreeIds.has(t.i))
      .filter(t => !query || t.n.toLowerCase().includes(query))
      .sort((a, b) => a.r - b.r || a.n.localeCompare(b.n))
      .slice(0, 200);
    const wrap = $("lifeTreeResults"); wrap.innerHTML = "";
    if (!trees.length) {
      // Against the startable count, not every tree — branches and relic lines
      // were never on offer, so counting them here would keep claiming trees
      // are left when there are none you could actually start on.
      const startable = c.trees.filter(t => t.f && !t.p);
      const atHr = startable.filter(t => (t.hr || 1) <= run.hr);
      // "Used them all" and "the rest need a higher HR" are different dead
      // ends and read very differently to someone stuck on the screen.
      wrap.innerHTML = usedTreeIds.size >= atHr.length && atHr.length < startable.length
        ? `<p class="hint">Every ${escapeHtml(c.label)} tree available at HR ${run.hr} has been used. More open up as your Hunter Rank rises.</p>`
        : usedTreeIds.size >= startable.length
          ? `<p class="hint">Every tree for ${escapeHtml(c.label)} has already been used this run.</p>`
          : `<p class="hint">No trees match.</p>`;
      return;
    }
    trees.forEach(t => {
      const row = document.createElement("div");
      row.className = "tree-row";
      row.innerHTML = `<span>${escapeHtml(t.n)}</span><span class="tr-rarity">Rarity ${t.r}</span>`;
      row.addEventListener("click", () => {
        run.lives.push(newLife(c.slug, t.i, t.levels[0][0]));
        const idx = run.lives.length - 1;
        // A new weapon joins the rack; it does NOT take over as the one in
        // play. Auto-assigning silently moved quest credit onto a fresh
        // root-tier weapon the player hadn't chosen to hunt with. The one
        // exception is having nothing in play at all (the pick that rescues
        // a run after the last weapon was sold) — there, leaving no current
        // weapon would just be a dead end.
        const cur = run.lives[run.currentLifeIndex];
        if (!cur || cur.status !== "alive") run.currentLifeIndex = idx;
        // Point the tree at it either way: you picked it, you probably want
        // to see where it goes.
        viewLifeIndex = idx;
        // Decrement, don't clear — a second rank-up may have come in before
        // this pick, in which case one is still owed and the picker should
        // stay open rather than acting like the debt is fully paid.
        run.pendingNewLives = Math.max(0, (run.pendingNewLives || 0) - 1);
        $("lifeTreeSearch").value = "";
        save(); renderAll();
      });
      wrap.appendChild(row);
    });
  }
  $("lifeTreeSearch").addEventListener("input", () => renderLifeTreeResults($("lifeTreeSearch").value));

  // ── Key quest checklist ────────────────────────────────────────────────
  // Plain tracking only now — rank-up is driven entirely by the urgent
  // chain above, since urgent quests turned out to be a separate category
  // from Key Quests (Key:false on every one of them), not one flagged
  // amongst this list. See CLAUDE.md for how that was discovered.
  function tierKey(t, lvl) { return t + "|" + lvl; }

  // The urgent quest(s) this tier gates (not the ones tagged with this
  // tier in QuestData.json — see the gateT/gateLvl note in build-quests.js).
  // Pub 4★ gates two: Sky Render (HR11->12) and Castle on the Run
  // (Victory), the chain's last tier standing in for the one that would
  // gate a 13th step that doesn't exist. Completed means both the tier's
  // own Key Quests AND all the urgent(s) it gates are checked.
  function tierUrgentQuests(tier) {
    return DATA.urgentChain.filter(s => s.gateT === tier.t && s.gateLvl === tier.lvl).flatMap(s => s.quests);
  }

  function renderTierList() {
    const wrap = $("tierList"); wrap.innerHTML = "";
    DATA.keyTiers.forEach(tier => {
      const key = tierKey(tier.t, tier.lvl);
      const checked = run.keyQuestsChecked[key] || [];
      const total = tier.quests.length;
      const done = checked.length;

      const locked = tier.unlockHr != null && tier.unlockHr > run.hr;
      const urgentQuests = tierUrgentQuests(tier);
      const completed = done === total && urgentQuests.every(q => run.urgentChecked.includes(q.n));
      // Locked (checked boxes just don't apply yet) and completed (they
      // applied and it's over) are opposite ends of the same "not editable
      // right now" state — both disable the same way.
      const frozen = locked || completed;

      const panel = document.createElement("section");
      panel.className = "panel";
      // Panels aren't user-toggleable and never close on their own either —
      // always open, so the whole checklist stays visible at a glance.
      // completed still drives the COMPLETED badge and disables the
      // checkboxes (frozen, below); it just no longer hides the panel.
      panel.dataset.open = "true";
      panel.innerHTML = `<button class="panel-head">${escapeHtml(tierLabel(tier.t, tier.lvl))}${completed ? ' <span class="tier-completed">COMPLETED</span>' : ""}
          <span class="panel-state${done === total ? " ready" : ""}">${locked ? "Locked" : `${done}/${total}`}</span>
          <span class="chev">&#9662;</span></button>
        <div class="panel-body">
          ${locked ? `<p class="hint">Unlocks at HR ${tier.unlockHr}.</p>` : ""}
          <div class="tier-quests"></div>
        </div>`;
      const body = panel.querySelector(".tier-quests");
      tier.quests.forEach(q => {
        const isChecked = checked.includes(q.n);
        const label = document.createElement("label");
        label.className = "chk" + (frozen ? " na" : "");
        label.innerHTML = `<input type="checkbox" ${isChecked ? "checked" : ""} ${frozen ? "disabled" : ""}> ${escapeHtml(q.n)}`;
        label.querySelector("input").addEventListener("change", (e) => {
          const arr = run.keyQuestsChecked[key] || (run.keyQuestsChecked[key] = []);
          const i = arr.indexOf(q.n);
          if (e.target.checked && i === -1) arr.push(q.n);
          else if (!e.target.checked && i !== -1) arr.splice(i, 1);
          creditQuest(q.n, e.target.checked);
          save(); renderTierList(); renderRankPanel(); renderQuestProgress(); renderCurrentWeapon();
        });
        body.appendChild(label);
      });
      wrap.appendChild(panel);
    });

    // HR13+ — not a real Hunter Rank (the tracked chain tops out at
    // HR12/Victory), just a label for what's next: the three Fatalis hunts,
    // tracked toward Advanced Victory (run.fatalisCleared / victoryAchieved()
    // above). Real quest names, not just the monster names — DATA.victory's
    // Pub G4★ entries specifically (each monster also has an Events-tab
    // duplicate of the same hunt; this panel shows the Pub one). Same
    // panel markup/behavior as every other tier: frozen (disabled) once
    // locked or completed, hint reserves its height via visibility so
    // unlocking doesn't resize the panel, same fix as the Hunter Rank
    // Progress panel's own gate note above. Only shown under Advanced quest
    // rules — under Basic, Victory ends at Ahtal-Ka and fatalisCleared
    // never factors into victoryAchieved() at all, so tracking it here
    // would just be clutter with no effect on anything.
    if (run.questRulesMode === "advanced") {
      const fatalisLocked = !run.ahtalKaCleared;
      const fatalisDone = FATALIS_KEYS.filter(k => run.fatalisCleared[k]).length;
      const fatalisTotal = FATALIS_KEYS.length;
      const fatalisCompleted = fatalisDone === fatalisTotal;
      const fatalisFrozen = fatalisLocked || fatalisCompleted;
      const hrPanel = document.createElement("section");
      hrPanel.className = "panel";
      hrPanel.dataset.open = "true";
      hrPanel.innerHTML = `<button class="panel-head">HR13+${fatalisCompleted ? ' <span class="tier-completed">COMPLETED</span>' : ""}
          <span class="panel-state${fatalisCompleted ? " ready" : ""}">${fatalisLocked ? "Locked" : `${fatalisDone}/${fatalisTotal}`}</span>
          <span class="chev">&#9662;</span></button>
        <div class="panel-body">
          <p class="hint"${fatalisLocked ? "" : ' style="visibility:hidden"'}>Locked until Ahtal-Ka is defeated.</p>
          <div class="tier-quests"></div>
        </div>`;
      const hrBody = hrPanel.querySelector(".tier-quests");
      FATALIS_KEYS.forEach(k => {
        const questName = DATA.victory[k].quests.find(q => q.t === "Pub").n;
        const isChecked = run.fatalisCleared[k];
        const label = document.createElement("label");
        label.className = "chk" + (fatalisFrozen ? " na" : "");
        label.innerHTML = `<input type="checkbox" ${isChecked ? "checked" : ""} ${fatalisFrozen ? "disabled" : ""}> ${escapeHtml(questName)}`;
        label.querySelector("input").addEventListener("change", (e) => {
          run.fatalisCleared[k] = e.target.checked;
          creditQuest(questName, e.target.checked);
          // Under Advanced rules the third Fatalis is the run's last quest,
          // so it gets the same "ready to end the run?" confirmation Basic
          // gives Ahtal-Ka. Cancelling un-checks it again rather than
          // leaving the run sat in a won-but-not-ended state.
          if (e.target.checked && victoryAchieved()) {
            confirmAction("Claim Victory?", VICTORY_CONFIRM, endRunVictorious, () => {
              run.fatalisCleared[k] = false;
              creditQuest(questName, false);
              save(); renderTierList(); renderRankPanel(); renderQuestProgress(); renderCurrentWeapon();
            });
            return;
          }
          save(); renderTierList(); renderRankPanel(); renderQuestProgress(); renderCurrentWeapon();
        });
        hrBody.appendChild(label);
      });
      wrap.appendChild(hrPanel);
    }
  }

  // ── Page tabs (Quests / Weapons) ───────────────────────────────────────
  let activeTab = "quests";
  function renderTabs() {
    $("tabQuests").classList.toggle("on", activeTab === "quests");
    $("tabWeapons").classList.toggle("on", activeTab === "weapons");
    $("tabSelect").classList.toggle("on", activeTab === "select");
    // A rank-up doesn't jump anywhere, so the tab has to carry the news —
    // otherwise banked picks are invisible from the other pages. The badge
    // lives on Weapon Selection because that's where you go to spend them;
    // Weapons is just the read-only view of what you already hold.
    const pending = run.pendingNewLives || 0;
    $("tabSelect").innerHTML = "Weapon Selection" +
      (pending > 0 ? ` <span class="tab-badge">${pending}</span>` : "");
    $("questsPage").classList.toggle("hidden", activeTab !== "quests");
    $("weaponsPage").classList.toggle("hidden", activeTab !== "weapons");
    $("selectPage").classList.toggle("hidden", activeTab !== "select");
    // Re-render the tree once the page is actually visible. A hidden
    // #weaponsPage means the canvas has clientWidth/Height of 0, so
    // renderWeaponTree() falls back to 600x400 and builds a camera framed
    // for a canvas that doesn't exist — the tree then sat off-centre and
    // badly zoomed until something else forced a redraw. Must run AFTER
    // the .hidden toggles above, not before.
    if (activeTab === "weapons") renderWeaponTree();
  }
  $("tabQuests").addEventListener("click", () => { activeTab = "quests"; renderTabs(); });
  $("tabWeapons").addEventListener("click", () => { activeTab = "weapons"; renderTabs(); });
  $("tabSelect").addEventListener("click", () => { activeTab = "select"; renderTabs(); });

  // ── Result screen ─────────────────────────────────────────────────────
  // Deliberately minimal — a fuller result screen, closer to the Zenny
  // Gauntlet's, is planned and will be where victory tracking lives.
  function renderResult() {
    const soldCount = run.lives.filter(l => l.status === "sold").length;
    const keyDone = Object.values(run.keyQuestsChecked).reduce((n, a) => n + a.length, 0);
    const keyTotal = DATA.keyTiers.reduce((n, t) => n + t.quests.length, 0);
    // A won run and a lost one both land here, so the heading has to say
    // which — "Run Over" on a victory would read as failure.
    const won = run.endReason === "victory";
    $("resultBody").innerHTML = `
      <h2${won ? ' class="result-victory"' : ""}>${won ? "Victory" : "Run Over"}</h2>
      ${won ? "" : `<p class="hint">${classBySlug[run.class] ? escapeHtml(classBySlug[run.class].label) : ""} —
        ${run.endReason === "no-lives" ? "no weapons remaining" : "ended"}</p>`}`
      + (won ? victoryFlavorHtml() : "") + `
      <div class="sum-stats">
        <div class="sum-stat"><b>${run.hr}</b><span>Hunter Rank</span></div>
        <div class="sum-stat"><b>${run.lives.length}</b><span>Weapons obtained</span></div>
        <div class="sum-stat"><b>${soldCount}</b><span>Weapons lost</span></div>
        <div class="sum-stat"><b>${keyDone}/${keyTotal}</b><span>Key quests</span></div>
        <div class="sum-stat"><b>${run.urgentChecked.length}/${urgentQuestTotal()}</b><span>Urgent quests</span></div>
      </div>` + weaponRosterHtml();
  }

  // The victory send-off. One line always, plus a line per Advanced rule the
  // run was played under — those two lines are the *only* reward for having
  // chosen the harder ruleset, so they're earned text, not decoration, and
  // they never appear on a Basic run.
  function victoryFlavorHtml() {
    const cls = classBySlug[run.class];
    const lines = ["You were Victorious! You manage to defeat Ahtal-Ka!"];
    if (run.questRulesMode === "advanced") {
      lines.push("You have achieved the impossible, you slayed the Trio of Fatalis! " +
        "Stories of your accomplishments will be passed down for ages.");
    }
    if (run.weaponRulesMode === "advanced") {
      lines.push(`You have mastered using the ${cls ? cls.label : "weapon"}. ` +
        "Your skills will be the example for future hunters!");
    }
    return `<div class="victory-flavor">` +
      lines.map(t => `<p>${escapeHtml(t)}</p>`).join("") + `</div>`;
  }

  // Every weapon the run used, with how many quests it cleared. Split into
  // survivors and fallen rather than one list with a marker — at the end of a
  // run "what did I lose" is a different question from "what am I still
  // holding", and the fallen section is the run's casualty list.
  function weaponRosterHtml() {
    if (!run.lives.length) return "";
    const row = (life, i) => {
      const info = currentNodeInfo(life);
      const cls = classBySlug[life.classSlug];
      const uses = life.uses || 0;
      return `<div class="wr-row">
        <img class="wr-icon" src="${weaponRarityIcon(life.classSlug, info.stats ? info.stats.r : 0)}" alt="">
        <div class="wr-id">
          <div class="wr-name">${escapeHtml(info.levelName)}</div>
          <div class="wr-sub">${escapeHtml(cls ? cls.label : "")} &middot; ${escapeHtml(info.treeName)} Lv${info.lv}</div>
        </div>
        <div class="wr-uses"><b>${uses}</b><span>quest${uses === 1 ? "" : "s"}</span></div>
      </div>`;
    };
    const alive = run.lives.filter(l => l.status === "alive");
    const fallen = run.lives.filter(l => l.status !== "alive");
    let html = `<div class="weapon-roster">`;
    if (alive.length) {
      html += `<div class="wr-title">Weapons Standing</div>` + alive.map(row).join("");
    }
    if (fallen.length) {
      html += `<div class="wr-title wr-title-fallen">Fallen</div>` +
        `<div class="wr-fallen">${fallen.map(row).join("")}</div>`;
    }
    return html + `</div>`;
  }

  // ── End run / new run ─────────────────────────────────────────────────
  $("endRunBtn").addEventListener("click", () => {
    confirmAction("End this run?", "This closes out the run and shows the result screen.", () => {
      run.ended = true;
      run.endReason = run.endReason || "manual";
      save(); renderAll();
    });
  });
  $("newRunBtn").addEventListener("click", () => {
    run = emptyRun();
    pickedClass = null; pickedStarter = null; weaponRulesMode = "basic"; questRulesMode = "basic";
    pickerClass = null; activeTab = "quests";
    save(); renderAll();
  });

  // ── Craftables lookup ──────────────────────────────────────────────────
  function renderCraftResults(q) {
    const query = q.trim().toLowerCase();
    // Ingredients are searchable too, so "Honey" answers "what can I make
    // with this?" as well as "can I craft this?". Each row shows its full
    // recipe, so it's always obvious why a match came back.
    const items = DATA.craftables
      .filter(it => !query || it.n.toLowerCase().includes(query) ||
        it.a.toLowerCase().includes(query) || it.b.toLowerCase().includes(query))
      .slice(0, 300);
    const wrap = $("craftResults"); wrap.innerHTML = "";
    if (!items.length) { wrap.innerHTML = `<p class="hint">No items match.</p>`; return; }
    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "craft-row";
      // No badges: every row is craftable, so a "Craftable" tag on all of
      // them would say nothing. The recipe itself is the useful payload.
      row.innerHTML = `<span class="craft-name">${escapeHtml(it.n)}</span>` +
        `<span class="craft-recipe">${escapeHtml(it.a)} <i>+</i> ${escapeHtml(it.b)}</span>`;
      wrap.appendChild(row);
    });
  }
  $("craftBtn").addEventListener("click", () => {
    $("craftSearch").value = "";
    renderCraftResults("");
    $("craftModal").classList.remove("hidden");
    $("craftSearch").focus();
  });
  $("craftSearch").addEventListener("input", () => renderCraftResults($("craftSearch").value));
  $("craftClose").addEventListener("click", () => $("craftModal").classList.add("hidden"));

  // ── Simple modals ──────────────────────────────────────────────────────
  $("rulesBtn").addEventListener("click", () => $("rulesModal").classList.remove("hidden"));
  $("rulesClose").addEventListener("click", () => $("rulesModal").classList.add("hidden"));
  $("linksBtn").addEventListener("click", () => $("linksModal").classList.remove("hidden"));
  $("linksClose").addEventListener("click", () => $("linksModal").classList.add("hidden"));
  $("themeBtn").addEventListener("click", () => $("themeModal").classList.remove("hidden"));
  $("themeClose").addEventListener("click", () => $("themeModal").classList.add("hidden"));

  // onCancelled is optional — only needed when backing out has to undo
  // something the caller already did (e.g. re-checking a checkbox that
  // triggered the confirm). Backdrop clicks route through the Cancel button,
  // so they run it too.
  function confirmAction(title, body, onOk, onCancelled) {
    $("confirmTitle").textContent = title;
    $("confirmBody").textContent = body;
    $("confirmModal").classList.remove("hidden");
    const okBtn = $("confirmOk"), cancelBtn = $("confirmCancel");
    const cleanup = () => {
      okBtn.removeEventListener("click", onClick);
      cancelBtn.removeEventListener("click", onCancel);
      $("confirmModal").classList.add("hidden");
    };
    const onClick = () => { cleanup(); onOk(); };
    const onCancel = () => { cleanup(); if (onCancelled) onCancelled(); };
    okBtn.addEventListener("click", onClick);
    cancelBtn.addEventListener("click", onCancel);
  }

  // Click the backdrop (outside .modal-card) to close — same convention the
  // Quest Randomizer uses. e.target === the modal div itself only when the
  // click didn't land on a descendant like .modal-card, i.e. it landed on
  // the dimmed overlay area around the card.
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target !== modal) return;
      // confirmModal's Cancel button owns this call's cleanup (removing the
      // listeners confirmAction() just attached above) — reuse it instead
      // of hiding the modal directly, or those listeners leak onto the next
      // confirmAction() call. Cancel, not a no-op, is also just the correct
      // "I backed out of this" outcome for a confirm dialog.
      if (modal.id === "confirmModal") $("confirmCancel").click();
      else modal.classList.add("hidden");
    });
  });

  // ── Top-level render ───────────────────────────────────────────────────
  function renderAll() {
    settleRunEnd();
    const showStart = !run.active;
    const showResult = run.active && run.ended;
    const showDashboard = run.active && !run.ended;

    $("startScreen").classList.toggle("hidden", !showStart);
    $("resultScreen").classList.toggle("hidden", !showResult);
    $("sidebar").classList.toggle("hidden", !showDashboard);
    $("dashboardContent").classList.toggle("hidden", !showDashboard);

    if (showStart) { renderWeaponRulesToggle(); renderQuestRulesToggle(); renderClassGrid(); renderStarterGrid(); }
    if (showDashboard) { renderTabs(); renderRunStatus(); renderLives(); renderRankPanel(); renderTierList(); renderQuestProgress(); }
    if (showResult) renderResult();
  }

  // ── Init ───────────────────────────────────────────────────────────────
  load();
  buildSwatches();
  let savedHex = cfg.themeHex;
  try { savedHex = localStorage.getItem("mhgu-challenge-run-theme") || savedHex; } catch (e) {}
  // A save from before the palette swapped to the Deviants (or any other
  // stale/foreign hex) wouldn't match any swatch — no tile would show
  // selected and the title icon would fall back to the question mark, while
  // the background color half-applies anyway. Falling back to the default
  // avoids that half-applied state, same guard the Zenny Gauntlet uses.
  if (!COLORS_HEX[savedHex.toUpperCase()]) savedHex = DEFAULT_CFG.themeHex;
  applyTheme(savedHex);
  renderAll();
})();
