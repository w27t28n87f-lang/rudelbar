RUDELBAR v113

Änderung Registrierung:
- Nach erfolgreicher Registrierung wird der neue Benutzer sofort angemeldet und direkt in die App weitergeleitet.
- Es ist keine E-Mail-Bestätigung in der App vorgesehen.
- Dafür muss in Supabase EINMAL die Option "Confirm email" deaktiviert werden:
  Authentication -> Providers -> Email -> Confirm email = AUS
- "Allow new users to sign up" muss eingeschaltet bleiben.
- Die Rudelbar-Einladung bleibt weiterhin Pflicht; der Datenbank-Trigger aus v112/v113 prüft den Einladungscode.

WICHTIG FÜR BEREITS ANGELEGTE, NOCH NICHT BESTÄTIGTE KONTEN:
Falls bereits ein Konto mit derselben E-Mail-Adresse angelegt wurde, bevor "Confirm email" ausgeschaltet wurde, kann es nötig sein, diesen unbestätigten Benutzer in Supabase Authentication -> Users zu löschen und anschließend eine neue Rudelbar-Einladung zu erzeugen.
