// Gemeinsame Test-Hilfen für HSGPLOT, DIREKTPLOT und die Website-Vorschau:
// HP-GL zurück ins Raster rechnen, Stiftbewegung messen, Testbilder erzeugen.
"use strict";

const parseHPGL = s => s.split(";").filter(x => x.length).map(c => ({ op: c.slice(0, 2), args: c.slice(2).length ? c.slice(2).split(",").map(Number) : [] }));

// Plotter nachspielen. Erlaubte Striche: waagerecht in einer Plotterzeile oder senkrecht genau eine Zeile weit.
// Liefert Raster (512×512, Zeile 0 = oben), Fehler und Kennzahlen zur Stiftbewegung.
function rasterFromHPGL(cmds, cfg) {
  const r = new Uint8Array(512 * 512), errors = [];
  const m = { lowers: 0, upTravel: 0, downTravel: 0 };            // Stift senken, Leerfahrt, Zeichenweg (Plotter-Einheiten)
  let x = 0, y = 0, down = false;
  const px = (X, Y) => {
    const c = (X - cfg.x0) / cfg.s, pr = (Y - cfg.y0) / cfg.s;
    if (!Number.isInteger(c) || !Number.isInteger(pr) || c < 0 || c > 511 || pr < 0 || pr > 511) { errors.push(`Koordinate daneben ${X},${Y}`); return null; }
    return [c, pr];
  };
  const mark = (c, pr) => { r[(511 - pr) * 512 + c] = 1; };
  for (const c of cmds) {
    if (c.op === "PU") {
      down = false;
      for (let i = 0; i + 1 < c.args.length; i += 2) { m.upTravel += Math.hypot(c.args[i] - x, c.args[i + 1] - y); x = c.args[i]; y = c.args[i + 1]; }
    } else if (c.op === "PD") {
      if (!down) { m.lowers++; down = true; const p = px(x, y); if (p) mark(...p); }
      for (let i = 0; i + 1 < c.args.length; i += 2) {
        const x2 = c.args[i], y2 = c.args[i + 1], a = px(x, y), b = px(x2, y2);
        m.downTravel += Math.hypot(x2 - x, y2 - y);
        if (a && b) {
          if (a[1] === b[1]) for (let k = Math.min(a[0], b[0]); k <= Math.max(a[0], b[0]); k++) mark(k, a[1]);
          else if (a[0] === b[0] && Math.abs(a[1] - b[1]) === 1) { mark(...a); mark(...b); }
          else errors.push(`Strich schräg oder zu lang ${x},${y} -> ${x2},${y2}`);
        }
        x = x2; y = y2;
      }
    } else if (c.op === "IN") { down = false; }
    else if (c.op !== "SP") errors.push("Unbekannter Befehl " + c.op);
  }
  return { r, errors, m };
}

// Erwartetes Plotter-Raster aus dem Bildschirm (256 Zeilen: jede doppelt), optional Lücken bis gap Punkte gefüllt
function expected(fb, rows, inv, gap = 0) {
  const e = new Uint8Array(512 * 512);
  for (let pr = 0; pr < 512; pr++) {
    const row = rows === 512 ? 511 - pr : 255 - (pr >> 1), o = (511 - pr) * 512;
    for (let x = 0; x < 512; x++) e[o + x] = fb[row * 512 + x] ^ (inv ? 1 : 0);
    if (gap > 0) {
      let last = -1;
      for (let x = 0; x < 512; x++) if (e[o + x]) { if (last >= 0 && x - last - 1 <= gap) for (let k = last + 1; k < x; k++) e[o + k] = 1; last = x; }
    }
  }
  return e;
}
const diffCount = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };

function rnd(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) >>> 24; }
const pack = (px, rows) => { const d = new Uint8Array(rows * 64); for (let i = 0; i < px.length; i++) if (px[i]) d[i >> 3] |= 0x80 >> (i & 7); return d; };

// "Foto": weicher Verlauf mit hellen und dunklen Flecken, Atkinson-Dithering wie die Konverter-Vorgabe
function photoImage(rows) {
  const g = new Float32Array(512 * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < 512; x++) {
    const v = y * (512 / rows);
    const a = 0.5 + 0.35 * Math.sin(x / 70) * Math.cos(v / 90) + 0.25 * Math.exp(-((x - 300) ** 2 + (v - 200) ** 2) / 6000) - 0.3 * Math.exp(-((x - 120) ** 2 + (v - 380) ** 2) / 9000);
    g[y * 512 + x] = Math.max(0, Math.min(1, a)) * 255;
  }
  const px = new Uint8Array(512 * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < 512; x++) {
    const i = y * 512 + x, old = g[i], nw = old >= 128 ? 255 : 0, err = (old - nw) / 8;
    px[i] = nw ? 1 : 0;
    for (const [dx, dy] of [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) {
      const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < 512 && yy < rows) g[yy * 512 + xx] += err;
    }
  }
  return pack(px, rows);
}
// Strichzeichnung: Rahmen, Kreis, Diagonalen, gefüllte Scheibe
function lineArt(rows) {
  const px = new Uint8Array(512 * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < 512; x++) {
    const v = y * (512 / rows), d = Math.hypot(x - 256, v - 256), d2 = Math.hypot(x - 380, v - 120);
    if (y < 2 || y >= rows - 2 || x < 2 || x >= 510 || (d > 196 && d < 202) || Math.abs(x - v) < 1.5 || Math.abs(x + v - 511) < 1.5 || d2 < 60) px[y * 512 + x] = 1;
  }
  return pack(px, rows);
}
// Dichtes Testbild (wie bisher): Rahmen, Ring, Block, ~2 % Streupunkte
function testImage(rows, seed) {
  const r = rnd(seed), px = new Uint8Array(512 * rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < 512; x++) {
    const cx = x - 256, cy = (y - rows / 2) * (512 / rows), d = Math.sqrt(cx * cx + cy * cy);
    if (y === 0 || y === rows - 1 || x === 0 || x === 511 || (d > 150 && d < 160) || (x > 500 && y < 20) || r() < 6) px[y * 512 + x] = 1;
  }
  return pack(px, rows);
}
// Referenz für den Kringel-Modus (muss Byte für Byte der 6502-Ausgabe entsprechen).
// P = Plotter-Raster aus expected(); cfg = { s, x0, y0, pen }; stopAfterBands = Abbruch nach n Bändern
function kringelRef(P, cfg) {
  const S = cfg.s, CW = 4 * S, offs = k => Array.from({ length: k }, (_, i) => Math.floor((i + 1) * CW / k));
  let out = `IN;SP${cfg.pen || 1};`, dir = 0, pdown = false, side = 0;
  for (let br = 508; br >= 0; br -= 4) {
    let any = false;
    for (let pr = br; pr < br + 4; pr++) for (let x = 0; x < 512; x++) if (P[(511 - pr) * 512 + x]) any = true;
    if (!any) { pdown = false; continue; }
    const ylo = cfg.y0 + br * S, yhi = ylo + 3 * S, y = () => (side ? yhi : ylo);
    for (let i = 0; i < 128; i++) {
      const c = dir ? 127 - i : i;
      let cnt = 0; for (let pr = br; pr < br + 4; pr++) for (let x = 4 * c; x < 4 * c + 4; x++) cnt += P[(511 - pr) * 512 + x];
      const k = cnt >> 1;                                       // 0..8 Zacken
      if (!k) { pdown = false; continue; }
      const xb = cfg.x0 + (dir ? 4 * (c + 1) : 4 * c) * S;
      if (!pdown) { out += `PU${xb},${y()};`; pdown = true; }
      out += "PD" + offs(k).map(o => { side ^= 1; return `${dir ? xb - o : xb + o},${y()}`; }).join(",") + ";";
    }
    dir ^= 1;
  }
  return out + "PU;SP0;";
}
// Referenz für den Schraffur-Modus (muss Byte für Byte der 6502-Ausgabe entsprechen).
// Zellen 4×4 Punkte (128 × 128), Stufe = Anzahl der Schwellen th[0..3], die die Punktzahl erreicht.
// Ebene 1 waagerecht (wird schon beim Einlesen Band für Band gezeichnet), 2 senkrecht, 3 "/", 4 "\".
// Koordinaten in Punkten: Zelle (m, c) = x 4c..4c+4, y 4m..4m+4 (m = 0 unten); Plotter = X0/Y0 + Punkte * S.
function hatchRef(P, cfg, th = [2, 5, 8, 11]) {
  const S = cfg.s, L = Array.from({ length: 128 }, () => new Uint8Array(128));
  let out = `IN;SP${cfg.pen || 1};`, dir = 0;
  const X = p => cfg.x0 + p * S, Y = p => cfg.y0 + p * S;
  // eine Linie: Start (m, c), Schritt (dm, dc), n Zellen, Ein-/Austrittspunkt relativ zur Zellecke (Punkte)
  const line = (t, m, c, dm, dc, n, en, ex) => {
    if (dir) { m += (n - 1) * dm; c += (n - 1) * dc; dm = -dm; dc = -dc; [en, ex] = [ex, en]; }
    let run = null, any = false;
    const emit = () => { out += `PU${X(run[0])},${Y(run[1])};PD${X(run[2])},${Y(run[3])};`; run = null; any = true; };
    for (let i = 0; i < n; i++, m += dm, c += dc) {
      if (L[m][c] >= t) {
        if (!run) run = [4 * c + en[0], 4 * m + en[1]];
        run[2] = 4 * c + ex[0]; run[3] = 4 * m + ex[1];
      } else if (run) emit();
    }
    if (run) emit();
    if (any) dir ^= 1;
  };
  for (let m = 127; m >= 0; m--) {                               // Einlesen + Ebene 1
    for (let c = 0; c < 128; c++) {
      let cnt = 0;
      for (let pr = 4 * m; pr < 4 * m + 4; pr++) for (let x = 4 * c; x < 4 * c + 4; x++) cnt += P[(511 - pr) * 512 + x];
      L[m][c] = th.filter(v => cnt >= v).length;
    }
    line(1, m, 0, 0, 1, 128, [0, 2], [4, 2]);
  }
  for (let c = 0; c < 128; c++) line(2, 127, c, -1, 0, 128, [2, 4], [2, 0]);
  for (let s = 0; s < 255; s++) {                                // "/" von links oben nach rechts unten
    const m = s < 127 ? 127 - s : 0, c = s < 127 ? 0 : s - 127;
    line(3, m, c, 1, 1, 128 - Math.abs(s - 127), [0, 0], [4, 4]);
  }
  for (let s = 254; s >= 0; s--) {                               // "\" von rechts oben nach links unten
    const m = s >= 127 ? 127 : s, c = s >= 127 ? s - 127 : 0;
    line(4, m, c, -1, 1, Math.min(s, 254 - s) + 1, [0, 4], [4, 0]);
  }
  return out + "PU;SP0;";
}
// HP-GL als SVG zeichnen (Vorschau), Plotter-Einheiten, Y nach oben
function hpglToSVG(s, title = "") {
  let x = 0, y = 0, path = "", lifts = 0;
  for (const c of parseHPGL(s)) {
    if (c.op === "PU") { for (let i = 0; i + 1 < c.args.length; i += 2) { x = c.args[i]; y = c.args[i + 1]; } }
    else if (c.op === "PD") { path += `M${x} ${-y}`; lifts++; for (let i = 0; i + 1 < c.args.length; i += 2) { x = c.args[i]; y = c.args[i + 1]; path += `L${x} ${-y}`; } }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="1700 -7550 7400 7400" width="900" height="900"><title>${title}</title>` +
    `<rect x="1700" y="-7550" width="7400" height="7400" fill="#fff"/><path d="${path}" fill="none" stroke="#123" stroke-width="12" stroke-linejoin="round"/></svg>`;
}
const fmt = m => `${m.lowers} × Stift senken, Leerfahrt ${(m.upTravel * 0.025 / 1000).toFixed(1)} m, Zeichenweg ${(m.downTravel * 0.025 / 1000).toFixed(1)} m`;

// Kennzahlen für beliebige Striche (auch schräg, Kringel-Modus)
function penStats(s) {
  const m = { lowers: 0, upTravel: 0, downTravel: 0 }; let x = 0, y = 0, down = false;
  for (const c of parseHPGL(s)) {
    if (c.op === "PU") { down = false; for (let i = 0; i + 1 < c.args.length; i += 2) { m.upTravel += Math.hypot(c.args[i] - x, c.args[i + 1] - y); x = c.args[i]; y = c.args[i + 1]; } }
    else if (c.op === "PD") { if (!down) { m.lowers++; down = true; } for (let i = 0; i + 1 < c.args.length; i += 2) { m.downTravel += Math.hypot(c.args[i] - x, c.args[i + 1] - y); x = c.args[i]; y = c.args[i + 1]; } }
  }
  return m;
}

if (typeof module !== "undefined") module.exports = { parseHPGL, rasterFromHPGL, expected, diffCount, rnd, photoImage, lineArt, testImage, fmt, kringelRef, hatchRef, hpglToSVG, penStats };
