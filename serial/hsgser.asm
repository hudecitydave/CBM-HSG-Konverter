; HSGSER - HSG-Bildempfaenger ueber den Userport (HSG-Link mit Arduino Pro Micro)
; CBM 8032 / 4032 mit HSG-Board (EF9365 oder EF9366)
;
; Aufbau wie hsgimage.asm (AndyG, Juli 2024); statt vom Floppy-Laufwerk kommen die
; Bytes parallel vom Userport:
;   PA0..PA7 (Userport C..L)  Datenbyte vom Pro Micro
;   CA1      (Userport B)     Strobe vom Pro Micro, fallende Flanke = "Byte liegt an"
;   CB2      (Userport M)     Quittung an den Pro Micro, wechselt nach jedem Byte den Pegel
;
; Rahmenformat (alle Werte Bytes, 16-Bit-Werte Low zuerst):
;   "H" "S" "G" <Befehl> <Kopf ...> <Nutzdaten ...> <Pruefsumme>
;   Pruefsumme = Summe aller Bytes nach dem Befehlsbyte (Kopf + Nutzdaten) modulo 256
;
;   I  Vollbild:  Zeilen(16)                                  dann Zeilen*64 Bytes
;      Bildschirm wird geloescht, nur gesetzte Bits werden gezeichnet (wie HSGIMAGE)
;   P  Ausschnitt: Spalte(8, 0-63) Zeile(16) Breite(8, 1-64) Hoehe(16)
;                                                             dann Breite*Hoehe Bytes
;      gesetzte Bits zeichnen, geloeschte Bits radieren (fuer Live-Aenderungen)
;   C  Bildschirm loeschen
;   Q  Viewer beenden (zurueck zu BASIC)
;
; Bitfolge: MSB = linkes Pixel, Zeile 0 = oben. Bei EF9366 256 Zeilen, bei EF9365 512.
;
; Start am CBM:  sys 40960   load "hsgser",8   run      Abbruch mit STOP
;
; Taste D oder LEER: Grafik zusaetzlich auf dem eingebauten CBM-Bildschirm an/aus
; (HSG-ROM DISPLAY, $AEDC). Dazu muss der HSG-Umschalter in Mittelstellung stehen.
; Der externe Monitor zeigt die Grafik immer.

!to "hsgser",cbm

CHROUT   = $FFD2        ; Zeichen ausgeben
STOP     = $FFE1        ; Z=1, wenn STOP gedrueckt
GETIN    = $FFE4        ; Taste holen, A=0 wenn keine
HSGINIT  = $AED0        ; HSG-ROM: Init + Bildschirm loeschen (setzt DISPLAY auf 0)
DISPLAY  = $AEDC        ; HSG-ROM: X=1 Grafik auf CBM-Bildschirm, X=0 Text
BOARD    = $0371        ; HSG-ROM: 0 = 512 Zeilen (EF9365), 1 = 256 Zeilen (EF9366)
CLRCMD   = $04          ; EF936x: Bildschirm loeschen

CMD      = $AF70        ; EF936x Befehl / Status (Bit 2 = bereit)
CTRL1    = $AF71        ; Bit 0 = Schreiben an, Bit 1 = Stift (1) / Radierer (0)
CTRL2    = $AF72
DELTAX   = $AF75
DELTAY   = $AF77
X_HIGH   = $AF78
X_LOW    = $AF79
Y_HIGH   = $AF7A
Y_LOW    = $AF7B

VIA_ORA  = $E841        ; Port A mit Handshake (Lesen loescht CA1-Flag)
VIA_DDRA = $E843
VIA_PCR  = $E84C        ; Bit 0 CA1-Flanke, Bits 3-1 CA2 (Zeichensatz!), Bits 7-5 CB2
VIA_IFR  = $E84D        ; Bit 1 = CA1-Flanke erkannt
VIA_IER  = $E84E

PEN      = $03          ; CTRL1: Stift, Schreiben an
ERASER   = $01          ; CTRL1: Radierer, Schreiben an
PENUP    = $02          ; CTRL1: Stift, Schreiben aus
PLOTCMD  = $15          ; Punktbefehl wie in HSGIMAGE (DELTAX = DELTAY = 0)

* = $0401
                !byte <END_BASIC,>END_BASIC
                !byte $0A,$00           ; Zeile 10
                !byte $9E               ; SYS
                !pet "1040"
                !byte $00,$00,$00
END_BASIC:      NOP
                NOP
                NOP

; ---------------------------------------------------------------- Start ($0410 = 1040)
START:          TSX
                STX SAVESP
                LDA #$00
                STA DISP                ; HSGINIT schaltet auf Text
                JSR VIAINIT
                JSR HSGINIT             ; einmal komplett initialisieren
                JSR GFXINIT
                LDY #M_HELLO-MSGS
                JSR MSG

MAINLP:         JSR SYNC
                JSR GETB
                STA CMDBYTE
                LDA #$00
                STA CSUM
                LDA CMDBYTE
                CMP #'I'
                BNE M1
                JMP DOIMAGE
M1:             CMP #'P'
                BNE M2
                JMP DOPATCH
M2:             CMP #'C'
                BNE M3
                JMP DOCLEAR
M3:             CMP #'Q'
                BNE M4
                JMP DOQUIT
M4:             LDY #M_BADCMD-MSGS
                JSR MSG
                JMP MAINLP

; ---------------------------------------------------------------- Befehle
DOIMAGE:        JSR GETBS
                STA HROWS
                JSR GETBS
                STA HROWS+1
                JSR GFXINIT             ; Bildschirm loeschen
                LDA #$00
                STA XCOL
                STA YTOP
                STA YTOP+1
                STA MODE                ; nur gesetzte Bits zeichnen
                LDA #64
                STA WBYTES
                JSR RECT
                JSR CHKSUM
                BCS DOIMG9
                LDY #M_IMGOK-MSGS
                JSR MSG
DOIMG9:         JMP MAINLP

DOPATCH:        JSR GETBS
                STA XCOL
                JSR GETBS
                STA YTOP
                JSR GETBS
                STA YTOP+1
                JSR GETBS
                STA WBYTES
                JSR GETBS
                STA HROWS
                JSR GETBS
                STA HROWS+1
                LDA #$01
                STA MODE                ; zeichnen und radieren
                LDA WBYTES
                BNE DOP1
                JMP MAINLP              ; Breite 0 ist ungueltig
DOP1:           JSR RECT
                JSR CHKSUM              ; Meldung nur im Fehlerfall (Live-Modus)
                JMP MAINLP

DOCLEAR:        JSR CHKSUM
                BCS DOCLR9
                JSR GFXINIT
                LDY #M_CLEAR-MSGS
                JSR MSG
DOCLR9:         JMP MAINLP

DOQUIT:         JSR CHKSUM
                BCS DOCLR9
                LDY #M_BYE-MSGS
                JSR MSG
                JMP FINISH

; ---------------------------------------------------------------- Rechteck zeichnen
; XCOL (Bytespalte), YTOP (Zeile von oben), WBYTES, HROWS, MODE
RECT:           LDA #$FF                ; YCUR = letzte Zeile - YTOP (EF936x: Y=0 unten)
                SEC
                SBC YTOP
                STA YCUR
                LDA ROWS512
                SBC YTOP+1
                STA YCUR+1              ; negativ = ausserhalb, wird nicht gezeichnet
                LDA HROWS
                STA ROWCNT
                LDA HROWS+1
                STA ROWCNT+1

ROWLP:          LDA ROWCNT
                ORA ROWCNT+1
                BNE ROWGO
                LDA #PENUP
                STA CTRL1
                RTS

ROWGO:          LDA XCOL                ; X = XCOL * 8
                STA TMP
                LDA #$00
                STA TMP+1
                ASL TMP
                ROL TMP+1
                ASL TMP
                ROL TMP+1
                ASL TMP
                ROL TMP+1
                JSR GWAIT
                LDA TMP+1
                STA X_HIGH
                LDA TMP
                STA X_LOW
                LDA YCUR+1
                AND #$0F
                STA Y_HIGH
                LDA YCUR
                STA Y_LOW
                LDA WBYTES
                STA BCNT
                LDA XCOL
                STA COLCUR

BYTELP:         JSR GETBS
                STA CURBYTE
                LDA #$00                ; sichtbar, wenn Zeile >= 0 und Spalte < 64
                STA VIS
                LDA YCUR+1
                BMI NOVIS
                LDA COLCUR
                CMP #64
                BCS NOVIS
                INC VIS
NOVIS:          LDX #$08

BITLP:          ASL CURBYTE
                BCC BIT0
                LDA #PEN
                BNE BITDO
BIT0:           LDA MODE
                BEQ BITNX
                LDA #ERASER
BITDO:          LDY VIS
                BEQ BITNX
                STA CTRL1
                LDA #PLOTCMD
                STA CMD
                JSR GWAIT
BITNX:          INC X_LOW
                BNE BITNX2
                INC X_HIGH
BITNX2:         DEX
                BNE BITLP

                INC COLCUR
                DEC BCNT
                BNE BYTELP

                SEC                     ; naechste Zeile: YCUR - 1, ROWCNT - 1
                LDA YCUR
                SBC #$01
                STA YCUR
                LDA YCUR+1
                SBC #$00
                STA YCUR+1
                SEC
                LDA ROWCNT
                SBC #$01
                STA ROWCNT
                LDA ROWCNT+1
                SBC #$00
                STA ROWCNT+1
                JMP ROWLP

; ---------------------------------------------------------------- Userport
VIAINIT:        LDA #$02
                STA VIA_IER             ; CA1-Interrupt aus (wir fragen ab)
                LDA #$00
                STA VIA_DDRA            ; Port A = Eingang
                LDA VIA_PCR
                AND #$1E                ; CA2 (Zeichensatz) und CB1 behalten, CA1 fallende Flanke
                ORA #$C0                ; CB2 = Ausgang, Low
                STA VIA_PCR
                LDA VIA_ORA             ; altes Flag loeschen
                RTS

; Byte mit Pruefsumme lesen
GETBS:          JSR GETB
                PHA
                CLC
                ADC CSUM
                STA CSUM
                PLA
                RTS

; Byte vom Userport lesen; STOP-Taste bricht ab, D/LEER schaltet den CBM-Bildschirm um
GETB:           LDA VIA_IFR
                AND #$02
                BNE GOTB
                JSR STOP
                BNE GETB1
                JMP ABORT
GETB1:          JSR GETIN
                BEQ GETB
                CMP #'D'
                BEQ GETB2
                CMP #' '
                BNE GETB
GETB2:          JSR TOGGLE
                JMP GETB
GOTB:           LDA VIA_ORA             ; Byte lesen, CA1-Flag loeschen
                PHA
                LDA VIA_PCR
                EOR #$20                ; CB2 umschalten = Quittung
                STA VIA_PCR
                PLA
                RTS

; Warten auf "HSG"
SYNC:           JSR GETB
SYNC1:          CMP #'H'
                BNE SYNC
                JSR GETB
                CMP #'S'
                BNE SYNC1
                JSR GETB
                CMP #'G'
                BNE SYNC1
                RTS

; Pruefsumme lesen und vergleichen; C=1 bei Fehler
CHKSUM:         JSR GETB
                CMP CSUM
                BEQ CHK1
                LDY #M_CSBAD-MSGS
                JSR MSG
                SEC
                RTS
CHK1:           CLC
                RTS

; ---------------------------------------------------------------- HSG
; Bildschirm loeschen ohne HSGINIT, damit die DISPLAY-Einstellung bleibt
GFXINIT:        JSR GWAIT
                LDA #CLRCMD
                STA CMD
                JSR GWAIT
                LDA BOARD
                EOR #$01
                AND #$01
                STA ROWS512             ; 1 = 512 Zeilen (EF9365), 0 = 256 Zeilen (EF9366)
                LDA #$00
                STA DELTAX
                STA DELTAY
                STA CTRL2
                RTS

; Grafik auf dem eingebauten Bildschirm an/aus
TOGGLE:         LDA DISP
                EOR #$01
                STA DISP
SETDISP:        JSR GWAIT
                LDX DISP
                JMP DISPLAY

GWAIT:          PHA
GWAIT1:         LDA CMD
                AND #$04
                BEQ GWAIT1
                PLA
                RTS

; ---------------------------------------------------------------- Ende
ABORT:          LDX SAVESP
                TXS
                LDY #M_STOP-MSGS
                JSR MSG
FINISH:         LDA #PENUP
                STA CTRL1
                LDA #$00                ; CBM-Bildschirm wieder auf Text
                STA DISP
                JMP SETDISP

; Text ausgeben, Ende = Bit 7 gesetzt
MSG:            LDA MSGS,Y
                PHP
                AND #$7F
                JSR CHROUT
                INY
                PLP
                BPL MSG
                RTS

MSGS:
M_HELLO:        !byte $0D,$12
                !pet "hsgser - hsg-link empfaenger"
                !byte $0D
                !pet "warte auf daten, stop = ende"
                !byte $0D
                !pet "d/leer = grafik auf cbm-schirm an/aus"
                !byte $8D
M_IMGOK:        !pet "bild empfangen"
                !byte $8D
M_CSBAD:        !pet "pruefsummenfehler"
                !byte $8D
M_BADCMD:       !pet "unbekannter befehl"
                !byte $8D
M_CLEAR:        !pet "geloescht"
                !byte $8D
M_BYE:          !pet "ende"
                !byte $8D
M_STOP:         !pet "abbruch"
                !byte $8D

; ---------------------------------------------------------------- Variablen
SAVESP:         !byte 0
DISP:           !byte 0
CMDBYTE:        !byte 0
CSUM:           !byte 0
ROWS512:        !byte 0
MODE:           !byte 0
XCOL:           !byte 0
YTOP:           !byte 0,0
WBYTES:         !byte 0
HROWS:          !byte 0,0
YCUR:           !byte 0,0
ROWCNT:         !byte 0,0
TMP:            !byte 0,0
BCNT:           !byte 0
COLCUR:         !byte 0
CURBYTE:        !byte 0
VIS:            !byte 0
