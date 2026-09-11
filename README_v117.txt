RUDELBAR v117

Neu:
- Rollen: Superuser und Mitarbeiter
- Superuser hat vollständigen Zugriff auf Einstellungen und Einladungen
- Beim Erstellen eines Einladungslinks wird die Rolle festgelegt
- Mitarbeiter sehen in den Einstellungen nur das eigene Konto und App-Informationen
- Button "Konto löschen" mit doppelter Bestätigung
- "Fertig" in Unterseiten geht erst eine Ebene zurück; Einladungen kehren zu Team & Einladungen zurück
- transparenter Wolf aus dem Rechnungsdesign auf der Startseite

WICHTIG – EINMALIG:
1. Alle Dateien aus diesem Paket ins GitHub-Root hochladen/ersetzen.
2. In Supabase > SQL Editor die Datei supabase_v117_roles_setup.sql komplett ausführen.
3. Danach Seite neu laden.

Bestehende Rollen:
- Bestehende Admins werden automatisch Superuser.
- Alle übrigen bestehenden Benutzer werden Mitarbeiter.

Die E-Mail-Bestätigung bleibt wie bisher deaktiviert.
