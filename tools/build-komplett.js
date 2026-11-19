// Baut CBM-HSG-Komplett-Anleitung.pdf aus anleitung/komplett-anleitung.html (Chrome oder Edge, headless).
//   node tools/build-komplett.js
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const src = path.join(root, "anleitung", "komplett-anleitung.html");
const out = path.join(root, "CBM-HSG-Komplett-Anleitung.pdf");
const browsers = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];
const exe = browsers.find(b => fs.existsSync(b));
if (!exe) throw new Error("Chrome oder Edge nicht gefunden");
execFileSync(exe, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", "--virtual-time-budget=6000",
  `--print-to-pdf=${out}`, "file:///" + src.replace(/\\/g, "/")], { stdio: "inherit" });
console.log(out, fs.statSync(out).size, "Byte");
