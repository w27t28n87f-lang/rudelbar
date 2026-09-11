RUDELBAR v118

Änderungen:
- Besitzerkonto martin_kuester1988@web.de wird per SQL wieder als Superuser gesetzt.
- Mobile Kneipe > Archiv: Superuser kann einzelne Tagesabschlüsse löschen.
- Beim Löschen eines Tagesabschlusses bleiben die einzelnen Verkäufe im Verlauf erhalten.
- Löschen ist absichtlich nur für Superuser sichtbar.
- Cache-Version auf v118 erhöht.

Einmalig nach dem GitHub-Upload:
Supabase > SQL Editor > supabase_v118_superuser_fix.sql vollständig ausführen.
Danach die App einmal neu laden bzw. ab- und wieder anmelden, damit die Rolle neu gelesen wird.
