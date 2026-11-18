// Baut ein D64 mit den Viewern HSGSER und HSGIMAGE.
// Nutzt dieselbe D64-Klasse wie hsg-converter.html (wird aus der HTML-Datei gelesen).
//   node tools/make-d64.js [ausgabe.d64]
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "hsg-converter.html"), "utf8");

const a = html.indexOf("/* ---------------------------------------------------------------- D64 */");
const b = html.indexOf("/* ---------------------------------------------------------------- Viewer");
if (a < 0 || b < 0) throw new Error("D64-Abschnitt in hsg-converter.html nicht gefunden");
const b64 = name => { const m = html.match(new RegExp(`const ${name} = "([A-Za-z0-9+/=]+)"`)); if (!m) throw new Error(name + " fehlt"); return Buffer.from(m[1], "base64"); };
const { D64, petEncode } = new Function(html.slice(a, b) + "\nreturn { D64, petEncode };")();

const out = process.argv[2] || path.join(root, "serial", "hsgser.d64");
const ser = fs.readFileSync(path.join(root, "serial", "hsgser.prg"));
if (!ser.equals(b64("HSGSER_B64"))) console.warn("Hinweis: serial/hsgser.prg weicht vom im Konverter eingebetteten HSGSER ab, verwendet wird hsgser.prg");

const disk = D64.blank("HSG-LINK", "HL");
const files = [["HSGSER", ser], ["HSGIMAGE", b64("HSGIMAGE_B64")]];
for (const [name, data] of files) {
  const blocks = disk.writeFile(Uint8Array.from(petEncode(name, 16)), new Uint8Array(data), 2);
  console.log(`${name.padEnd(9)} ${String(blocks).padStart(3)} Blöcke, ${data.length} Byte, Ladeadresse $${(data[0] | data[1] << 8).toString(16).toUpperCase()}`);
}
// Gegenprobe: alles wieder auslesen
for (const [name, data] of files) {
  const e = disk.entries().find(x => x.name === name);
  if (!e || !Buffer.from(disk.readFile(e)).equals(data)) throw new Error("Gegenprobe fehlgeschlagen: " + name);
}
fs.writeFileSync(out, disk.d);
console.log(`${out}: Disk "${disk.name}" ${disk.id}, ${disk.freeBlocks()} Blöcke frei`);
