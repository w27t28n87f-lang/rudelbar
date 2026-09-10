RUDELBAR v70 – KOMPLETTPAKET

WEB-APP (GitHub Pages)
- index.html
- style.css
- app.js
- manifest.json
- service-worker.js
- Logo-Haupt.png
- Logo-Mobile_Kneipe.png
- Logo-Mode.png
- Logo-Service.png

REGISTRIERUNG NUR PER EINLADUNG
1. supabase_setup_v70.sql einmal im Supabase SQL Editor ausführen.
2. In Supabase Authentication die öffentliche Registrierung deaktivieren.
3. Die Edge Function register-invite aus supabase/functions/register-invite/index.ts deployen.
   Die Funktion muss ohne JWT-Prüfung laufen. Dafür liegt supabase/config.toml bei.
4. Web-App-Dateien auf GitHub Pages ersetzen.
5. Mit dem bisherigen Inhaber-Login anmelden. Der älteste vorhandene Auth-Benutzer
   wird beim Setup automatisch als Admin gesetzt.
6. Auf der Rudelbar-Startseite erscheint für den Admin der Button "Einladungen".
7. Dort Link erstellen und teilen. Der Link ist einmalig und zeitlich begrenzt.

SICHERHEIT
- Ohne gültigen ?invite=...-Token bietet die App keine Registrierung an.
- Die eigentliche Benutzeranlage passiert serverseitig in der Edge Function.
- Der Service-Role-Key steht nie in der Web-App.
- Direkte öffentliche Supabase-Registrierung muss deaktiviert sein, damit niemand
  die Einladungssperre umgehen kann.

TEAMDATEN
- Eingeladene, angemeldete Rudelbar-Mitglieder sehen die gemeinsamen Unternehmensdaten.
- Nur der Admin kann Einladungen erzeugen oder widerrufen.
