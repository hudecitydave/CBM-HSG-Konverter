// Baut die Komplett-Anleitung als PDF, deutsch und englisch (Chrome oder Edge, headless):
//   anleitung/komplett-anleitung.html -> CBM-HSG-Komplett-Anleitung.pdf
//   anleitung/complete-guide.html     -> CBM-HSG-Complete-Guide.pdf
//   node tools/build-komplett.js
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const root = path.join(__dirname, "..");
const browsers = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];
const exe = browsers.find(b => fs.existsSync(b));
if (!exe) throw new Error("Chrome oder Edge nicht gefunden");
for (const [html, pdf] of [["komplett-anleitung.html", "CBM-HSG-Komplett-Anleitung.pdf"], ["complete-guide.html", "CBM-HSG-Complete-Guide.pdf"]]) {
  const src = path.join(root, "anleitung", html), out = path.join(root, pdf);
  execFileSync(exe, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--allow-file-access-from-files", "--virtual-time-budget=6000",
    `--print-to-pdf=${out}`, "file:///" + src.replace(/\\/g, "/")], { stdio: "inherit" });
  console.log(out, fs.statSync(out).size, "Byte");
}
