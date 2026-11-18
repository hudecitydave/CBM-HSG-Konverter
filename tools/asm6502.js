#!/usr/bin/env node
// Minimaler 6502-Assembler für die ACME-Teilmenge, die hsgser.asm benutzt.
// Unterstützt: Labels, NAME = expr, * = addr, !to (ignoriert), !byte, !pet,
// Adressierungsarten imp/acc/#imm/zp/abs/zp,x/abs,x/abs,y/(zp),y/(zp,x)/(abs)/rel,
// Ausdrücke mit $hex, %bin, dezimal, 'c', Labels, + - * / & | und < > (Low/High-Byte).
// Ausgabe: PRG mit 2-Byte-Ladeadresse.  Aufruf: node asm6502.js quelle.asm ziel.prg
"use strict";
const fs = require("fs");

const OPS = {
  ADC:{imm:0x69,zp:0x65,zpx:0x75,abs:0x6D,abx:0x7D,aby:0x79,izx:0x61,izy:0x71},
  AND:{imm:0x29,zp:0x25,zpx:0x35,abs:0x2D,abx:0x3D,aby:0x39,izx:0x21,izy:0x31},
  ASL:{acc:0x0A,zp:0x06,zpx:0x16,abs:0x0E,abx:0x1E},
  BIT:{zp:0x24,abs:0x2C},
  BPL:{rel:0x10},BMI:{rel:0x30},BVC:{rel:0x50},BVS:{rel:0x70},BCC:{rel:0x90},BCS:{rel:0xB0},BNE:{rel:0xD0},BEQ:{rel:0xF0},
  BRK:{imp:0x00},
  CMP:{imm:0xC9,zp:0xC5,zpx:0xD5,abs:0xCD,abx:0xDD,aby:0xD9,izx:0xC1,izy:0xD1},
  CPX:{imm:0xE0,zp:0xE4,abs:0xEC},CPY:{imm:0xC0,zp:0xC4,abs:0xCC},
  DEC:{zp:0xC6,zpx:0xD6,abs:0xCE,abx:0xDE},
  EOR:{imm:0x49,zp:0x45,zpx:0x55,abs:0x4D,abx:0x5D,aby:0x59,izx:0x41,izy:0x51},
  CLC:{imp:0x18},SEC:{imp:0x38},CLI:{imp:0x58},SEI:{imp:0x78},CLV:{imp:0xB8},CLD:{imp:0xD8},SED:{imp:0xF8},
  INC:{zp:0xE6,zpx:0xF6,abs:0xEE,abx:0xFE},
  JMP:{abs:0x4C,ind:0x6C},JSR:{abs:0x20},
  LDA:{imm:0xA9,zp:0xA5,zpx:0xB5,abs:0xAD,abx:0xBD,aby:0xB9,izx:0xA1,izy:0xB1},
  LDX:{imm:0xA2,zp:0xA6,zpy:0xB6,abs:0xAE,aby:0xBE},
  LDY:{imm:0xA0,zp:0xA4,zpx:0xB4,abs:0xAC,abx:0xBC},
  LSR:{acc:0x4A,zp:0x46,zpx:0x56,abs:0x4E,abx:0x5E},
  NOP:{imp:0xEA},
  ORA:{imm:0x09,zp:0x05,zpx:0x15,abs:0x0D,abx:0x1D,aby:0x19,izx:0x01,izy:0x11},
  TAX:{imp:0xAA},TXA:{imp:0x8A},DEX:{imp:0xCA},INX:{imp:0xE8},TAY:{imp:0xA8},TYA:{imp:0x98},DEY:{imp:0x88},INY:{imp:0xC8},
  ROL:{acc:0x2A,zp:0x26,zpx:0x36,abs:0x2E,abx:0x3E},
  ROR:{acc:0x6A,zp:0x66,zpx:0x76,abs:0x6E,abx:0x7E},
  RTI:{imp:0x40},RTS:{imp:0x60},
  SBC:{imm:0xE9,zp:0xE5,zpx:0xF5,abs:0xED,abx:0xFD,aby:0xF9,izx:0xE1,izy:0xF1},
  STA:{zp:0x85,zpx:0x95,abs:0x8D,abx:0x9D,aby:0x99,izx:0x81,izy:0x91},
  STX:{zp:0x86,zpy:0x96,abs:0x8E},STY:{zp:0x84,zpx:0x94,abs:0x8C},
  TXS:{imp:0x9A},TSX:{imp:0xBA},PHA:{imp:0x48},PLA:{imp:0x68},PHP:{imp:0x08},PLP:{imp:0x28},
};
const SIZE = {imp:1,acc:1,imm:2,zp:2,zpx:2,zpy:2,izx:2,izy:2,rel:2,abs:3,abx:3,aby:3,ind:3};

function petscii(str) {
  const out = [];
  for (const ch of str) {
    const c = ch.charCodeAt(0);
    if (c >= 0x61 && c <= 0x7A) out.push(c - 0x20);       // a-z -> $41-$5A
    else if (c >= 0x41 && c <= 0x5A) out.push(c + 0x80);  // A-Z -> $C1-$DA
    else out.push(c);
  }
  return out;
}

function assemble(src, file) {
  const lines = src.split(/\r?\n/);
  const sym = Object.create(null);
  let out, pc, org;

  function evalExpr(e, pass, line) {
    e = e.trim();
    // Tokenizer
    const toks = e.match(/\$[0-9a-fA-F]+|%[01]+|\d+|'.'|[A-Za-z_][A-Za-z0-9_]*|\*|[-+*/&|<>()]/g) || [];
    let i = 0;
    const peek = () => toks[i], next = () => toks[i++];
    function prim() {
      const t = next();
      if (t === undefined) throw new Error("Ausdruck unvollständig");
      if (t === "<") return prim() & 0xFF;
      if (t === ">") return (prim() >> 8) & 0xFF;
      if (t === "-") return -prim();
      if (t === "(") { const v = expr(); if (next() !== ")") throw new Error("')' fehlt"); return v; }
      if (t === "*") return pc;
      if (t[0] === "$") return parseInt(t.slice(1), 16);
      if (t[0] === "%") return parseInt(t.slice(1), 2);
      if (t[0] === "'") return t.charCodeAt(1);
      if (/^\d/.test(t)) return parseInt(t, 10);
      if (t in sym) return sym[t];
      if (pass === 1) return NaN;
      throw new Error(`Unbekanntes Symbol '${t}'`);
    }
    function term() { let v = prim(); while (peek() === "*" || peek() === "/") { const o = next(), w = prim(); v = o === "*" ? v * w : Math.floor(v / w); } return v; }
    function expr() { let v = term(); while (["+", "-", "&", "|"].includes(peek())) { const o = next(), w = term(); v = o === "+" ? v + w : o === "-" ? v - w : o === "&" ? v & w : v | w; } return v; }
    const v = expr();
    if (i !== toks.length) throw new Error(`Ausdruck nicht verstanden: ${e}`);
    return v;
  }

  const modeCache = new Map(); // Zeilennr -> gewählte Adressierungsart (in Pass 1 festgelegt)
  for (const pass of [1, 2]) {
    out = []; pc = 0; org = null;
    lines.forEach((raw, ln) => {
      const where = `${file}:${ln + 1}`;
      try {
        let line = raw.replace(/;.*$/, "");
        // Strings vor dem Kommentar-Strip schützen (!pet "a;b")
        const strm = raw.match(/^([^;"]*"[^"]*")/);
        if (strm) line = raw.slice(0, raw.indexOf('"', raw.indexOf('"') + 1) + 1) + raw.slice(raw.indexOf('"', raw.indexOf('"') + 1) + 1).replace(/;.*$/, "");
        line = line.trim();
        if (!line) return;
        let m;
        if ((m = line.match(/^\*\s*=\s*(.+)$/))) { pc = evalExpr(m[1], 2); if (org === null) org = pc; return; }
        if ((m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/))) { const v = evalExpr(m[2], pass); if (!isNaN(v)) sym[m[1]] = v; return; }
        if ((m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):?(\s+|$)(.*)$/)) && !(m[1].toUpperCase() in OPS && !line.match(/^[A-Za-z_][A-Za-z0-9_]*:/))) {
          if (pass === 1 && m[1] in sym) throw new Error(`Label doppelt: ${m[1]}`);
          sym[m[1]] = pc; line = m[3].trim(); if (!line) return;
        }
        if ((m = line.match(/^!to\b/i))) return;
        if ((m = line.match(/^!(byte|by)\s+(.+)$/i))) {
          for (const p of m[2].split(",")) { const v = evalExpr(p, pass); out.push({ pc, v: v & 0xFF }); pc++; }
          return;
        }
        if ((m = line.match(/^!pet\s+"([^"]*)"\s*$/i))) { for (const b of petscii(m[1])) { out.push({ pc, v: b }); pc++; } return; }
        if ((m = line.match(/^([A-Za-z]{3})\b\s*(.*)$/))) {
          const mn = m[1].toUpperCase(), arg = m[2].trim(), op = OPS[mn];
          if (!op) throw new Error(`Unbekannter Befehl ${mn}`);
          let mode, ex = null;
          if (!arg) mode = op.imp !== undefined ? "imp" : "acc";
          else if (/^a$/i.test(arg) && op.acc !== undefined) mode = "acc";
          else if (arg[0] === "#") { mode = "imm"; ex = arg.slice(1); }
          else if ((m = arg.match(/^\((.+),\s*x\)$/i))) { mode = "izx"; ex = m[1]; }
          else if ((m = arg.match(/^\((.+)\),\s*y$/i))) { mode = "izy"; ex = m[1]; }
          else if ((m = arg.match(/^\((.+)\)$/))) { mode = "ind"; ex = m[1]; }
          else if (op.rel !== undefined) { mode = "rel"; ex = arg; }
          else {
            let idx = "";
            if ((m = arg.match(/^(.+),\s*([xy])$/i))) { ex = m[1]; idx = m[2].toLowerCase(); } else ex = arg;
            if (modeCache.has(ln)) mode = modeCache.get(ln);
            else {
              const v = evalExpr(ex, 1);
              const zpOk = !isNaN(v) && v >= 0 && v < 256;
              const zpm = idx === "x" ? "zpx" : idx === "y" ? "zpy" : "zp", abm = idx === "x" ? "abx" : idx === "y" ? "aby" : "abs";
              mode = zpOk && op[zpm] !== undefined ? zpm : abm;
              modeCache.set(ln, mode);
            }
          }
          if (op[mode] === undefined) throw new Error(`${mn}: Adressierungsart ${mode} gibt es nicht`);
          const bytes = [op[mode]];
          if (mode !== "imp" && mode !== "acc") {
            let v = evalExpr(ex, pass);
            if (pass === 2) {
              if (mode === "rel") { v = v - (pc + 2); if (v < -128 || v > 127) throw new Error(`Sprungweite ${v} zu groß`); bytes.push(v & 0xFF); }
              else if (SIZE[mode] === 2) { if (v < 0 || v > 255) throw new Error(`Wert ${v} passt nicht in ein Byte`); bytes.push(v); }
              else { if (v < 0 || v > 0xFFFF) throw new Error(`Adresse ${v} ungültig`); bytes.push(v & 0xFF, v >> 8); }
            } else while (bytes.length < SIZE[mode]) bytes.push(0);
          }
          for (const b of bytes) { out.push({ pc, v: b }); pc++; }
          return;
        }
        throw new Error(`Zeile nicht verstanden: ${line}`);
      } catch (err) { throw new Error(`${where}: ${err.message}`); }
    });
  }
  const end = Math.max(...out.map(o => o.pc)) + 1;
  const img = new Uint8Array(end - org + 2);
  img[0] = org & 0xFF; img[1] = org >> 8;
  for (const o of out) img[o.pc - org + 2] = o.v;
  return { prg: img, sym, org, end };
}

module.exports = { assemble, OPS, SIZE };
if (require.main === module) {
  const [src, dst] = process.argv.slice(2);
  if (!src || !dst) { console.error("Aufruf: node asm6502.js quelle.asm ziel.prg"); process.exit(1); }
  const r = assemble(fs.readFileSync(src, "latin1"), src);
  fs.writeFileSync(dst, r.prg);
  console.log(`${dst}: $${r.org.toString(16).toUpperCase()}-$${(r.end - 1).toString(16).toUpperCase()}, ${r.prg.length} Byte (inkl. Ladeadresse)`);
}
