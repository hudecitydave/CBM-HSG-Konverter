#!/usr/bin/env node
// Test von hsgser.prg in einem emulierten CBM: 6502 + VIA 6522 (Userport) + EF936x + Pro Micro.
// Aufruf: node tools/test-hsgser.js [serial/hsgser.prg]
"use strict";
const fs = require("fs"), path = require("path");
const { CPU } = require("./sim6502");

const prgPath = process.argv[2] || path.join(__dirname, "..", "serial", "hsgser.prg");
const PRG = fs.readFileSync(prgPath);

// ---- Rahmen bauen (gleiches Format wie im Browser)
function frame(cmd, header, payload) {
  const body = [...header, ...(payload || [])];
  let s = 0; for (const b of body) s = (s + b) & 0xFF;
  return [0x48, 0x53, 0x47, cmd.charCodeAt(0), ...body, s];
}
const le16 = v => [v & 0xFF, v >> 8];

// ---- Maschine
function machine(boardRows) {
  const mem = new Uint8Array(65536);
  const org = PRG[0] | (PRG[1] << 8);
  mem.set(PRG.subarray(2), org);
  mem[0x0371] = boardRows === 512 ? 0 : 1;
  const fb = new Uint8Array(512 * boardRows);         // oben = Zeile 0
  const gdp = { x: 0, y: 0, ctrl1: 0, ctrl2: 0, dx: 0, dy: 0, plots: 0 };
  const via = { pcr: 0x00, ifr: 0, ier: 0, ddra: 0xFF, pa: 0 };
  const link = { queue: [], waiting: false, ackLevel: 0, wait: 0, sent: 0, timeouts: 0 };
  let out = "";
  const keys = []; const disp = { value: 0, calls: [] };
  const cb2 = () => (via.pcr & 0xE0) === 0xE0 ? 1 : 0;   // 111 = High, 110 = Low

  function read(a) {
    if (a === 0xAF70) return 0x04;                        // immer bereit
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
    if (a >= 0xA000 && a < 0xB000 && !(a >= 0xAF70 && a <= 0xAF7F)) throw new Error(`Schreibzugriff ins ROM $${a.toString(16)}`);
    if (a === 0xAF70) {
      if (v === 0x15 && (gdp.ctrl1 & 1)) {
        const yy = boardRows - 1 - gdp.y;
        if (gdp.x < 512 && yy >= 0 && yy < boardRows) fb[yy * 512 + gdp.x] = (gdp.ctrl1 & 2) ? 1 : 0;
        else throw new Error(`Punkt ausserhalb: ${gdp.x},${gdp.y}`);
        gdp.plots++;
      } else if (v === 0x04) { fb.fill(0); gdp.clears = (gdp.clears || 0) + 1;
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
      const before = cb2(); via.pcr = v;
      if ((v & 0x0E) !== 0x0C && (v & 0x0E) !== 0) throw new Error("CA2-Bits verändert");
      if (link.waiting && cb2() !== link.ackLevel) { link.waiting = false; link.sent++; }
      void before; return;
    }
    if (a === 0xE84D) { via.ifr &= ~(v & 0x7F); return; }
    if (a === 0xE84E) { if (v & 0x80) via.ier |= v & 0x7F; else via.ier &= ~v; return; }
    if (a === 0xE843) { via.ddra = v; return; }
    if (a === 0xE841 || a === 0xE84F) return;
    mem[a] = v;
  }
  const cpu = new CPU(read, write);
  // SYS 1040 nachbilden: Rücksprungadresse $FFF0 (Sentinel) auf den Stapel
  cpu.sp = 0xF0; cpu.push(0xFF); cpu.push(0xEF); cpu.pc = 0x0410;
  let stopAfter = Infinity;

  function stub() {
    const rts = () => { const lo = cpu.pop(), hi = cpu.pop(); cpu.pc = (((hi << 8) | lo) + 1) & 0xFFFF; };
    if (cpu.pc === 0xFFD2) { const c = cpu.a; out += c === 13 ? "\n" : c >= 0x20 && c < 0x80 ? String.fromCharCode(c) : ""; rts(); return true; }
    if (cpu.pc === 0xFFE1) { const stop = cpu.cycles > stopAfter; cpu.z = stop ? 1 : 0; rts(); return true; }
    if (cpu.pc === 0xAED0) { fb.fill(0); gdp.ctrl1 = 0; disp.value = 0; disp.inits = (disp.inits || 0) + 1; rts(); return true; }
    if (cpu.pc === 0xFFE4) { cpu.a = keys.length ? keys.shift() : 0; cpu.z = cpu.a === 0 ? 1 : 0; cpu.n = (cpu.a >> 7) & 1; rts(); return true; }
    if (cpu.pc === 0xAEDC) { disp.value = cpu.x; disp.calls.push(cpu.x); rts(); return true; }
    return false;
  }
  // Pro Micro: legt nächstes Byte an, sobald das vorige quittiert ist
  function linkTick() {
    if (link.waiting) { if (++link.wait > 200000) { link.timeouts++; link.waiting = false; link.queue.length = 0; } return; }
    if (!link.queue.length) return;
    if ((via.pcr & 0xE0) !== 0xC0 && (via.pcr & 0xE0) !== 0xE0) return; // Viewer noch nicht bereit
    via.pa = link.queue.shift(); link.ackLevel = cb2(); link.wait = 0; link.waiting = true;
    if ((via.pcr & 1) === 0) via.ifr |= 0x02;              // fallende Flanke an CA1
  }
  function run(maxSteps) {
    idle = 0;
    for (let i = 0; i < maxSteps; i++) {
      if (cpu.pc === 0xFFF0) return "exit";
      if (!stub()) cpu.step();
      linkTick();
      if (!link.queue.length && !link.waiting && idleAt(cpu.pc) && cpu.cycles <= stopAfter) { if (++idle > 2000) return "idle"; } else idle = 0;
    }
    return "steps";
  }
  let idle = 0, getbAddr = null;
  function idleAt(pc) { if (getbAddr === null) return false; return pc === 0xFFE1 || pc === 0xFFE4 || (pc >= getbAddr && pc < getbAddr + 28); }
  return {
    cpu, fb, gdp, via, link, disp, get out() { return out; }, key(...k) { keys.push(...k); },
    send(bytes) { link.queue.push(...bytes); },
    run, setGetb(a) { getbAddr = a; }, setStop(c) { stopAfter = c; },
  };
}

// GETB-Adresse aus dem Assembler holen (für die Leerlauferkennung)
const { assemble } = require("./asm6502");
const sym = assemble(fs.readFileSync(path.join(__dirname, "..", "serial", "hsgser.asm"), "latin1"), "hsgser.asm").sym;

// ---- Hilfen
let fails = 0;
function check(name, cond, info) { console.log(`${cond ? "OK  " : "FAIL"} ${name}${info ? " – " + info : ""}`); if (!cond) fails++; }
function rnd(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) >>> 24; }
function randomImage(rows, seed) { const r = rnd(seed), d = new Uint8Array(rows * 64); for (let i = 0; i < d.length; i++) d[i] = r(); return d; }
function bitsOf(bytes, rows) { const b = new Uint8Array(512 * rows); for (let i = 0; i < rows * 512; i++) b[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1; return b; }
function diffCount(a, b) { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; }
function boot(rows) { const m = machine(rows); m.setGetb(sym.GETB); const r = m.run(200000); return { m, r }; }

// 1) EF9366: Vollbild
{
  const { m, r } = boot(256);
  check("Start, Begrüßung, wartet auf Daten", r === "idle" && /HSGSER/.test(m.out), JSON.stringify(m.out.trim()));
  const img = randomImage(256, 1);
  m.send(frame("I", le16(256), img));
  const t0 = m.cpu.cycles; const r2 = m.run(60_000_000);
  check("EF9366 Vollbild 512×256 pixelgenau", r2 === "idle" && diffCount(m.fb, bitsOf(img, 256)) === 0, `Abweichungen ${diffCount(m.fb, bitsOf(img, 256))}, Punkte ${m.gdp.plots}`);
  check("Meldung BILD EMPFANGEN", /BILD EMPFANGEN/.test(m.out));
  check("Keine Zeitüberschreitung am Link", m.link.timeouts === 0 && m.link.sent === 3 + 1 + 2 + 16384 + 1, `quittiert ${m.link.sent}`);
  console.log(`     6502-Zeit Zufallsbild (50 % Punkte): ~${((m.cpu.cycles - t0) / 1e6).toFixed(1)} s bei 1 MHz, ohne Wartezeit des EF936x und des Pro Micro`);

  // 2) Ausschnitt mit Radieren
  const before = Uint8Array.from(m.fb);
  const X = 10, Y = 100, Wd = 5, Hh = 20, patch = randomImage(Hh, 7).subarray(0, Wd * Hh);
  m.send(frame("P", [X, ...le16(Y), Wd, ...le16(Hh)], patch));
  m.run(20_000_000);
  const exp = Uint8Array.from(before);
  for (let yy = 0; yy < Hh; yy++) for (let xb = 0; xb < Wd; xb++) for (let k = 0; k < 8; k++)
    exp[(Y + yy) * 512 + (X + xb) * 8 + k] = (patch[yy * Wd + xb] >> (7 - k)) & 1;
  check("Ausschnitt P: Setzen + Radieren, Rest unverändert", diffCount(m.fb, exp) === 0, `Abweichungen ${diffCount(m.fb, exp)}`);

  // 3) Ausschnitt teilweise ausserhalb wird geclippt, Strom bleibt synchron
  const p2 = new Uint8Array(10 * 30).fill(0xFF);
  m.send(frame("P", [60, ...le16(240), 10, ...le16(30)], p2));
  m.run(20_000_000);
  let ok = true;
  for (let yy = 240; yy < 256; yy++) for (let x = 480; x < 512; x++) if (!m.fb[yy * 512 + x]) ok = false;
  check("Ausschnitt am Rand geclippt (kein Absturz)", ok);
  m.send(frame("C", []));
  m.run(2_000_000);
  check("Danach noch synchron: C löscht", m.fb.every(v => v === 0) && /GELOESCHT/.test(m.out));

  // 4) Müll + falsche Prüfsumme
  const bad = frame("I", le16(256), randomImage(256, 3)); bad[bad.length - 1] ^= 0x55;
  m.send([1, 2, 0x48, 0x48, 0x53, 9, ...bad]);
  m.run(60_000_000);
  check("Müll vor dem Rahmen wird übersprungen, Prüfsummenfehler gemeldet", /PRUEFSUMMENFEHLER/.test(m.out) && diffCount(m.fb, bitsOf(bad.slice(6, 6 + 16384), 256)) === 0);

  // 5) Q beendet
  m.send(frame("Q", []));
  const r5 = m.run(2_000_000);
  check("Q: zurück zu BASIC", r5 === "exit" && /ENDE/.test(m.out));
  check("CA2-Bits (Zeichensatz) unangetastet, Port A Eingang", (m.via.pcr & 0x0E) === 0 && m.via.ddra === 0);
}

// 6) EF9365: Vollbild 512×512
{
  const { m } = boot(512);
  const img = randomImage(512, 5);
  m.send(frame("I", le16(512), img));
  m.run(120_000_000);
  check("EF9365 Vollbild 512×512 pixelgenau", diffCount(m.fb, bitsOf(img, 512)) === 0, `Abweichungen ${diffCount(m.fb, bitsOf(img, 512))}`);
}

// 7) STOP bricht ab
{
  const { m } = boot(256);
  m.setStop(m.cpu.cycles + 1000);
  const r = m.run(2_000_000);
  check("STOP-Taste: Abbruch zurück zu BASIC", r === "exit" && /ABBRUCH/.test(m.out));
}

// 8) Taste D / LEER: Grafik auf dem CBM-Bildschirm an/aus, bleibt nach Bildempfang erhalten
{
  const { m } = boot(256);
  check("Start: CBM-Bildschirm auf Text, HSGINIT nur einmal", m.disp.value === 0 && m.disp.inits === 1);
  m.key(0x44); m.run(200000);
  check("Taste D: Grafik auf CBM-Bildschirm an", m.disp.value === 1 && m.disp.calls.join() === "1");
  const img = randomImage(256, 11);
  m.send(frame("I", le16(256), img)); m.run(60_000_000);
  check("Nach Bildempfang bleibt Grafik an, Bild pixelgenau", m.disp.value === 1 && m.disp.inits === 1 && diffCount(m.fb, bitsOf(img, 256)) === 0);
  m.key(0x20); m.run(200000);
  check("Taste LEER: wieder Text", m.disp.value === 0);
  m.key(0x41, 0x44); m.run(200000);
  check("Andere Tasten werden ignoriert", m.disp.value === 1 && m.disp.calls.join() === "1,0,1");
  m.send(frame("C", [])); m.run(2_000_000);
  check("C löscht per GDP-Befehl, Anzeige bleibt", m.fb.every(v => v === 0) && m.disp.value === 1 && m.disp.inits === 1);
  m.send(frame("Q", [])); const r = m.run(2_000_000);
  check("Q: CBM-Bildschirm zurück auf Text", r === "exit" && m.disp.value === 0);
}
{
  const { m } = boot(256);
  m.key(0x44); m.run(200000);
  m.setStop(m.cpu.cycles + 1000); const r = m.run(2_000_000);
  check("STOP bei Grafik-Anzeige: zurück auf Text", r === "exit" && m.disp.value === 0);
}

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nAlle Tests bestanden");
process.exit(fails ? 1 : 0);
