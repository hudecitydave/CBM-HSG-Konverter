// Baut HSG-Link-Anleitung.pdf aus anleitung/anleitung.html.
// Die Lötplan-Zeichnungen kommen unverändert aus serial/verdrahtung.html.
//   node tools/build-anleitung.js
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(root, "anleitung", "anleitung.html"), "utf8");
const wire = fs.readFileSync(path.join(root, "serial", "verdrahtung.html"), "utf8");
const m = wire.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error("Zeichen-Skript in verdrahtung.html nicht gefunden");
const tmp = path.join(root, "anleitung", "_build.html");
fs.writeFileSync(tmp, src.replace("/*__DRAWINGS__*/", () => m[1]));

const out = path.join(root, "HSG-Link-Anleitung.pdf");
const browsers = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];
const exe = browsers.find(b => fs.existsSync(b));
if (!exe) throw new Error("Chrome oder Edge nicht gefunden");
execFileSync(exe, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=4000",
  `--print-to-pdf=${out}`, "file:///" + tmp.replace(/\\/g, "/")], { stdio: "inherit" });
fs.unlinkSync(tmp);
console.log(out, fs.statSync(out).size, "Byte");
