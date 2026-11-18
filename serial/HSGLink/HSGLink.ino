/*
  HSGLink – USB (Web Serial) → Userport-Parallelbrücke für CBM 8032 + HSG-Board
  Board: Arduino Pro Micro 5 V / 16 MHz (ATmega32U4), in der Arduino-IDE als „Arduino Leonardo“ wählen.

  Der Pro Micro ist durchsichtig: jedes Byte, das der Browser schickt, legt er auf PA0..PA7,
  erzeugt eine fallende Flanke an CA1 und wartet, bis der CBM über CB2 quittiert
  (CB2 wechselt nach jedem gelesenen Byte den Pegel). Das Rahmenformat („HSG“ + Befehl …)
  wertet erst der Viewer HSGSER auf dem CBM aus.

  Verdrahtung (Userport = untere Kontaktreihe der Platinenkante, Buchstaben):
     Pro Micro   Userport   Signal
     2           C          PA0
     3           D          PA1
     4           E          PA2
     5           F          PA3
     6           H          PA4
     7           J          PA5
     8           K          PA6
     9           L          PA7
     10          B          CA1   (Strobe zum CBM)
     16          M          CB2   (Quittung vom CBM)
     GND         A und N    GND
  Empfohlen: 470-Ohm-Widerstände in Reihe in allen 10 Signalleitungen (Schutz bei Fehlbedienung).
  Den Pro Micro versorgt USB, die 5-V-Leitung des Userports bleibt unbenutzt.

  Rückmeldungen an den Browser (je eine Zeile):
     HSGLINK 1.0          nach dem Verbinden
     N <anzahl>           Zähler der an den CBM übergebenen Bytes: alle 512 Bytes und
                          immer dann, wenn nichts mehr ansteht (Browser erkennt „fertig“)
     E TIMEOUT <anzahl>   CBM hat ein Byte nicht quittiert (Viewer nicht gestartet / Kabel)
     R                    nach einem Fehler wieder bereit
*/

const uint8_t DATA_PINS[8] = {2, 3, 4, 5, 6, 7, 8, 9};  // PA0..PA7
const uint8_t PIN_STROBE = 10;                           // -> CA1
const uint8_t PIN_ACK = 16;                              // <- CB2
const unsigned long ACK_TIMEOUT_MS = 3000;               // Löschen des HSG-Bildschirms dauert etwas
const unsigned long FLUSH_QUIET_MS = 300;

unsigned long sentCount = 0, reportedCount = 0;
bool wasConnected = false;

void report() { Serial.print(F("N ")); Serial.println(sentCount); reportedCount = sentCount; }

void setup() {
  for (uint8_t i = 0; i < 8; i++) { pinMode(DATA_PINS[i], OUTPUT); digitalWrite(DATA_PINS[i], LOW); }
  pinMode(PIN_STROBE, OUTPUT);
  digitalWrite(PIN_STROBE, HIGH);                        // Ruhepegel High, Flanke High→Low = Strobe
  pinMode(PIN_ACK, INPUT_PULLUP);
  Serial.begin(115200);                                  // Baudrate ist bei USB-CDC ohne Bedeutung
}

static inline void putData(uint8_t b) {
  for (uint8_t i = 0; i < 8; i++) digitalWrite(DATA_PINS[i], (b >> i) & 1);
}

// Ein Byte übergeben; false bei Zeitüberschreitung
bool sendByte(uint8_t b) {
  uint8_t ack0 = digitalRead(PIN_ACK);
  putData(b);
  delayMicroseconds(2);                                  // Daten stabil vor dem Strobe
  digitalWrite(PIN_STROBE, LOW);                         // fallende Flanke: CA1-Flag im VIA
  delayMicroseconds(4);
  digitalWrite(PIN_STROBE, HIGH);
  unsigned long t0 = millis();
  while (digitalRead(PIN_ACK) == ack0) {
    if (millis() - t0 > ACK_TIMEOUT_MS) return false;
  }
  return true;
}

// Nach einem Fehler alles verwerfen, bis der Browser eine Weile still ist
void flushInput() {
  unsigned long quiet = millis();
  while (millis() - quiet < FLUSH_QUIET_MS) {
    while (Serial.available()) { Serial.read(); quiet = millis(); }
  }
}

void loop() {
  bool connected = (bool)Serial;                         // DTR gesetzt = Browser verbunden
  if (connected && !wasConnected) { Serial.println(F("HSGLINK 1.0")); sentCount = reportedCount = 0; }
  wasConnected = connected;

  while (Serial.available()) {
    int c = Serial.read();
    if (!sendByte((uint8_t)c)) {
      Serial.print(F("E TIMEOUT ")); Serial.println(sentCount);
      flushInput();
      Serial.println(F("R"));
      reportedCount = sentCount;
      return;
    }
    sentCount++;
    if ((sentCount & 511) == 0) report();
  }
  if (connected && sentCount != reportedCount) report();     // alles übergeben
}
