# Rudelbar v160 – Komplettpaket

Ausgangsbasis: rudelbar-main(3).zip. Bestehende Logos, Kassensystem, Teamverwaltung, Module und Service Worker sind enthalten.

## Vor dem Einsatz
1. GitHub-Repository und Supabase-Datenbank sichern.
2. Die Dateien aus dem Ordner rudelbar-main vollständig in das bestehende GitHub-Repository übernehmen, ohne Tabellen oder Benutzer zu löschen.
3. Im SQL Editor des **bestehenden Rudelbar-Supabase-Projekts** die Datei AKADEMIE_SUPABASE_SETUP.sql prüfen und einmal ausführen. Keine SQL-Datei im Academy-Zweitprojekt ausführen.
4. App neu laden, ggf. bestehende PWA schließen und neu öffnen.
5. Als Superuser unter Team die Lernfelder je Person anhaken und Speichern drücken.
6. Mit einem Mitarbeiterkonto prüfen, dass ausschließlich freigegebene Lernfelder erscheinen.
7. Kasse, Pfand, SumUp, Offline-Modus und Einladungen vor dem Live-Einsatz separat prüfen.

## Wichtig
- Akademie verwendet dieselbe Rudelbar-Supabase-URL und denselben Anmeldespeicher auf derselben Domain.
- Freigaben werden in academy_access per Supabase-RPC gespeichert, nicht nur im Browser.
- Das SQL legt neue Akademie-Tabellen und Regeln an. Vorher Backup und Prüfung auf vorhandene gleichnamige Tabellen durchführen.
- Ein automatisierter Live-Test mit dem bestehenden Supabase-Projekt ist hier nicht erfolgt.
- Die separate Akademie-Website und ihre dortigen Fortschrittsdaten werden nicht automatisch übertragen.
