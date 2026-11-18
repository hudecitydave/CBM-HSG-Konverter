; HSGMENU - HSG-Board am CBM: Bilder anzeigen und auf einen HP-GL-Plotter ausgeben, mit Menue
;   1 = nur CBM:     Bild von Diskette laden und anzeigen (Original HSGIMAGE von AndyG, Juli 2024),
;                    danach plotten (S = Schraffur, K = Kringel, P = Punkte)
;   2 = mit Serial:  Bilder vom PC ueber den Userport (HSG-Link, Protokoll wie serial/hsgser.asm),
;                    Tasten S/K/H plotten das angezeigte Bild
; Zusammengefasst aus cbm/hsgplot.asm (Empfang + Plot) und cbm/direktplot.asm (Laden).
;
; CBM 8032 / 4032 mit HSG-Board (EF9365 oder EF9366), BASIC 4, 32 KByte RAM
; Start am CBM:  sys 40960   load "hsgmenu",8   run
;
; Userport (Modus 2): PA0..PA7 Daten, CA1 Strobe vom Pro Micro, CB2 Quittung (wie HSGSER)
; Rahmen: "H" "S" "G" <Befehl> <Kopf> <Daten> <Pruefsumme>; I Vollbild, P Ausschnitt, C Loeschen, Q Ende
;
; Bild zuruecklesen wie das HSG-ROM (hcopy $A656 / tstb $A580): Modusregister Bit 0 = 0,
; EF936x-Befehl $0F, dann $AF20 lesen (8 Punkte invertiert, Bit 0 = links).
;
; Plotter-Einstellungen ab 1043 (POKE vor RUN, oder von der Website ins PRG geschrieben):
;   1043 Geraet (5)  1044 Sekundaeradresse (0)  1045 Einheiten je Punkt (14)
;   1046/1047 linker Rand (1800)  1048/1049 unterer Rand (250)
;   1050 1 = dunkle Stellen zeichnen (Papier wie Bildschirm), 0 = helle  1051 Stift (1)
;   1052 Punkte: Luecken bis n mitzeichnen (0)  1053-1056 Schraffur-Schwellen (2, 5, 8, 11)

!to "hsgmenu",cbm

CHROUT   = $FFD2        ; Zeichen ausgeben (an Bildschirm oder offenen Kanal)
CHKOUT   = $FFC9        ; Ausgabekanal X setzen
CLRCH    = $FFCC        ; Kanaele zuruecksetzen (UNLISTEN)
STOP     = $FFE1        ; Z=1, wenn STOP gedrueckt
GETIN    = $FFE4        ; Taste holen, A=0 wenn keine
KOPEN    = $F563        ; BASIC-4-OPEN ohne Parameterauswertung (wie HSG-ROM hcopy)
KCLOSE   = $F2E0        ; BASIC-4-CLOSE fuer Datei in LA (wie HSG-ROM hcopy)
FNLEN    = $D1          ; Laenge Dateiname
LA       = $D2          ; logische Dateinummer
SA       = $D3          ; Sekundaeradresse
FA       = $D4          ; Geraeteadresse
STATUS   = $96          ; ST
LFN      = $7C          ; logische Datei fuer den Plotter (wie hcopy)

HSGINIT  = $AED0        ; HSG-ROM: Init + Bildschirm loeschen (setzt DISPLAY auf 0)
DISPLAY  = $AEDC        ; HSG-ROM: X=1 Grafik auf CBM-Bildschirm, X=0 Text
BOARD    = $0371        ; HSG-ROM: 0 = 512 Zeilen (EF9365), 1 = 256 Zeilen (EF9366)
MODECOPY = $0372        ; HSG-ROM: Kopie des Modusregisters
MODEREG  = $AF00        ; Modusregister (nur schreiben), Bit 0 = 0: Lesemodus
READREG  = $AF20        ; gelesenes Bildbyte (invertiert)
CLRCMD   = $04          ; EF936x: Bildschirm loeschen
READCMD  = $0F          ; EF936x: Speicherzugriff an X/Y

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

; Loader (Modus 1), wie im Original HSGIMAGE
INPUTB   = $FFCF        ; Zeichen von der Eingabezeile
BUF      = $0200        ; Eingabepuffer = Dateiname
FNADR    = $DA          ; Zeiger auf den Dateinamen
RCLRCH   = $F2A6
RLISTN   = $F0D5
RSECND   = $F143
RUNLSN   = $F1B9
RTALK    = $F0D2
RTKSA    = $F193
RACPTR   = $F1C0
RUNTLK   = $F1AE
ROPENI   = $F4A5

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
                JMP START

; ---------------------------------------------------------------- Plotter-Einstellungen ($0413 = 1043)
CFG_DEV:        !byte 5
CFG_SA:         !byte 0
CFG_SCL:        !byte 14
CFG_X0:         !byte <1800,>1800
CFG_Y0:         !byte <250,>250
CFG_INV:        !byte 1			; 1050 1 = dunkle Stellen zeichnen (Papier wie Bildschirm), 0 = Negativ
CFG_PEN:        !byte 1
CFG_GAP:		!byte 0			; 1052 Luecken bis n Punkte ueberbruecken (0 = aus)
CFG_T:			!byte 2,5,8,11		; 1053-1056 Schraffur: Schwellen fuer Ebene 1-4 (Punkte je 4x4-Zelle, 17 = aus)

; ---------------------------------------------------------------- Menue
START:          LDA #$00
                STA DISP
MENU:           JSR STOP                ; STOP erst loslassen (nach Abbruch)
                BEQ MENU
                LDY #M_MENU-MSGS3
                JSR MSG3
MENU1:          JSR STOP                ; STOP = Ende
                BEQ MENUX
                JSR GETIN
                BEQ MENU1
                CMP #'1'
                BNE MENU2
                JSR CHROUT
                JSR DISKMODE            ; 1 = nur CBM: Bild von Diskette
                JMP MENU
MENU2:          CMP #'2'
                BNE MENU3
                JSR CHROUT
                JSR SERMODE             ; 2 = mit Serial: HSG-Link
                JMP MENU
MENU3:          CMP #'E'
                BNE MENU1
MENUX:          LDY #M_BYE-MSGS
                JMP MSG                 ; zurueck zu BASIC

; ---------------------------------------------------------------- 2 = mit Serial (HSG-Link)
; STOP oder Befehl Q: zurueck ins Menue (SAVESP = Stapel beim Eintritt)
SERMODE:        TSX
                STX SAVESP
                LDA #$00
                STA DISP                ; HSGINIT schaltet auf Text
                STA IDLE
                STA PLOTREQ
                JSR VIAINIT
                JSR HSGINIT             ; einmal komplett initialisieren
                JSR GFXINIT
                LDY #M_HELLO-MSGS
                JSR MSG

MAINLP:         LDX PLOTREQ             ; H waehrend der Uebertragung gedrueckt? (1 = Punkte, 2 = Kringel, 3 = Schraffur)
                BEQ MAIN1
                DEX
                STX PMODE
                LDA #$00
                STA PLOTREQ
                JSR PLOT
MAIN1:          LDA #$01
                STA IDLE                ; zwischen den Rahmen: Taste H erlaubt
                JSR SYNC
                LDA #$00
                STA IDLE
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

; Byte vom Userport lesen; STOP bricht ab, D/LEER schaltet den CBM-Bildschirm um,
; H plottet (nur zwischen zwei Rahmen)
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
                BEQ GETB2
                CMP #'H'		; H = Punkte
                BEQ GETBH
                CMP #'K'		; K = Kringel
                BEQ GETBK
                CMP #'S'		; S = Schraffur
                BNE GETB
                LDX #$03
                BNE GETBP
GETBK:          LDX #$02
                BNE GETBP
GETBH:          LDX #$01
GETBP:          LDA IDLE
                BNE GETB3
                STX PLOTREQ                ; mitten im Bild: vormerken, Plot nach dem Bild
                JMP GETB
GETB3:          DEX
                STX PMODE
                JSR PLOT
                JMP GETB
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

; ---------------------------------------------------------------- 1 = nur CBM: Bild von Diskette
; Laden und Anzeigen wie der Original-Loader HSGIMAGE (AndyG, Juli 2024), Marken mit LD vorangestellt.
; Leere Eingabe beim Dateinamen = zurueck ins Menue.
DISKMODE:       JSR LDSTART             ; HSG-Board vorbereiten
                LDY #LMSG2-LMSG1
                JSR LMSG                ; Ueberschrift und "enter filename ?"
                LDA #<BUF
                STA FNADR
                LDA #>BUF
                STA FNADR+1
                LDA #8
                STA FA                  ; Diskette = Geraet 8
                LDX #0
LDIN1:          JSR INPUTB              ; Dateiname von der Eingabezeile
                CMP #$0D
                BEQ LDIN2
                STA BUF,X
                INX
                BNE LDIN1
LDIN2:          STX FNLEN
                LDA #$0D
                JSR CHROUT
                LDA FNLEN
                BNE LDLOAD
                RTS                     ; nur RETURN: Menue

LDLOAD:         LDA #0
                STA STATUS
                LDA #$60
                STA SA                  ; Sekundaeradresse $60 (Laden)
                JSR ROPENI
                LDA FA
                JSR RTALK
                LDA SA
                JSR RTKSA
                JSR RACPTR              ; erstes Byte: gibt es die Datei?
                TAX
                LDA STATUS
                LSR
                LSR
                BCS LD90                ; nicht gefunden
                BCC LD47
LD40:           JSR STOP
                BEQ LD75
                LDA #$FD
                AND STATUS
                STA STATUS
LD45:           JSR RACPTR
                TAX
                LDA STATUS
                LSR
                LSR
                BCS LD40
LD47:           LDY #$08
LD50:           CLC
                TXA
                ROL
                TAX
                BCC LD55
                JSR LDPOINT
LD55:           JSR LDINC
                DEY
                BNE LD50
LD70:           LDA STATUS
                LSR
                LSR
                BIT STATUS              ; EOI?
                BVC LD40
LD75:           JSR RUNTLK              ; Kanal schliessen
                LDA FA
                JSR RLISTN
                LDA SA
                AND #$EF
                ORA #$E0
                JSR RSECND
                JSR RUNLSN
                JMP ASKPLOT
LD90:           JSR RCLRCH
                LDY #LMSG1-LMSG1
                JSR LMSG                ; "file not found error"
                JMP DISKMODE

; Punkt setzen
LDPOINT:        LDA #PEN
                STA CTRL1
                LDA #$00
                STA CTRL2
                LDA #PLOTCMD
                STA CMD
                JSR GWAIT
                LDA #PENUP
                STA CTRL1
                RTS
; naechster Punkt: X + 1, am Zeilenende X = 0 und Y - 1; nach der letzten Zeile Ende
LDINC:          INC X_LOW
                LDA X_LOW
                BEQ LDINC2
LDINC1:         RTS
LDINC2:         INC X_HIGH
                LDA X_HIGH
                CMP #$02
                BCC LDINC1
                LDA #$00
                STA X_LOW
                STA X_HIGH
                SEC
                LDA Y_LOW
                SBC #$01
                STA Y_LOW
                LDA Y_HIGH
                SBC #$00
                STA Y_HIGH
                BCS LDINC1
                PLA
                PLA
                JMP LD75
; HSG-Board vorbereiten: Init, Start oben links
LDSTART:        JSR HSGINIT
                JSR GWAIT
                LDA BOARD
                EOR #$01
                STA Y_HIGH              ; 1 = 512 Zeilen, 0 = 256 Zeilen
                LDA #$FF
                STA Y_LOW
                LDA #$00
                STA X_LOW
                STA X_HIGH
                STA DELTAX
                STA DELTAY
                RTS
; Loader-Texte, Ende = Bit 7 gesetzt
LMSG:           LDA LMSG1,Y
                PHP
                AND #$7F
                JSR CHROUT
                INY
                PLP
                BPL LMSG
                RTS
LMSG1:          !byte $0D
                !pet "file not found error - please re-enter filename"
                !byte $8D
LMSG2:          !byte $0D,$12
                !pet "1 - bild von diskette (hsg image loader, andyg 7/2024)"
                !byte $0D
                !pet "nur return = zurueck zum menue"
                !byte $0D,$0D
                !pet "enter filename ?"
                !byte $A0

; Nach dem Laden: plotten?  S = Schraffur, K = Kringel, P/J = Punkte, sonst naechstes Bild
ASKPLOT:        LDA BOARD               ; 0 = 512 Zeilen, 1 = 256 Zeilen
                EOR #$01
                AND #$01
                STA ROWS512
ASK1:           LDY #M_ASK-MSGS2
                JSR MSG2
ASK2:           JSR STOP                ; STOP = naechstes Bild
                BEQ ASKEND
                JSR GETIN
                BEQ ASK2
                CMP #'P'                ; P oder J = Punkte, K = Kringel, S = Schraffur
                BEQ ASKP
                CMP #'J'
                BEQ ASKP
                CMP #'K'
                BEQ ASKP
                CMP #'S'
                BNE ASKEND
ASKP:           PHA
                JSR CHROUT
                LDA #$0D
                JSR CHROUT
                PLA
                LDX #$00                ; 0 = Punkte, 1 = Kringel, 2 = Schraffur
                CMP #'K'
                BNE ASKP1
                INX
ASKP1:          CMP #'S'
                BNE ASKP2
                LDX #$02
ASKP2:          STX PMODE
                JSR PLOT
                JMP ASK1                ; noch einmal plotten?
ASKEND:         LDA #$0D
                JSR CHROUT
                LDA #PENUP
                STA CTRL1
ASKW:           JSR STOP                ; STOP loslassen
                BEQ ASKW
                JMP DISKMODE            ; naechstes Bild (nur RETURN = Menue)

; Menue-Texte
MSG3:           LDA MSGS3,Y
                PHP
                AND #$7F
                JSR CHROUT
                INY
                PLP
                BPL MSG3
                RTS
MSGS3:
M_MENU:         !byte $0D,$12
                !pet "hsgmenu - hsg-board: bilder anzeigen und plotten"
                !byte $0D,$0D
                !pet "1 = nur cbm (direktplot): bild von diskette laden"
                !byte $0D
                !pet "2 = mit serial (hsg-link): bilder vom pc"
                !byte $0D
                !pet "e = ende"
                !byte $0D,$0D
                !pet "wahl ?"
                !byte $A0

; ---------------------------------------------------------------- Plotter (Taste H)
PLOT:           JSR GWAIT
                LDA #PENUP
                STA CTRL1               ; Schreiben aus, Lesen veraendert nichts
                LDA #$00
                STA INVMASK
                LDA CFG_INV
                BEQ PL1
                LDA #$FF
                STA INVMASK
PL1:            LDY #M_PLOT-MSGS2        ; "plotte auf geraet n"
                JSR MSG2
                LDA CFG_DEV
                STA NUM
                LDA #$00
                STA NUM+1
                JSR NUMOUT
                LDA #$0D
                JSR CHROUT

                LDA #LFN                ; OPEN 124,dev,sa
                STA LA
                LDA CFG_DEV
                STA FA
                LDA CFG_SA
                STA SA
                LDA #$00
                STA FNLEN
                STA STATUS
                JSR KOPEN
                LDX #LFN
                JSR CHKOUT
                LDY #H_INIT-HPGL        ; "IN;SP"
                JSR HPS
                LDA CFG_PEN
                STA NUM
                LDA #$00
                STA NUM+1
                JSR NUMOUT
                LDA #$3B                ; Semikolon
                JSR OUTC
                LDA STATUS
                BEQ PL2
                JSR CLRCH               ; Plotter antwortet nicht
                JSR PLCLOSE
                LDY #M_NOPLT-MSGS2
                JMP MSG2

PL2:            LDA #$00		; Richtung links->rechts, Stift oben
                STA STOPF
            STA DIR
            STA PDOWN
                LDA PMODE		; 1 = Kringel, 2 = Schraffur
                BEQ PL3
                CMP #$02
                BNE PLK
                JMP HATCH
PLK:            JMP KLOOP
PL3:                LDA #<511               ; Plotterzeile 511 (oben) bis 0 (unten)
                STA PR
                LDA #>511
                STA PR+1
PLROW:          JSR STOP
                BEQ PLABRT
                JSR RDROW               ; Z=1: Zeile leer
                BNE PLR1
                LDA #$00		; leere Zeile: Stift kommt sicher hoch
                STA PDOWN
                JMP PLNEXT
PLR1:                LDA PR                  ; PY = Y0 + PR * Massstab
                STA MA
                LDA PR+1
                STA MA+1
                JSR MULS
                CLC
                LDA NUM
                ADC CFG_Y0
                STA PY
                LDA NUM+1
                ADC CFG_Y0+1
                STA PY+1
                JSR SCANROW
                LDA STOPF
                BEQ PLNEXT
                JMP PLABRT
PLNEXT:         LDA PR
                ORA PR+1
                BEQ PLDONE
                SEC
                LDA PR
                SBC #$01
                STA PR
                LDA PR+1
                SBC #$00
                STA PR+1
                JMP PLROW

PLDONE:         LDA #$00
                BEQ PLFIN
PLABRT:         LDA #$01
PLFIN:          STA PLRES
                LDY #H_END-HPGL         ; "PU;SP0;"
                JSR HPS
                JSR CLRCH
                JSR PLCLOSE
                LDY #M_PLOK-MSGS2
                LDA PLRES
                BEQ PLFIN2
                LDY #M_PLAB-MSGS2
PLFIN2:         JSR MSG2
PLWAIT:         JSR STOP                ; STOP loslassen, sonst endet gleich das Programm
                BEQ PLWAIT
                RTS

PLCLOSE:        LDA #LFN
                STA LA
                JMP KCLOSE

; Eine Bildzeile (64 Bytes) vom HSG-Board nach ROWBUF lesen; A = ODER aller Bytes
RDROW:          LDA PR                  ; GY = PR (512 Zeilen) bzw. PR / 2 (256 Zeilen)
                STA GY
                LDA PR+1
                STA GY+1
                LDA ROWS512
                BNE RD1
                LSR GY+1
                ROR GY
RD1:            LDA #$00
                STA ANY
                STA RDX
                STA RDX+1
                TAX
RDLP:           JSR GWAIT
                LDA RDX                 ; X = Spalte * 8
                STA X_LOW
                LDA RDX+1
                STA X_HIGH
                LDA GY
                STA Y_LOW
                LDA GY+1
                AND #$0F
                STA Y_HIGH
                LDA MODECOPY            ; Lesemodus an
                AND #$FE
                STA MODEREG
                LDA #READCMD
                STA CMD
                JSR GWAIT
                LDA MODECOPY            ; Lesemodus aus
                STA MODEREG
                LDA READREG
                EOR #$FF                ; 1 = heller Punkt
                EOR INVMASK
                STA ROWBUF,X
                ORA ANY
                STA ANY
                CLC
                LDA RDX
                ADC #$08
                STA RDX
                LDA RDX+1
                ADC #$00
                STA RDX+1
                INX
                CPX #64
                BNE RDLP
                LDA ANY
                RTS

; Zeile in ROWBUF nach Punktfolgen absuchen und ausgeben (wenig Stiftverschleiss):
;  - Schlangenlinie: Richtung DIR wechselt mit jeder gezeichneten Zeile, keine Rueckfahrt
;  - erste Folge einer Zeile: liegt der Stift noch unten (Ende der Zeile darueber) und ist der Punkt
;    direkt darunter Teil dieser Folge, geht der Stift ohne Absetzen eine Zeile tiefer
;  - CFG_GAP: Luecken bis zu so vielen Punkten innerhalb einer Folge werden mitgezeichnet
SCANROW:        LDA PDOWN
                STA CONN
                LDA #$00
                STA PDOWN
                STA EDGE
                STA XP
                STA XP+1
                LDA DIR
                BEQ SCLP
                LDA #$07                ; rueckwaerts: ab Punkt 511, Bytegrenze bei Bit 7
                STA EDGE
                LDA #<511
                STA XP
                LDA #>511
                STA XP+1
SCLP:           LDA XP+1
                CMP #$02
                BCS SCDONE              ; XP = 512 oder -1: Zeile fertig
                LDA XP
                AND #$07
                CMP EDGE
                BNE SC1
                JSR BYTEAT              ; ganzes Byte leer: 8 Punkte ueberspringen
                BNE SC1
                JSR STEP8
                JMP SCLP
SC1:            JSR PIX
                BCS SCRUN
                JSR STEP
                JMP SCLP
SCDONE:         LDA DIR                 ; naechste Zeile in Gegenrichtung
                EOR #$01
                STA DIR
                RTS

SCRUN:          JSR STOP                ; STOP: Zeile beenden, Abbruch nach der Zeile
                BNE SCRN0
                LDA #$01
                STA STOPF
                LDA #$FF
                STA XP+1
                JMP SCLP
SCRN0:          LDA XP                  ; Anfang XS, bisheriges Ende XE
                STA XS
                STA XE
                LDA XP+1
                STA XS+1
                STA XE+1
                LDA CFG_GAP
                STA GAPC
SCR2:           JSR STEP
                LDA XP+1
                CMP #$02
                BCS SCEND
                JSR PIX
                BCC SCR3
                LDA XP                  ; gesetzt: Folge geht weiter
                STA XE
                LDA XP+1
                STA XE+1
                LDA CFG_GAP
                STA GAPC
                JMP SCR2
SCR3:           LDA GAPC                ; Luecke: noch erlaubt?
                BEQ SCEND
                DEC GAPC
                JMP SCR2

SCEND:          LDA CONN                ; nur bei der ersten Folge der Zeile
                BNE SCE0
                JMP SCPU
SCE0:                LDA #$00
                STA CONN
                LDA DIR                 ; LO/HI = linkes/rechtes Ende der Folge
                BNE SCE1
                LDA XS
                STA LO
                LDA XS+1
                STA LO+1
                LDA XE
                STA HI
                LDA XE+1
                STA HI+1
                JMP SCE2
SCE1:           LDA XE
                STA LO
                LDA XE+1
                STA LO+1
                LDA XS
                STA HI
                LDA XS+1
                STA HI+1
SCE2:           LDA LX                  ; LO <= LX?
                CMP LO
                LDA LX+1
                SBC LO+1
                BCC SCPU
                LDA HI                  ; LX <= HI?
                CMP LX
                LDA HI+1
                SBC LX+1
                BCC SCPU
                LDA XP                  ; Punkt bei LX in dieser Zeile gesetzt?
                PHA
                LDA XP+1
                PHA
                LDA LX
                STA XP
                LDA LX+1
                STA XP+1
                JSR PIX
                PLA
                STA XP+1
                PLA
                STA XP
                BCC SCPU
                LDA #'P'                ; Stift bleibt unten: "PDlx,py;PDxs,py;"
                JSR OUTC
                LDA #'D'
                JSR OUTC
                LDA LX
                STA MA
                LDA LX+1
                STA MA+1
                JSR XOUT
                JSR YOUT
                LDA #'D'
                BNE SCP1
SCPU:           LDA #'U'                ; Stift hoch: "PUxs,py;"
SCP1:           PHA
                LDA #'P'
                JSR OUTC
                PLA
                JSR OUTC
                LDA XS
                STA MA
                LDA XS+1
                STA MA+1
                JSR XOUT
                JSR YOUT
                LDA #'P'                ; "PDxe,py;"
                JSR OUTC
                LDA #'D'
                JSR OUTC
                LDA XE
                STA MA
                STA LX
                LDA XE+1
                STA MA+1
                STA LX+1
                JSR XOUT
                JSR YOUT
                LDA #$01                ; Stift liegt jetzt unten bei LX
                STA PDOWN
                JMP SCLP

; XP einen Punkt bzw. 8 Punkte in Richtung DIR weiter
STEP:           LDA DIR
                BNE STEPL
                INC XP
                BNE STEP1
                INC XP+1
STEP1:          RTS
STEPL:          LDA XP
                BNE STEPL1
                DEC XP+1
STEPL1:         DEC XP
                RTS
STEP8:          LDA DIR
                BNE STEP8L
                CLC
                LDA XP
                ADC #$08
                STA XP
                BCC STEP81
                INC XP+1
STEP81:         RTS
STEP8L:         SEC
                LDA XP
                SBC #$08
                STA XP
                BCS STEP81
                DEC XP+1
                RTS

; ---------------------------------------------------------------- Kringel-Modus (Zickzack)
; Das Bild wird in Baender aus 4 Plotterzeilen und Zellen aus 4 Punkten Breite geteilt (128 x 128).
; Jedes Band wird als durchgehende Zickzacklinie gezeichnet, je Zelle 0..8 Zacken = Anzahl
; der zu zeichnenden Punkte (0..16) / 2. Der Stift hebt nur ueber leeren Zellen ab.
; Baender in Schlangenlinie, Stift bleibt zwischen zwei Baendern unten, wenn beide Randzellen Tinte haben.
KLOOP:          LDA CFG_SCL             ; CW = Zellenbreite = 4 * Massstab
                STA CW
                LDA #$00
                STA CW+1
                STA SIDE
                ASL CW
                ROL CW+1
                ASL CW
                ROL CW+1
                JSR KOFFS               ; Zacken-Abstaende vorberechnen
                LDA #<508               ; oberstes Band: Plotterzeilen 508..511
                STA BR
                LDA #>508
                STA BR+1
KBAND:          JSR STOP
                BNE KB1
                JMP PLABRT
KB1:            JSR KREAD               ; 4 Zeilen lesen, Z=1 wenn alle leer
                BNE KB2
                LDA #$00
                STA PDOWN
                JMP KNEXT
KB2:            LDA BR                  ; YLO = Y0 + BR * S
                STA MA
                LDA BR+1
                STA MA+1
                JSR MULS
                CLC
                LDA NUM
                ADC CFG_Y0
                STA YLO
                LDA NUM+1
                ADC CFG_Y0+1
                STA YLO+1
                LDA #$03                ; YHI = YLO + 3 * S
                STA MA
                LDA #$00
                STA MA+1
                JSR MULS
                CLC
                LDA NUM
                ADC YLO
                STA YHI
                LDA NUM+1
                ADC YLO+1
                STA YHI+1
                LDA #$00                ; erste Zelle: 0 (links) bzw. 127 (rechts)
                LDX DIR
                BEQ KB3
                LDA #127
KB3:            STA CELL

KCELL:          JSR STOP                ; STOP auch mitten im Band
                BNE KCL0
                JMP PLABRT
KCL0:           JSR KCOUNT              ; A = Zacken 0..8
                STA KN
                BNE KC1
                LDA #$00                ; leere Zelle: Stift hoch
                STA PDOWN
                JMP KCNEXT
KC1:            JSR KEDGE               ; XB = Startkante der Zelle
                LDA PDOWN
                BNE KC2
                LDA #'P'                ; Stift oben: "PUxb,y;"
                JSR OUTC
                LDA #'U'
                JSR OUTC
                LDA XB
                STA VX
                LDA XB+1
                STA VX+1
                JSR OUTXY
                LDA #$3B
                JSR OUTC
                LDA #$01
                STA PDOWN
KC2:            LDA #'P'                ; "PDx,y,x,y,...;"
                JSR OUTC
                LDA #'D'
                JSR OUTC
                LDX KN
                LDA KBTAB,X
                STA OI
                LDA KN
                STA KI
KV:             LDA SIDE                ; jede Zacke wechselt die Seite
                EOR #$01
                STA SIDE
                LDY OI
                LDA DIR
                BNE KV1
                CLC                     ; links->rechts: XB + Abstand
                LDA XB
                ADC OFFS,Y
                STA VX
                LDA XB+1
                ADC OFFS+1,Y
                STA VX+1
                JMP KV2
KV1:            SEC                     ; rechts->links: XB - Abstand
                LDA XB
                SBC OFFS,Y
                STA VX
                LDA XB+1
                SBC OFFS+1,Y
                STA VX+1
KV2:            JSR OUTXY
                INC OI
                INC OI
                DEC KI
                BEQ KV3
                LDA #$2C                ; Komma
                JSR OUTC
                JMP KV
KV3:            LDA #$3B                ; Semikolon
                JSR OUTC

KCNEXT:         LDA DIR
                BNE KCN1
                INC CELL
                LDA CELL
                CMP #128
                BEQ KBEND
                JMP KCELL
KCN1:           DEC CELL
                BMI KBEND
                JMP KCELL
KBEND:          LDA DIR                 ; naechstes Band in Gegenrichtung
                EOR #$01
                STA DIR
KNEXT:          LDA BR
                ORA BR+1
                BNE KN1
                JMP PLDONE
KN1:            SEC
                LDA BR
                SBC #$04
                STA BR
                LDA BR+1
                SBC #$00
                STA BR+1
                JMP KBAND

; ---------------------------------------------------------------- Schraffur-Modus (Taste S)
; Das Bild wird in 128 x 128 Zellen zu 4 x 4 Punkten geteilt. Je Zelle zaehlt die Stufe 0..4,
; wie viele der Schwellen CFG_T (1053-1056) die Zahl der zu zeichnenden Punkte erreicht.
; Die Stufen liegen in MAP ($2000-$5FFF, 16 KByte, Zeile m = 0 unten).
; Ebene 1 zeichnet waagerechte Linien (schon beim Einlesen, Band fuer Band), Ebene 2 senkrechte,
; Ebene 3 "/" und Ebene 4 "\". Eine Linie liegt nur ueber Zellen mit Stufe >= Ebene,
; jede zusammenhaengende Strecke wird zu "PUx,y;PDx,y;". Linien in Schlangenlinie.
MAP             = $2000

HATCH:          LDA #127                ; Band m = 127 (oben) .. 0
                STA QS
HA1:            JSR STOP
                BNE HA2
                JMP PLABRT
HA2:            LDA #$00                ; BR = 4 * m
                STA BR+1
                LDA QS
                ASL A
                ROL BR+1
                ASL A
                ROL BR+1
                STA BR
                JSR KREAD               ; 4 Zeilen nach ROWBUF+64..
                LDA QS                  ; Zieladresse der Kartenzeile in HAW eintragen
                JSR QROW
                STA HAW+2
                STX HAW+1
                LDA #$00
                STA CELL
HA3:            JSR KCOUNT              ; CNT = Punkte der Zelle (0..16)
                LDX #$00
                LDY #$00
HA4:            LDA CNT
                CMP CFG_T,Y
                BCC HA5
                INX
HA5:            INY
                CPY #$04
                BNE HA4
                TXA
                LDX CELL
HAW:            STA MAP,X               ; Adresse wird gesetzt
                INC CELL
                LDA CELL
                CMP #128
                BNE HA3
                LDA QS                  ; Ebene 1: waagerechte Linie durch dieses Band
                STA QM
                LDA #$00
                STA QC
                STA QDM
                STA QEN
                STA QEX+1
                LDA #$01
                STA QDC
                STA QTH
                LDA #$02
                STA QEN+1
                STA QEX+1
                LDA #$04
                STA QEX
                JSR QLINE128
                DEC QS
                BMI HA9
                JMP HA1
HA9:

                LDA #$00                ; Ebene 2: senkrecht, Spalte c = 0..127, von oben nach unten
                STA QS
HB1:            LDA #127
                STA QM
                LDA QS
                STA QC
                LDA #$FF
                STA QDM
                LDA #$00
                STA QDC
                STA QEX+1
                LDA #$02
                STA QTH
                STA QEN
                STA QEX
                LDA #$04
                STA QEN+1
                JSR QLINE128
                INC QS
                BPL HB1

                LDA #$00                ; Ebene 3: "/", Diagonale s = 0..254 (c - m = s - 127)
                STA QS
HC1:            LDA QS
                CMP #127
                BCS HC2
                LDA #127                ; s < 127: m = 127 - s, c = 0, n = s + 1
                SEC
                SBC QS
                STA QM
                LDA #$00
                STA QC
                LDX QS
                INX
                JMP HC3
HC2:            SBC #127                ; s >= 127: m = 0, c = s - 127, n = 255 - s
                STA QC
                LDA #$00
                STA QM
                LDA #255
                SEC
                SBC QS
                TAX
HC3:            STX QN
                LDA #$01
                STA QDM
                STA QDC
                LDA #$03
                STA QTH
                LDA #$00
                STA QEN
                STA QEN+1
                LDA #$04
                STA QEX
                STA QEX+1
                JSR QLINE
                INC QS
                LDA QS
                CMP #255
                BNE HC1

                LDA #254                ; Ebene 4: "\", Diagonale s = 254..0 (c + m = s)
                STA QS
HD1:            LDA QS
                CMP #127
                BCC HD2
                SBC #127                ; s >= 127: m = 127, c = s - 127, n = 255 - s
                STA QC
                LDA #127
                STA QM
                LDA #255
                SEC
                SBC QS
                TAX
                JMP HD3
HD2:            STA QM                  ; s < 127: m = s, c = 0, n = s + 1
                LDA #$00
                STA QC
                LDX QS
                INX
HD3:            STX QN
                LDA #$FF
                STA QDM
                LDA #$01
                STA QDC
                LDA #$04
                STA QTH
                STA QEX
                STA QEN+1
                LDA #$00
                STA QEN
                STA QEX+1
                JSR QLINE
                DEC QS
                LDA QS
                CMP #$FF
                BNE HD1
                JMP PLDONE

; Kartenzeile m (A): X = Low-Byte, A = High-Byte von MAP + m * 128
QROW:           LSR A
                TAY
                LDA #$00
                ROR A
                TAX
                TYA
                CLC
                ADC #>MAP
                RTS

; Linie mit 128 Zellen; danach bei STOP abbrechen
QLINE128:       LDA #128
                STA QN
; Eine Linie: Start (QM, QC), Schritt (QDM, QDC), QN Zellen, Ebene QTH,
; Ein-/Austrittspunkt QEN/QEX (x, y in Punkten relativ zur Zellecke). DIR = 1: rueckwaerts.
QLINE:          JSR QLINE1
                LDA STOPF
                BEQ QL0
                PLA                     ; Ruecksprung verwerfen, Plot abbrechen
                PLA
                JMP PLABRT
QL0:            RTS
QLINE1:         JSR STOP                ; STOP je Linie (auch ohne Strecke)
                BNE QL0A
                LDA #$01
                STA STOPF
                RTS
QL0A:           LDA #$00
                STA QIN
                STA QANY
                LDA DIR
                BEQ QL3
                LDX QN                  ; rueckwaerts: Start = letzte Zelle, Schritt umdrehen
                DEX
                STX QT
                LDA QDM
                BEQ QL1B
                BMI QL1A
                CLC
                LDA QM
                ADC QT
                STA QM
                JMP QL1B
QL1A:           SEC
                LDA QM
                SBC QT
                STA QM
QL1B:           LDA QDC
                BEQ QL2
                BMI QL1C
                CLC
                LDA QC
                ADC QT
                STA QC
                JMP QL2
QL1C:           SEC
                LDA QC
                SBC QT
                STA QC
QL2:            LDA #$00                ; Schritte negieren
                SEC
                SBC QDM
                STA QDM
                LDA #$00
                SEC
                SBC QDC
                STA QDC
                LDX QEN                 ; Ein- und Austritt tauschen
                LDA QEX
                STA QEN
                STX QEX
                LDX QEN+1
                LDA QEX+1
                STA QEN+1
                STX QEX+1
QL3:            LDA QM                  ; Stufe der Zelle (QM, QC) lesen
                JSR QROW
                STA QRD+2
                TXA
                ORA QC
                STA QRD+1
QRD:            LDA MAP                 ; Adresse wird gesetzt
                CMP QTH
                BCC QL5
                LDA QIN                 ; Zelle gehoert zur Strecke
                BNE QL4
                LDA QC                  ; Streckenanfang = Eintrittspunkt
                LDX QEN
                JSR Q4
                STA QRS
                STX QRS+1
                LDA QM
                LDX QEN+1
                JSR Q4
                STA QRS+2
                STX QRS+3
                LDA #$01
                STA QIN
QL4:            LDA QC                  ; Streckenende = Austrittspunkt dieser Zelle
                LDX QEX
                JSR Q4
                STA QRE
                STX QRE+1
                LDA QM
                LDX QEX+1
                JSR Q4
                STA QRE+2
                STX QRE+3
                JMP QL6
QL5:            LDA QIN
                BEQ QL6
                JSR QEMIT
                LDA STOPF
                BNE QL9
QL6:            CLC                     ; naechste Zelle
                LDA QM
                ADC QDM
                STA QM
                CLC
                LDA QC
                ADC QDC
                STA QC
                DEC QN
                BEQ QL6E
                JMP QL3
QL6E:           LDA QIN
                BEQ QL7
                JSR QEMIT
QL7:            LDA QANY                ; naechste Linie in Gegenrichtung
                BEQ QL9
                LDA DIR
                EOR #$01
                STA DIR
QL9:            RTS

; A = 4 * A + X (16 Bit): A = Low, X = High
Q4:             STX QT
                LDX #$00
                STX QT+1
                ASL A
                ROL QT+1
                ASL A
                ROL QT+1
                CLC
                ADC QT
                BCC Q41
                INC QT+1
Q41:            LDX QT+1
                RTS

; Strecke ausgeben: "PUxa,ya;PDxe,ye;"
QEMIT:          LDA #$00
                STA QIN
                LDA #$01
                STA QANY
                JSR STOP
                BNE QE1
                LDA #$01
                STA STOPF
QE1:            LDA #'P'
                JSR OUTC
                LDA #'U'
                JSR OUTC
                LDX #$00
                JSR QXY
                LDA #'P'
                JSR OUTC
                LDA #'D'
                JSR OUTC
                LDX #$04
                ; weiter in QXY
; "x,y;" aus QRS+X (x = X0 + x * S, y = Y0 + y * S)
QXY:            LDA QRS,X
                STA MA
                LDA QRS+1,X
                STA MA+1
                STX QT
                JSR XOUT                ; X0 + MA * S, dann ","
                LDX QT
                LDA QRS+2,X
                STA MA
                LDA QRS+3,X
                STA MA+1
                JSR MULS
                CLC
                LDA NUM
                ADC CFG_Y0
                STA NUM
                LDA NUM+1
                ADC CFG_Y0+1
                STA NUM+1
                JSR NUMOUT
                LDA #$3B
                JMP OUTC

; 4 Plotterzeilen BR..BR+3 nach ROWBUF+64 .. ROWBUF+319 lesen; A = ODER aller Bytes
KREAD:          LDA #$00
                STA BANY
                STA KJ
KR1:            CLC
                LDA BR
                ADC KJ
                STA PR
                LDA BR+1
                ADC #$00
                STA PR+1
                JSR RDROW
                ORA BANY
                STA BANY
                LDA KJ                  ; Ziel = KJ * 64
                ASL A
                ASL A
                ASL A
                ASL A
                ASL A
                ASL A
                TAY
                LDX #$00
KR2:            LDA ROWBUF,X
                STA ROWBUF+64,Y
                INX
                INY
                CPX #64
                BNE KR2
                INC KJ
                LDA KJ
                CMP #$04
                BNE KR1
                LDA BANY
                RTS

; Zacken der Zelle CELL: A = gesetzte Punkte / 2 (0..8; ein einzelner Punkt bleibt weiss)
KCOUNT:         LDA CELL
                LSR A
                TAY
                LDA #$00
                STA CNT
                ROL A                   ; ungerade Zelle = rechte 4 Punkte (Bits 4-7)
                STA ODD
                LDA ROWBUF+64,Y
                JSR KNIB
                LDA ROWBUF+128,Y
                JSR KNIB
                LDA ROWBUF+192,Y
                JSR KNIB
                LDA ROWBUF+256,Y
                JSR KNIB
                LDA CNT
                LSR A
                RTS
KNIB:           LDX ODD
                BEQ KNB1
                LSR A
                LSR A
                LSR A
                LSR A
KNB1:           AND #$0F
                TAX
                LDA POPTAB,X
                CLC
                ADC CNT
                STA CNT
                RTS

; XB = X0 + 4 * S * CELL (links->rechts) bzw. X0 + 4 * S * (CELL + 1) (rechts->links)
KEDGE:          LDA CELL
                LDX DIR
                BEQ KE1
                CLC
                ADC #$01
KE1:            STA MA
                LDA #$00
                STA MA+1
                ASL MA
                ROL MA+1
                ASL MA
                ROL MA+1
                JSR MULS
                CLC
                LDA NUM
                ADC CFG_X0
                STA XB
                LDA NUM+1
                ADC CFG_X0+1
                STA XB+1
                RTS

; "x,y" ausgeben: x = VX, y = YHI oder YLO je nach SIDE
OUTXY:          LDA VX
                STA NUM
                LDA VX+1
                STA NUM+1
                JSR NUMOUT
                LDA #$2C
                JSR OUTC
                LDA SIDE
                BNE OXY1
                LDA YLO
                STA NUM
                LDA YLO+1
                STA NUM+1
                JMP NUMOUT
OXY1:           LDA YHI
                STA NUM
                LDA YHI+1
                STA NUM+1
                JMP NUMOUT

; OFFS: Abstaende i * CW / k fuer k = 1..8, i = 1..k (36 Werte), Beginn je k in KBTAB
KOFFS:          LDY #$00
                LDA #$01
                STA KK
KO1:            LDA #$01
                STA II
KO2:            LDA #$00
                STA NUM
                STA NUM+1
                LDX II
KO3:            CLC
                LDA NUM
                ADC CW
                STA NUM
                LDA NUM+1
                ADC CW+1
                STA NUM+1
                DEX
                BNE KO3
                LDA KK
                STA DV
                JSR DIV8
                LDA NUM
                STA OFFS,Y
                LDA NUM+1
                STA OFFS+1,Y
                INY
                INY
                INC II
                LDA KK
                CMP II
                BCS KO2
                INC KK
                LDA KK
                CMP #$09
                BNE KO1
                RTS

; NUM = NUM / DV (16 durch 8 Bit, DV <= 4)
DIV8:           LDA #$00
                STA REM
                LDX #16
DV1:            ASL NUM
                ROL NUM+1
                ROL REM
                LDA REM
                CMP DV
                BCC DV2
                SBC DV
                STA REM
                INC NUM
DV2:            DEX
                BNE DV1
                RTS

KBTAB:          !byte 0,0,2,6,12,20,30,42,56
POPTAB:         !byte 0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4

; X-Koordinate: X0 + MA * Massstab, dann ","
XOUT:           JSR MULS
                CLC
                LDA NUM
                ADC CFG_X0
                STA NUM
                LDA NUM+1
                ADC CFG_X0+1
                STA NUM+1
                JSR NUMOUT
                LDA #$2C                ; Komma
                JMP OUTC

; Y-Koordinate PY, dann ";"
YOUT:           LDA PY
                STA NUM
                LDA PY+1
                STA NUM+1
                JSR NUMOUT
                LDA #$3B                ; Semikolon
                JMP OUTC

; A = ROWBUF[XP / 8], Z gesetzt wenn 0
BYTEAT:         LDA XP+1
                LSR A
                LDA XP
                ROR A
                LSR A
                LSR A
                TAY
                LDA ROWBUF,Y
                RTS

; C = Punkt an XP (Bit XP and 7, Bit 0 = links)
PIX:            JSR BYTEAT
                PHA
                LDA XP
                AND #$07
                TAY
                PLA
PIX1:           LSR A
                DEY
                BPL PIX1
                RTS

; NUM = MA * CFG_SCL (16 Bit)
MULS:           LDA #$00
                STA NUM
                STA NUM+1
                LDA CFG_SCL
                STA MTMP
                LDX #$08
MUL1:           ASL NUM
                ROL NUM+1
                ASL MTMP
                BCC MUL2
                CLC
                LDA NUM
                ADC MA
                STA NUM
                LDA NUM+1
                ADC MA+1
                STA NUM+1
MUL2:           DEX
                BNE MUL1
                RTS

; NUM dezimal ohne fuehrende Nullen ausgeben (zerstoert NUM)
NUMOUT:         LDA #$00
                STA NZ
                LDX #$00
NO1:            LDA #$00
                STA DIG
NO2:            SEC
                LDA NUM
                SBC POWL,X
                STA MTMP
                LDA NUM+1
                SBC POWH,X
                BCC NO3
                STA NUM+1
                LDA MTMP
                STA NUM
                INC DIG
                JMP NO2
NO3:            LDA DIG
                ORA NZ
                BNE NO4
                CPX #$04                ; letzte Stelle immer ausgeben
                BNE NO5
NO4:            LDA DIG
                ORA #$30
                JSR OUTC
                LDA #$01
                STA NZ
NO5:            INX
                CPX #$05
                BNE NO1
                RTS
POWL:           !byte <10000,<1000,<100,<10,<1
POWH:           !byte >10000,>1000,>100,>10,>1

; Zeichen ausgeben, X und Y bleiben erhalten
OUTC:           STX SVX
                STY SVY
                JSR CHROUT
                LDX SVX
                LDY SVY
                RTS

; HP-GL-Text ab HPGL+Y ausgeben, Ende = Bit 7 gesetzt
HPS:            LDA HPGL,Y
                PHP
                AND #$7F
                JSR OUTC
                INY
                PLP
                BPL HPS
                RTS

HPGL:
H_INIT:         !pet "in;s"
                !byte 'P'+$80
H_END:          !pet "pu;sp0"
                !byte $3B+$80             ; Semikolon mit Endemarke

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
                !pet "2 - bilder vom pc (hsg-link)"
                !byte $0D
                !pet "warte auf daten, stop = menue"
                !byte $0D
                !pet "d/leer = grafik cbm-schirm an/aus"
                !byte $0D
                !pet "plotter: s = schraffur, k = kringel, h = punkte"
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

; Plot-Meldungen (eigene Tabelle, MSGS ist sonst laenger als 256 Byte)
MSG2:           LDA MSGS2,Y
                PHP
                AND #$7F
                JSR CHROUT
                INY
                PLP
                BPL MSG2
                RTS

MSGS2:
M_ASK:          !byte $0D
                !pet "plotten? s=schraffur k=kringel p=punkte n=nein"
                !byte $A0
M_PLOT:         !pet "plotte auf geraet"
                !byte $A0
M_NOPLT:        !pet "plotter antwortet nicht"
                !byte $8D
M_PLOK:         !pet "plot fertig"
                !byte $8D
M_PLAB:         !pet "plot abgebrochen"
                !byte $8D

; ---------------------------------------------------------------- Variablen
SAVESP:         !byte 0
DISP:           !byte 0
IDLE:           !byte 0
PLOTREQ:        !byte 0
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
INVMASK:        !byte 0
PR:             !byte 0,0
GY:             !byte 0,0
PY:             !byte 0,0
XP:             !byte 0,0
XS:             !byte 0,0
MA:             !byte 0,0
NUM:            !byte 0,0
MTMP:           !byte 0
DIG:            !byte 0
NZ:             !byte 0
ANY:            !byte 0
RDX:            !byte 0,0
PLRES:          !byte 0
PMODE:			!byte 0
STOPF:			!byte 0
BR:			!byte 0,0
YLO:			!byte 0,0
YHI:			!byte 0,0
CW:			!byte 0,0
XB:			!byte 0,0
VX:			!byte 0,0
CELL:			!byte 0
KN:			!byte 0
KI:			!byte 0
OI:			!byte 0
SIDE:			!byte 0
ODD:			!byte 0
CNT:			!byte 0
BANY:			!byte 0
KJ:			!byte 0
KK:			!byte 0
II:			!byte 0
DV:			!byte 0
REM:			!byte 0
OFFS:			!byte 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
DIR:			!byte 0
EDGE:			!byte 0
PDOWN:			!byte 0
CONN:			!byte 0
GAPC:			!byte 0
XE:			!byte 0,0
LX:			!byte 0,0
LO:			!byte 0,0
HI:			!byte 0,0
QS:			!byte 0
QM:			!byte 0
QC:			!byte 0
QDM:			!byte 0
QDC:			!byte 0
QN:			!byte 0
QTH:			!byte 0
QIN:			!byte 0
QANY:			!byte 0
QT:			!byte 0,0
QEN:			!byte 0,0
QEX:			!byte 0,0
QRS:			!byte 0,0,0,0		; Streckenanfang x, y (QRE muss direkt folgen)
QRE:			!byte 0,0,0,0		; Streckenende x, y
SVX:            !byte 0
SVY:            !byte 0
ROWBUF:         !byte 0                 ; 64 Byte Zeilenpuffer + 256 Byte Bandpuffer (hinter dem Programm)
