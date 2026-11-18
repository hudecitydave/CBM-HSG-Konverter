// Aktualisiert in hsg-converter.html die eingebetteten Teile aus dem cbm-Ordner:
//   - HSGMENU_B64 aus cbm/hsgmenu.prg (das Programm, das die Website mit den Plot-Einstellungen ins D64 schreibt)
//   - den Block "hpgl-sim" aus cbm/hpgl-sim.js (Plot-Referenzen für die Vorschau)
// Nach jeder Änderung an hsgmenu.asm oder hpgl-sim.js:  node tools/update-html.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), file = path.join(root, "hsg-converter.html");
let s = fs.readFileSync(file, "utf8");
const crlf = s.includes("\r\n"); s = s.replace(/\r\n/g, "\n");
const prg = fs.readFileSync(path.join(root, "cbm", "hsgmenu.prg"));
const before = s;
s = s.replace(/const HSGMENU_B64 = "[A-Za-z0-9+/=]+";/, () => `const HSGMENU_B64 = "${prg.toString("base64")}";`);
const hp = fs.readFileSync(path.join(root, "cbm", "hpgl-sim.js"), "utf8").replace(/\r\n/g, "\n");
const A = "const HP = (function () { const module = { exports: {} };\n", B = "\nreturn module.exports; })();\n/* ==== END hpgl-sim ==== */";
const i = s.indexOf(A), j = s.indexOf(B);
if (i < 0 || j < 0 || !/const HSGMENU_B64 = /.test(s)) throw new Error("Marker in hsg-converter.html nicht gefunden");
s = s.slice(0, i + A.length) + hp + s.slice(j);
fs.writeFileSync(file, crlf ? s.replace(/\n/g, "\r\n") : s);
console.log(s === before ? "hsg-converter.html war schon aktuell" : `hsg-converter.html aktualisiert (HSGMENU ${prg.length} Byte, hpgl-sim ${hp.length} Zeichen)`);
