// Baut die Disketten der CBM-Programme:
//   cbm/hsgmenu.d64     HSGMENU, DRUCK8028, 8028TEST und alle Testbilder (Hauptdiskette)
//   cbm/hsgplot.d64     Einzelprogramm HSGPLOT (+ HSGIMAGE)
//   cbm/direktplot.d64  Einzelprogramm DIREKTPLOT und Testbilder
// D64-Klasse, HSGIMAGE und der 8028-Teil kommen aus ../hsg-converter.html (nur gelesen).
//   node cbm/make-d64.js
const fs = require("fs"), path = require("path");
const here = __dirname, root = path.join(here, "..");
const html = fs.readFileSync(path.join(root, "hsg-converter.html"), "utf8");
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error(`Abschnitt ${a} nicht gefunden`); return html.slice(i, j); };
const { D64, petEncode } = new Function(cut("/* ---------------------------------------------------------------- D64 */", "/* ---------------------------------------------------------------- Viewer") + "\nreturn { D64, petEncode };")();
const dummy = () => ({ addEventListener() {}, set onclick(v) {} });
const T8 = new Function("$", "document", "render", cut("/* ==== BEGIN 8028 ==== */", "/* ==== END 8028 ==== */") + "\nreturn { t8Tokenize, T8_BASIC, t8TestBytes };")(dummy, {}, () => {});
const m = /const HSGIMAGE_B64 = "([A-Za-z0-9+/=]+)"/.exec(html); if (!m) throw new Error("HSGIMAGE fehlt in der HTML");
const HSGIMAGE = Buffer.from(m[1], "base64");
const { photoImage } = require("./hpgl-sim");

// Testbild: dunkler Rahmen + Kreis auf hellem Grund (HSGIMAGE-Format, MSB = linker Punkt)
function frameCircle(rows) {
  const d = new Uint8Array(rows * 64);
  for (let y = 0; y < rows; y++) for (let x = 0; x < 512; x++) {
    const cx = x - 255.5, cy = (y - (rows - 1) / 2) * (512 / rows), r = Math.sqrt(cx * cx + cy * cy);
    const on = y < 2 || y >= rows - 2 || x < 2 || x >= 510 || (r > 196 && r < 202);
    if (!on) d[y * 64 + (x >> 3)] |= 0x80 >> (x & 7);
  }
  return d;
}
const rd = n => fs.readFileSync(path.join(here, n));
const pictures = [["BLUES512", rd("blues512.bin"), 2], ["BLUES256", rd("blues256.bin"), 2], ["FOTO512", photoImage(512), 2], ["FOTO256", photoImage(256), 2], ["TEST512", frameCircle(512), 2], ["TEST256", frameCircle(256), 2]];

function build(file, name, id, files) {
  const disk = D64.blank(name, id);
  for (const [n, data, type] of files) disk.writeFile(Uint8Array.from(petEncode(n, 16)), new Uint8Array(data), type);
  for (const [n, data] of files) {
    const e = disk.entries().find(x => x.name === n);
    if (!e || !Buffer.from(disk.readFile(e)).equals(Buffer.from(data))) throw new Error(`Gegenprobe fehlgeschlagen: ${file} ${n}`);
  }
  fs.writeFileSync(path.join(here, file), disk.d);
  console.log(`${file.padEnd(15)} "${disk.name}" ${disk.id}: ${files.map(f => f[0]).join(", ")} – ${disk.freeBlocks()} Blöcke frei`);
}
build("hsgmenu.d64", "HSG-MENU", "HM", [["HSGMENU", rd("hsgmenu.prg"), 2], ["DRUCK8028", T8.t8Tokenize(T8.T8_BASIC), 2], ["8028TEST", T8.t8TestBytes(), 1], ...pictures]);
build("hsgplot.d64", "HSG-PLOT", "HP", [["HSGPLOT", rd("hsgplot.prg"), 2], ["HSGIMAGE", HSGIMAGE, 2]]);
build("direktplot.d64", "HSG DIREKTPLOT", "DP", [["DIREKTPLOT", rd("direktplot.prg"), 2], ...pictures.slice(0, 4), ...pictures.slice(4)]);
