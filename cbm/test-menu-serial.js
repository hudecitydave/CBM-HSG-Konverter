#!/usr/bin/env node
// Test von hsgmenu.prg, Menüpunkt 2 (mit Serial): 6502 + VIA (Userport) + EF936x mit Rücklesen + HP-GL-Plotter.
// Abgeleitet aus cbm/test-hsgplot.js.   Aufruf: node cbm/test-menu-serial.js
"use strict";
const fs = require("fs"), path = require("path");
const { CPU } = require("../tools/sim6502");
const { assemble } = require("../tools/asm6502");

const asmPath = path.join(__dirname, "hsgmenu.asm");
const asm = assemble(fs.readFileSync(asmPath, "latin1"), "hsgmenu.asm");
const PRG = Buffer.from(asm.prg), sym = asm.sym;
const prgFile = path.join(__dirname, "hsgmenu.prg");
if (fs.existsSync(prgFile) && !fs.readFileSync(prgFile).equals(PRG)) console.warn("Hinweis: hsgmenu.prg ist nicht aktuell – neu assemblieren!");

function frame(cmd, header, payload) {
  const body = [...header, ...(payload || [])];
  let s = 0; for (const b of body) s = (s + b) & 0xFF;
  return [0x48, 0x53, 0x47, cmd.charCodeAt(0), ...body, s];
}
const le16 = v => [v & 0xFF, v >> 8];

function machine(boardRows, opt = {}) {
  const mem = new Uint8Array(65536);
  const org = PRG[0] | (PRG[1] << 8);
  mem.set(PRG.subarray(2), org);
  mem[0x0371] = boardRows === 512 ? 0 : 1;
  mem[0x0372] = 0x11;                                   // Kopie Modusregister (Bit 0 = 1: normal)
  const fb = new Uint8Array(512 * boardRows);         // oben = Zeile 0
  const gdp = { x: 0, y: 0, ctrl1: 0, ctrl2: 0, dx: 0, dy: 0, plots: 0, reads: 0, mode: 0x11, latch: 0xFF, badRead: 0, modeWrites: [] };
  const via = { pcr: 0x00, ifr: 0, ier: 0, ddra: 0xFF, pa: 0 };
  const link = { queue: [], waiting: false, ackLevel: 0, wait: 0, sent: 0, timeouts: 0 };
  const ieee = { present: opt.plotterAt === undefined ? 5 : opt.plotterAt, files: {}, chan: null, data: "", opens: [], closes: [], unexpected: [] };
  let out = "";
  const keys = [0x32]; const disp = { value: 0, calls: [] };
  const cb2 = () => (via.pcr & 0xE0) === 0xE0 ? 1 : 0;

  function read(a) {
    if (a === 0xAF70) return 0x04;
    if (a === 0xAF20) return gdp.latch;
    if (a === 0xAF71) return gdp.ctrl1;
    if (a === 0xAF78) return (gdp.x >> 8) & 0x0F;
    if (a === 0xAF79) return gdp.x & 0xFF;
    if (a === 0xAF7A) return (gdp.y >> 8) & 0x0F;
    if (a === 0xAF7B) return gdp.y & 0xFF;
    if (a === 0xE841) { via.ifr &= ~0x02; return via.pa; }
    if (a === 0xE84F) return via.pa;
    if (a === 0xE843) return via.ddra;
    if (a === 0xE84C) return via.pcr;
    if (a === 0xE84D) return via.ifr;
    if (a === 0xE84E) return via.ier | 0x80;
    return mem[a];
  }
  function write(a, v) {
    v &= 0xFF;
    if (a === 0xAF00) { gdp.mode = v; gdp.modeWrites.push(v); return; }
    if (a >= 0xA000 && a < 0xB000 && !(a >= 0xAF70 && a <= 0xAF7F)) throw new Error(`Schreibzugriff ins ROM $${a.toString(16)}`);
    if (a === 0xAF70) {
      if (v === 0x15 && (gdp.ctrl1 & 1)) {
        const yy = boardRows - 1 - gdp.y;
        if (gdp.x < 512 && yy >= 0 && yy < boardRows) fb[yy * 512 + gdp.x] = (gdp.ctrl1 & 2) ? 1 : 0;
        else throw new Error(`Punkt ausserhalb: ${gdp.x},${gdp.y}`);
        gdp.plots++;
      } else if (v === 0x04) { fb.fill(0); gdp.clears = (gdp.clears || 0) + 1;
      } else if (v === 0x0F) {                          // Speicherzugriff: Byte an X/Y in den Lese-Latch
        if (gdp.mode & 1) gdp.badRead++;                // Lesemodus nicht eingeschaltet
        if (gdp.ctrl1 & 1) throw new Error("Lesen bei eingeschaltetem Schreiben");
        const yy = boardRows - 1 - gdp.y, x0 = gdp.x & ~7;
        if (x0 >= 512 || yy < 0 || yy >= boardRows) throw new Error(`Lesen ausserhalb: ${gdp.x},${gdp.y}`);
        let byte = 0; for (let k = 0; k < 8; k++) if (fb[yy * 512 + x0 + k]) byte |= 1 << k;
        gdp.latch = byte ^ 0xFF; gdp.reads++;
      } else if (v !== 0x15) throw new Error(`Unerwarteter GDP-Befehl $${v.toString(16)}`);
      return;
    }
    if (a === 0xAF71) { gdp.ctrl1 = v; return; }
    if (a === 0xAF72) { gdp.ctrl2 = v; return; }
    if (a === 0xAF75) { gdp.dx = v; return; }
    if (a === 0xAF77) { gdp.dy = v; return; }
    if (a === 0xAF78) { gdp.x = (gdp.x & 0xFF) | ((v & 0x0F) << 8); return; }
    if (a === 0xAF79) { gdp.x = (gdp.x & 0xF00) | v; return; }
    if (a === 0xAF7A) { gdp.y = (gdp.y & 0xFF) | ((v & 0x0F) << 8); return; }
    if (a === 0xAF7B) { gdp.y = (gdp.y & 0xF00) | v; return; }
    if (a === 0xE84C) {
      via.pcr = v;
      if ((v & 0x0E) !== 0x0C && (v & 0x0E) !== 0) throw new Error("CA2-Bits verändert");
      if (link.waiting && cb2() !== link.ackLevel) { link.waiting = false; link.sent++; }
      return;
    }
    if (a === 0xE84D) { via.ifr &= ~(v & 0x7F); return; }
    if (a === 0xE84E) { if (v & 0x80) via.ier |= v & 0x7F; else via.ier &= ~v; return; }
    if (a === 0xE843) { via.ddra = v; return; }
    if (a === 0xE841 || a === 0xE84F) return;
    mem[a] = v;
  }
  const cpu = new CPU(read, write);
  cpu.sp = 0xF0; cpu.push(0xFF); cpu.push(0xEF); cpu.pc = 0x0410;
  let stopFrom = Infinity, stopTo = Infinity;
  let trash = 0x5A;

  function stub() {
    const rts = () => { const lo = cpu.pop(), hi = cpu.pop(); cpu.pc = (((hi << 8) | lo) + 1) & 0xFFFF; };
    const pc = cpu.pc;
    if (pc === 0xFFD2) {
      const c = cpu.a;
      if (ieee.chan !== null) {                         // Ausgabe an IEEE-Datei
        const f = ieee.files[ieee.chan];
        if (f.fa === ieee.present) { ieee.data += String.fromCharCode(c); if (c & 0x80 || c < 0x20) ieee.unexpected.push(c); }
        else mem[0x96] |= 0x80;                         // Gerät nicht vorhanden
        cpu.x = trash; cpu.y = trash ^ 0xFF; trash = (trash * 5 + 1) & 0xFF;   // ungünstigster Fall: X/Y zerstört
      } else out += c === 13 ? "\n" : c >= 0x20 && c < 0x80 ? String.fromCharCode(c) : "";
      rts(); return true;
    }
    if (pc === 0xF563) { const f = { la: mem[0xD2], sa: mem[0xD3], fa: mem[0xD4], fnlen: mem[0xD1] }; ieee.files[f.la] = f; ieee.opens.push(f); rts(); return true; }
    if (pc === 0xF2E0) { ieee.closes.push(mem[0xD2]); delete ieee.files[mem[0xD2]]; rts(); return true; }
    if (pc === 0xFFC9) { if (!ieee.files[cpu.x]) throw new Error("CHKOUT auf nicht geöffnete Datei " + cpu.x); ieee.chan = cpu.x; rts(); return true; }
    if (pc === 0xFFCC) { ieee.chan = null; rts(); return true; }
    if (pc === 0xFFE1) { const stop = cpu.cycles > stopFrom && cpu.cycles < stopTo; cpu.z = stop ? 1 : 0; rts(); return true; }
    if (pc === 0xAED0) { fb.fill(0); gdp.ctrl1 = 0; disp.value = 0; disp.inits = (disp.inits || 0) + 1; rts(); return true; }
    if (pc === 0xFFE4) { cpu.a = keys.length ? keys.shift() : 0; cpu.z = cpu.a === 0 ? 1 : 0; cpu.n = (cpu.a >> 7) & 1; rts(); return true; }
    if (pc === 0xAEDC) { disp.value = cpu.x; disp.calls.push(cpu.x); rts(); return true; }
    return false;
  }
  function linkTick() {
    if (link.waiting) { if (++link.wait > 200000) { link.timeouts++; link.waiting = false; link.queue.length = 0; } return; }
    if (!link.queue.length) return;
    if ((via.pcr & 0xE0) !== 0xC0 && (via.pcr & 0xE0) !== 0xE0) return;
    via.pa = link.queue.shift(); link.ackLevel = cb2(); link.wait = 0; link.waiting = true;
    if ((via.pcr & 1) === 0) via.ifr |= 0x02;
  }
  let idle = 0;
  const idleAt = pc => pc === 0xFFE1 || pc === 0xFFE4 || (pc >= sym.GETB && pc < sym.GOTB) || (pc >= sym.MENU1 && pc < sym.MENU2);   // Empfang oder Menü
  function run(maxSteps) {
    idle = 0;
    for (let i = 0; i < maxSteps; i++) {
      if (cpu.pc === 0xFFF0) return "exit";
      if (!stub()) cpu.step();
      linkTick();
      if (!link.queue.length && !link.waiting && !keys.length && idleAt(cpu.pc) && !(cpu.cycles > stopFrom && cpu.cycles < stopTo)) { if (++idle > 2000) return "idle"; } else idle = 0;
    }
    return "steps";
  }
  return {
    cpu, mem, fb, gdp, via, link, disp, ieee, get out() { return out; }, get keysLeft() { return keys.length; }, key(...k) { keys.push(...k); },
    send(bytes) { link.queue.push(...bytes); }, run,
    setStop(from, to = Infinity) { stopFrom = from; stopTo = to; },
  };
}

const { parseHPGL, rasterFromHPGL, expected, diffCount, testImage, photoImage, kringelRef, hatchRef, penStats, fmt } = require("./hpgl-sim");
let fails = 0;
function check(name, cond, info) { console.log(`${cond ? "OK  " : "FAIL"} ${name}${info ? " – " + info : ""}`); if (!cond) fails++; }
function rnd(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) >>> 24; }
function randomImage(rows, seed) { const r = rnd(seed), d = new Uint8Array(rows * 64); for (let i = 0; i < d.length; i++) d[i] = r(); return d; }
function bitsOf(bytes, rows) { const b = new Uint8Array(512 * rows); for (let i = 0; i < rows * 512; i++) b[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1; return b; }
function boot(rows, opt) { const m = machine(rows, opt); const r = m.run(300000); return { m, r }; }
const CFG = { s: 14, x0: 1800, y0: 250 };

check("Einstellbytes an den dokumentierten Adressen, Puffer unter der Schraffur-Karte ($2000)", sym.ROWBUF + 320 <= 0x2000 &&
  sym.CFG_DEV === 1043 && sym.CFG_SA === 1044 && sym.CFG_SCL === 1045 && sym.CFG_X0 === 1046 && sym.CFG_Y0 === 1048 && sym.CFG_INV === 1050 && sym.CFG_PEN === 1051 && sym.CFG_GAP === 1052 && sym.CFG_T === 1053);
console.log(`     hsgmenu.prg: $${asm.org.toString(16).toUpperCase()}-$${(asm.end - 1).toString(16).toUpperCase()}, ${PRG.length} Byte, Zeilenpuffer bis $${(sym.ROWBUF + 63).toString(16).toUpperCase()}`);

// ---------------------------------------------------------------- Empfang wie HSGSER (Regression)
{
  const { m, r } = boot(256);
  check("Start: Menü, Taste 2, Begrüßung mit den Plot-Tasten", r === "idle" && /HSGMENU - HSG-BOARD/.test(m.out) && /2 - BILDER VOM PC \(HSG-LINK\)/.test(m.out) && /1 = NUR CBM \(DIREKTPLOT\)/.test(m.out) && /STOP = MENUE/.test(m.out) && /PLOTTER: S = SCHRAFFUR, K = KRINGEL, H = PUNKTE/.test(m.out), JSON.stringify(m.out.trim()));
  const img = randomImage(256, 1);
  m.send(frame("I", le16(256), img)); const r2 = m.run(60_000_000);
  check("EF9366 Vollbild pixelgenau", r2 === "idle" && diffCount(m.fb, bitsOf(img, 256)) === 0);
  check("Kein Link-Timeout", m.link.timeouts === 0 && m.link.sent === 3 + 1 + 2 + 16384 + 1);
  const before = Uint8Array.from(m.fb);
  const X = 10, Y = 100, Wd = 5, Hh = 20, patch = randomImage(Hh, 7).subarray(0, Wd * Hh);
  m.send(frame("P", [X, ...le16(Y), Wd, ...le16(Hh)], patch)); m.run(20_000_000);
  const exp = Uint8Array.from(before);
  for (let yy = 0; yy < Hh; yy++) for (let xb = 0; xb < Wd; xb++) for (let k = 0; k < 8; k++) exp[(Y + yy) * 512 + (X + xb) * 8 + k] = (patch[yy * Wd + xb] >> (7 - k)) & 1;
  check("Ausschnitt P", diffCount(m.fb, exp) === 0);
  m.key(0x44); m.run(200000);
  check("Taste D: Grafik an", m.disp.value === 1);
  m.key(0x20); m.run(200000);
  check("Taste LEER: Grafik aus", m.disp.value === 0);
  m.send(frame("Q", [])); const rq = m.run(2_000_000);
  check("Q: zurück ins Menü", rq === "idle" && /ENDE/.test(m.out) && (m.out.match(/WAHL \?/g) || []).length === 2, rq + " " + JSON.stringify(m.out.slice(-160)));
  m.key(0x45); check("Menü: E beendet das Programm", m.run(1_000_000) === "exit");
}
{
  const { m } = boot(256); m.setStop(m.cpu.cycles + 1000, m.cpu.cycles + 200_000);
  check("STOP im Empfang: zurück ins Menü", m.run(2_000_000) === "idle" && /ABBRUCH/.test(m.out) && (m.out.match(/WAHL \?/g) || []).length === 2);
  m.setStop(m.cpu.cycles + 1000);
  check("STOP im Menü beendet das Programm", m.run(2_000_000) === "exit");
}

// ---------------------------------------------------------------- Plotten
function plotRun(rows, seed, opt = {}) {
  const { m } = boot(rows, opt);
  if (opt.poke) for (const [a, v] of opt.poke) m.mem[a] = v;
  const img = testImage(rows, seed);
  m.send(frame("I", le16(rows), img)); m.run(80_000_000);
  const fbBefore = Uint8Array.from(m.fb);
  const c0 = m.cpu.cycles;
  m.key(0x48); const r = m.run(400_000_000);
  return { m, r, img, fbBefore, cycles: m.cpu.cycles - c0 };
}

// 1) EF9365 512×512
{
  const { m, r, img, fbBefore, cycles } = plotRun(512, 3, { poke: [[1050, 0]] });   // 0 = helle Punkte zeichnen
  check("EF9365: Bild vorher korrekt empfangen", diffCount(fbBefore, bitsOf(img, 512)) === 0);
  const cmds = parseHPGL(m.ieee.data);
  check("Plot läuft durch und kehrt in den Empfang zurück", r === "idle" && /PLOTTE AUF GERAET 5/.test(m.out) && /PLOT FERTIG/.test(m.out), JSON.stringify(m.out.split("\n").slice(-3)));
  check("Datei 124 an Gerät 5, SA 0 geöffnet und wieder geschlossen", m.ieee.opens.length === 1 && m.ieee.opens[0].la === 124 && m.ieee.opens[0].fa === 5 && m.ieee.opens[0].sa === 0 && m.ieee.opens[0].fnlen === 0 && m.ieee.closes.join() === "124" && m.ieee.chan === null);
  check("HP-GL beginnt mit IN;SP1; und endet mit PU;SP0;", m.ieee.data.startsWith("IN;SP1;") && m.ieee.data.endsWith("PU;SP0;"), m.ieee.data.slice(0, 40) + " … " + m.ieee.data.slice(-20));
  check("Nur ASCII-Zeichen gesendet", m.ieee.unexpected.length === 0 && /^[A-Z0-9,;]*$/.test(m.ieee.data));
  check("Nur IN/SP/PU/PD-Befehle", cmds.every(c => ["IN", "SP", "PU", "PD"].includes(c.op)));
  const { r: ras, errors } = rasterFromHPGL(cmds, CFG);
  check("poke 1050,0: helle Punkte, Punkt für Punkt (512×512)", errors.length === 0 && diffCount(ras, expected(m.fb, 512, false)) === 0, `Abweichungen ${diffCount(ras, expected(m.fb, 512, false))}, Fehler ${errors.slice(0, 3)}`);
  check("Bildschirm durch das Lesen unverändert", diffCount(m.fb, fbBefore) === 0);
  check("Lesemodus korrekt: jedes Lesen mit Bit 0 = 0, danach Modusregister wiederhergestellt", m.gdp.badRead === 0 && m.gdp.reads === 512 * 64 && m.gdp.mode === 0x11);
  const xs = cmds.filter(c => c.args.length === 2).map(c => c.args[0]), ys = cmds.filter(c => c.args.length === 2).map(c => c.args[1]);
  check("Koordinatenbereich passt auf A4 (HP 7470A/7475A)", Math.min(...xs) === 1800 && Math.max(...xs) === 1800 + 511 * 14 && Math.min(...ys) === 250 && Math.max(...ys) === 250 + 511 * 14, `X ${Math.min(...xs)}–${Math.max(...xs)}, Y ${Math.min(...ys)}–${Math.max(...ys)}`);
  console.log(`     6502-Zeit für den Plot: ~${(cycles / 1e6).toFixed(1)} s bei 1 MHz (ohne Wartezeit des Plotters), ${m.ieee.data.length} Byte HP-GL, ${cmds.filter(c => c.op === "PD").length} Striche`);
  // Danach weiter empfangen
  const img2 = randomImage(512, 9);
  m.send(frame("I", le16(512), img2)); m.run(150_000_000);
  check("Nach dem Plot: nächstes Bild wird wieder pixelgenau empfangen", diffCount(m.fb, bitsOf(img2, 512)) === 0);
}

// 2) EF9366 512×256: jede Zeile doppelt
{
  const { m, r } = plotRun(256, 4);
  const { r: ras, errors } = rasterFromHPGL(parseHPGL(m.ieee.data), CFG);
  check("EF9366, Vorgabe: dunkle Punkte gezeichnet (Papier wie Bildschirm), jede Zeile doppelt", r === "idle" && errors.length === 0 && diffCount(ras, expected(m.fb, 256, true)) === 0, `Abweichungen ${diffCount(ras, expected(m.fb, 256, true))}`);
}

// 3) POKE-Einstellungen: Gerät 6, SA 1, Maßstab 10, Ränder, Negativ, Stift 2
{
  const poke = [[1043, 6], [1044, 1], [1045, 10], [1046, 500 & 255], [1047, 500 >> 8], [1048, 1000 & 255], [1049, 1000 >> 8], [1051, 2]];
  const { m, r } = plotRun(512, 5, { plotterAt: 6, poke });
  const cmds = parseHPGL(m.ieee.data);
  const { r: ras, errors } = rasterFromHPGL(cmds, { s: 10, x0: 500, y0: 1000 });
  check("Einstellungen per POKE: Gerät 6, SA 1, Stift 2", r === "idle" && m.ieee.opens[0].fa === 6 && m.ieee.opens[0].sa === 1 && m.ieee.data.startsWith("IN;SP2;") && /GERAET 6/.test(m.out));
  check("Maßstab 10, Ränder 500/1000, dunkle Punkte (Vorgabe)", errors.length === 0 && diffCount(ras, expected(m.fb, 512, true)) === 0, `Abweichungen ${diffCount(ras, expected(m.fb, 512, true))}, Fehler ${errors.slice(0, 3)}`);
}

// 4) Kein Plotter am Bus
{
  const { m } = boot(512, { plotterAt: 9 });
  m.key(0x48); const r = m.run(5_000_000);
  check("Kein Plotter: Meldung, Datei geschlossen, kein Lesen", r === "idle" && /PLOTTER ANTWORTET NICHT/.test(m.out) && m.ieee.closes.join() === "124" && m.ieee.chan === null && m.gdp.reads === 0);
  const img = randomImage(512, 2);
  m.send(frame("I", le16(512), img)); m.run(150_000_000);
  check("Danach normaler Empfang", diffCount(m.fb, bitsOf(img, 512)) === 0);
}

// 5) STOP während des Plots
{
  const { m } = boot(512);
  const img = testImage(512, 6);
  m.send(frame("I", le16(512), img)); m.run(150_000_000);
  m.key(0x48); m.run(3_000_000);                       // Plot läuft
  const now = m.cpu.cycles; m.setStop(now, now + 200_000);
  const r = m.run(50_000_000);
  check("STOP bricht nur den Plot ab, Programm läuft weiter", r === "idle" && /PLOT ABGEBROCHEN/.test(m.out) && !/\nABBRUCH/.test(m.out), JSON.stringify(m.out.split("\n").slice(-3)));
  check("Nach Abbruch: PU;SP0; gesendet, Datei zu", m.ieee.data.endsWith("PU;SP0;") && m.ieee.closes.join() === "124" && m.ieee.chan === null);
  m.send(frame("C", [])); m.run(3_000_000);
  check("Danach weiter synchron", /GELOESCHT/.test(m.out) && m.fb.every(v => v === 0));
}

// 6) Taste H während eines laufenden Bildes: vormerken, nach dem Bild plotten
{
  const { m } = boot(256);
  const img = randomImage(256, 8).map(v => v & 0x11);  // dünn besetzt, damit der Plot kurz bleibt
  m.send(frame("I", le16(256), img));
  m.run(30000);
  check("Übertragung läuft gerade", m.link.sent > 10 && m.link.queue.length > 1000);
  m.key(0x48);
  const r = m.run(400_000_000);
  const { r: ras, errors } = rasterFromHPGL(parseHPGL(m.ieee.data), CFG);
  check("H während der Übertragung: Bild vollständig, danach genau ein Plot des fertigen Bildes",
    r === "idle" && m.link.timeouts === 0 && diffCount(m.fb, bitsOf(img, 256)) === 0 && m.ieee.opens.length === 1 &&
    errors.length === 0 && diffCount(ras, expected(m.fb, 256, true)) === 0 && m.out.indexOf("BILD EMPFANGEN") < m.out.indexOf("PLOTTE AUF"),
    `Ende ${r}, Ausgabe ${JSON.stringify(m.out.split(String.fromCharCode(10)).slice(-4))}, geöffnet ${m.ieee.opens.length}, Abweichungen Bild ${diffCount(m.fb, bitsOf(img, 256))}, Plot ${diffCount(ras, expected(m.fb, 256, true))}`);
}

// 7) Leeres Bild
{
  const { m } = boot(256); m.mem[1050] = 0;
  m.key(0x48); const r = m.run(50_000_000);
  check("Leeres Bild mit poke 1050,0: nur IN;SP1;PU;SP0;", r === "idle" && m.ieee.data === "IN;SP1;PU;SP0;", m.ieee.data);
}

// 8) Taste K: Kringel-Modus, Byte für Byte gegen die Referenz
for (const rows of [512, 256]) {
  const { m } = boot(rows);
  const img = photoImage(rows);
  m.send(frame("I", le16(rows), img)); m.run(150_000_000);
  check(`Kringel ${rows}: Bild empfangen`, diffCount(m.fb, bitsOf(img, rows)) === 0);
  const c0 = m.cpu.cycles; m.key(0x4B); const r = m.run(900_000_000);
  const ref = kringelRef(expected(m.fb, rows, true), { s: 14, x0: 1800, y0: 250, pen: 1 });
  check(`Kringel ${rows}: Taste K, HP-GL = Referenz, danach weiter empfangsbereit`, r === "idle" && m.ieee.data === ref && /PLOT FERTIG/.test(m.out) && m.ieee.closes.join() === "124");
  console.log(`     ${fmt(penStats(m.ieee.data))}, 6502 ${((m.cpu.cycles - c0) / 1e6).toFixed(0)} s`);
}
{ // K während der Übertragung: vormerken, nach dem Bild als Kringel plotten
  const { m } = boot(256);
  const img = photoImage(256);
  m.send(frame("I", le16(256), img)); m.run(30000); m.key(0x4B);
  const r = m.run(900_000_000);
  check("K während der Übertragung: Bild vollständig, danach Kringel-Plot", r === "idle" && diffCount(m.fb, bitsOf(img, 256)) === 0 &&
    m.ieee.data === kringelRef(expected(m.fb, 256, true), { s: 14, x0: 1800, y0: 250, pen: 1 }) && m.out.indexOf("BILD EMPFANGEN") < m.out.indexOf("PLOTTE AUF"));
}

// 9) Taste S: Schraffur, Byte für Byte gegen die Referenz
let hatchCycles = 0;
for (const rows of [512, 256]) {
  const { m } = boot(rows);
  const img = photoImage(rows);
  m.send(frame("I", le16(rows), img)); m.run(150_000_000);
  const c0 = m.cpu.cycles; m.key(0x53); const r = m.run(1_500_000_000);
  const ref = hatchRef(expected(m.fb, rows, true), { s: 14, x0: 1800, y0: 250, pen: 1 });
  check(`Schraffur ${rows}: Taste S, HP-GL = Referenz, danach weiter empfangsbereit`, r === "idle" && m.ieee.data === ref && /PLOT FERTIG/.test(m.out) && m.ieee.closes.join() === "124",
    `Länge ${m.ieee.data.length}/${ref.length}, erste Abweichung bei ${[...ref].findIndex((ch, i) => ch !== m.ieee.data[i])}: ${JSON.stringify(m.ieee.data.slice(Math.max(0, [...ref].findIndex((ch, i) => ch !== m.ieee.data[i]) - 30)).slice(0, 80))}`);
  const pts = parseHPGL(m.ieee.data).filter(c => c.args.length === 2);
  check(`Schraffur ${rows}: Koordinaten im Bildbereich, Bildschirm unverändert`, pts.every(c => c.args[0] >= 1800 && c.args[0] <= 1800 + 512 * 14 && c.args[1] >= 250 && c.args[1] <= 250 + 512 * 14) && diffCount(m.fb, bitsOf(img, rows)) === 0);
  if (rows === 512) hatchCycles = m.cpu.cycles - c0;
  console.log(`     ${fmt(penStats(m.ieee.data))}, 6502 ${((m.cpu.cycles - c0) / 1e6).toFixed(0)} s`);
}
{ // eigene Schwellen und Maßstab per POKE, Ebene 4 abgeschaltet (17)
  const { m } = boot(512);
  m.send(frame("I", le16(512), photoImage(512))); m.run(150_000_000);
  for (const [a, v] of [[1045, 10], [1053, 4], [1054, 8], [1055, 12], [1056, 17]]) m.mem[a] = v;
  m.key(0x53); const r = m.run(1_500_000_000);
  check("Schraffur: Schwellen 1053-1056 und Maßstab per POKE", r === "idle" && m.ieee.data === hatchRef(expected(m.fb, 512, true), { s: 10, x0: 1800, y0: 250, pen: 1 }, [4, 8, 12, 17]));
}
for (const [name, frac] of [["beim Einlesen (Ebene 1)", 0.2], ["bei den Diagonalen", 0.9]]) { // STOP
  const { m } = boot(512);
  m.send(frame("I", le16(512), photoImage(512))); m.run(150_000_000);
  m.key(0x53); const target = m.cpu.cycles + Math.floor(hatchCycles * frac);
  while (m.cpu.cycles < target) m.run(10000);           // run() zählt Befehle, hier nach Takten anhalten
  const now = m.cpu.cycles; m.setStop(now, now + 200_000);
  const r = m.run(50_000_000);
  check(`Schraffur: STOP ${name} bricht nur den Plot ab`, r === "idle" && /PLOT ABGEBROCHEN/.test(m.out) && m.ieee.data.endsWith("PU;SP0;") && m.ieee.closes.join() === "124" && m.ieee.chan === null,
    JSON.stringify(m.out.split("\n").slice(-3)));
}
{ // S während der Übertragung
  const { m } = boot(256);
  const img = photoImage(256);
  m.send(frame("I", le16(256), img)); m.run(30000); m.key(0x53);
  const r = m.run(1_500_000_000);
  check("S während der Übertragung: Bild vollständig, danach Schraffur-Plot", r === "idle" && diffCount(m.fb, bitsOf(img, 256)) === 0 &&
    m.ieee.data === hatchRef(expected(m.fb, 256, true), { s: 14, x0: 1800, y0: 250, pen: 1 }) && m.out.indexOf("BILD EMPFANGEN") < m.out.indexOf("PLOTTE AUF"));
}

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nAlle Tests bestanden");
process.exit(fails ? 1 : 0);
