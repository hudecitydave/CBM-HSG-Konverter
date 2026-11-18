; DIREKTPLOT - HSG Image Loader (AndyG, Juli 2024) MIT Ausgabe auf HP-GL-Plotter
; Unveraenderte Grundlage: "LSG Board PET/hsgimage/hsgimage.asm". Aenderungen sind mit NEU markiert:
;  - bei 1040 steht jetzt JMP INIT, dahinter die Plotter-Einstellungen (POKE 1043-1051 wie HSGPLOT)
;  - nach dem Laden fragt das Programm "plotten? p=punkte k=kringel n=nein": P (oder J) plottet
;    Punkt fuer Punkt, K als Zickzack-"Kringel" (schont den Stift), jede andere Taste beendet
;  - Plot-Routine (Zuruecklesen vom HSG-Board, HP-GL ueber IEEE) aus cbm/hsgplot.asm
; Start am CBM:  sys 40960   load "direktplot",8   run
;

; Disassembly of: hsg a000-afff.bin  DATE: 05/05/2024
;
; ---- Equates
;
USRPOK              =$00                          ;USR Function Jump Instr (4C)
USRADD              =$01                          ;USR Address Low Byte / High Byte
CHARAC              =$03                          ;Search Character
charcount           =$04                          ;Flag: Scan for Quote at End of String
blank               =$05                          ;Input Buffer Pointer / No. of Subscripts
DIMFLG              =$06                          ;Flag: Default Array DiMension / array name initial / AND
VAUYP               =$07                          ;Data Type: $FF = String
INTFLG              =$08                          ;Data Type: $80 = Integer
GARBFL              =$09                          ;Flag: DATA scan/LlST quote/Garbage Coll
SUBFLG              =$0A                          ;Flag: Subscript Ref / User Function Call
INPFLG              =$0B                          ;Flag: $00 = INPUT
TANSGN              =$0C                          ;Flag TAN sign / Comparison Result
DSTAT               =$0D                          ;Disk Status DS$ descriptor
FNUM                =$10                          ;File# of current I/O device (when non-zero suppresses INPUT prompt etc)
LINNUM              =$11                          ;Temp: Integer Value
TEMPPT              =$13                          ;Pointer Temporary String
LASTPT              =$14                          ;Last Temp String Address
TEMPST              =$16                          ;Stack for Temporary Strings
INDEX               =$1F                          ;Utility Pointer Area
ARYTAB              =$2C                          ;Pointer: Start of BASIC Arrays
STREND              =$2E                          ;Pointer End of BASIC Arrays (+1)
FRETOP              =$30                          ;Pointer: Bottom of String Storage
FRESPC              =$32                          ;Utility String Pointer
MEMSIZ              =$34                          ;Pointer: Highest Address Used by BASIC
CURLIN              =$36                          ;Current BASIC Line Number
DATPTR              =$3E                          ;Pointer: Current DATA Item Address
FORPNT              =$46                          ;Pointer: Index Variable for FOR/NEXT
TMP1                =$48                          ;Y-save; op-save; BASIC pointer save
CSYMB               =$4A                          ;Comparison symbol accumulator: bits 0
PTMP                =$4B                          ;Pointer to temp storage in RAM for FN DEF
TEMPF1              =$54                          ;Temporary storage for FLPT value.
FACEXP              =$5E                          ;Floating-Point Accumulator #1: Exponent
SGNFLG              =$64                          ;Pointer: Series Evaluation Constant Pointer
ARGHO               =$67                          ;Floating Accum. #2: Mantissa
FACOV               =$6D                          ;Floating Accum. #1. Low-Order (Rounding)
FBUFPT              =$6E                          ;Pointer: Cassette Buffer
CHRGET              =$70                          ;Subroutine: Get Next Byte of BASIC Text
CHRGOT              =$76                          ;Entry to Get Same Byte of Text Again
TXTPTR              =$77                          ;Pointer: Current Byte of BASIC Text
CBINV               =$92                          ;Vector: BRK Instr. Interrupt  
STATUS              =$96                          ;Kernal I/O Status Word: ST
NDX                 =$9E                          ;No. of Chars. in Keyboard Buffer (Queue)
C3PO                =$A0                          ;Flag: Serial Bus-Output Char. Buffered
AVAIL               =$A2                          ;Not Used
BSOUR               =$A5                          ;Buffered Character for IEEE Bus
KEYIMG              =$A6                          ;Key Image
BLNCT               =$A8                          ;Timer: Countdown to Toggle Cursor
GDBLN               =$A9                          ;Character Under Cursor
BLNON               =$AA                          ;Flag: Last Cursor Blink On/Off
LDTND               =$AE                          ;No. of Open Files / Index to File Table
PRTY                =$B1                          ;Tape Character Parity
SAL                 =$C7                          ;Pointer: Tape Buffer/ Screen Scrolling
RCHRER              =$D0                          ;Read character error
FNLEN               =$D1                          ;Length of Current File Name
LA                  =$D2                          ;Current Logical File Number
SA                  =$D3                          ;Current Secondary Address
FA                  =$D4                          ;Current Device Number
LNMX                =$D5                          ;Physical Screen Line Length
TAPE1               =$D6                          ;Pointer: Start of Tape Buffer
TBLX                =$D8                          ;Current Cursor Physical Line Number
DATAX               =$D9                          ;Current Character to Print
FNADR               =$DA                          ;Pointer: Current File Name
MYCH                =$DF                          ;Serial Word Buffer
SCTOP               =$E0                          ;First line of window
SCLF                =$E2                          ;First column of window
RPTFLG              =$E4                          ;Flag: REPEAT Key Used
DELAY               =$E6                          ;Repeat Delay Counter
CAS1                =$F9                          ;Tape Motor Interlock #1
CAS2                =$FA                          ;Tape Motor Interlock #2
FREEFF              =$FF                          ;Not used
BUF                 =$0200                        ;System INPUT Buffer
DOSREC              =$033A                        ;DOS byte parameter in RECORD / char ptr

CHKOUT              =$FFC9                        ;$FFC9 CHKOUT  Set Output
CLRCH               =$FFCC                        ;$FFCC CLRCH   Restore I/O Vector
INPUTB		    =$FFCF
CHROUT              =$FFD2                        ;$FFD2 CHROUT  Output Vector
STOP                =$FFE1 
open		    =$F563
schar		    =$027B
lastline	    =$027C

;***********************
; floppy disc IO calls
;***********************

RCLRCH 		=$F2A6 
RLISTN 		=$F0D5 
RSECND 		=$F143
RCIOUT 		=$F19E
RUNLSN 		=$F1B9
RTALK  		=$F0D2
RTKSA  		=$F193
RACPTR 		=$F1C0
RUNTLK 		=$F1AE
ROPENI 		=$F4A5
           
;**************************
; HSG specific registers
;**************************
MODE		=$AF00

CMD		=$AF70		; acts as status also
CTRL1		=$AF71
CTRL2		=$AF72

DELTAX 		=$AF75			; delta x
DELTAY 		=$AF77			; delta y

X_HIGH		=$AF78
X_LOW		=$AF79
Y_HIGH		=$AF7A
Y_LOW		=$AF7B

; ---- NEU: Equates fuer die Plotter-Ausgabe
GETIN		    =$FFE4			; Taste holen
KOPEN		    =$F563			; BASIC-4-OPEN (wie HSG-ROM hcopy)
KCLOSE		    =$F2E0			; BASIC-4-CLOSE fuer Datei in LA
LFN		    =$7C			; logische Datei 124 fuer den Plotter
MODECOPY	    =$0372			; HSG-ROM: Kopie des Modusregisters
READREG		    =$AF20			; gelesenes Bildbyte (invertiert)
READCMD		    =$0F			; EF936x: Speicherzugriff an X/Y

!TO "direktplot",cbm
;  
* = $0401
  
;
;ENTER COMPILED BASIC TEXT 
;
START_BASIC: 
         		!BYTE <END_BASIC,>END_BASIC		; Link to next line of Basic. In this case the end
	 		!BYTE $0A,$00 				; 10 (Line number)
         		!BYTE $9E 				; SYS (token)
         		!PET "1040"				; 1040 (decimal address)
         		!BYTE $00,$00,$00  
END_BASIC:
	  		NOP		; 1037
	  		NOP		; 1038
	  		NOP		; 1039

; ---- NEU: Start und Plotter-Einstellungen
			JMP INIT		; 1040
CFG_DEV:		!byte 5			; 1043 IEEE-Geraeteadresse des Plotters
CFG_SA:			!byte 0			; 1044 Sekundaeradresse
CFG_SCL:		!byte 14		; 1045 Plotter-Einheiten je Bildpunkt (0,025 mm)
CFG_X0:			!byte <1800,>1800	; 1046/1047 linker Rand
CFG_Y0:			!byte <250,>250		; 1048/1049 unterer Rand
CFG_INV:		!byte 1			; 1050 1 = dunkle Stellen zeichnen (Papier wie Bildschirm), 0 = Negativ
CFG_PEN:		!byte 1			; 1051 Stift-Nummer
CFG_GAP:		!byte 0			; 1052 Luecken bis n Punkte ueberbruecken (0 = aus)
CFG_T:			!byte 2,5,8,11		; 1053-1056 Schraffur: Schwellen fuer Ebene 1-4 (Punkte je 4x4-Zelle, 17 = aus)


                    
; equivalent to 1040 dec

;
; setup for file load
; output welcome title on screen andprompt for filename
;

INIT:  	  		JSR set_start		; setup the HSG board

			LDY #(MSG2-MSG1)
          		JSR MSG         	; Output Entry Message and prompt
              
	   		LDA #<BUF		; set pointer for the filename to the input keyboard buffer
          		STA FNADR
          		LDA #>BUF
          		STA FNADR+1     	; PLACE FOR FILE NAME 
              
          		LDA #8
          		STA FA       		; Defaults to device #8. Guess can change with a POKE command  

;
;INPUT FILE NAME FROM SCREEN TO BUF  
;
          		LDX #0  
INIT1:    
	  		JSR INPUTB  		; get screen text and copy to input buffer
          		CMP #$0D
	  		BEQ INIT2  
          		STA BUF,X  		; store in buffer and get next char until user hits return
          		INX  
          		BNE INIT1  
              
INIT2:    		STX FNLEN  		; store length of text for filename
          		LDA #$0D
          		JSR CHROUT       	; ECHO CR to screen
              
          		LDA FNLEN  
          		BNE LOAD	      	; check not null              
          		RTS  			; user just hit enter	          
              
LOAD:      		LDA #0
          		STA STATUS
              
          		LDA #$60
          		STA SA          	; secondary address (SPECIAL LOAD COMMAND)
              
          		JSR ROPENI       	; OPEN THE FILE
              
          		LDA FA
          		JSR RTALK        	; ESTABLISH CHANNEL
              
          		LDA SA
          		JSR RTKSA        	; TELL IT TO LOAD
			JSR RACPTR       	; get frst byte and store to check if file exists
			TAX			; store in X
			
          		LDA STATUS
          		LSR 
         		LSR 
          		BCS LOAD90        	; FILE NOT FOUND
              		BCC LOAD47

LOAD40:      		JSR STOP		; check if stop key pressed. end if so
			BEQ LOAD75

			LDA #$FD        	; MASK OFF TIMEOUT
          		AND STATUS
          		STA STATUS
              
LOAD45:      		JSR RACPTR       	; DATA BYTE
          		TAX
          		LDA STATUS      	; TIMEOUT?
          		LSR 
          		LSR 
          		BCS LOAD40        	; YES...TRY AGAIN
		
LOAD47:			LDY #$08

LOAD50:			CLC
			TXA
			ROL
			TAX
			BCC LOAD55

			JSR output_hsg
			
LOAD55:			JSR cordinc

			DEY
			BNE LOAD50
	

LOAD70:    		LDA STATUS      ;TIMEOUT?
          		LSR 
          		LSR 
			BIT STATUS      ;EOI?
         		BVC LOAD40      ;NO...
 
;********************
; close the channel
;********************
             
LOAD75:	        	JSR RUNTLK       ;CLOSE CHANNEL             
         		LDA FA		;CLOSE FILE
         		JSR RLISTN
          
         		LDA SA
         		AND #$EF  
         		ORA #$E0  
         		JSR RSECND  
         		JSR RUNLSN  
			JMP ASKPLOT	; NEU: statt RTS - Bild auf den Plotter ausgeben?
		
;*********************
; file not found
;********************* 
            
LOAD90     		JSR RCLRCH  
         		LDY #MSG1-MSG1  
         		JSR MSG         ; output "FILE NOT FOUND ERROR"
         		JMP INIT	; RETRY - get new filename


;Output point to screen in GPU

output_hsg:		LDA #$03		; pen down 		... 07 hs write 
			STA CTRL1
			LDA #$00		; continuous points
			STA CTRL2
			
			lda #$15		; set write point
			STA CMD

			JSR check_gpu		; wait for HSG to finish drawing point
			LDA #$02		; pen up
			STA CTRL1
			RTS
;****************
; increase coordinates by 1
;****************
			
cordinc:		INC X_LOW 		
			LDA X_LOW		
			BEQ cordinc2
                	
cordinc1:		RTS
			
cordinc2:		INC X_HIGH	
                	LDA X_HIGH	
                	CMP #$02			; done 512 bits in X
                	BCC cordinc1			; special_loop0			; not done full row
			
			LDA #$00
			STA X_LOW	 
			STA X_HIGH	 

			SEC
                	LDA Y_LOW	 		; ylow
                	SBC #$01			; 
                	STA Y_LOW	 

	              	LDA Y_HIGH	 
                	SBC #$00
                	STA Y_HIGH	 		; yhi

                	BCS cordinc1			; close out as done
			PLA				; pop return stack
			PLA				; return to finished
			JMP LOAD75
;************
;check GPU finished drawing and ready for next command
;************

check_gpu:         	PHA
check1:			LDA CMD			; graphics processor status register bit 2
           		AND #$04
           		BEQ check1
              		PLA
             		RTS

;*******************
; output welcome message and prompt for filename
;*******************

MSG:     
			LDA MSG1,Y 
        		PHP 
        		AND #$7F 
        		JSR CHROUT 
        		INY 
        		PLP 
       			BPL MSG 
        		RTS 

MSG1:     		!BYTE $0D
			!PET "file not found error - please re-enter filename"
			!BYTE $8D 

MSG2:     		!BYTE $0D,$12
        		!PET "direktplot - hsg image loader + plotter" 
        		!BYTE $0D,$0D,$0D
        		!PET "enter filename ?"
			!BYTE $A0	

set_start:		JSR $AED0			; init HSG board command
			JSR check_gpu 			; check finished executing last command
                       	LDA $0371			; what is the board resoltuon - in Y 512 or 255
                	EOR #$01			; if 1 = 512
                	STA Y_HIGH			; yhigh = 1 = 512 board, 0 = 256 board
                	LDA #$FF			; start at top left so max Y
                	STA Y_LOW			; ylow
			LDA #$00			; 0,0
          		STA X_LOW
			LDA #$00
			STA X_HIGH

;setup delta cords in GPU : make them 0 so plots single point
			
			LDA #$00
			STA DELTAX
			LDA #$00
			STA DELTAY
			RTS



;***************************************************************************
; ---- NEU in DIREKTPLOT: Bild nach dem Laden auf den HP-GL-Plotter ausgeben
;      (Plot-Routine aus cbm/hsgplot.asm uebernommen)
;***************************************************************************

ASKPLOT:		LDA $0371			; 0 = 512 Zeilen, 1 = 256 Zeilen
			EOR #$01
			AND #$01
			STA ROWS512
ASK1:			LDY #M_ASK-PMSGS		; "auf plotter ausgeben (j/n) ?"
			JSR PMSG
ASK2:			JSR STOP			; STOP = Ende
			BEQ ASKEND
			JSR GETIN
			BEQ ASK2
			CMP #'P'		; P oder J = Punkte, K = Kringel
			BEQ ASKP
			CMP #'J'
			BEQ ASKP
			CMP #'K'
			BEQ ASKP
			CMP #'S'		; S = Schraffur
			BNE ASKEND
ASKP:			PHA
			JSR CHROUT
			LDA #$0D
			JSR CHROUT
			PLA
			LDX #$00		; 0 = Punkte, 1 = Kringel, 2 = Schraffur
			CMP #'K'
			BNE ASKP1
			INX
ASKP1:			CMP #'S'
			BNE ASKP2
			LDX #$02
ASKP2:			STX PMODE
			JSR PLOT
			JMP ASK1			; noch einmal plotten?
ASKEND:			LDA #$0D
			JSR CHROUT
			LDA #$02			; pen up
			STA CTRL1
			RTS

PLOT:			JSR check_gpu
			LDA #$02			; Schreiben aus, Lesen veraendert nichts
			STA CTRL1
			LDA #$00
			STA INVMASK
			LDA CFG_INV
			BEQ PL1
			LDA #$FF
			STA INVMASK
PL1:			LDY #M_PLOT-PMSGS		; "plotte auf geraet n"
			JSR PMSG
			LDA CFG_DEV
			STA NUM
			LDA #$00
			STA NUM+1
			JSR NUMOUT
			LDA #$0D
			JSR CHROUT

			LDA #LFN			; OPEN 124,dev,sa
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
			LDY #H_INIT-HPGL		; "IN;SP"
			JSR HPS
			LDA CFG_PEN
			STA NUM
			LDA #$00
			STA NUM+1
			JSR NUMOUT
			LDA #$3B			; Semikolon
			JSR OUTC
			LDA STATUS
			BEQ PL2
			JSR CLRCH			; Plotter antwortet nicht
			JSR PLCLOSE
			LDY #M_NOPLT-PMSGS
			JMP PMSG

PL2:			LDA #$00		; Richtung links->rechts, Stift oben
                STA STOPF
			STA DIR
			STA PDOWN
                LDA PMODE		; 1 = Kringel, 2 = Schraffur
                BEQ PL3
                CMP #$02
                BNE PLK
                JMP HATCH
PLK:            JMP KLOOP
PL3:                LDA #<511			; Plotterzeile 511 (oben) bis 0 (unten)
			STA PR
			LDA #>511
			STA PR+1
PLROW:			JSR STOP
			BEQ PLABRT
			JSR RDROW			; Z=1: Zeile leer
			BNE PLR1
			LDA #$00		; leere Zeile: Stift kommt sicher hoch
			STA PDOWN
			JMP PLNEXT
PLR1:			LDA PR				; PY = Y0 + PR * Massstab
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
PLNEXT:			LDA PR
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

PLDONE:			LDA #$00
			BEQ PLFIN
PLABRT:			LDA #$01
PLFIN:			STA PLRES
			LDY #H_END-HPGL			; "PU;SP0;"
			JSR HPS
			JSR CLRCH
			JSR PLCLOSE
			LDY #M_PLOK-PMSGS
			LDA PLRES
			BEQ PLFIN2
			LDY #M_PLAB-PMSGS
PLFIN2:			JSR PMSG
PLWAIT:			JSR STOP			; STOP loslassen, sonst endet gleich die Abfrage
			BEQ PLWAIT
			RTS

PLCLOSE:		LDA #LFN
			STA LA
			JMP KCLOSE

; Eine Bildzeile (64 Bytes) vom HSG-Board nach ROWBUF lesen; A = ODER aller Bytes
RDROW:			LDA PR				; GY = PR (512 Zeilen) bzw. PR / 2 (256 Zeilen)
			STA GY
			LDA PR+1
			STA GY+1
			LDA ROWS512
			BNE RD1
			LSR GY+1
			ROR GY
RD1:			LDA #$00
			STA ANY
			STA RDX
			STA RDX+1
			TAX
RDLP:			JSR check_gpu
			LDA RDX				; X = Spalte * 8
			STA X_LOW
			LDA RDX+1
			STA X_HIGH
			LDA GY
			STA Y_LOW
			LDA GY+1
			AND #$0F
			STA Y_HIGH
			LDA MODECOPY			; Lesemodus an
			AND #$FE
			STA MODE
			LDA #READCMD
			STA CMD
			JSR check_gpu
			LDA MODECOPY			; Lesemodus aus
			STA MODE
			LDA READREG
			EOR #$FF			; 1 = heller Punkt
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
XOUT:			JSR MULS
			CLC
			LDA NUM
			ADC CFG_X0
			STA NUM
			LDA NUM+1
			ADC CFG_X0+1
			STA NUM+1
			JSR NUMOUT
			LDA #$2C			; Komma
			JMP OUTC

; Y-Koordinate PY, dann ";"
YOUT:			LDA PY
			STA NUM
			LDA PY+1
			STA NUM+1
			JSR NUMOUT
			LDA #$3B			; Semikolon
			JMP OUTC

; A = ROWBUF[XP / 8], Z gesetzt wenn 0
BYTEAT:			LDA XP+1
			LSR A
			LDA XP
			ROR A
			LSR A
			LSR A
			TAY
			LDA ROWBUF,Y
			RTS

; C = Punkt an XP (Bit XP and 7, Bit 0 = links)
PIX:			JSR BYTEAT
			PHA
			LDA XP
			AND #$07
			TAY
			PLA
PIX1:			LSR A
			DEY
			BPL PIX1
			RTS

; NUM = MA * CFG_SCL (16 Bit)
MULS:			LDA #$00
			STA NUM
			STA NUM+1
			LDA CFG_SCL
			STA MTMP
			LDX #$08
MUL1:			ASL NUM
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
MUL2:			DEX
			BNE MUL1
			RTS

; NUM dezimal ohne fuehrende Nullen ausgeben (zerstoert NUM)
NUMOUT:			LDA #$00
			STA NZ
			LDX #$00
NO1:			LDA #$00
			STA DIG
NO2:			SEC
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
NO3:			LDA DIG
			ORA NZ
			BNE NO4
			CPX #$04			; letzte Stelle immer ausgeben
			BNE NO5
NO4:			LDA DIG
			ORA #$30
			JSR OUTC
			LDA #$01
			STA NZ
NO5:			INX
			CPX #$05
			BNE NO1
			RTS
POWL:			!byte <10000,<1000,<100,<10,<1
POWH:			!byte >10000,>1000,>100,>10,>1

; Zeichen ausgeben, X und Y bleiben erhalten
OUTC:			STX SVX
			STY SVY
			JSR CHROUT
			LDX SVX
			LDY SVY
			RTS

; HP-GL-Text ab HPGL+Y ausgeben, Ende = Bit 7 gesetzt
HPS:			LDA HPGL,Y
			PHP
			AND #$7F
			JSR OUTC
			INY
			PLP
			BPL HPS
			RTS

HPGL:
H_INIT:			!pet "in;s"
			!byte 'P'+$80
H_END:			!pet "pu;sp0"
			!byte $3B+$80			; Semikolon mit Endemarke

; Plot-Meldungen, Ende = Bit 7 gesetzt
PMSG:			LDA PMSGS,Y
			PHP
			AND #$7F
			JSR CHROUT
			INY
			PLP
			BPL PMSG
			RTS

PMSGS:
M_ASK:			!byte $0D
			!pet "plotten? s=schraffur k=kringel p=punkte n=nein"
			!byte $A0
M_PLOT:			!pet "plotte auf geraet"
			!byte $A0
M_NOPLT:		!pet "plotter antwortet nicht"
			!byte $8D
M_PLOK:			!pet "plot fertig"
			!byte $8D
M_PLAB:			!pet "plot abgebrochen"
			!byte $8D

; Variablen
ROWS512:		!byte 0
INVMASK:		!byte 0
PR:			!byte 0,0
GY:			!byte 0,0
PY:			!byte 0,0
XP:			!byte 0,0
XS:			!byte 0,0
MA:			!byte 0,0
NUM:			!byte 0,0
MTMP:			!byte 0
DIG:			!byte 0
NZ:			!byte 0
ANY:			!byte 0
RDX:			!byte 0,0
PLRES:			!byte 0
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
SVX:			!byte 0
SVY:			!byte 0
ROWBUF:			!byte 0				; 64 Byte Zeilenpuffer + 256 Byte Bandpuffer (hinter dem Programm)
