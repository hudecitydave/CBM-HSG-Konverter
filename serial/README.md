# HSG-Link: Bilder aus dem Browser direkt aufs HSG-Board

```
Browser (hsg-converter.html, Chrome/Edge, Web Serial)
   │ USB
   ▼
Arduino Pro Micro 5 V / 16 MHz  ── Sketch HSGLink/HSGLink.ino
   │ 8 Daten + Strobe + Quittung + GND, parallel
   ▼
Userport CBM 8032 (VIA 6522, $E840)
   │
   ▼
Viewer HSGSER (hsgser.prg)  →  HSG-Board (EF9365/EF9366)  →  Monitor
```

## Dateien

| Datei | Inhalt |
|---|---|
| `hsgser.asm` | Quelltext des Viewers (ACME-Syntax, baut auf `hsgimage.asm` auf) |
| `hsgser.prg` | fertig assemblierter Viewer, 875 Byte, Start `$0410` (`SYS 1040`) |
| `hsgser.d64` | Disk „HSG-LINK“ mit HSGSER und HSGIMAGE, für die SD-Karte der 9096. Neu bauen mit `node tools/make-d64.js` |
| `HSGLink/HSGLink.ino` | Sketch für den Pro Micro |
| `../tools/asm6502.js` | kleiner Assembler: `node tools/asm6502.js serial/hsgser.asm serial/hsgser.prg` |
| `../tools/test-hsgser.js` | Emulationstest: 6502 + VIA + EF936x + Pro Micro, `node tools/test-hsgser.js` |

Der Konverter enthält `hsgser.prg` bereits und legt ihn auf Wunsch zusammen mit HSGIMAGE in jedes neue D64.

## Einkaufsliste

Alle Links wurden am **09.11.2026** einzeln aufgerufen. Geprüft wurden Erreichbarkeit, Lagerstand und Preis. Alle Shops bzw. eBay-Verkäufer sitzen in Deutschland. Preise inkl. MwSt., zzgl. Versand.

**Bestellung 1: BerryBase** (alles außer dem Userport-Stecker, ein Paket)

| Anzahl | Teil | Artikel | Preis | Lager |
|---|---|---|---|---|
| 1 | **Pro Micro, ATmega32U4, 5 V / 16 MHz**, Micro-USB-Kabel liegt bei | [BerryBase CH-APROMIC](https://www.berrybase.de/en/compatible-arduino-pro-micro-with-atmel-mega-32u4-processor) | 8,90 € | 100+, 1–3 Tage |
| 10 | **Metallschichtwiderstand 470 Ω, ¼ W, 1 %** | [BerryBase MSW470R.25](https://www.berrybase.de/metallschichtwiderstand-470-0-ohm-1-4w-1-0207-axial-durchsteckmontage) | 0,05 €/Stk. | 100+, 1–3 Tage |
| 1 | **Dupont-Kabelset 20 cm** (je 40 × F-F, M-M, F-M). F-M-Adern abschneiden: Buchsenende auf den Pro Micro, offenes Ende an Widerstand und Stecker löten | [BerryBase DUPK-SET-20](https://www.berrybase.de/40pin-jumper-dupont-kabel-set-je-1x-f-f-m-m-f-m-20cm) | 4,90 € | 100+, 1–3 Tage |

**Bestellung 2: Userport-Stecker** (2 × 12 = 24 Kontakte, Raster 3,96 mm, gleiche Bauform wie beim C64-Userport). Eins der drei Angebote genügt:

| Angebot | Verkäufer, Standort | Preis | Lager |
|---|---|---|---|
| [Kartenstecker 24pol (2x12) z. B. für C64 Userport](https://www.ebay.de/itm/332402291824) | sherlocks-technikshop, Frankfurt/Main | 4,95 € + 3,50 € Brief | 47 verfügbar, 523 verkauft |
| [USERPORT Stecker … Kartenstecker 2x12 Pol](https://www.ebay.de/itm/317391256073) | retroelectronico, Baden-Württemberg | 4,89 € + 4,50 € | 8 verfügbar |
| [FaszinationC64: 5 × Userport-Stecker, Neuware](https://www.ebay.de/itm/168158079306) | faszinationc64_bustronix, Deutschland | 19,64 €, versandkostenfrei | – |

Optional: [5 Codier-Plättchen für Kartenstecker](https://www.ebay.de/itm/197742765294) (Kassel, 1,90 € + 1,30 €, 4 verfügbar). Sie schützen vor dem Verpolen. Beim PET sitzt die Kodierung zwischen Kontakt 1-2 und 10-11.

**Alternativen für den Pro Micro**, ebenfalls am 09.11.2026 lagernd:
- [Reichelt: JOY-IT ARD PRO-MICRO, 5 V / 16 MHz, Micro-USB](https://www.reichelt.com/de/en/shop/product/arduino-compatible_micro_pro_board_atmega32u4_microusb-330660): 8,75 €, auf Lager, 1–2 Werktage. Ohne USB-Kabel.
- [Eckstein: Pro Micro 5 V / 16 MHz, USB-C](https://eckstein-shop.de/5V-16MHz-ATmega32U4-Board-Type-C-Compatible-with-Arduino-Pro-Micro-EN): 12,95 €, auf Lager, ca. 1–3 Tage. Ohne USB-Kabel.

**Nicht lieferbar** (am 09.11.2026 geprüft): Polyplay „Userport-Stecker Commodore (24 Pin, blau)“, Makershop Pro Micro 5 V, BerryBase SparkFun Pro Micro.

Eine Platine ist nicht nötig. Die Widerstände lötest du direkt in die Leitungen und isolierst sie mit Schrumpfschlauch oder Isolierband aus dem Vorrat.

## Verdrahtung

**Grafischer Lötplan zum Ausdrucken:** [verdrahtung.html](verdrahtung.html). Er enthält Plan, Tabelle zum Abhaken, Arbeitsschritte und einen Test, mit dem du Kontakt A am CBM bestimmst.

Der Userport ist die Platinenkante hinten am CBM. Benutzt wird nur die **untere Reihe** (Buchstaben). Die Belegung ist am **8032-Schaltplan 8032029, Blatt 3 („Cassette & Keyboard“)** geprüft, Stecker J2 „USER PORT“ am VIA UB15 (6522): B = CA1, C…L = PA0…PA7, M = CB2, A/N/1/12 = GND ([Schaltpläne bei zimmers.net](https://www.zimmers.net/anonftp/pub/cbm/schematics/computers/pet/8032/index.html)). Der Schaltplan zeigt nicht, auf welcher Seite der Platinenkante A liegt. **Von hinten auf den Rechner gesehen liegen 1 und A links.** Das steht bei Olaf Seibert, „PIA and VIA info (PET)“ („rear view for IEEE and User port“, [patpend.net](https://patpend.net/technical/pet8032/PETio.doc.txt)), und in [Compute! Nr. 19](https://www.atarimagazines.com/compute/issue19/PET_To_PET_Communication_Over_The_User_Port.php). Compute! nennt dazu die Codierschlitze zwischen A/B und L/M. Links liegt also ein Kontakt außerhalb des Schlitzes, rechts liegen zwei. Das Foto der Rückseite des 8032-32 B zeigt genau dieses Muster an der **mittleren Platinenkante**. Das ist der Userport. Rechts daneben steckt der IEEE-488-Stecker zur Floppy bzw. 9096, beide bleiben gleichzeitig angeschlossen. Der Lötplan zeigt das als Bild. Ein optionaler Messtest bestätigt es am Gerät.

| Pro Micro | 470 Ω | Userport | Signal | Richtung |
|---|---|---|---|---|
| 2 | ✓ | C | PA0 | → CBM |
| 3 | ✓ | D | PA1 | → CBM |
| 4 | ✓ | E | PA2 | → CBM |
| 5 | ✓ | F | PA3 | → CBM |
| 6 | ✓ | H | PA4 | → CBM |
| 7 | ✓ | J | PA5 | → CBM |
| 8 | ✓ | K | PA6 | → CBM |
| 9 | ✓ | L | PA7 | → CBM |
| 10 | ✓ | B | CA1 (Strobe) | → CBM |
| 16 | ✓ | M | CB2 (Quittung) | ← CBM |
| GND | – | A und N | Masse | – |

Der Pro Micro bekommt seinen Strom über USB. **Die 5-V-Leitung des Userports nicht anschließen.** Die Widerstände schützen beide Seiten, falls ein anderes Programm am CBM Port A als Ausgang schaltet.

## Pro Micro programmieren

1. Arduino IDE → Board **„Arduino Leonardo“** wählen (der Pro Micro verwendet denselben Bootloader).
2. `HSGLink/HSGLink.ino` öffnen und hochladen. Erkennt die IDE den Port nicht: kurz vor dem Hochladen RST zweimal schnell gegen GND tippen.
3. Test im Seriellen Monitor: Nach dem Öffnen erscheint `HSGLINK 1.0`.

Kommandozeile (`compile` mit dem installierten arduino-cli geprüft, `upload` nicht, weil kein Board angeschlossen war):

```
arduino-cli compile --fqbn arduino:avr:leonardo HSGLink
arduino-cli upload  --fqbn arduino:avr:leonardo -p COMx HSGLink
```

## Benutzung

1. `hsgser.d64` auf die 9096 mounten. Am CBM: `sys 40960`, dann `load "hsgser",8`, dann `run`. Es erscheint „HSGSER – HSG-LINK EMPFAENGER“.
2. Konverter in **Chrome oder Edge** öffnen. Rechts bei **HSG-Link** auf **Verbinden …** klicken und den Pro Micro wählen. Es erscheint „HSGLINK 1.0 bereit“.
3. Bild hineinziehen und **Bild senden** klicken. Mit **Live** werden spätere Änderungen automatisch geschickt. Bei kleinen Änderungen wird nur das geänderte Rechteck übertragen.
4. **Taste D oder LEER** am CBM schaltet die Grafik zusätzlich auf den eingebauten Bildschirm und wieder zurück auf Text. Das nutzt die ROM-Routine DISPLAY ($AEDC) und geht nur, wenn der HSG-Umschalter in **Mittelstellung** steht (Handbuch Abschnitt 3.1.3). Der externe Monitor zeigt die Grafik immer. Das Zurückschalten auf Text dauert etwa 3 s, bis der Monitor wieder synchronisiert ist. Beim Beenden schaltet HSGSER automatisch auf Text.
5. **Löschen** leert den HSG-Bildschirm, **Viewer beenden** kehrt zu BASIC zurück. Am CBM bricht STOP jederzeit ab.

Meldet der Konverter „Der CBM quittiert nicht“: HSGSER läuft nicht, das Kabel sitzt falsch, oder CA1/CB2 sind vertauscht.

## Protokoll

Jeder Rahmen hat die Form `"H" "S" "G" <Befehl> <Kopf> <Daten> <Prüfsumme>`. Die Prüfsumme ist die Summe von Kopf und Daten modulo 256. 16-Bit-Werte stehen mit dem Low-Byte zuerst. Bitfolge: MSB = linkes Pixel, Zeile 0 = oben.

| Befehl | Kopf | Daten | Wirkung |
|---|---|---|---|
| `I` | Zeilen (16) | Zeilen × 64 Byte | Bildschirm löschen, gesetzte Bits zeichnen |
| `P` | Spalte (8, 0–63), Zeile (16), Breite (8, 1–64), Höhe (16) | Breite × Höhe Byte | Rechteck setzen **und** radieren |
| `C` | – | – | Bildschirm löschen |
| `Q` | – | – | Viewer beenden |

Handshake je Byte: Der Pro Micro legt das Byte an PA0–7 an und erzeugt eine fallende Flanke an CA1. HSGSER liest `$E841` (das löscht das CA1-Flag) und schaltet CB2 um. Der Pro Micro wartet auf diesen Pegelwechsel, höchstens 3 s.

## Was getestet ist und was nicht

- **Getestet (Emulation, `tools/test-hsgser.js`, 21/21 OK):**
  - Vollbild EF9366 (512 × 256) und EF9365 (512 × 512), pixelgenau
  - Ausschnitt mit Setzen und Radieren sowie Clipping am Rand
  - Müll vor dem Rahmen, falsche Prüfsumme, Löschen, Beenden und STOP
  - CA2 (Zeichensatz) bleibt unberührt, Port A steht auf Eingang
- **Getestet im Browser** mit einem simulierten Pro Micro: Rahmenaufbau, Prüfsummen, Fortschritt, Ausschnitt-Erkennung und Fehlermeldung bei Zeitüberschreitung.
- **Pro-Micro-Sketch:** kompiliert für `arduino:avr:leonardo`.
- **Nicht getestet:** echte Hardware, also Userport-Belegung am 8032, Pegel und Timing sowie die tatsächliche Zeichengeschwindigkeit des EF936x. Der 6502 allein braucht für ein Zufallsbild mit 50 % gesetzten Punkten etwa 9 s (geschätzt). Dazu kommt die Zeit, die der EF936x pro Punkt braucht.
