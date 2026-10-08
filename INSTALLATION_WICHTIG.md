# Rudelbar v136 + Akademie: Installationshinweise

## Wichtig: Umfang der Ausgangsdatei
Die hochgeladene `Rudelbar_Reset_v135(1).zip` enthielt **nur `index.html` und `app.js`**. Die hier erzeugte ZIP enthält diese beiden vollständig aktualisierten Dateien sowie den vollständigen Akademie-Code, zusätzliche CSS/JS-Dateien und das SQL-Setup. **Die ursprünglich in Rudelbar verwendeten Bilder, `style.css`, `manifest.json` und ggf. weitere Ressourcen sind nicht im Upload enthalten und konnten daher nicht beigefügt werden.** Die ZIP ist ein vollständiges *Update-Paket für das vorhandene Rudelbar-GitHub-Repository*, kein unabhängig lauffähiger Ersatz ohne die bestehenden Ressourcen.

## Installation
1. Vorher eine Sicherung des aktuellen Rudelbar-Repositories und der Supabase-Datenbank erstellen.
2. Die Dateien/Ordner aus dieser ZIP in die **Wurzel des vorhandenen Rudelbar-Repositories** hochladen. Vorhandene `index.html` und `app.js` ersetzen. **Andere vorhandene Dateien (insbesondere `style.css`, Logos, Bilder und `manifest.json`) nicht löschen.**
3. Im **bestehenden Rudelbar-Supabase-Projekt** den Inhalt von `AKADEMIE_SUPABASE_SETUP.sql` im SQL Editor ausführen. Das Akademie-Supabase-Projekt ist nicht das Ziel; die App verwendet die bereits vorhandenen Rudelbar-Logins.
4. GitHub Pages neu laden (ggf. Strg+F5), als Superuser Teamverwaltung öffnen, Freigaben per Checkbox setzen, **Speichern**. Mitarbeiter sehen nur freigegebene Lernfelder.
5. Test auf iPhone, iPad (hoch/quer), Android/Pixel, Desktop und im echten Kassenbetrieb durchführen, bevor live gearbeitet wird.

## Was ist umgesetzt?
- Fünfte Kachel „Akademie“; die bestehenden vier Sparten bleiben.
- Bestehende Rudelbar-Supabase-Anmeldung wird durch dieselbe Supabase-Projektkonfiguration auch in der Akademie genutzt.
- Lernbereiche: Unternehmertum, Marketing, Mobile Kneipe, Security § 34a; Übungen und Probeprüfung aus der Akademie v6.
- Superuser können Lernfelder in der Teamverwaltung pro Benutzer freigeben, serverseitig gespeichert in `academy_access`.
- SQL-RLS schützt persönliche Lernfortschritte und Berechtigungsdaten. Die **statischen Lerninhalte** sind im Browsercode enthalten und daher technisch nicht vertraulich; eine echte serverseitige Auslieferung pro Berechtigung wäre eine separate Ausbaustufe.
- Neues responsives Zusatzstylesheet für breite Desktop-Monitore, Tablets und Mobilgeräte.

## Bekannte Grenzen / noch zu prüfen
- Das Originalstylesheet und Bilder fehlten im hochgeladenen ZIP. Ihre Wirkung auf das neue responsive CSS konnte nicht visuell getestet werden.
- Das Kassensystem wurde in dieser Version **nicht fachlich repariert**. Keine Behauptung, dass SumUp, Pfand, Rückgaben oder Kassenabschluss jetzt fehlerfrei sind.
- Supabase-Tabellen und bestehende RPC-Funktionen wurden nicht live getestet. `get_rudelbar_role()` muss im Rudelbar-Projekt existieren. SQL vor produktivem Einsatz prüfen.
- Die Prüfungssimulation enthält eigens formulierte Übungsfragen, keine offiziellen historischen IHK-Prüfungsfragen.
- Die alten Akademie-Fortschritte im **separaten** Akademie-Supabase-Projekt werden nicht automatisch migriert.
- Für ein vollständig selbstständig lauffähiges ZIP benötigen wir noch das vollständige Rudelbar-Repository inklusive Styles, Bilder und Manifest.
