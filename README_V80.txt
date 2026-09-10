RUDELBAR v80 – Rechnungen

Neu:
- Rechnungen für Mode, Facility Service und Security
- atomare fortlaufende Nummern je Bereich/Jahr
- Rechnungspositionen, Netto/MwSt/Gesamt
- PDF erzeugen, teilen oder drucken
- Speicherung lokal + über bestehende moduldaten-Synchronisation in Supabase
- Monatsauszug als CSV
- Entwürfe löschbar; ausgestellte Rechnungen werden storniert statt gelöscht

EINMALIG vor dem Upload:
1. supabase_rechnungen_v80.sql im Supabase SQL Editor ausführen.
2. Danach alle v80 Programmdateien auf GitHub ersetzen.
3. App neu öffnen.

Hinweis:
Für eine neue fortlaufende Nummer muss die App online sein. So entstehen bei mehreren Geräten keine doppelten Nummern.
Die PDF-Erstellung nutzt jsPDF über CDN; bei der ersten Verwendung ist Internet nötig.
