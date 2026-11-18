// Kleiner 6502-Emulator (dokumentierte Befehle, Binärmodus) für Tests von hsgser.prg.
"use strict";
const { OPS } = require("./asm6502");

const DECODE = new Array(256);
for (const [mn, modes] of Object.entries(OPS)) for (const [mode, op] of Object.entries(modes)) DECODE[op] = [mn, mode];

class CPU {
  constructor(read, write) {
    this.read = read; this.write = write;
    this.a = 0; this.x = 0; this.y = 0; this.sp = 0xFF; this.pc = 0;
    this.c = 0; this.z = 0; this.i = 1; this.d = 0; this.v = 0; this.n = 0;
    this.cycles = 0;
  }
  rd16(a) { return this.read(a) | (this.read((a + 1) & 0xFFFF) << 8); }
  push(v) { this.write(0x100 + this.sp, v & 0xFF); this.sp = (this.sp - 1) & 0xFF; }
  pop() { this.sp = (this.sp + 1) & 0xFF; return this.read(0x100 + this.sp); }
  get p() { return (this.n << 7) | (this.v << 6) | 0x20 | 0x10 | (this.d << 3) | (this.i << 2) | (this.z << 1) | this.c; }
  set p(v) { this.n = (v >> 7) & 1; this.v = (v >> 6) & 1; this.d = (v >> 3) & 1; this.i = (v >> 2) & 1; this.z = (v >> 1) & 1; this.c = v & 1; }
  nz(v) { v &= 0xFF; this.z = v === 0 ? 1 : 0; this.n = v >> 7; return v; }
  step() {
    const op = this.read(this.pc), dec = DECODE[op];
    if (!dec) throw new Error(`Unbekannter Opcode $${op.toString(16)} bei $${this.pc.toString(16)}`);
    const [mn, mode] = dec; const pc0 = this.pc;
    let addr = null, val;
    const b1 = this.read((pc0 + 1) & 0xFFFF), w = this.rd16((pc0 + 1) & 0xFFFF);
    switch (mode) {
      case "imp": case "acc": this.pc += 1; break;
      case "imm": addr = pc0 + 1; this.pc += 2; break;
      case "zp": addr = b1; this.pc += 2; break;
      case "zpx": addr = (b1 + this.x) & 0xFF; this.pc += 2; break;
      case "zpy": addr = (b1 + this.y) & 0xFF; this.pc += 2; break;
      case "izx": { const z = (b1 + this.x) & 0xFF; addr = this.read(z) | (this.read((z + 1) & 0xFF) << 8); this.pc += 2; break; }
      case "izy": addr = ((this.read(b1) | (this.read((b1 + 1) & 0xFF) << 8)) + this.y) & 0xFFFF; this.pc += 2; break;
      case "abs": addr = w; this.pc += 3; break;
      case "abx": addr = (w + this.x) & 0xFFFF; this.pc += 3; break;
      case "aby": addr = (w + this.y) & 0xFFFF; this.pc += 3; break;
      case "ind": addr = this.rd16(w); this.pc += 3; break;
      case "rel": addr = (this.pc + 2 + ((b1 << 24) >> 24)) & 0xFFFF; this.pc += 2; break;
    }
    this.pc &= 0xFFFF;
    // Taktzahl näherungsweise (ohne Seitenwechsel-Zuschläge)
    const RMW = ["ASL", "LSR", "ROL", "ROR", "INC", "DEC"].includes(mn);
    this.cycles += mn === "JSR" || mn === "RTS" || mn === "RTI" ? 6 : mn === "PHA" || mn === "PHP" ? 3 : mn === "PLA" || mn === "PLP" ? 4 :
      mode === "rel" ? 3 : mode === "imp" || mode === "acc" || mode === "imm" ? 2 : mode === "zp" ? (RMW ? 5 : 3) :
      mode === "abs" || mode === "abx" || mode === "aby" ? (RMW ? 6 : mn === "JMP" ? 3 : 4) : 5;
    const ld = () => this.read(addr);
    const rmw = f => { if (mode === "acc") this.a = f(this.a); else { const r = f(this.read(addr)); this.write(addr, r); } };
    const br = cond => { if (cond) this.pc = addr; };
    const adc = v => { const s = this.a + v + this.c; this.v = (~(this.a ^ v) & (this.a ^ s) & 0x80) ? 1 : 0; this.c = s > 0xFF ? 1 : 0; this.a = this.nz(s); };
    const cmp = (r, v) => { const t = r - v; this.c = t >= 0 ? 1 : 0; this.nz(t); };
    switch (mn) {
      case "LDA": this.a = this.nz(ld()); break;
      case "LDX": this.x = this.nz(ld()); break;
      case "LDY": this.y = this.nz(ld()); break;
      case "STA": this.write(addr, this.a); break;
      case "STX": this.write(addr, this.x); break;
      case "STY": this.write(addr, this.y); break;
      case "ADC": adc(ld()); break;
      case "SBC": adc(ld() ^ 0xFF); break;
      case "AND": this.a = this.nz(this.a & ld()); break;
      case "ORA": this.a = this.nz(this.a | ld()); break;
      case "EOR": this.a = this.nz(this.a ^ ld()); break;
      case "CMP": cmp(this.a, ld()); break;
      case "CPX": cmp(this.x, ld()); break;
      case "CPY": cmp(this.y, ld()); break;
      case "BIT": { const v = ld(); this.z = (this.a & v) ? 0 : 1; this.n = v >> 7; this.v = (v >> 6) & 1; break; }
      case "ASL": rmw(v => { this.c = v >> 7; return this.nz(v << 1); }); break;
      case "LSR": rmw(v => { this.c = v & 1; return this.nz(v >> 1); }); break;
      case "ROL": rmw(v => { const c = this.c; this.c = v >> 7; return this.nz((v << 1) | c); }); break;
      case "ROR": rmw(v => { const c = this.c; this.c = v & 1; return this.nz((v >> 1) | (c << 7)); }); break;
      case "INC": rmw(v => this.nz(v + 1)); break;
      case "DEC": rmw(v => this.nz(v - 1)); break;
      case "INX": this.x = this.nz(this.x + 1); break;
      case "INY": this.y = this.nz(this.y + 1); break;
      case "DEX": this.x = this.nz(this.x - 1); break;
      case "DEY": this.y = this.nz(this.y - 1); break;
      case "TAX": this.x = this.nz(this.a); break;
      case "TXA": this.a = this.nz(this.x); break;
      case "TAY": this.y = this.nz(this.a); break;
      case "TYA": this.a = this.nz(this.y); break;
      case "TSX": this.x = this.nz(this.sp); break;
      case "TXS": this.sp = this.x; break;
      case "PHA": this.push(this.a); break;
      case "PLA": this.a = this.nz(this.pop()); break;
      case "PHP": this.push(this.p); break;
      case "PLP": this.p = this.pop(); break;
      case "CLC": this.c = 0; break; case "SEC": this.c = 1; break;
      case "CLI": this.i = 0; break; case "SEI": this.i = 1; break;
      case "CLV": this.v = 0; break; case "CLD": this.d = 0; break; case "SED": this.d = 1; break;
      case "BPL": br(!this.n); break; case "BMI": br(this.n); break;
      case "BVC": br(!this.v); break; case "BVS": br(this.v); break;
      case "BCC": br(!this.c); break; case "BCS": br(this.c); break;
      case "BNE": br(!this.z); break; case "BEQ": br(this.z); break;
      case "JMP": this.pc = addr; break;
      case "JSR": { const r = (pc0 + 2) & 0xFFFF; this.push(r >> 8); this.push(r); this.pc = addr; break; }
      case "RTS": { const lo = this.pop(), hi = this.pop(); this.pc = (((hi << 8) | lo) + 1) & 0xFFFF; break; }
      case "RTI": { this.p = this.pop(); const lo = this.pop(), hi = this.pop(); this.pc = (hi << 8) | lo; break; }
      case "NOP": break;
      case "BRK": throw new Error(`BRK bei $${pc0.toString(16)}`);
      default: throw new Error(`Nicht implementiert: ${mn}`);
    }
  }
}
module.exports = { CPU };
