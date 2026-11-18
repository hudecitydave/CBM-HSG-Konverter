#!/usr/bin/env node
// Test von direktplot.prg im emulierten CBM: 6502 + Diskette (IEEE-Laderoutinen) + EF936x mit Rücklesen
// + HP-GL-Plotter am IEEE-Bus.   Aufruf: node cbm/test-direktplot.js
"use strict";
const fs = require("fs"), path = require("path");
const { CPU } = require("../tools/sim6502");
const { assemble } = require("../tools/asm6502");

const asm = assemble(fs.readFileSync(path.join(__dirname, "direktplot.asm"), "latin1"), "direktplot.asm");
const PRG = Buffer.from(asm.prg), sym = asm.sym;
const prgFile = path.join(__dirname, "direktplot.prg");
if (fs.existsSync(prgFile) && !fs.readFileSync(prgFile).equals(PRG)) console.warn("Hinweis: direktplot.prg ist nicht aktuell – neu assemblieren!");

function machine(boardRows, disk, opt = {}) {
  const mem = new Uint8Array(65536);
  mem.set(PRG.subarray(2), PRG[0] | (PRG[1] << 8));
  mem[0x0371] = boardRows === 512 ? 0 : 1;
  mem[0x0372] = 0x11;
  if (opt.poke) for (const [a, v] of opt.poke) mem[a] = v;
  const fb = new Uint8Array(512 * boardRows);
  const gdp = { x: 0, y: 0, ctrl1: 0, mode: 0x11, latch: 0xFF, badRead: 0, reads: 0, plots: 0 };
  const ieee = { present: opt.plotterAt === undefined ? 5 : opt.plotterAt, files: {}, chan: null, data: "", opens: [], closes: [], unexpected: [] };
  const dsk = { file: null, pos: 0, talk: false, loads: [], closed: 0 };
  let out = "", input = [], keys = [], stopFrom = Infinity, stopTo = Infinity, trash = 0x5A;

  const read = a => {
    if (a === 0xAF70) return 0x04;
    if (a === 0xAF20) return gdp.latch;
    if (a === 0xAF71) return gdp.ctrl1;
    if (a === 0xAF78) return (gdp.x >> 8) & 0x0F;
    if (a === 0xAF79) return gdp.x & 0xFF;
    if (a === 0xAF7A) return (gdp.y >> 8) & 0x0F;
    if (a === 0xAF7B) return gdp.y & 0xFF;
    return mem[a];
  };
  const write = (a, v) => {
    v &= 0xFF;
    if (a === 0xAF00) { gdp.mode = v; return; }
    if (a >= 0xA000 && a < 0xB000 && !(a >= 0xAF70 && a <= 0xAF7F)) throw new Error(`Schreibzugriff ins ROM $${a.toString(16)}`);
    if (a === 0xAF70) {
      if (v === 0x15) {
        if (gdp.ctrl1 & 1) {
          const yy = boardRows - 1 - gdp.y;
          if (gdp.x >= 512 || yy < 0 || yy >= boardRows) throw new Error(`Punkt ausserhalb: ${gdp.x},${gdp.y}`);
          fb[yy * 512 + gdp.x] = (gdp.ctrl1 & 2) ? 1 : 0; gdp.plots++;
        }
      } else if (v === 0x0F) {
        if (gdp.mode & 1) gdp.badRead++;
        if (gdp.ctrl1 & 1) throw new Error("Lesen bei eingeschaltetem Schreiben");
        const yy = boardRows - 1 - gdp.y, x0 = gdp.x & ~7;
        if (x0 >= 512 || yy < 0 || yy >= boardRows) throw new Error(`Lesen ausserhalb: ${gdp.x},${gdp.y}`);
        let b = 0; for (let k = 0; k < 8; k++) if (fb[yy * 512 + x0 + k]) b |= 1 << k;
        gdp.latch = b ^ 0xFF; gdp.reads++;
      } else throw new Error(`Unerwarteter GDP-Befehl $${v.toString(16)}`);
      return;
    }
    if (a === 0xAF71) { gdp.ctrl1 = v; return; }
    if (a === 0xAF78) { gdp.x = (gdp.x & 0xFF) | ((v & 0x0F) << 8); return; }
    if (a === 0xAF79) { gdp.x = (gdp.x & 0xF00) | v; return; }
    if (a === 0xAF7A) { gdp.y = (gdp.y & 0xFF) | ((v & 0x0F) << 8); return; }
    if (a === 0xAF7B) { gdp.y = (gdp.y & 0xF00) | v; return; }
    if (a >= 0xAF70 && a <= 0xAF7F) return;
    mem[a] = v;
  };
  const cpu = new CPU(read, write);
  cpu.sp = 0xF0; cpu.push(0xFF); cpu.push(0xEF); cpu.pc = 0x0410;   // RTS -> $FFF0 = zurück zu BASIC
  const rts = () => { const lo = cpu.pop(), hi = cpu.pop(); cpu.pc = (((hi << 8) | lo) + 1) & 0xFFFF; };
  const fname = () => { const a = mem[0xDA] | mem[0xDB] << 8; return String.fromCharCode(...mem.subarray(a, a + mem[0xD1])); };

  function stub() {
    const pc = cpu.pc;
    switch (pc) {
      case 0xFFD2: {
        const c = cpu.a;
        if (ieee.chan !== null) {
          const f = ieee.files[ieee.chan];
          if (f.fa === ieee.present) { ieee.data += String.fromCharCode(c); if (c & 0x80 || c < 0x20) ieee.unexpected.push(c); }
          else mem[0x96] |= 0x80;
          cpu.x = trash; cpu.y = trash ^ 0xFF; trash = (trash * 5 + 1) & 0xFF;
        } else out += c === 13 ? "\n" : c >= 0x20 && c < 0x80 ? String.fromCharCode(c) : "";
        break;
      }
      case 0xFFCF: if (!input.length) return "wait"; cpu.a = input.shift(); break;   // Eingabezeile
      case 0xFFE4: cpu.a = keys.length ? keys.shift() : 0; cpu.z = cpu.a === 0 ? 1 : 0; break;
      case 0xFFE1: cpu.z = cpu.cycles > stopFrom && cpu.cycles < stopTo ? 1 : 0; break;
      case 0xAED0: fb.fill(0); gdp.ctrl1 = 0; break;
      // Diskette (BASIC-4-Routinen wie im Original-Loader)
      case 0xF4A5: dsk.file = disk[fname()] || null; dsk.pos = 0; dsk.loads.push({ name: fname(), fa: mem[0xD4], sa: mem[0xD3] }); break;
      case 0xF0D2: dsk.talk = true; break;
      case 0xF193: break;
      case 0xF1C0: {
        if (!dsk.file) { mem[0x96] |= 0x02; cpu.a = 0x0D; break; }      // nicht gefunden: Timeout
        cpu.a = dsk.file[dsk.pos++] ?? 0x0D;
        if (dsk.pos >= dsk.file.length) mem[0x96] |= 0x40;               // EOI beim letzten Byte
        break;
      }
      case 0xF1AE: dsk.talk = false; break;
      case 0xF0D5: case 0xF143: break;
      case 0xF1B9: dsk.closed++; break;
      case 0xF2A6: dsk.talk = false; break;
      // IEEE-Datei für den Plotter
      case 0xF563: { const f = { la: mem[0xD2], sa: mem[0xD3], fa: mem[0xD4], fnlen: mem[0xD1] }; ieee.files[f.la] = f; ieee.opens.push(f); break; }
      case 0xF2E0: ieee.closes.push(mem[0xD2]); delete ieee.files[mem[0xD2]]; break;
      case 0xFFC9: if (!ieee.files[cpu.x]) throw new Error("CHKOUT auf nicht geöffnete Datei " + cpu.x); ieee.chan = cpu.x; break;
      case 0xFFCC: ieee.chan = null; break;
      default: return false;
    }
    rts(); return true;
  }
  function run(maxSteps) {
    let idle = 0;
    for (let i = 0; i < maxSteps; i++) {
      if (cpu.pc === 0xFFF0) return "exit";
      const s = stub();
      if (s === "wait") return "input";
      if (!s) cpu.step();
      // Leerlauf = Warteschleife an der Frage (ASK2..ASKEND) ohne Taste und ohne STOP
      const inAsk = (cpu.pc >= sym.ASK2 && cpu.pc < sym.ASKEND) || cpu.pc === 0xFFE4 || cpu.pc === 0xFFE1;
      if (inAsk && !keys.length && !(cpu.cycles > stopFrom && cpu.cycles < stopTo)) { if (++idle > 2000) return "idle"; } else idle = 0;
    }
    return "steps";
  }
  return {
    cpu, mem, fb, gdp, ieee, dsk, get out() { return out; }, run,
    type(s) { for (const c of s) input.push(c.charCodeAt(0)); input.push(13); },
    key(...k) { keys.push(...k); }, setStop(from, to = Infinity) { stopFrom = from; stopTo = to; },
  };
}

const { parseHPGL, rasterFromHPGL, expected, diffCount, testImage, photoImage, lineArt, fmt, kringelRef, hatchRef, hpglToSVG, penStats } = require("./hpgl-sim");
let fails = 0;
const check = (name, cond, info) => { console.log(`${cond ? "OK  " : "FAIL"} ${name}${info ? " – " + info : ""}`); if (!cond) fails++; };
const bitsOf = (bytes, rows) => { const b = new Uint8Array(512 * rows); for (let i = 0; i < rows * 512; i++) b[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1; return b; };
const KEY_J = 0x4A, KEY_N = 0x4E, KEY_K = 0x4B, KEY_S = 0x53, CFG = { s: 14, x0: 1800, y0: 250 };

check("Einstellbytes an denselben Adressen wie HSGPLOT (1043–1056)",
  sym.CFG_DEV === 1043 && sym.CFG_SA === 1044 && sym.CFG_SCL === 1045 && sym.CFG_X0 === 1046 && sym.CFG_Y0 === 1048 && sym.CFG_INV === 1050 && sym.CFG_PEN === 1051 && sym.CFG_GAP === 1052 && sym.CFG_T === 1053);
console.log(`     direktplot.prg: $${asm.org.toString(16).toUpperCase()}-$${(asm.end - 1).toString(16).toUpperCase()}, ${PRG.length} Byte, Zeilenpuffer bis $${(sym.ROWBUF + 63).toString(16).toUpperCase()}`);

function loadAndShow(rows, opt = {}) {
  const img = testImage(rows, rows);
  const m = machine(rows, { BILD: img }, opt);
  const r0 = m.run(1_000_000);
  m.type("BILD");
  const r1 = m.run(200_000_000);
  return { m, img, r0, r1 };
}

for (const rows of [512, 256]) {
  const { m, img, r0, r1 } = loadAndShow(rows, { poke: [[1050, 0]] });   // 0 = helle Punkte zeichnen (Rahmen-Testbild)
  check(`${rows} Zeilen: Begrüßung und Dateiname-Abfrage wie im Original`, r0 === "input" && /DIREKTPLOT - HSG IMAGE LOADER \+ PLOTTER/.test(m.out) && /ENTER FILENAME \?/.test(m.out));
  check(`${rows} Zeilen: Datei geladen wie im Original (Gerät 8, SA $60) und Kanal geschlossen`, m.dsk.loads.length === 1 && m.dsk.loads[0].fa === 8 && m.dsk.loads[0].sa === 0x60 && m.dsk.closed === 1 && !m.dsk.talk);
  check(`${rows} Zeilen: Bild pixelgenau angezeigt`, diffCount(m.fb, bitsOf(img, rows)) === 0);
  check(`${rows} Zeilen: danach Frage „plotten? s=schraffur k=kringel p=punkte n=nein“`, r1 === "idle" && /PLOTTEN\? S=SCHRAFFUR K=KRINGEL P=PUNKTE N=NEIN/.test(m.out) && m.ieee.opens.length === 0);
  const fbBefore = Uint8Array.from(m.fb), c0 = m.cpu.cycles;
  m.key(KEY_J); const r2 = m.run(400_000_000);
  const cmds = parseHPGL(m.ieee.data), { r: ras, errors } = rasterFromHPGL(cmds, CFG);
  check(`${rows} Zeilen: J plottet, danach erneute Frage`, r2 === "idle" && /PLOTTE AUF GERAET 5/.test(m.out) && /PLOT FERTIG\n\nPLOTTEN\?/.test(m.out), JSON.stringify(m.out.slice(-80)));
  check(`${rows} Zeilen: Datei 124 an Gerät 5, SA 0, wieder geschlossen`, m.ieee.opens.length === 1 && m.ieee.opens[0].la === 124 && m.ieee.opens[0].fa === 5 && m.ieee.opens[0].sa === 0 && m.ieee.closes.join() === "124" && m.ieee.chan === null);
  check(`${rows} Zeilen: HP-GL IN;SP1; … PU;SP0;, nur ASCII`, m.ieee.data.startsWith("IN;SP1;") && m.ieee.data.endsWith("PU;SP0;") && m.ieee.unexpected.length === 0 && /^[A-Z0-9,;]*$/.test(m.ieee.data));
  check(`${rows} Zeilen: poke 1050,0: helle Punkte, Punkt für Punkt`, errors.length === 0 && diffCount(ras, expected(m.fb, rows, false)) === 0, `Abw. ${diffCount(ras, expected(m.fb, rows, false))}, ${errors.slice(0, 2)}`);
  check(`${rows} Zeilen: Lesemodus korrekt, Bild unverändert`, m.gdp.badRead === 0 && m.gdp.reads === (512) * 64 && m.gdp.mode === 0x11 && diffCount(m.fb, fbBefore) === 0);
  console.log(`     6502-Zeit für den Plot: ~${((m.cpu.cycles - c0) / 1e6).toFixed(1)} s, ${m.ieee.data.length} Byte HP-GL`);
  m.key(KEY_J); m.run(400_000_000);
  check(`${rows} Zeilen: zweites J plottet noch einmal`, m.ieee.opens.length === 2 && (m.out.match(/PLOT FERTIG/g) || []).length === 2);
  m.key(KEY_N);
  check(`${rows} Zeilen: N beendet, zurück zu BASIC`, m.run(1_000_000) === "exit" && m.gdp.ctrl1 === 0x02);
}

{ // N sofort
  const { m } = loadAndShow(256); m.key(KEY_N);
  check("N direkt nach dem Laden: Ende ohne Plot", m.run(1_000_000) === "exit" && m.ieee.opens.length === 0);
}
{ // Datei nicht vorhanden: Original-Verhalten
  const m = machine(256, {}); m.run(1_000_000); m.type("FEHLT");
  const r = m.run(5_000_000);
  check("Datei fehlt: Original-Meldung und neue Abfrage", r === "input" && /FILE NOT FOUND ERROR/.test(m.out) && (m.out.match(/ENTER FILENAME \?/g) || []).length === 2 && m.ieee.opens.length === 0);
  m.type("");
  check("Leere Eingabe beendet wie im Original", m.run(1_000_000) === "exit");
}
{ // kein Plotter
  const { m } = loadAndShow(256, { plotterAt: 99 }); m.key(KEY_J); const r = m.run(50_000_000);
  check("Kein Plotter: Meldung, Datei geschlossen, erneute Frage", r === "idle" && /PLOTTER ANTWORTET NICHT\n\nPLOTTEN\?/.test(m.out) && m.ieee.closes.join() === "124" && m.ieee.chan === null);
}
{ // STOP während des Plots
  const { m } = loadAndShow(512); m.key(KEY_J); m.setStop(m.cpu.cycles + 5_000_000, m.cpu.cycles + 5_200_000);
  const r = m.run(400_000_000);
  check("STOP im Plot: Abbruch, Stift abgelegt, erneute Frage", r === "idle" && /PLOT ABGEBROCHEN/.test(m.out) && m.ieee.data.endsWith("PU;SP0;") && m.ieee.closes.join() === "124" && /ABGEBROCHEN\n\nPLOTTEN\?/.test(m.out));
  m.setStop(m.cpu.cycles + 1000);
  check("STOP an der Frage beendet", m.run(1_000_000) === "exit");
}
{ // POKE-Einstellungen
  const { m } = loadAndShow(512, { plotterAt: 6, poke: [[1043, 6], [1044, 255], [1045, 7], [1046, 100], [1047, 0], [1048, 50], [1049, 0], [1051, 2]] });
  m.key(KEY_J); m.run(400_000_000);
  const { r: ras, errors } = rasterFromHPGL(parseHPGL(m.ieee.data), { s: 7, x0: 100, y0: 50 });
  check("POKE: Gerät 6, SA 255, Maßstab 7, Ränder, Stift 2, dunkle Punkte (Vorgabe)", m.ieee.opens[0].fa === 6 && m.ieee.opens[0].sa === 255 && m.ieee.data.startsWith("IN;SP2;") && errors.length === 0 && diffCount(ras, expected(m.fb, 512, true)) === 0);
}

// ---------------------------------------------------------------- Stiftbewegung messen (Foto, Strichzeichnung, Testbild)
function plotFile(rows, img, poke = [], key = KEY_J) {
  const m = machine(rows, { B: img }, { poke }); m.run(1_000_000); m.type("B"); m.run(200_000_000);
  const c0 = m.cpu.cycles; m.key(key); const r = m.run(900_000_000);
  return { m, r, secs: (m.cpu.cycles - c0) / 1e6 };
}
const GAP = Number(process.env.GAP || 0), SVGDIR = process.env.SVGDIR;
for (const [name, rows, img] of [["Foto (Atkinson)", 256, photoImage(256)], ["Foto (Atkinson)", 512, photoImage(512)], ["Strichzeichnung", 512, lineArt(512)], ["dichtes Testbild", 512, testImage(512, 3)], ["Foto BLUES512", 512, fs.readFileSync(path.join(__dirname, "blues512.bin"))]]) {
  for (const gap of GAP ? [0, GAP] : [0]) {
    const { m, r, secs } = plotFile(rows, img, gap ? [[1052, gap]] : []);
    const res = rasterFromHPGL(parseHPGL(m.ieee.data), CFG), d = diffCount(res.r, expected(m.fb, rows, true, gap));
    check(`Punkte: ${name} ${rows} Zeilen${gap ? ", Lücken bis " + gap : ""}: Plot = Erwartung`, r === "idle" && res.errors.length === 0 && d === 0, `Abw. ${d} ${res.errors.slice(0, 2)}`);
    console.log(`     ${fmt(res.m)}, 6502 ${secs.toFixed(0)} s, ${(m.ieee.data.length / 1024).toFixed(0)} KB HP-GL`);
    if (SVGDIR) fs.writeFileSync(path.join(SVGDIR, `punkte-${name.split(" ")[0]}-${rows}.svg`), hpglToSVG(m.ieee.data));
  }
  const { m, r, secs } = plotFile(rows, img, [], KEY_K);
  const ref = kringelRef(expected(m.fb, rows, true), { ...CFG, pen: 1 });
  let at = 0; while (at < ref.length && ref[at] === m.ieee.data[at]) at++;
  check(`Kringel: ${name} ${rows} Zeilen: HP-GL = Referenz, Byte für Byte`, r === "idle" && m.ieee.data === ref && /PLOT FERTIG\n\nPLOTTEN\?/.test(m.out),
    at < ref.length || ref.length !== m.ieee.data.length ? `ab Byte ${at}: 6502 "${m.ieee.data.slice(at, at + 40)}" / Ref "${ref.slice(at, at + 40)}"` : "");
  console.log(`     ${fmt(penStats(m.ieee.data))}, 6502 ${secs.toFixed(0)} s, ${(m.ieee.data.length / 1024).toFixed(0)} KB HP-GL`);
  if (SVGDIR) fs.writeFileSync(path.join(SVGDIR, `kringel-${name.split(" ")[0]}-${rows}.svg`), hpglToSVG(m.ieee.data));
  {
    const { m, r, secs } = plotFile(rows, img, [], KEY_S);
    const ref = hatchRef(expected(m.fb, rows, true), { ...CFG, pen: 1 });
    let at = 0; while (at < ref.length && ref[at] === m.ieee.data[at]) at++;
    check(`Schraffur: ${name} ${rows} Zeilen: HP-GL = Referenz, Byte für Byte`, r === "idle" && m.ieee.data === ref && /PLOT FERTIG\n\nPLOTTEN\?/.test(m.out),
      at < ref.length || ref.length !== m.ieee.data.length ? `ab Byte ${at}: 6502 "${m.ieee.data.slice(at, at + 40)}" / Ref "${ref.slice(at, at + 40)}"` : "");
    console.log(`     ${fmt(penStats(m.ieee.data))}, 6502 ${secs.toFixed(0)} s, ${(m.ieee.data.length / 1024).toFixed(0)} KB HP-GL`);
    if (SVGDIR) fs.writeFileSync(path.join(SVGDIR, `schraffur-${name.split(" ")[0]}-${rows}.svg`), hpglToSVG(m.ieee.data));
  }
}
{ // Kringel mit POKE-Einstellungen (Maßstab 7, Ränder, Negativ, Stift 3) und STOP-Abbruch
  const img = photoImage(512);
  const { m } = plotFile(512, img, [[1045, 7], [1046, 100], [1047, 0], [1048, 50], [1049, 0], [1050, 0], [1051, 3]], KEY_K);
  check("Kringel mit Maßstab 7, Rändern, poke 1050,0, Stift 3 = Referenz", m.ieee.data === kringelRef(expected(m.fb, 512, false), { s: 7, x0: 100, y0: 50, pen: 3 }));
  const m2 = machine(512, { B: img }); m2.run(1_000_000); m2.type("B"); m2.run(200_000_000);
  m2.key(KEY_K); m2.setStop(m2.cpu.cycles + 8_000_000, m2.cpu.cycles + 8_200_000); const r = m2.run(900_000_000);
  const full = kringelRef(expected(m2.fb, 512, true), { ...CFG, pen: 1 }), cut = m2.ieee.data.slice(0, -"PU;SP0;".length);
  check("Kringel: STOP bricht ab, PU;SP0; am Ende, erneute Frage", r === "idle" && /PLOT ABGEBROCHEN\n\nPLOTTEN\?/.test(m2.out) && m2.ieee.data.endsWith("PU;SP0;") && full.startsWith(cut) && cut.length < full.length - 100,
    `Ende ${r}, ${JSON.stringify(m2.out.slice(-60))}, gesendet ${cut.length} von ${full.length}, Präfix ${full.startsWith(cut)}`);
}

{ // Schraffur mit POKE (Schwellen, Maßstab, Ränder, Stift) und STOP
  const img = photoImage(512);
  const { m } = plotFile(512, img, [[1045, 7], [1046, 100], [1047, 0], [1048, 50], [1049, 0], [1051, 3], [1053, 1], [1054, 3], [1055, 6], [1056, 9]], KEY_S);
  check("Schraffur mit Schwellen 1/3/6/9, Maßstab 7, Rändern, Stift 3 = Referenz", m.ieee.data === hatchRef(expected(m.fb, 512, true), { s: 7, x0: 100, y0: 50, pen: 3 }, [1, 3, 6, 9]));
  const m2 = machine(512, { B: img }); m2.run(1_000_000); m2.type("B"); m2.run(200_000_000);
  m2.key(KEY_S); m2.setStop(m2.cpu.cycles + 30_000_000, m2.cpu.cycles + 30_200_000); const r = m2.run(1_500_000_000);
  const full = hatchRef(expected(m2.fb, 512, true), { ...CFG, pen: 1 }), cut = m2.ieee.data.slice(0, -"PU;SP0;".length);
  check("Schraffur: STOP bricht ab, PU;SP0; am Ende, erneute Frage", r === "idle" && /PLOT ABGEBROCHEN\n\nPLOTTEN\?/.test(m2.out) && m2.ieee.data.endsWith("PU;SP0;") && full.startsWith(cut) && cut.length < full.length - 100,
    `Ende ${r}, ${JSON.stringify(m2.out.slice(-60))}, gesendet ${cut.length} von ${full.length}, Präfix ${full.startsWith(cut)}`);
}

console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : "\nAlle Tests bestanden");
process.exit(fails ? 1 : 0);
