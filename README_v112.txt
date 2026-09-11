RUDELBAR v112 - REGISTRIERUNGSFIX

Gefundene Hauptfehler in v111:
1. app.js rief weiterhin zuerst die nicht vorhandene Edge Function register-invite auf.
2. index.html lud app.js/style.css/manifest noch mit ?v=110, obwohl Service Worker bereits v111 war. Das konnte alte Dateien aus Safari/PWA-Caches mischen.
3. Registrierung hing damit gleichzeitig von zwei Backend-Wege ab (Edge Function + DB-Trigger). v112 verwendet nur noch EINEN Weg: Supabase Auth signUp + DB-Trigger.

Einmalig ausführen:
- supabase_v112_invite_setup.sql im Supabase SQL Editor komplett ausführen.
- Authentication > Providers > Email: Allow new users to sign up = EIN.
- Danach in der App einen NEUEN Einladungscode erstellen.
