RUDELBAR v116

Änderung Rechnungen:
- Der Button im Rechnungseditor heißt jetzt „Rechnung erstellen & teilen“.
- Beim Tippen wird der Rechnungsdatensatz weiterhin lokal und in Supabase gespeichert/synchronisiert.
- Direkt danach wird die PDF erzeugt und das native Teilen-Menü des Geräts geöffnet.
- Abbrechen des Teilen-Menüs erzeugt keine Fehlermeldung mehr.

Speicherorte:
- Lokal im Browser: rudelbar_modul_<bereich>_rechnungen
- Cloud-Synchronisierung: Supabase-Tabelle moduldaten
- PDFs selbst werden nicht automatisch gespeichert, sondern beim PDF/Teilen/Drucken jeweils neu erzeugt.
