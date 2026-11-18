// Test der Website ohne Browser: Einstellbytes für HSGMENU, eingebettetes Programm, 8028-Ausgaben
// (Druckprogramm DRUCK8028, Testseite, Byte-Strom). Zeichenwahl und Vorschauen brauchen Canvas und werden im Browser geprüft.
//   node tools/test-website.js
const fs = require("fs"), path = require("path");
const HTML = fs.readFileSync(path.join(__dirname, "..", "hsg-converter.html"), "utf8");
const block = n => { const a = HTML.indexOf(`/* ==== BEGIN ${n}`), b = HTML.indexOf(`/* ==== END ${n} ==== */`); if (a < 0 || b < 0) throw new Error("Block " + n + " fehlt in hsg-converter.html"); return HTML.slice(a, b); };
const src = block("8028");
const stub = new Proxy({}, { get: () => () => {} });
const $ = () => ({ addEventListener() {}, set onclick(v) {} });
const M = new Function("$", "document", "render", src + "\nreturn { t8Tokenize, T8_BASIC, T8_TOKENS, T8_CHARS, t8TestBytes, t8Bytes, t8Strikes };")($, stub, () => {});
let fails = 0;
const check = (n, c, i) => { console.log(`${c ? "OK  " : "FAIL"} ${n}${i ? " – " + i : ""}`); if (!c) fails++; };

// Tokens wie BASIC 2/4 (PET/CBM)
const tok = k => 0x80 + M.T8_TOKENS.indexOf(k);
check("Token-Tabelle: END $80, PRINT# $98, PRINT $99, OPEN $9F, CLOSE $A0, GET $A1, THEN $A7, CHR$ $C7, GO $CB",
  tok("END") === 0x80 && tok("PRINT#") === 0x98 && tok("PRINT") === 0x99 && tok("OPEN") === 0x9F && tok("CLOSE") === 0xA0 && tok("GET") === 0xA1 && tok("THEN") === 0xA7 && tok("CHR$") === 0xC7 && tok("GO") === 0xCB && tok("INPUT#") === 0x84 && tok("VAL") === 0xC5);

const prg = M.t8Tokenize(M.T8_BASIC);
const detok = b => {
  const lines = []; let p = 2, ok = true; const base = b[0] | b[1] << 8;
  for (;;) {
    const link = b[p] | b[p + 1] << 8; if (!link) break;
    const ln = b[p + 2] | b[p + 3] << 8; let q = p + 4, s = "";
    while (b[q]) { s += b[q] >= 0x80 ? M.T8_TOKENS[b[q] - 0x80] : String.fromCharCode(b[q]); q++; }
    if (link !== base + q + 1 - 2) ok = false;
    lines.push(ln + " " + s); p = q + 1;
  }
  return { lines, ok, end: p + 2 === b.length };
};
const d = detok(prg);
check("DRUCK8028: Ladeadresse $0401, Zeilenverkettung und Programmende korrekt", prg[0] === 1 && prg[1] === 4 && d.ok && d.end);
check("DRUCK8028: Rückübersetzung = Quelltext (ohne Leerzeichen außerhalb von Texten)",
  d.lines.join("\n") === M.T8_BASIC.map(l => { const [, n, b] = /^(\d+)\s*(.*)$/.exec(l); let o = "", q = false; for (const ch of b) { if (ch === '"') q = !q; if (q || ch === '"' || ch !== " ") o += ch; } return n + " " + o; }).join("\n"), "\n" + d.lines.join("\n"));
check("DRUCK8028: Texte in Anführungszeichen nicht tokenisiert", d.lines[0].includes('"DRUCK8028 - TEXTGRAFIK AUF DEN CBM 8028"'));

const t = M.t8TestBytes(), ts = String.fromCharCode(...t);
// Erlaubt laut Bedienungshandbuch 8028 (Tabelle 9.1): Zeichenvorrat, Leerzeichen, CR, CS ($8D), BS ($08), 10 cpi ($04)
const ok = new Set([...M.T8_CHARS, 0x20, 13, 0x8D, 8, 0x04]);
check("Testseite: nur Zeichenvorrat, Leerzeichen und die Steuercodes CR, CS, BS, 10 cpi", [...t].every(b => ok.has(b)) && t[0] === 0x04);
const l1 = ts.split("\r").find(l => l.startsWith("1 ")), [a1, b1] = l1.split("\x8D");
check("Testseite: X und O im CS-Test genau übereinander", a1.indexOf("\xD8") === b1.indexOf("\xCF") && a1.length - a1.indexOf("\xD8") === 8, `${a1.indexOf("\xD8")}/${b1.indexOf("\xCF")}`);
check("Zeichenvorrat: 81 Zeichen, ohne $3C $3E $40 $5B–$5F (Sonderzeichen bzw. Leerzeichen auf dem Typenrad)",
  M.T8_CHARS.length === 81 && ![0x3C, 0x3E, 0x40, 0x5B, 0x5C, 0x5D, 0x5E, 0x5F].some(c => M.T8_CHARS.includes(c)) && M.T8_CHARS.includes(0xC1) && M.T8_CHARS.includes(0x5A));

// Byte-Strom einer kleinen Textgrafik
const res = { out: [[[0x41], [0x42, 0x43], [0x20]], [[0x20], [0x20], [0x20]], [[0x44], [0x20], [0x45, 0x46]]] };
const hex = a => Array.from(a).map(x => x.toString(16).padStart(2, "0")).join(" ");
check("Bytes, Überdrucken CS, 10 cpi", hex(M.t8Bytes(res, { over: "cs", cpi: 10 })) === "04 41 42 8d 20 43 0d 0d 44 20 45 8d 20 20 46 0d", hex(M.t8Bytes(res, { over: "cs", cpi: 10 })));
check("Bytes, Überdrucken BS, 12 cpi", hex(M.t8Bytes(res, { over: "bs", cpi: 12 })) === "84 41 42 08 43 0d 0d 44 20 45 08 46 0d", hex(M.t8Bytes(res, { over: "bs", cpi: 12 })));
check("Bytes, ohne Überdrucken", hex(M.t8Bytes(res, { over: "off", cpi: 10 })) === "04 41 42 0d 0d 44 20 45 0d");
check("Anschläge zählen", M.t8Strikes(res) === 6);

// ---------------- Plotter: Einstellbytes und eingebettetes HSGMENU
{
  const { assemble } = require("../tools/asm6502");
  const asm = assemble(fs.readFileSync(path.join(__dirname, "..", "cbm", "hsgmenu.asm"), "latin1"), "hsgmenu.asm"), sym = asm.sym;
  const prg = fs.readFileSync(path.join(__dirname, "..", "cbm", "hsgmenu.prg"));
  check("hsgmenu.prg ist aktuell (= Quelltext)", Buffer.from(asm.prg).equals(prg));
  const psrc = block("PLOT");
  const el = () => ({ addEventListener() {}, set onclick(v) {}, value: "", checked: true, classList: { toggle() {} } });
  const PLM = new Function("$", "document", "render", "VIEWERS", "H", "HP", psrc + "\nreturn { plCfgBytes, plPatched, PL_CFG_ADDR };")(el, { querySelectorAll: () => [] }, () => {}, {}, 512, {});
  const o = { dev: 6, scl: 10, pen: 3, x0: 1000, y0: 300, inv: 0, gap: 2, th: [1, 4, 7, 17] };
  const b = PLM.plCfgBytes(o), at = a => b[a - PLM.PL_CFG_ADDR];
  check("Einstellbytes an den Adressen aus dem Quelltext (CFG_DEV … CFG_T+3)",
    PLM.PL_CFG_ADDR === sym.CFG_DEV && at(sym.CFG_DEV) === 6 && at(sym.CFG_SA) === 0 && at(sym.CFG_SCL) === 10 && at(sym.CFG_X0) + 256 * at(sym.CFG_X0 + 1) === 1000 &&
    at(sym.CFG_Y0) + 256 * at(sym.CFG_Y0 + 1) === 300 && at(sym.CFG_INV) === 0 && at(sym.CFG_PEN) === 3 && at(sym.CFG_GAP) === 2 &&
    [0, 1, 2, 3].every(i => at(sym.CFG_T + i) === o.th[i]) && b.length === sym.CFG_T + 4 - sym.CFG_DEV);
  const p = PLM.plPatched(prg, o); let diff = 0; for (let i = 0; i < p.length; i++) if (p[i] !== prg[i]) diff++;
  check("Patch ändert nur die Einstellbytes", p.length === prg.length && [...p].every((v, i) => i - 2 + 0x0401 >= sym.CFG_DEV && i - 2 + 0x0401 <= sym.CFG_T + 3 ? v === at(i - 2 + 0x0401) : v === prg[i]), diff + " Byte geändert");
  const vor = PLM.plPatched(prg, { dev: 5, scl: 14, pen: 1, x0: 1800, y0: 250, inv: 1, gap: 0, th: [2, 5, 8, 11] });
  check("Website-Vorgaben = Vorgaben im Quelltext", Buffer.from(vor).equals(prg));
  const html = HTML, m = /const HSGMENU_B64 = "([A-Za-z0-9+/=]+)"/.exec(html);
  const hp = fs.readFileSync(path.join(__dirname, "..", "cbm", "hpgl-sim.js"), "utf8").replace(/\r\n/g, "\n");
  check("hsg-converter.html enthält die aktuelle cbm/hpgl-sim.js", block("hpgl-sim").replace(/\r\n/g, "\n").includes(hp), "sonst: node tools/update-html.js");
  check("hsg-converter.html enthält das aktuelle HSGMENU", m && Buffer.from(m[1], "base64").equals(prg));
}

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nAlle Tests bestanden");
process.exit(fails ? 1 : 0);
