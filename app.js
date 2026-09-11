const $ = id => document.getElementById(id);

const SUPABASE_URL = "https://tntxevhyxplhmoxlcwzd.supabase.co";
const SUPABASE_KEY = "sb_publishable_YMGXkfmudWcDqrzD_GlJyg_F6RtEfSd";

const GETRAENKE_KEY = "rudelbar_getraenke";
const VERKAEUFE_KEY = "rudelbar_verkaeufe";
const ABSCHLUSS_KEY = "rudelbar_abschluesse";
const SYNC_KEY = "rudelbar_sync_queue";
const EMAIL_KEY = "rudelbar_login_email";

const sb = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  }
);

let getraenke = laden(GETRAENKE_KEY, [
  { id: neueID(), name: "Pils", preis: 3.50, bild: null },
  { id: neueID(), name: "Radler", preis: 3.50, bild: null },
  { id: neueID(), name: "Cola", preis: 3.00, bild: null },
  { id: neueID(), name: "Wasser", preis: 2.50, bild: null }
]);

let verkaeufe = laden(VERKAEUFE_KEY, []);
let abschluesse = laden(ABSCHLUSS_KEY, []);
let syncQueue = laden(SYNC_KEY, []);

let warenkorb = {};
let editID = null;
let neuesBild = null;
let verkaufEditID = null;
let verkaufEditPositionen = [];
let realtimeChannel = null;
let angemeldet = false;
let syncLaeuft = false;
let aktuellerUser = null;
let istAdmin = false;
let aktuelleRolle = "mitarbeiter";


/* GRUNDLAGEN */

function neueID() {
  return crypto.randomUUID();
}

function laden(key, fallback) {
  try {
    const daten = localStorage.getItem(key);
    return daten ? JSON.parse(daten) : fallback;
  } catch {
    return fallback;
  }
}

function speichernLokal() {
  try {
    localStorage.setItem(GETRAENKE_KEY, JSON.stringify(getraenke));
    localStorage.setItem(VERKAEUFE_KEY, JSON.stringify(verkaeufe));
    localStorage.setItem(ABSCHLUSS_KEY, JSON.stringify(abschluesse));
    localStorage.setItem(SYNC_KEY, JSON.stringify(syncQueue));
    return true;
  } catch (error) {
    console.error(error);
    alert("Lokaler Speicher ist voll. Bitte große Getränkefotos verkleinern.");
    return false;
  }
}

function euro(wert) {
  return Number(wert).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR"
  });
}

function zahl(text) {
  return Number(
    String(text)
      .replace(/\./g, "")
      .replace(",", ".")
  ) || 0;
}

function esc(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}


/* SUPABASE DATENFORMATE */

function getraenkZuDB(g) {
  return {
    id: g.id,
    name: g.name,
    preis: Number(g.preis),
    bild_url: g.bild || null,
    aktiv: true
  };
}

function getraenkVonDB(g) {
  return {
    id: g.id,
    name: g.name,
    preis: Number(g.preis),
    bild: g.bild_url || null
  };
}

function verkaufZuDB(v) {
  return {
    id: v.id,
    datum: v.datum,
    zahlungsart: v.zahlungsart,
    gesamt: Number(v.gesamt),
    positionen: v.positionen,
    abgeschlossen: !!v.abgeschlossen,
    abschluss_id: v.abschlussID || null
  };
}

function verkaufVonDB(v) {
  return {
    id: v.id,
    datum: v.datum,
    zahlungsart: v.zahlungsart,
    gesamt: Number(v.gesamt),
    positionen: v.positionen || [],
    abgeschlossen: !!v.abgeschlossen,
    abschlussID: v.abschluss_id || null
  };
}

function abschlussZuDB(a) {
  return {
    id: a.id,
    datum: a.datum,
    veranstaltung: a.veranstaltung || "Tagesabschluss",
    anfangsbestand: Number(a.start ?? a.anfangsbestand ?? 0),
    einlagen: Number(a.einlagen || 0),
    entnahmen: Number(a.entnahmen || 0),
    ausgaben: Number(a.ausgaben || 0),
    bar: Number(a.bar || 0),
    karte: Number(a.karte || 0),
    gesamt: Number(a.gesamt || 0),
    soll: Number(a.soll || 0),
    ist: Number(a.ist || 0),
    differenz: Number(a.diff ?? a.differenz ?? 0)
  };
}

function abschlussVonDB(a) {
  return {
    id: a.id,
    datum: a.datum,
    veranstaltung: a.veranstaltung || "Tagesabschluss",
    start: Number(a.anfangsbestand || 0),
    einlagen: Number(a.einlagen || 0),
    entnahmen: Number(a.entnahmen || 0),
    ausgaben: Number(a.ausgaben || 0),
    bar: Number(a.bar || 0),
    karte: Number(a.karte || 0),
    gesamt: Number(a.gesamt || 0),
    soll: Number(a.soll || 0),
    ist: Number(a.ist || 0),
    diff: Number(a.differenz || 0)
  };
}



/* MODUL-DATEN: SUPABASE */

function modulZuDB(bereich, modul, eintrag) {
  return {
    id: eintrag.id,
    bereich,
    modul,
    daten: eintrag,
    updated_at: eintrag.updatedAt || new Date().toISOString()
  };
}

function modulVonDB(row) {
  const daten = row.daten && typeof row.daten === "object" ? row.daten : {};
  return {
    ...daten,
    id: row.id,
    createdAt: daten.createdAt || row.created_at || new Date().toISOString(),
    updatedAt: daten.updatedAt || row.updated_at || new Date().toISOString()
  };
}

function lokaleModulSammlung() {
  const sammlung = [];
  const prefix = "rudelbar_modul_";

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;

    const rest = key.slice(prefix.length);
    const pos = rest.indexOf("_");
    if (pos < 1) continue;

    const bereich = rest.slice(0, pos);
    const modul = rest.slice(pos + 1);
    const daten = laden(key, []);

    if (!Array.isArray(daten)) continue;
    daten.forEach(eintrag => {
      if (eintrag?.id) sammlung.push({ bereich, modul, eintrag });
    });
  }

  return sammlung;
}

function modulLokalspeicherLeeren() {
  const prefix = "rudelbar_modul_";
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  keys.forEach(key => localStorage.removeItem(key));
}

function remoteModuldatenLokalSpeichern(rows) {
  modulLokalspeicherLeeren();
  const gruppen = new Map();

  (rows || []).forEach(row => {
    const key = modulKey(row.bereich, row.modul);
    if (!gruppen.has(key)) gruppen.set(key, []);
    gruppen.get(key).push(modulVonDB(row));
  });

  gruppen.forEach((daten, key) => {
    localStorage.setItem(key, JSON.stringify(daten));
  });

  if (!$('modulAnsicht').classList.contains('versteckt') && aktiverBereich && aktivesModul) {
    modulRendern();
  }
}

async function moduldatenErstSynchronisieren(remoteRows) {
  const lokale = lokaleModulSammlung();
  const remoteMap = new Map((remoteRows || []).map(row => [row.id, row]));
  const ergebnis = new Map();

  function setze(bereich, modul, eintrag) {
    const key = modulKey(bereich, modul);
    if (!ergebnis.has(key)) ergebnis.set(key, new Map());
    ergebnis.get(key).set(eintrag.id, eintrag);
  }

  (remoteRows || []).forEach(row => setze(row.bereich, row.modul, modulVonDB(row)));

  lokale.forEach(({ bereich, modul, eintrag }) => {
    const remote = remoteMap.get(eintrag.id);

    if (!remote) {
      setze(bereich, modul, eintrag);
      queueUpsert("moduldaten", modulZuDB(bereich, modul, eintrag));
      return;
    }

    const lokalZeit = Date.parse(eintrag.updatedAt || eintrag.createdAt || 0) || 0;
    const remoteZeit = Date.parse(remote.updated_at || remote.daten?.updatedAt || remote.created_at || 0) || 0;

    if (lokalZeit > remoteZeit) {
      setze(bereich, modul, eintrag);
      queueUpsert("moduldaten", modulZuDB(bereich, modul, eintrag));
    }
  });

  modulLokalspeicherLeeren();
  ergebnis.forEach((map, key) => {
    localStorage.setItem(key, JSON.stringify([...map.values()]));
  });
}

/* SYNC STATUS */

function syncStatus(status, text) {
  const box = $("syncStatus");

  box.className = "sync-status " + status;
  $("syncText").textContent = text;
}

function statusAktualisieren() {
  if (!navigator.onLine) {
    syncStatus("offline", "Offline");
    return;
  }

  if (syncQueue.length > 0) {
    syncStatus("wartet", `${syncQueue.length} wartet`);
    return;
  }

  if (angemeldet) {
    syncStatus("online", "Synchronisiert");
  } else {
    syncStatus("offline", "Nicht angemeldet");
  }
}


/* OFFLINE QUEUE */

function queueUpsert(table, payload) {
  syncQueue = syncQueue.filter(
    x => !(x.table === table && x.id === payload.id)
  );

  syncQueue.push({
    id: payload.id,
    table,
    action: "upsert",
    payload
  });

  speichernLokal();
  statusAktualisieren();
  syncStarten();
}

function queueDelete(table, id) {
  syncQueue = syncQueue.filter(
    x => !(x.table === table && x.id === id)
  );

  syncQueue.push({
    id,
    table,
    action: "delete"
  });

  speichernLokal();
  statusAktualisieren();
  syncStarten();
}

async function syncStarten() {
  if (
    syncLaeuft ||
    !angemeldet ||
    !navigator.onLine ||
    !syncQueue.length
  ) {
    statusAktualisieren();
    return;
  }

  syncLaeuft = true;
  syncStatus("wartet", "Synchronisiere…");

  while (syncQueue.length && navigator.onLine) {
    const job = syncQueue[0];

    let result;

    if (job.action === "delete") {
      result = await sb
        .from(job.table)
        .delete()
        .eq("id", job.id);
    } else {
      result = await sb
        .from(job.table)
        .upsert(job.payload);
    }

    if (result.error) {
      console.error("Sync Fehler:", result.error);
      syncStatus("fehler", "Sync-Fehler");
      break;
    }

    syncQueue.shift();
    speichernLokal();
  }

  syncLaeuft = false;
  statusAktualisieren();
}


/* LOGIN */

async function authStart() {
  if (!window.supabase) {
    syncStatus("fehler", "Supabase fehlt");
    return;
  }

  const { data } = await sb.auth.getSession();
  aktuellerUser = data.session?.user || null;

  if (data.session) {
    angemeldet = true;
    await nachLogin();
    return;
  }

  $("loginEmail").value = localStorage.getItem(EMAIL_KEY) || "";

  const token = einladungsTokenAusURL();
  $("registrierenOeffnen").classList.remove("versteckt");
  if (token) registrierungOeffnen();
  else $("loginDialog").showModal();
}

async function anmelden() {
  const email = $("loginEmail").value.trim();
  const passwort = $("loginPasswort").value;

  $("loginFehler").textContent = "";

  if (!email || !passwort) {
    $("loginFehler").textContent = "Bitte E-Mail und Passwort eingeben.";
    return;
  }

  $("loginButton").disabled = true;
  $("loginButton").textContent = "Anmelden…";

  const { error } = await sb.auth.signInWithPassword({
    email,
    password: passwort
  });

  $("loginButton").disabled = false;
  $("loginButton").textContent = "Anmelden";

  if (error) {
    $("loginFehler").textContent = "Anmeldung fehlgeschlagen.";
    console.error(error);
    return;
  }

  localStorage.setItem(EMAIL_KEY, email);

  angemeldet = true;
  const sessionResult = await sb.auth.getSession();
  aktuellerUser = sessionResult.data.session?.user || null;

  if ($("loginDialog").open) $("loginDialog").close();

  await nachLogin();
}

async function nachLogin() {
  const sessionResult = await sb.auth.getSession();
  aktuellerUser = sessionResult.data.session?.user || null;
  await adminStatusLaden();
  statusAktualisieren();

  if (syncQueue.length) {
    await syncStarten();

    if (syncQueue.length) {
      realtimeStarten();
      startNachLogin();
      return;
    }
  }

  await ersteSynchronisierung();
  realtimeStarten();
  startNachLogin();
}


/* EINSTELLUNGEN */
const APP_SETTINGS_KEY = "rudelbar_app_settings_v94";
let appSettings = { startbereich:"start", creatorSpalten:"2", animationen:true };

function appSettingsLaden(){
  try{
    const gespeichert=JSON.parse(localStorage.getItem(APP_SETTINGS_KEY)||"{}");
    appSettings={...appSettings,...gespeichert};
  }catch{}
  appSettingsAnwenden();
}
function appSettingsAnwenden(){
  document.body.classList.toggle("creator-3spalten-mobile",String(appSettings.creatorSpalten)==="3");
  document.body.classList.toggle("reduzierte-animationen",appSettings.animationen===false);
}
function appSettingsSpeichern(){
  appSettings.startbereich=$("settingsStartbereich")?.value||"start";
  appSettings.creatorSpalten=$("settingsCreatorSpalten")?.value||"2";
  appSettings.animationen=$("settingsAnimationen")?.checked!==false;
  localStorage.setItem(APP_SETTINGS_KEY,JSON.stringify(appSettings));
  appSettingsAnwenden();
}
function settingsSeiteOeffnen(name="home") {
  const geschuetzt=["team","unternehmen","rechnungen","darstellung"];
  if (aktuelleRolle !== "superuser" && geschuetzt.includes(name)) name="home";
  document.querySelectorAll(".settings-page").forEach(el=>el.classList.remove("aktiv"));
  const id=name==="home"?"settingsHome":"settingsPage"+name[0].toUpperCase()+name.slice(1);
  $(id)?.classList.add("aktiv");
}
function settingsRolleAnwenden(){
  document.body.classList.toggle("rolle-mitarbeiter", aktuelleRolle !== "superuser");
  document.body.classList.toggle("rolle-superuser", aktuelleRolle === "superuser");
  document.querySelectorAll(".superuser-only").forEach(el=>el.classList.toggle("versteckt", aktuelleRolle !== "superuser"));
  document.querySelectorAll(".superuser-only-page").forEach(el=>{
    if (aktuelleRolle !== "superuser") el.classList.remove("aktiv");
  });
}

async function eigenesKontoLoeschen(){
  if (!aktuellerUser) return;
  const rolleText = aktuelleRolle === "superuser" ? "Superuser" : "Mitarbeiter";
  const erste = confirm(`Dein ${rolleText}-Konto wirklich dauerhaft löschen?`);
  if (!erste) return;
  const zweite = confirm("Letzte Bestätigung: Das Konto wird sofort gelöscht und kann nicht wiederhergestellt werden.");
  if (!zweite) return;

  const btn=$("settingsKontoLoeschen");
  if(btn){ btn.disabled=true; btn.textContent="Konto wird gelöscht…"; }
  const { error } = await sb.rpc("delete_my_rudelbar_account");
  if (error) {
    console.error(error);
    alert("Konto konnte nicht gelöscht werden. Bitte zuerst das Supabase-v117-Setup ausführen.");
    if(btn){ btn.disabled=false; btn.textContent="🗑 Konto löschen"; }
    return;
  }

  try { await sb.auth.signOut(); } catch {}
  localStorage.removeItem(EMAIL_KEY);
  location.replace(basisAppURL().toString());
}

function einstellungenOeffnen(){
  settingsSeiteOeffnen("home");
  $("settingsName").textContent=aktuellerUser?.user_metadata?.name||"–";
  $("settingsEmail").textContent=aktuellerUser?.email||"–";
  $("settingsRolle").textContent=aktuelleRolle==="superuser"?"Superuser":"Mitarbeiter";
  if($("settingsZugangInfo")) $("settingsZugangInfo").textContent=aktuelleRolle==="superuser"?"Vollzugriff":"Nur eigenes Konto";
  if(aktuelleRolle==="superuser"){
    $("settingsStartbereich").value=appSettings.startbereich||"start";
    $("settingsCreatorSpalten").value=appSettings.creatorSpalten||"2";
    $("settingsAnimationen").checked=appSettings.animationen!==false;
    rechnungsSettingsInUI();
  }
  $("settingsInviteBtn")?.classList.toggle("versteckt",!istAdmin);
  $("einstellungenDialog").showModal();
}
function einstellungenSchliessen(){
  const homeAktiv=$("settingsHome")?.classList.contains("aktiv");
  if(!homeAktiv){
    settingsSeiteOeffnen("home");
    return;
  }
  if(aktuelleRolle==="superuser"){
    appSettingsSpeichern();
    rechnungsSettingsAusUI();
  }
  if($("einstellungenDialog").open) $("einstellungenDialog").close();
}
async function appAdresseTeilen(){
  const url=basisAppURL().toString();
  if(navigator.share){
    try{ await navigator.share({title:"Rudelbar App",text:"Rudelbar App",url}); return; }
    catch(error){ if(error?.name==="AbortError") return; }
  }
  try{ await navigator.clipboard.writeText(url); alert("App-Adresse kopiert."); }
  catch{ alert(url); }
}
function startNachLogin(){
  const ziel=appSettings.startbereich||"start";
  if(["kneipe","mode","service","security"].includes(ziel)) bereichMenuZeigen(ziel);
  else startseiteZeigen();
}

/* EINLADUNGEN / REGISTRIERUNG */

const INVITE_TOKEN_KEY = "rudelbar_invite_token";

function inviteTokenNormalisieren(wert) {
  const raw = String(wert || "").trim();
  if (!raw) return "";

  // Vollständige URL akzeptieren. Eine normale App-URL OHNE invite darf niemals
  // versehentlich selbst als Einladungscode interpretiert werden.
  try {
    const url = new URL(raw);
    let token = (url.searchParams.get("invite") || "").trim();
    if (!token && url.hash) {
      const hash = url.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash.includes("?") ? hash.split("?").pop() : hash);
      token = (params.get("invite") || "").trim();
    }
    return token;
  } catch (_) {}

  // Auch eingefügte Fragmente wie invite=ABC oder ?invite=ABC akzeptieren.
  if (/invite=/i.test(raw)) {
    try {
      const teil = raw.replace(/^.*?[?#]/, "").replace(/^#/, "");
      const params = new URLSearchParams(teil);
      const token = (params.get("invite") || "").trim();
      if (token) return token;
    } catch (_) {}
    const match = raw.match(/(?:^|[?&#])invite=([^&#\s]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1]).trim();
  }

  // Reiner Code als Fallback.
  return raw.replace(/\s+/g, "");
}

function inviteCodeErzeugen() {
  // Gut abtippbarer Einmalcode ohne leicht verwechselbare Zeichen.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}

function istNurNormaleAppURL(wert) {
  const raw = String(wert || "").trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    const token = inviteTokenNormalisieren(raw);
    return !token && url.origin === window.location.origin;
  } catch (_) {
    return false;
  }
}

function inviteTokenSpeichern(token) {
  const clean = inviteTokenNormalisieren(token);
  if (!clean) return "";
  sessionStorage.setItem(INVITE_TOKEN_KEY, clean);
  localStorage.setItem(INVITE_TOKEN_KEY, clean);
  return clean;
}

function einladungsTokenAusURL() {
  // v111: Query + Hash + Session + LocalStorage. Query und Hash werden beim
  // Erstellen absichtlich gleichzeitig gesetzt, damit iOS/WhatsApp mindestens
  // eine der beiden Varianten transportiert.
  let token = "";
  try {
    token = inviteTokenNormalisieren(window.location.href);
    if (token) return inviteTokenSpeichern(token);
  } catch (e) {
    console.warn("Einladungslink konnte nicht gelesen werden:", e);
  }

  token = sessionStorage.getItem(INVITE_TOKEN_KEY) || localStorage.getItem(INVITE_TOKEN_KEY) || "";
  return inviteTokenNormalisieren(token);
}

function einladungsTokenAktuell() {
  const automatisch = einladungsTokenAusURL();
  if (automatisch) return automatisch;
  const manuell = inviteTokenNormalisieren($("registerInviteManuell")?.value || "");
  return manuell ? inviteTokenSpeichern(manuell) : "";
}

function registrierungInviteStatusAktualisieren(token) {
  const status = $("registerInviteStatus");
  const fallback = $("registerInviteFallback");
  if (status) {
    status.textContent = token
      ? "✓ Persönliche Einladung erkannt. Du kannst jetzt dein eigenes Konto anlegen."
      : "Der Einladungslink konnte nicht automatisch erkannt werden. Füge unten den vollständigen Link oder den Einladungscode ein.";
    status.classList.toggle("ok", Boolean(token));
  }
  fallback?.classList.toggle("versteckt", Boolean(token));
}

function inviteManuellUebernehmen() {
  const feld = $("registerInviteManuell");
  const raw = feld?.value || "";
  $("registerFehler").textContent = "";
  $("registerErfolg").textContent = "";

  // Eine normale Rudelbar-Adresse ist KEINE Einladung. Alte, eventuell ungültige
  // Tokens werden in diesem Fall bewusst entfernt, damit sie nicht heimlich weiterverwendet werden.
  if (istNurNormaleAppURL(raw)) {
    sessionStorage.removeItem(INVITE_TOKEN_KEY);
    localStorage.removeItem(INVITE_TOKEN_KEY);
    registrierungInviteStatusAktualisieren("");
    $("registerFehler").textContent = "Das ist nur die normale Rudelbar-Adresse. Bitte den persönlichen Einladungscode (12 Zeichen) oder den vollständigen Einladungslink einfügen.";
    return;
  }

  const token = inviteTokenNormalisieren(raw);
  if (!token) {
    $("registerFehler").textContent = "Bitte den persönlichen Einladungscode oder den vollständigen Einladungslink einfügen.";
    return;
  }
  inviteTokenSpeichern(token);
  registrierungInviteStatusAktualisieren(token);
  $("registerErfolg").textContent = `Einladungscode ${token} übernommen. Du kannst das Konto jetzt erstellen.`;
}

function basisAppURL() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url;
}

async function adminStatusLaden() {
  istAdmin = false;
  aktuelleRolle = "mitarbeiter";
  $("settingsInviteBtn")?.classList.add("versteckt");

  if (!aktuellerUser) {
    settingsRolleAnwenden();
    return;
  }

  // v117: Rolle serverseitig aus app_roles lesen. Nicht aus veränderbaren User-Metadaten.
  const { data: roleData, error: roleError } = await sb.rpc("get_rudelbar_role");
  if (!roleError && typeof roleData === "string") {
    aktuelleRolle = roleData === "superuser" ? "superuser" : "mitarbeiter";
    istAdmin = aktuelleRolle === "superuser";
  } else {
    // Rückwärtskompatibilität, falls das v117-SQL noch nicht ausgeführt wurde.
    const { data, error } = await sb.rpc("is_rudelbar_admin");
    if (error) console.warn("Rollenstatus konnte nicht geladen werden:", error.message);
    istAdmin = data === true;
    aktuelleRolle = istAdmin ? "superuser" : "mitarbeiter";
  }

  if (istAdmin) $("settingsInviteBtn")?.classList.remove("versteckt");
  settingsRolleAnwenden();
}

function registrierungOeffnen() {
  const token = einladungsTokenAusURL();
  if ($("loginDialog").open) $("loginDialog").close();
  $("registerFehler").textContent = "";
  $("registerErfolg").textContent = "";
  $("registerPasswort").value = "";
  $("registerPasswort2").value = "";
  registrierungInviteStatusAktualisieren(token);
  // Eingabefelder bleiben immer bedienbar. Der Invite-Token wird erst beim Absenden geprüft.
  // Dadurch kann ein iPhone den Nutzer nicht mehr in einem scheinbar "eingefrorenen" Formular festhalten.
  ["registerName","registerEmail","registerPasswort","registerPasswort2","registerButton"].forEach(id=>{
    const el=$(id);
    if(!el) return;
    el.disabled=false;
    el.removeAttribute("readonly");
    el.style.pointerEvents="auto";
    el.style.webkitUserSelect="text";
    el.style.userSelect="text";
  });
  const reg = $("registrierungDialog");
  reg.classList.remove("versteckt");
  document.body.classList.add("register-offen");
  setTimeout(() => {
    const feld = $("registerName");
    if (feld) { feld.removeAttribute("readonly"); feld.disabled = false; feld.focus({preventScroll:true}); }
  }, 180);
}

function registrierungZurLogin() {
  $("registrierungDialog").classList.add("versteckt");
  document.body.classList.remove("register-offen");
  $("loginDialog").showModal();
}

async function registrierenMitEinladung() {
  const token = einladungsTokenAktuell();
  const name = $("registerName").value.trim();
  const email = $("registerEmail").value.trim().toLowerCase();
  const passwort = $("registerPasswort").value;
  const passwort2 = $("registerPasswort2").value;

  $("registerFehler").textContent = "";
  $("registerErfolg").textContent = "";

  if (!token) {
    $("registerFehler").textContent = "Einladung fehlt. Bitte den Einladungslink oder Einladungscode einfügen.";
    registrierungInviteStatusAktualisieren("");
    return;
  }
  if (!name || !email || !passwort || !passwort2) {
    $("registerFehler").textContent = "Bitte alle Felder ausfüllen.";
    return;
  }
  if (passwort.length < 8) {
    $("registerFehler").textContent = "Das Passwort muss mindestens 8 Zeichen lang sein.";
    return;
  }
  if (passwort !== passwort2) {
    $("registerFehler").textContent = "Die Passwörter stimmen nicht überein.";
    return;
  }

  $("registerButton").disabled = true;
  $("registerButton").textContent = "Konto wird erstellt…";

  try {
    // v113: bewusst KEIN Aufruf einer Edge Function mehr.
    // Der Einladungscode wird vom DB-Trigger aus supabase_v112_invite_setup.sql
    // direkt beim Supabase-Auth-Signup geprüft und atomar verbraucht.
    const { data: signUpData, error: signUpError } = await sb.auth.signUp({
      email,
      password: passwort,
      options: {
        data: {
          name,
          rudelbar_invite_token: token
        }
      }
    });

    if (signUpError) {
      let detail = String(signUpError.message || "Registrierung fehlgeschlagen.");
      if (/signups? not allowed|signup.*disabled|user signups? are disabled/i.test(detail)) {
        detail = "Registrierung ist in Supabase noch deaktiviert. In Authentication → Providers → Email muss 'Allow new users to sign up' aktiviert sein.";
      } else if (/database error saving new user/i.test(detail)) {
        detail = "Der Einladungscode ist ungültig, abgelaufen oder das v112-Supabase-Setup wurde noch nicht vollständig ausgeführt.";
      } else if (/user already registered|already been registered|already registered/i.test(detail)) {
        detail = "Für diese E-Mail-Adresse existiert bereits ein Konto. Bitte stattdessen anmelden.";
      }
      throw new Error(detail);
    }

    if (!signUpData?.user) {
      throw new Error("Supabase hat kein Benutzerkonto zurückgegeben. Bitte das v112-Supabase-Setup prüfen.");
    }

    // Für Rudelbar ist keine zusätzliche E-Mail-Bestätigung gewünscht.
    // Wenn Supabase "Confirm Email" deaktiviert hat, liefert signUp sofort eine Session.
    // Falls wider Erwarten keine Session zurückkommt, probieren wir genau einmal den
    // direkten Login. So landet ein korrekt konfiguriertes Konto unmittelbar in der App.
    let aktiveSession = signUpData.session || null;

    if (!aktiveSession) {
      const { data: loginData, error: loginError } = await sb.auth.signInWithPassword({
        email,
        password: passwort
      });
      if (!loginError && loginData?.session) {
        aktiveSession = loginData.session;
      }
    }

    if (!aktiveSession) {
      throw new Error(
        "Das Konto wurde erstellt, aber Supabase verlangt noch eine E-Mail-Bestätigung. " +
        "Bitte in Supabase unter Authentication → Providers → Email die Option 'Confirm email' ausschalten. " +
        "Danach wird beim Registrieren keine Bestätigungs-Mail mehr benötigt und der neue Benutzer landet direkt in der App."
      );
    }

    // Erst nach erfolgreicher Session den lokal gespeicherten Einladungscode entfernen.
    sessionStorage.removeItem(INVITE_TOKEN_KEY);
    localStorage.removeItem(INVITE_TOKEN_KEY);

    $("registerErfolg").textContent = "Konto erstellt. Die App wird geöffnet…";
    localStorage.setItem(EMAIL_KEY, email);
    angemeldet = true;
    aktuellerUser = aktiveSession.user || null;

    // v114: Nach erfolgreicher Registrierung erzwingen wir einen sauberen Neustart
    // auf der normalen App-URL. Supabase speichert die aktive Session bereits im
    // Browser. Beim Neuladen liest authStart() diese Session und öffnet direkt die App.
    // Das ist auf iOS/Safari robuster als nur DOM-Ansichten umzuschalten, weil dort
    // die Registrierungsansicht nach signUp() gelegentlich sichtbar blieb.
    const clean = basisAppURL();
    $("registrierungDialog").classList.add("versteckt");
    document.body.classList.remove("register-offen");

    // Session noch einmal explizit im Client setzen, falls Safari den signUp-State
    // verzögert in den Storage schreibt.
    if (aktiveSession?.access_token && aktiveSession?.refresh_token) {
      const { error: sessionError } = await sb.auth.setSession({
        access_token: aktiveSession.access_token,
        refresh_token: aktiveSession.refresh_token
      });
      if (sessionError) console.warn("Session konnte nicht erneut gesetzt werden:", sessionError.message);
    }

    // Kurzer Frame erlaubt Safari, den Session-Storage sicher zu schreiben.
    await new Promise(resolve => setTimeout(resolve, 120));
    window.location.replace(clean.toString());
    return;
  } catch (error) {
    console.error(error);
    const meldung = error?.message || "Registrierung fehlgeschlagen.";
    $("registerFehler").textContent = meldung;

    // Nur bei echten Invite-Problemen den lokal gespeicherten Code verwerfen.
    if (/invite|einladung|token|abgelaufen|ungültig|invalid|expired/i.test(meldung)) {
      sessionStorage.removeItem(INVITE_TOKEN_KEY);
      localStorage.removeItem(INVITE_TOKEN_KEY);
      registrierungInviteStatusAktualisieren("");
    }
    $("registerInviteFallback")?.classList.remove("versteckt");
  } finally {
    $("registerButton").disabled = false;
    $("registerButton").textContent = "Konto erstellen";
  }
}

async function einladungenOeffnen() {
  if (!istAdmin) {
    alert("Nur der Administrator kann Einladungen erstellen.");
    return;
  }

  $("einladungName").value = "";
  $("einladungErgebnis").classList.add("versteckt");
  $("einladungLink").value = "";
  await einladungenLaden();
  $("einladungDialog").showModal();
}

async function einladungenLaden() {
  const liste = $("einladungListe");
  liste.innerHTML = '<div class="daten-leer"><span>Lade Einladungen…</span></div>';

  const { data, error } = await sb
    .from("einladungen")
    .select("id,label,rolle,expires_at,used_at,created_at")
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    liste.innerHTML = '<div class="daten-leer"><strong>Fehler</strong><span>Einladungen konnten nicht geladen werden.</span></div>';
    return;
  }

  if (!data?.length) {
    liste.innerHTML = '<div class="daten-leer"><strong>Keine aktiven Einladungen</strong><span>Erstelle oben einen neuen Link.</span></div>';
    return;
  }

  liste.innerHTML = data.map(item => {
    const bis = new Date(item.expires_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
    return `
      <article class="einladung-karte">
        <div>
          <strong>${esc(item.label || "Einladung")}</strong>
          <small>${item.rolle === "superuser" ? "Superuser" : "Mitarbeiter"} · gültig bis ${esc(bis)}</small>
        </div>
        <button class="daten-loeschen" data-invite-revoke="${item.id}" type="button">Widerrufen</button>
      </article>`;
  }).join("");

  liste.querySelectorAll("[data-invite-revoke]").forEach(button => {
    button.onclick = () => einladungWiderrufen(button.dataset.inviteRevoke);
  });
}

async function einladungErstellen() {
  if (!istAdmin || !aktuellerUser) return;

  const label = $("einladungName").value.trim() || "Rudelbar-Mitglied";
  const rolle = $("einladungRolle")?.value === "superuser" ? "superuser" : "mitarbeiter";
  const tage = Math.max(1, Number($("einladungTage").value) || 7);
  const token = inviteCodeErzeugen();
  const expires = new Date(Date.now() + tage * 86400000).toISOString();

  $("einladungErstellen").disabled = true;
  $("einladungErstellen").textContent = "Erstelle…";

  const { error } = await sb.from("einladungen").insert({
    token,
    label,
    rolle,
    created_by: aktuellerUser.id,
    expires_at: expires
  });

  $("einladungErstellen").disabled = false;
  $("einladungErstellen").textContent = "+ Einladungslink erstellen";

  if (error) {
    console.error(error);
    alert("Einladung konnte nicht erstellt werden.");
    return;
  }

  const url = basisAppURL();
  // Doppelte Transport-Sicherung: Query UND Hash enthalten denselben Token.
  // Fällt eine Variante durch WhatsApp/Safari weg, bleibt die andere erhalten.
  url.searchParams.set("invite", token);
  url.hash = `invite=${encodeURIComponent(token)}`;
  $("einladungLink").value = url.toString();
  if ($("einladungCode")) $("einladungCode").value = token;
  $("einladungErgebnis").classList.remove("versteckt");
  await einladungenLaden();
}

async function einladungWiderrufen(id) {
  if (!confirm("Diese Einladung wirklich widerrufen?")) return;
  const { error } = await sb.from("einladungen").delete().eq("id", id);
  if (error) {
    console.error(error);
    alert("Einladung konnte nicht widerrufen werden.");
    return;
  }
  await einladungenLaden();
}

async function einladungLinkKopieren() {
  const link = $("einladungLink").value;
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    alert("Einladungslink kopiert.");
  } catch {
    $("einladungLink").focus();
    $("einladungLink").select();
    alert("Link ist markiert und kann kopiert werden.");
  }
}

async function einladungCodeKopieren() {
  const code = $("einladungCode")?.value || "";
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    alert("Einladungscode kopiert.");
  } catch {
    alert(code);
  }
}

async function einladungLinkTeilen() {
  const url = $("einladungLink").value;
  if (!url) return;
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Rudelbar Einladung",
        text: `Hier ist deine persönliche Einladung zur Rudelbar-App.\n\nRolle: ${$("einladungRolle")?.value === "superuser" ? "Superuser" : "Mitarbeiter"}\nEinladungscode: ${$("einladungCode")?.value || ""}\n\nFalls der Link auf dem iPhone gekürzt wird, einfach den 12-stelligen Code in der Registrierung eingeben.`,
        url
      });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  await einladungLinkKopieren();
}

async function abmelden() {
  if (!confirm("Von der Rudelbar-App abmelden?")) return;

  if (realtimeChannel) {
    try { await sb.removeChannel(realtimeChannel); } catch {}
    realtimeChannel = null;
  }

  await sb.auth.signOut();
  angemeldet = false;
  aktuellerUser = null;
  istAdmin = false;
  aktuelleRolle = "mitarbeiter";
  $("settingsInviteBtn")?.classList.add("versteckt");
  alleHauptansichtenVerstecken();
  statusAktualisieren();

  $("loginEmail").value = localStorage.getItem(EMAIL_KEY) || "";
  $("loginPasswort").value = "";
  $("loginFehler").textContent = "";
  $("loginDialog").showModal();
}


/* ERSTE SYNCHRONISIERUNG */

async function ersteSynchronisierung() {
  if (!navigator.onLine) {
    statusAktualisieren();
    return;
  }

  syncStatus("wartet", "Lade Daten…");

  const [
    remoteGetraenke,
    remoteVerkaeufe,
    remoteAbschluesse,
    remoteModuldaten
  ] = await Promise.all([
    sb.from("getraenke").select("*").eq("aktiv", true),
    sb.from("verkaeufe").select("*"),
    sb.from("tagesabschluesse").select("*"),
    sb.from("moduldaten").select("*")
  ]);

  if (
    remoteGetraenke.error ||
    remoteVerkaeufe.error ||
    remoteAbschluesse.error ||
    remoteModuldaten.error
  ) {
    console.error(
      remoteGetraenke.error,
      remoteVerkaeufe.error,
      remoteAbschluesse.error,
      remoteModuldaten.error
    );

    syncStatus("fehler", "Verbindung fehlerhaft");
    return;
  }

  if (remoteGetraenke.data.length === 0 && getraenke.length) {
    getraenke.forEach(g => queueUpsert("getraenke", getraenkZuDB(g)));
  } else if (remoteGetraenke.data.length) {
    getraenke = remoteGetraenke.data.map(getraenkVonDB);
  }

  if (remoteVerkaeufe.data.length === 0 && verkaeufe.length) {
    verkaeufe.forEach(v => queueUpsert("verkaeufe", verkaufZuDB(v)));
  } else if (remoteVerkaeufe.data.length) {
    verkaeufe = remoteVerkaeufe.data.map(verkaufVonDB);
  }

  if (remoteAbschluesse.data.length === 0 && abschluesse.length) {
    abschluesse.forEach(a =>
      queueUpsert("tagesabschluesse", abschlussZuDB(a))
    );
  } else if (remoteAbschluesse.data.length) {
    abschluesse = remoteAbschluesse.data.map(abschlussVonDB);
  }

  await moduldatenErstSynchronisieren(remoteModuldaten.data || []);

  speichernLokal();
  render();

  await syncStarten();
  statusAktualisieren();
}


/* REMOTE KOMPLETT NEU LADEN */

async function remoteNeuLaden() {
  if (!angemeldet || !navigator.onLine || syncQueue.length) return;

  const [g, v, a, m] = await Promise.all([
    sb.from("getraenke").select("*").eq("aktiv", true),
    sb.from("verkaeufe").select("*"),
    sb.from("tagesabschluesse").select("*"),
    sb.from("moduldaten").select("*")
  ]);

  if (g.error || v.error || a.error || m.error) return;

  getraenke = g.data.map(getraenkVonDB);
  verkaeufe = v.data.map(verkaufVonDB);
  abschluesse = a.data.map(abschlussVonDB);
  remoteModuldatenLokalSpeichern(m.data || []);

  speichernLokal();
  render();

  if ($("statistikDialog").open) statistikInhaltRendern();
  if ($("abschlussDialog").open) abschlussAktualisieren();
}


/* REALTIME */

function realtimeStarten() {
  if (realtimeChannel) return;

  realtimeChannel = sb
    .channel("rudelbar-live")

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "getraenke"
      },
      () => remoteNeuLaden()
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "verkaeufe"
      },
      () => remoteNeuLaden()
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "tagesabschluesse"
      },
      () => remoteNeuLaden()
    )

    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "moduldaten"
      },
      () => remoteNeuLaden()
    )

    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        statusAktualisieren();
      }
    });
}


/* SVG */

function bierSVG() {
  return `
    <svg class="becher-icon" viewBox="0 0 24 24">
      <path d="M6 3h9v17H6z"/>
      <path d="M15 6h2.5a3.5 3.5 0 0 1 0 7H15"/>
      <path d="M8 7v9M11 7v9"/>
      <path d="M6 5c2 1 3-1 5 0 2 1 3-1 4 0"/>
    </svg>`;
}

function stiftSVG() {
  return `
    <svg viewBox="0 0 24 24">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>
    </svg>`;
}

function trashSVG() {
  return `
    <svg viewBox="0 0 24 24">
      <path d="M3 6h18"/>
      <path d="M8 6V4h8v2"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v5M14 11v5"/>
    </svg>`;
}

function leerWarenkorbHTML() {
  return `
    <div class="leer">
      <svg class="leer-icon" viewBox="0 0 24 24">
        <path d="M3 3h2l2 12h10l3-8H6"/>
        <circle cx="9" cy="20" r="1"/>
        <circle cx="18" cy="20" r="1"/>
      </svg>
      <p>Noch keine Getränke</p>
    </div>`;
}


/* RENDER */

function render() {
  renderGetraenke();
  renderWarenkorb();
}

function renderGetraenke() {
  $("getraenkeListe").innerHTML = getraenke.map(g => {
    const anzahl = warenkorb[g.id] || 0;

    return `
      <article class="getraenk">

        <button class="getraenk-hauptbereich" data-add="${g.id}">

          <div class="getraenk-bild">
            ${
              g.bild
                ? `<img src="${g.bild}" alt="${esc(g.name)}">`
                : bierSVG()
            }
          </div>

          <div class="getraenk-name">${esc(g.name)}</div>
          <div class="getraenk-preis">${euro(g.preis)}</div>

          ${
            anzahl
              ? `<div class="ausgewaehlt">${anzahl} × gewählt</div>`
              : ""
          }

        </button>

        <div class="getraenk-aktionen">

          <button class="aktion bearbeiten" data-edit="${g.id}">
            ${stiftSVG()}
          </button>

          <button class="aktion entfernen" data-delete="${g.id}">
            ${trashSVG()}
          </button>

        </div>

      </article>`;
  }).join("");

  document.querySelectorAll("[data-add]").forEach(button => {
    button.onclick = () => {
      const id = button.dataset.add;
      warenkorb[id] = (warenkorb[id] || 0) + 1;
      render();
    };
  });

  document.querySelectorAll("[data-edit]").forEach(button => {
    button.onclick = () => getraenkBearbeiten(button.dataset.edit);
  });

  document.querySelectorAll("[data-delete]").forEach(button => {
    button.onclick = () => getraenkLoeschen(button.dataset.delete);
  });
}

function renderWarenkorb() {
  const liste = getraenke.filter(g => (warenkorb[g.id] || 0) > 0);

  if (!liste.length) {
    $("warenkorb").innerHTML = leerWarenkorbHTML();
  } else {
    $("warenkorb").innerHTML = liste.map(g => `
      <div class="warenkorb-zeile">

        <div class="warenkorb-info">
          <strong>${esc(g.name)}</strong>
          <small>${euro(g.preis)}</small>
        </div>

        <div class="warenkorb-steuerung">
          <button data-minus="${g.id}">−</button>
          <strong>${warenkorb[g.id]}</strong>
          <button data-plus="${g.id}">+</button>
        </div>

        <strong class="warenkorb-summe">
          ${euro(g.preis * warenkorb[g.id])}
        </strong>

      </div>
    `).join("");
  }

  document.querySelectorAll("[data-minus]").forEach(button => {
    button.onclick = () => {
      const id = button.dataset.minus;
      warenkorb[id]--;

      if (warenkorb[id] <= 0) delete warenkorb[id];

      render();
    };
  });

  document.querySelectorAll("[data-plus]").forEach(button => {
    button.onclick = () => {
      const id = button.dataset.plus;
      warenkorb[id] = (warenkorb[id] || 0) + 1;
      render();
    };
  });

  const summe = gesamtpreis();
  $("gesamtpreis").textContent = euro(summe);

  const anzahl = Object.values(warenkorb).reduce((sum, menge) => sum + Number(menge || 0), 0);
  const artikelAnzahl = $("artikelAnzahl");
  const kompaktGesamt = $("kompaktGesamt");
  if (artikelAnzahl) artikelAnzahl.textContent = `${anzahl} ${anzahl === 1 ? "Artikel" : "Artikel"}`;
  if (kompaktGesamt) kompaktGesamt.textContent = euro(summe);
}

function gesamtpreis() {
  return getraenke.reduce(
    (summe, g) => summe + (warenkorb[g.id] || 0) * g.preis,
    0
  );
}


/* GETRÄNKE */

function neuesGetraenkOeffnen() {
  editID = null;
  neuesBild = null;

  $("dialogTitel").textContent = "Getränk hinzufügen";
  $("nameInput").value = "";
  $("preisInput").value = "";
  $("bildInput").value = "";
  $("bildVorschau").innerHTML = "";

  $("getraenkDialog").showModal();
}

function getraenkBearbeiten(id) {
  const g = getraenke.find(x => x.id === id);
  if (!g) return;

  editID = id;
  neuesBild = g.bild || null;

  $("dialogTitel").textContent = "Getränk bearbeiten";
  $("nameInput").value = g.name;
  $("preisInput").value = String(g.preis).replace(".", ",");
  $("bildInput").value = "";

  $("bildVorschau").innerHTML = g.bild
    ? `<img src="${g.bild}" alt="${esc(g.name)}">`
    : "";

  $("getraenkDialog").showModal();
}

function getraenkSpeichern() {
  const name = $("nameInput").value.trim();
  const preis = zahl($("preisInput").value);

  if (!name) {
    alert("Bitte einen Namen eingeben.");
    return;
  }

  if (!preis || preis <= 0) {
    alert("Bitte einen gültigen Preis eingeben.");
    return;
  }

  let g;

  if (editID) {
    g = getraenke.find(x => x.id === editID);
    if (!g) return;

    g.name = name;
    g.preis = preis;
    g.bild = neuesBild;
  } else {
    g = {
      id: neueID(),
      name,
      preis,
      bild: neuesBild
    };

    getraenke.push(g);
  }

  speichernLokal();
  queueUpsert("getraenke", getraenkZuDB(g));

  render();
  $("getraenkDialog").close();
}

function getraenkLoeschen(id) {
  const g = getraenke.find(x => x.id === id);
  if (!g) return;

  if (!confirm(`${g.name} wirklich löschen?`)) return;

  getraenke = getraenke.filter(x => x.id !== id);
  delete warenkorb[id];

  speichernLokal();
  queueDelete("getraenke", id);

  render();
}


/* FOTO */

$("bildInput").onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    neuesBild = await bildVerkleinern(file, 700, 0.65);

    $("bildVorschau").innerHTML = `
      <img src="${neuesBild}" alt="Getränk">
    `;
  } catch (error) {
    console.error(error);
    alert("Das Foto konnte nicht verarbeitet werden.");
  }
};

function bildVerkleinern(file, maxGroesse = 700, qualitaet = 0.65) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = reject;

    reader.onload = () => {
      const img = new Image();

      img.onerror = reject;

      img.onload = () => {
        let breite = img.width;
        let hoehe = img.height;

        if (breite > maxGroesse || hoehe > maxGroesse) {
          const faktor = Math.min(
            maxGroesse / breite,
            maxGroesse / hoehe
          );

          breite = Math.round(breite * faktor);
          hoehe = Math.round(hoehe * faktor);
        }

        const canvas = document.createElement("canvas");

        canvas.width = breite;
        canvas.height = hoehe;

        const ctx = canvas.getContext("2d");

        ctx.drawImage(img, 0, 0, breite, hoehe);

        resolve(
          canvas.toDataURL("image/jpeg", qualitaet)
        );
      };

      img.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}


/* VERKAUF */

function verkaufAbschliessen(zahlungsart) {
  const gesamt = gesamtpreis();
  if (!gesamt) return;

  const positionen = getraenke
    .filter(g => warenkorb[g.id])
    .map(g => ({
      getraenkId: g.id,
      name: g.name,
      preis: g.preis,
      anzahl: warenkorb[g.id]
    }));

  const verkauf = {
    id: neueID(),
    datum: new Date().toISOString(),
    zahlungsart,
    gesamt,
    positionen,
    abgeschlossen: false,
    abschlussID: null
  };

  verkaeufe.push(verkauf);

  warenkorb = {};

  speichernLokal();
  queueUpsert("verkaeufe", verkaufZuDB(verkauf));

  render();
}


/* STATISTIK */

function heuteVerkaeufe() {
  const heute = new Date().toDateString();

  return verkaeufe.filter(
    v => new Date(v.datum).toDateString() === heute
  );
}

function offeneVerkaeufe() {
  return verkaeufe.filter(v => !v.abgeschlossen);
}

function aggregieren(liste) {
  const map = {};
  let anzahl = 0;
  let gesamt = 0;

  liste.forEach(v => {
    gesamt += Number(v.gesamt);

    v.positionen.forEach(p => {
      anzahl += p.anzahl;

      if (!map[p.name]) {
        map[p.name] = {
          anzahl: 0,
          umsatz: 0
        };
      }

      map[p.name].anzahl += p.anzahl;
      map[p.name].umsatz += p.preis * p.anzahl;
    });
  });

  return { map, anzahl, gesamt };
}

function getraenkeTabelle(daten) {
  const zeilen = Object.entries(daten.map)
    .sort((a, b) => b[1].anzahl - a[1].anzahl)
    .map(([name, x]) => `
      <tr>
        <td>${esc(name)}</td>
        <td>${x.anzahl}</td>
        <td>${euro(x.umsatz)}</td>
      </tr>
    `)
    .join("");

  return `
    <table class="tabelle">

      <thead>
        <tr>
          <th>Getränk</th>
          <th>Stück</th>
          <th>Umsatz</th>
        </tr>
      </thead>

      <tbody>

        ${zeilen}

        <tr class="gesamt">
          <td>GESAMT</td>
          <td>${daten.anzahl}</td>
          <td>${euro(daten.gesamt)}</td>
        </tr>

      </tbody>

    </table>`;
}

function statistikOeffnen() {
  statistikInhaltRendern();
  $("statistikDialog").showModal();
}

function statistikInhaltRendern() {
  const v = heuteVerkaeufe();
  const daten = aggregieren(v);

  $("statistikInhalt").innerHTML = `

    <div class="stat-karten">

      <div class="stat">
        <span>Verkäufe</span>
        <strong>${v.length}</strong>
      </div>

      <div class="stat">
        <span>Getränke</span>
        <strong>${daten.anzahl}</strong>
      </div>

      <div class="stat">
        <span>Gesamt</span>
        <strong>${euro(daten.gesamt)}</strong>
      </div>

    </div>

    <h3>Verkaufte Getränke</h3>

    ${getraenkeTabelle(daten)}

    <h3>Einzelne Verkäufe</h3>

    <table class="tabelle">

      <thead>
        <tr>
          <th>Zeit</th>
          <th>Zahlung</th>
          <th>Betrag</th>
          <th></th>
        </tr>
      </thead>

      <tbody>

        ${v.map(x => `
          <tr>

            <td>
              ${new Date(x.datum).toLocaleTimeString(
                "de-DE",
                {
                  hour: "2-digit",
                  minute: "2-digit"
                }
              )}
            </td>

            <td>${x.zahlungsart}</td>

            <td>${euro(x.gesamt)}</td>

            <td>
              <div class="verkauf-aktion">

                <button class="mini-button" data-verkauf-edit="${x.id}">
                  ${stiftSVG()}
                </button>

                <button class="mini-button loeschen" data-verkauf-delete="${x.id}">
                  ${trashSVG()}
                </button>

              </div>
            </td>

          </tr>
        `).join("")}

      </tbody>

    </table>
  `;

  document.querySelectorAll("[data-verkauf-edit]").forEach(button => {
    button.onclick = () =>
      verkaufBearbeitenOeffnen(button.dataset.verkaufEdit);
  });

  document.querySelectorAll("[data-verkauf-delete]").forEach(button => {
    button.onclick = () =>
      verkaufDirektLoeschen(button.dataset.verkaufDelete);
  });
}


/* VERKAUF BEARBEITEN */

function verkaufBearbeitenOeffnen(id) {
  const verkauf = verkaeufe.find(v => v.id === id);
  if (!verkauf) return;

  verkaufEditID = id;

  const map = new Map();

  verkauf.positionen.forEach(p => {
    map.set(
      p.getraenkId || `alt-${p.name}`,
      {
        getraenkId: p.getraenkId || `alt-${p.name}`,
        name: p.name,
        preis: Number(p.preis),
        anzahl: Number(p.anzahl)
      }
    );
  });

  getraenke.forEach(g => {
    if (!map.has(g.id)) {
      map.set(g.id, {
        getraenkId: g.id,
        name: g.name,
        preis: g.preis,
        anzahl: 0
      });
    }
  });

  verkaufEditPositionen = [...map.values()];

  $("verkaufZahlungsart").value = verkauf.zahlungsart;

  renderVerkaufEdit();

  $("verkaufDialog").showModal();
}

function renderVerkaufEdit() {
  $("verkaufPositionen").innerHTML = verkaufEditPositionen.map(p => `
    <div class="verkauf-position">

      <div class="verkauf-position-info">
        <strong>${esc(p.name)}</strong>
        <small>${euro(p.preis)}</small>
      </div>

      <div class="verkauf-menge">

        <button data-edit-minus="${esc(p.getraenkId)}">
          −
        </button>

        <strong>${p.anzahl}</strong>

        <button data-edit-plus="${esc(p.getraenkId)}">
          +
        </button>

      </div>

      <strong>${euro(p.preis * p.anzahl)}</strong>

    </div>
  `).join("");

  document.querySelectorAll("[data-edit-minus]").forEach(button => {
    button.onclick = () => {
      const p = verkaufEditPositionen.find(
        x => x.getraenkId === button.dataset.editMinus
      );

      if (p && p.anzahl > 0) {
        p.anzahl--;
        renderVerkaufEdit();
      }
    };
  });

  document.querySelectorAll("[data-edit-plus]").forEach(button => {
    button.onclick = () => {
      const p = verkaufEditPositionen.find(
        x => x.getraenkId === button.dataset.editPlus
      );

      if (p) {
        p.anzahl++;
        renderVerkaufEdit();
      }
    };
  });

  const gesamt = verkaufEditPositionen.reduce(
    (summe, p) => summe + p.preis * p.anzahl,
    0
  );

  $("verkaufEditGesamt").textContent = euro(gesamt);
}

function verkaufBearbeitungSpeichern() {
  const verkauf = verkaeufe.find(v => v.id === verkaufEditID);
  if (!verkauf) return;

  const positionen = verkaufEditPositionen.filter(p => p.anzahl > 0);

  if (!positionen.length) {
    alert("Der Verkauf enthält keine Getränke mehr.");
    return;
  }

  verkauf.zahlungsart = $("verkaufZahlungsart").value;

  verkauf.positionen = positionen.map(p => ({
    getraenkId: p.getraenkId.startsWith("alt-") ? null : p.getraenkId,
    name: p.name,
    preis: p.preis,
    anzahl: p.anzahl
  }));

  verkauf.gesamt = positionen.reduce(
    (summe, p) => summe + p.preis * p.anzahl,
    0
  );

  speichernLokal();

  queueUpsert(
    "verkaeufe",
    verkaufZuDB(verkauf)
  );

  if (verkauf.abschlussID) {
    abschlussNeuBerechnen(verkauf.abschlussID);
  }

  $("verkaufDialog").close();

  statistikInhaltRendern();
}

function verkaufBearbeitungLoeschen() {
  if (!verkaufEditID) return;

  const verkauf = verkaeufe.find(v => v.id === verkaufEditID);
  if (!verkauf) return;

  if (!confirm("Diesen Verkauf wirklich löschen?")) return;

  const abschlussID = verkauf.abschlussID;

  verkaeufe = verkaeufe.filter(v => v.id !== verkaufEditID);

  speichernLokal();
  queueDelete("verkaeufe", verkaufEditID);

  if (abschlussID) {
    abschlussNeuBerechnen(abschlussID);
  }

  $("verkaufDialog").close();

  statistikInhaltRendern();
}

function verkaufDirektLoeschen(id) {
  const verkauf = verkaeufe.find(v => v.id === id);
  if (!verkauf) return;

  if (!confirm("Diesen Verkauf wirklich löschen?")) return;

  const abschlussID = verkauf.abschlussID;

  verkaeufe = verkaeufe.filter(v => v.id !== id);

  speichernLokal();
  queueDelete("verkaeufe", id);

  if (abschlussID) {
    abschlussNeuBerechnen(abschlussID);
  }

  statistikInhaltRendern();
}


/* TAGESABSCHLUSS */

function abschlussBerechnen() {
  const v = offeneVerkaeufe();
  const daten = aggregieren(v);

  const bar = v
    .filter(x => x.zahlungsart === "Bar")
    .reduce((summe, x) => summe + Number(x.gesamt), 0);

  const karte = v
    .filter(x => x.zahlungsart === "Karte")
    .reduce((summe, x) => summe + Number(x.gesamt), 0);

  const start = zahl($("anfangsbestandInput").value);
  const einlagen = zahl($("einlagenInput").value);
  const entnahmen = zahl($("entnahmenInput").value);
  const ausgaben = zahl($("ausgabenInput").value);
  const ist = zahl($("istKasseInput").value);

  const soll =
    start +
    bar +
    einlagen -
    entnahmen -
    ausgaben;

  const diff = ist - soll;

  return {
    v,
    daten,
    bar,
    karte,
    start,
    einlagen,
    entnahmen,
    ausgaben,
    ist,
    soll,
    diff
  };
}

function abschlussAktualisieren() {
  const d = abschlussBerechnen();

  $("abschlussInhalt").innerHTML = `

    <h3>Umsatz</h3>

    <table class="tabelle">
      <tbody>

        <tr>
          <td>Barumsatz</td>
          <td>${euro(d.bar)}</td>
        </tr>

        <tr>
          <td>Kartenumsatz</td>
          <td>${euro(d.karte)}</td>
        </tr>

        <tr class="gesamt">
          <td>Gesamtumsatz</td>
          <td>${euro(d.daten.gesamt)}</td>
        </tr>

      </tbody>
    </table>

    <h3>Kassenprüfung</h3>

    <table class="tabelle">
      <tbody>

        <tr>
          <td>Anfangsbestand</td>
          <td>${euro(d.start)}</td>
        </tr>

        <tr>
          <td>Einlagen</td>
          <td>${euro(d.einlagen)}</td>
        </tr>

        <tr>
          <td>Entnahmen</td>
          <td>${euro(d.entnahmen)}</td>
        </tr>

        <tr>
          <td>Ausgaben</td>
          <td>${euro(d.ausgaben)}</td>
        </tr>

        <tr>
          <td>Soll-Kassenbestand</td>
          <td>${euro(d.soll)}</td>
        </tr>

        <tr>
          <td>Ist-Kassenbestand</td>
          <td>${euro(d.ist)}</td>
        </tr>

        <tr class="gesamt">
          <td>Differenz</td>
          <td>${euro(d.diff)}</td>
        </tr>

      </tbody>
    </table>

    <h3>Verkaufte Getränke</h3>

    ${getraenkeTabelle(d.daten)}
  `;

  return d;
}

function abschlussOeffnen() {
  abschlussAktualisieren();
  $("abschlussDialog").showModal();
}

function abschlussSpeichern() {
  const d = abschlussAktualisieren();

  if (!d.v.length) {
    alert("Keine offenen Verkäufe.");
    return;
  }

  const abschlussID = neueID();

  const abschluss = {
    id: abschlussID,
    datum: new Date().toISOString(),
    veranstaltung:
      $("veranstaltungInput").value.trim() || "Tagesabschluss",
    start: d.start,
    einlagen: d.einlagen,
    entnahmen: d.entnahmen,
    ausgaben: d.ausgaben,
    bar: d.bar,
    karte: d.karte,
    gesamt: d.daten.gesamt,
    soll: d.soll,
    ist: d.ist,
    diff: d.diff
  };

  abschluesse.push(abschluss);

  d.v.forEach(v => {
    v.abgeschlossen = true;
    v.abschlussID = abschlussID;

    queueUpsert(
      "verkaeufe",
      verkaufZuDB(v)
    );
  });

  speichernLokal();

  queueUpsert(
    "tagesabschluesse",
    abschlussZuDB(abschluss)
  );

  $("abschlussDialog").close();
}

function abschlussNeuBerechnen(abschlussID) {
  const a = abschluesse.find(x => x.id === abschlussID);
  if (!a) return;

  const liste = verkaeufe.filter(
    v => v.abschlussID === abschlussID
  );

  const daten = aggregieren(liste);

  a.bar = liste
    .filter(v => v.zahlungsart === "Bar")
    .reduce((s, v) => s + Number(v.gesamt), 0);

  a.karte = liste
    .filter(v => v.zahlungsart === "Karte")
    .reduce((s, v) => s + Number(v.gesamt), 0);

  a.gesamt = daten.gesamt;

  a.soll =
    Number(a.start || 0) +
    a.bar +
    Number(a.einlagen || 0) -
    Number(a.entnahmen || 0) -
    Number(a.ausgaben || 0);

  a.diff =
    Number(a.ist || 0) -
    a.soll;

  speichernLokal();

  queueUpsert(
    "tagesabschluesse",
    abschlussZuDB(a)
  );
}


/* EXPORT */

function exportHTML(titel, inhalt) {
  return `
<!DOCTYPE html>
<html lang="de">

<head>

<meta charset="UTF-8">

<meta name="viewport" content="width=device-width,initial-scale=1">

<title>${titel}</title>

<style>

body {
  margin: 0;
  padding: 30px;
  background: #171717;
  color: white;
  font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
}

.blatt {
  max-width: 900px;
  margin: auto;
}

h1 {
  margin: 0;
  color: #efa834;
}

.untertitel {
  margin: 4px 0 28px;
  color: #b87931;
  font-weight: 800;
}

h2 {
  color: #efa834;
  margin-top: 30px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0 28px;
  background: #242424;
}

th {
  background: #efa834;
  color: #222;
}

th,
td {
  padding: 12px;
  border: 1px solid #555;
  text-align: left;
}

th:not(:first-child),
td:not(:first-child) {
  text-align: right;
}

.gesamt {
  color: #efa834;
  font-weight: 900;
}

@media print {
  body {
    background: white;
    color: black;
  }

  table {
    background: white;
  }
}

</style>

</head>

<body>

<div class="blatt">

<h1>RUDELBAR</h1>
<div class="untertitel">DIE MOBILE KNEIPE</div>

<h2>${titel}</h2>

${inhalt}

</div>

</body>
</html>`;
}

async function htmlTeilen(html, dateiname) {
  const blob = new Blob(
    [html],
    { type: "text/html;charset=utf-8" }
  );

  const datei = new File(
    [blob],
    dateiname,
    { type: "text/html" }
  );

  if (
    navigator.share &&
    (
      !navigator.canShare ||
      navigator.canShare({ files: [datei] })
    )
  ) {
    try {
      await navigator.share({
        title: "Rudelbar",
        files: [datei]
      });

      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = dateiname;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}

async function tagesuebersichtTeilen() {
  const daten = aggregieren(heuteVerkaeufe());

  const html = exportHTML(
    "Tagesübersicht",
    `
      <p>
        Datum:
        ${new Date().toLocaleDateString("de-DE")}
      </p>

      ${getraenkeTabelle(daten)}
    `
  );

  await htmlTeilen(
    html,
    "Rudelbar_Tagesuebersicht.html"
  );
}

async function tagesabschlussTeilen() {
  const d = abschlussAktualisieren();

  const veranstaltung =
    $("veranstaltungInput").value.trim()
    || "Tagesabschluss";

  const html = exportHTML(
    "Tagesabschluss",
    `
      <p>
        <strong>Veranstaltung:</strong>
        ${esc(veranstaltung)}
      </p>

      <p>
        <strong>Datum:</strong>
        ${new Date().toLocaleDateString("de-DE")}
      </p>

      <h2>Umsatz</h2>

      <table>
        <tbody>

          <tr>
            <td>Barumsatz</td>
            <td>${euro(d.bar)}</td>
          </tr>

          <tr>
            <td>Kartenumsatz</td>
            <td>${euro(d.karte)}</td>
          </tr>

          <tr class="gesamt">
            <td>Gesamtumsatz</td>
            <td>${euro(d.daten.gesamt)}</td>
          </tr>

        </tbody>
      </table>

      <h2>Kassenprüfung</h2>

      <table>
        <tbody>

          <tr>
            <td>Anfangsbestand</td>
            <td>${euro(d.start)}</td>
          </tr>

          <tr>
            <td>Einlagen</td>
            <td>${euro(d.einlagen)}</td>
          </tr>

          <tr>
            <td>Entnahmen</td>
            <td>${euro(d.entnahmen)}</td>
          </tr>

          <tr>
            <td>Ausgaben</td>
            <td>${euro(d.ausgaben)}</td>
          </tr>

          <tr>
            <td>Soll-Kassenbestand</td>
            <td>${euro(d.soll)}</td>
          </tr>

          <tr>
            <td>Ist-Kassenbestand</td>
            <td>${euro(d.ist)}</td>
          </tr>

          <tr class="gesamt">
            <td>Differenz</td>
            <td>${euro(d.diff)}</td>
          </tr>

        </tbody>
      </table>

      <h2>Verkaufte Getränke</h2>

      ${getraenkeTabelle(d.daten)}
    `
  );

  await htmlTeilen(
    html,
    "Rudelbar_Tagesabschluss.html"
  );
}



/* BEREICHSNAVIGATION */

const BEREICHE = {
  kneipe: {
    titel: "RUDELBAR",
    subtitel: "DIE MOBILE KNEIPE",
    logo: "Logo-Mobile_Kneipe.png",
    module: [
      { id: "kasse", icon: "💶", titel: "Kasse", text: "Verkauf und Bezahlung" },
      { id: "veranstaltungen", icon: "📅", titel: "Veranstaltungen", text: "Aufträge und Einsätze" },
      { id: "abschluss", icon: "✓", titel: "Tagesabschluss", text: "Kasse prüfen und abschließen" },
      { id: "archiv", icon: "🗂️", titel: "Archiv", text: "Abschlüsse und Unterlagen" },
      { id: "auswertung", icon: "📊", titel: "Auswertung", text: "Verkäufe und Umsätze" }
    ]
  },
  mode: {
    titel: "RUDELBAR",
    subtitel: "MODE",
    logo: "Logo-Mode.png",
    module: [
      { id: "auftraege", icon: "📦", titel: "Aufträge", text: "Bestellungen verwalten" },
      { id: "artikel", icon: "👕", titel: "Artikel", text: "Produkte und Bestand" },
      { id: "creator", icon: "🎨", titel: "Creator Modus", text: "Designs auf Kleidung visualisieren" },
      { id: "kunden", icon: "👥", titel: "Kunden", text: "Kundendaten verwalten" },
      { id: "angebote", icon: "📝", titel: "Angebote", text: "Angebote erstellen" },
      { id: "rechnungen", icon: "🧾", titel: "Rechnungen", text: "Rechnungen verwalten" },
      { id: "kalkulation", icon: "🧮", titel: "Kalkulation", text: "Preise und Marge" }
    ]
  },
  service: {
    titel: "RUDELBAR",
    subtitel: "FACILITY SERVICE",
    logo: "Logo-Service.png",
    module: [
      { id: "auftraege", icon: "🛠️", titel: "Aufträge", text: "Einsätze planen" },
      { id: "kunden", icon: "👥", titel: "Kunden", text: "Kundendaten verwalten" },
      { id: "angebote", icon: "📝", titel: "Angebote", text: "Leistungen anbieten" },
      { id: "rechnungen", icon: "🧾", titel: "Rechnungen", text: "Abrechnung verwalten" },
      { id: "kalkulation", icon: "🧮", titel: "Kalkulation", text: "Kosten und Preise" },
      { id: "auswertung", icon: "📊", titel: "Auswertung", text: "Umsätze und Aufträge" }
    ]
  },
  security: {
    titel: "RUDELBAR",
    subtitel: "SECURITY",
    logo: "Logo-Haupt.png",
    module: [
      { id: "auftraege", icon: "🛡️", titel: "Aufträge", text: "Security-Einsätze" },
      { id: "personal", icon: "👥", titel: "Personal", text: "Mitarbeiter und Qualifikationen" },
      { id: "dienstplan", icon: "📅", titel: "Dienstplan", text: "Einsatzplanung" },
      { id: "kunden", icon: "🤝", titel: "Kunden", text: "Veranstalter und Auftraggeber" },
      { id: "angebote", icon: "📝", titel: "Angebote", text: "Angebote erstellen" },
      { id: "rechnungen", icon: "🧾", titel: "Rechnungen", text: "Abrechnung verwalten" }
    ]
  }
};

let aktiverBereich = null;

function alleHauptansichtenVerstecken() {
  ["bereichStart", "bereichMenu", "modulAnsicht", "creatorAnsicht", "kassenApp"].forEach(id => {
    $(id)?.classList.add("versteckt");
  });
}

function nachOben() {
  window.scrollTo({ top: 0, behavior: "auto" });
}

function startseiteZeigen() {
  alleHauptansichtenVerstecken();
  $("bereichStart").classList.remove("versteckt");
  aktiverBereich = null;
  nachOben();
}

function bereichMenuZeigen(bereich) {
  const daten = BEREICHE[bereich];
  if (!daten) return;

  aktiverBereich = bereich;
  $("bereichMenuLogo").src = daten.logo;
  $("bereichMenuLogo").alt = `${daten.titel} ${daten.subtitel}`;
  $("bereichMenuTitel").textContent = daten.titel;
  $("bereichMenuSubtitel").textContent = daten.subtitel;

  $("bereichMenuGrid").innerHTML = daten.module.map(modul => `
    <button class="modul-karte" data-modul="${modul.id}">
      <span class="modul-icon">${modul.icon}</span>
      <strong>${modul.titel}</strong>
      <small>${modul.text}</small>
    </button>
  `).join("");

  document.querySelectorAll("[data-modul]").forEach(button => {
    button.onclick = () => modulOeffnen(button.dataset.modul);
  });

  alleHauptansichtenVerstecken();
  $("bereichMenu").classList.remove("versteckt");
  nachOben();
}

function kasseZeigen() {
  alleHauptansichtenVerstecken();
  $("kassenApp").classList.remove("versteckt");
  nachOben();
  render();
}

const MODUL_FELDER = {
  kneipe: {
    veranstaltungen: [
      { key: "titel", label: "Veranstaltung", type: "text", required: true, full: true },
      { key: "datum", label: "Datum", type: "date", required: true },
      { key: "ort", label: "Ort", type: "text" },
      { key: "kunde", label: "Auftraggeber", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["Anfrage", "Geplant", "Bestätigt", "Erledigt"] },
      { key: "betrag", label: "Geplanter Umsatz €", type: "number" },
      { key: "notiz", label: "Notizen", type: "textarea", full: true }
    ]
  },
  mode: {
    auftraege: [
      { key: "titel", label: "Auftrag / Bestellung", type: "text", required: true, full: true },
      { key: "datum", label: "Datum", type: "date" },
      { key: "kunde", label: "Kunde", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["Offen", "Bestellt", "In Produktion", "Fertig", "Ausgeliefert"] },
      { key: "betrag", label: "Auftragswert €", type: "number" },
      { key: "notiz", label: "Artikel / Größen / Hinweise", type: "textarea", full: true }
    ],
    artikel: [
      { key: "titel", label: "Artikel", type: "text", required: true, full: true },
      { key: "variante", label: "Größe / Variante", type: "text" },
      { key: "bestand", label: "Bestand", type: "number" },
      { key: "ek", label: "Einkaufspreis €", type: "number" },
      { key: "betrag", label: "Verkaufspreis €", type: "number" },
      { key: "status", label: "Status", type: "select", options: ["Aktiv", "Nachbestellen", "Ausverkauft", "Inaktiv"] },
      { key: "notiz", label: "Notizen", type: "textarea", full: true }
    ],
    kunden: kundenFelder(),
    angebote: dokumentFelder("Angebot"),
    rechnungen: dokumentFelder("Rechnung"),
    kalkulation: kalkulationsFelder()
  },
  service: {
    auftraege: [
      { key: "titel", label: "Auftrag", type: "text", required: true, full: true },
      { key: "datum", label: "Einsatzdatum", type: "date" },
      { key: "kunde", label: "Kunde", type: "text" },
      { key: "ort", label: "Einsatzort", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["Anfrage", "Geplant", "In Arbeit", "Erledigt", "Abgerechnet"] },
      { key: "betrag", label: "Auftragswert €", type: "number" },
      { key: "notiz", label: "Leistungsumfang", type: "textarea", full: true }
    ],
    kunden: kundenFelder(),
    angebote: dokumentFelder("Angebot"),
    rechnungen: dokumentFelder("Rechnung"),
    kalkulation: kalkulationsFelder(),
    auswertung: [
      { key: "titel", label: "Auswertungsposition", type: "text", required: true, full: true },
      { key: "datum", label: "Datum", type: "date" },
      { key: "status", label: "Kategorie", type: "select", options: ["Umsatz", "Material", "Fahrt", "Fremdleistung", "Sonstiges"] },
      { key: "betrag", label: "Betrag €", type: "number" },
      { key: "notiz", label: "Notizen", type: "textarea", full: true }
    ]
  },
  security: {
    auftraege: [
      { key: "titel", label: "Security-Auftrag", type: "text", required: true, full: true },
      { key: "datum", label: "Einsatzdatum", type: "date" },
      { key: "kunde", label: "Veranstalter", type: "text" },
      { key: "ort", label: "Einsatzort", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["Anfrage", "Geplant", "Bestätigt", "Erledigt", "Abgerechnet"] },
      { key: "betrag", label: "Auftragswert €", type: "number" },
      { key: "notiz", label: "Aufgaben / Besonderheiten", type: "textarea", full: true }
    ],
    personal: [
      { key: "titel", label: "Name", type: "text", required: true, full: true },
      { key: "telefon", label: "Telefon", type: "tel" },
      { key: "qualifikation", label: "Qualifikation", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["Verfügbar", "Eingeplant", "Nicht verfügbar"] },
      { key: "datum", label: "§34a / Nachweis gültig bis", type: "date" },
      { key: "notiz", label: "Notizen", type: "textarea", full: true }
    ],
    dienstplan: [
      { key: "titel", label: "Einsatz / Veranstaltung", type: "text", required: true, full: true },
      { key: "datum", label: "Datum", type: "date", required: true },
      { key: "kunde", label: "Mitarbeiter", type: "text" },
      { key: "ort", label: "Ort", type: "text" },
      { key: "start", label: "Beginn", type: "time" },
      { key: "ende", label: "Ende", type: "time" },
      { key: "status", label: "Status", type: "select", options: ["Geplant", "Bestätigt", "Erledigt"] },
      { key: "notiz", label: "Hinweise", type: "textarea", full: true }
    ],
    kunden: kundenFelder(),
    angebote: dokumentFelder("Angebot"),
    rechnungen: dokumentFelder("Rechnung")
  }
};

function kundenFelder() {
  return [
    { key: "titel", label: "Name / Firma", type: "text", required: true, full: true },
    { key: "ansprechpartner", label: "Ansprechpartner", type: "text" },
    { key: "telefon", label: "Telefon", type: "tel" },
    { key: "email", label: "E-Mail", type: "email" },
    { key: "ort", label: "Ort / Adresse", type: "text", full: true },
    { key: "status", label: "Status", type: "select", options: ["Aktiv", "Interessent", "Inaktiv"] },
    { key: "notiz", label: "Notizen", type: "textarea", full: true }
  ];
}

function dokumentFelder(art) {
  return [
    { key: "titel", label: `${art} / Betreff`, type: "text", required: true, full: true },
    { key: "nummer", label: `${art}nummer`, type: "text" },
    { key: "datum", label: "Datum", type: "date" },
    { key: "kunde", label: "Kunde", type: "text" },
    { key: "status", label: "Status", type: "select", options: art === "Angebot" ? ["Entwurf", "Versendet", "Angenommen", "Abgelehnt"] : ["Entwurf", "Offen", "Bezahlt", "Storniert"] },
    { key: "betrag", label: "Betrag €", type: "number" },
    { key: "notiz", label: "Leistung / Positionen / Notizen", type: "textarea", full: true }
  ];
}

function kalkulationsFelder() {
  return [
    { key: "titel", label: "Kalkulation", type: "text", required: true, full: true },
    { key: "datum", label: "Datum", type: "date" },
    { key: "ek", label: "Kosten / EK €", type: "number" },
    { key: "betrag", label: "Verkaufspreis €", type: "number" },
    { key: "menge", label: "Menge / Stunden", type: "number" },
    { key: "status", label: "Status", type: "select", options: ["Entwurf", "Freigegeben", "Archiviert"] },
    { key: "notiz", label: "Berechnung / Notizen", type: "textarea", full: true }
  ];
}

let aktivesModul = null;
let modulEditID = null;

function modulKey(bereich, modul) {
  return `rudelbar_modul_${bereich}_${modul}`;
}

function modulDatenLaden() {
  return laden(modulKey(aktiverBereich, aktivesModul), []);
}

function modulDatenSpeichern(daten) {
  localStorage.setItem(modulKey(aktiverBereich, aktivesModul), JSON.stringify(daten));
}

function modulDefinition() {
  return MODUL_FELDER[aktiverBereich]?.[aktivesModul] || [
    { key: "titel", label: "Bezeichnung", type: "text", required: true, full: true },
    { key: "datum", label: "Datum", type: "date" },
    { key: "status", label: "Status", type: "text" },
    { key: "betrag", label: "Betrag €", type: "number" },
    { key: "notiz", label: "Notizen", type: "textarea", full: true }
  ];
}

function modulDatenZeigen(modulId) {
  const bereich = BEREICHE[aktiverBereich];
  const modul = bereich?.module.find(m => m.id === modulId);
  if (!bereich || !modul) return;

  aktivesModul = modulId;
  $("modulLogo").src = bereich.logo;
  $("modulTitel").textContent = modul.titel.toUpperCase();
  $("modulBereich").textContent = bereich.subtitel;
  $("modulInhaltTitel").textContent = modul.titel;
  $("modulInhaltText").textContent = modul.text;
  $("modulMonatExport")?.classList.toggle("versteckt", modulId !== "rechnungen");

  alleHauptansichtenVerstecken();
  $("modulAnsicht").classList.remove("versteckt");
  modulRendern();
  nachOben();
}

function modulRendern() {
  if (aktivesModul === "rechnungen" && ["mode", "service", "security"].includes(aktiverBereich)) {
    rechnungenRendern();
    return;
  }
  if (aktiverBereich === "kneipe" && aktivesModul === "archiv") {
    archivModulRendern();
    return;
  }

  const daten = modulDatenLaden();
  const betragSumme = daten.reduce((s, x) => s + Number(x.betrag || 0), 0);
  const offen = daten.filter(x => !["Erledigt", "Bezahlt", "Ausgeliefert", "Archiviert", "Inaktiv"].includes(x.status)).length;

  $("modulStatistik").innerHTML = `
    <div class="statbox"><span>Einträge</span><strong>${daten.length}</strong></div>
    <div class="statbox"><span>Aktiv / offen</span><strong>${offen}</strong></div>
    <div class="statbox"><span>Summe</span><strong>${euro(betragSumme)}</strong></div>`;

  if (!daten.length) {
    $("modulListe").innerHTML = `<div class="daten-leer"><strong>Noch keine Einträge</strong><span>Mit „+ Neu“ legst du den ersten Datensatz an.</span></div>`;
    return;
  }

  const sortiert = [...daten].sort((a,b) => String(b.datum || b.createdAt || "").localeCompare(String(a.datum || a.createdAt || "")));
  $("modulListe").innerHTML = sortiert.map(x => datenKarteHTML(x)).join("");

  document.querySelectorAll("[data-mod-edit]").forEach(btn => btn.onclick = () => modulFormOeffnen(btn.dataset.modEdit));
  document.querySelectorAll("[data-mod-del]").forEach(btn => btn.onclick = () => modulEintragLoeschen(btn.dataset.modDel));
}

function datenKarteHTML(x) {
  const titel = esc(x.titel || x.name || "Eintrag");
  const meta = [];
  if (x.datum) meta.push(`📅 ${esc(x.datum)}`);
  if (x.kunde) meta.push(`👤 ${esc(x.kunde)}`);
  if (x.ort) meta.push(`📍 ${esc(x.ort)}`);
  if (x.status) meta.push(`<span class="status-chip">${esc(x.status)}</span>`);
  if (x.nummer) meta.push(`# ${esc(x.nummer)}`);
  if (x.bestand !== undefined && x.bestand !== "") meta.push(`Bestand: ${esc(x.bestand)}`);
  if (x.qualifikation) meta.push(`Qualifikation: ${esc(x.qualifikation)}`);
  if (x.start || x.ende) meta.push(`⏱ ${esc(x.start || "")}–${esc(x.ende || "")}`);

  let zusatz = "";
  if (x.ek !== undefined && x.ek !== "") zusatz += `EK/Kosten: ${euro(Number(x.ek || 0))}`;
  if (x.menge !== undefined && x.menge !== "") zusatz += `${zusatz ? " · " : ""}Menge: ${esc(x.menge)}`;
  if (x.ek && x.betrag) {
    const marge = Number(x.betrag) - Number(x.ek);
    zusatz += `${zusatz ? " · " : ""}Marge: ${euro(marge)}`;
  }

  return `
    <article class="daten-karte">
      <div class="daten-karte-kopf">
        <div><h3>${titel}</h3><div class="meta">${meta.join("<span> · </span>")}</div></div>
        ${x.betrag !== undefined && x.betrag !== "" ? `<div class="betrag">${euro(Number(x.betrag || 0))}</div>` : ""}
      </div>
      ${zusatz ? `<div class="meta"><span>${zusatz}</span></div>` : ""}
      ${x.notiz ? `<div class="notiz">${esc(x.notiz)}</div>` : ""}
      <div class="daten-karte-aktionen">
        <button class="daten-bearbeiten" data-mod-edit="${x.id}">Bearbeiten</button>
        <button class="daten-loeschen" data-mod-del="${x.id}">Löschen</button>
      </div>
    </article>`;
}

function modulFormOeffnen(id = null) {
  modulEditID = id;
  const daten = modulDatenLaden();
  const eintrag = id ? daten.find(x => x.id === id) || {} : {};
  const felder = modulDefinition();
  const modul = BEREICHE[aktiverBereich]?.module.find(m => m.id === aktivesModul);
  $("modulFormTitel").textContent = id ? `${modul?.titel || "Eintrag"} bearbeiten` : `${modul?.titel || "Eintrag"} anlegen`;

  $("modulForm").innerHTML = felder.map(f => {
    const value = eintrag[f.key] ?? "";
    const cls = f.full ? "ganz" : "";
    if (f.type === "textarea") {
      return `<label class="${cls}">${esc(f.label)}<textarea name="${f.key}" ${f.required ? "required" : ""}>${esc(value)}</textarea></label>`;
    }
    if (f.type === "select") {
      return `<label class="${cls}">${esc(f.label)}<select name="${f.key}">${(f.options || []).map(o => `<option value="${esc(o)}" ${o === value ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
    }
    const step = f.type === "number" ? ' step="0.01" inputmode="decimal"' : "";
    return `<label class="${cls}">${esc(f.label)}<input name="${f.key}" type="${f.type || "text"}" value="${esc(value)}" ${f.required ? "required" : ""}${step}></label>`;
  }).join("");

  $("modulFormDialog").showModal();
}

function modulFormSpeichern() {
  const form = $("modulForm");
  if (!form.reportValidity()) return;
  const daten = modulDatenLaden();
  const alt = modulEditID ? daten.find(x => x.id === modulEditID) : null;
  const neu = { ...(alt || {}), id: modulEditID || neueID(), createdAt: alt?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };

  new FormData(form).forEach((value, key) => {
    if (["betrag", "ek", "bestand", "menge"].includes(key)) neu[key] = value === "" ? "" : Number(String(value).replace(",", "."));
    else neu[key] = String(value).trim();
  });

  if (modulEditID) {
    const i = daten.findIndex(x => x.id === modulEditID);
    if (i >= 0) daten[i] = neu;
  } else {
    daten.push(neu);
  }

  modulDatenSpeichern(daten);
  queueUpsert("moduldaten", modulZuDB(aktiverBereich, aktivesModul, neu));
  $("modulFormDialog").close();
  modulEditID = null;
  modulRendern();
}

function modulEintragLoeschen(id) {
  if (!confirm("Diesen Eintrag wirklich löschen?")) return;
  const daten = modulDatenLaden().filter(x => x.id !== id);
  modulDatenSpeichern(daten);
  queueDelete("moduldaten", id);
  modulRendern();
}

function archivModulRendern() {
  const daten = [...abschluesse].sort((a,b) => String(b.datum).localeCompare(String(a.datum)));
  const summe = daten.reduce((s,x) => s + Number(x.gesamt || 0), 0);
  $("modulStatistik").innerHTML = `
    <div class="statbox"><span>Abschlüsse</span><strong>${daten.length}</strong></div>
    <div class="statbox"><span>Gesamtumsatz</span><strong>${euro(summe)}</strong></div>
    <div class="statbox"><span>Letzter</span><strong>${daten[0]?.datum ? esc(daten[0].datum.slice(0,10)) : "–"}</strong></div>`;
  $("modulNeu").style.display = "none";
  if (!daten.length) {
    $("modulListe").innerHTML = `<div class="daten-leer"><strong>Noch kein Tagesabschluss</strong><span>Gespeicherte Abschlüsse erscheinen automatisch hier.</span></div>`;
    return;
  }
  $("modulListe").innerHTML = daten.map(x => `
    <article class="daten-karte">
      <div class="daten-karte-kopf">
        <div><h3>${esc(x.veranstaltung || "Tagesabschluss")}</h3><div class="meta"><span>📅 ${esc(String(x.datum).slice(0,10))}</span><span>Bar: ${euro(x.bar)}</span><span>Karte: ${euro(x.karte)}</span></div></div>
        <div class="betrag">${euro(x.gesamt)}</div>
      </div>
      <div class="notiz">Kassendifferenz: ${euro(x.diff ?? x.differenz ?? 0)}</div>
    </article>`).join("");
}

function csvWert(wert) {
  return `"${String(wert ?? "").replaceAll('"','""')}"`;
}

function modulExportieren() {
  let daten;
  if (aktiverBereich === "kneipe" && aktivesModul === "archiv") daten = abschluesse;
  else daten = modulDatenLaden();
  if (!daten.length) { alert("Keine Daten zum Exportieren vorhanden."); return; }

  const keys = [...new Set(daten.flatMap(Object.keys))].filter(k => !["createdAt", "updatedAt"].includes(k));
  const csv = "\uFEFF" + [keys.join(";"), ...daten.map(x => keys.map(k => csvWert(x[k])).join(";"))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Rudelbar_${aktiverBereich}_${aktivesModul}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function modulOeffnen(modulId) {
  $("modulNeu").style.display = "";
  if (aktiverBereich === "mode" && modulId === "creator") {
    creatorOeffnen();
    return;
  }
  if (aktiverBereich === "kneipe" && modulId === "kasse") {
    kasseZeigen();
    return;
  }
  if (aktiverBereich === "kneipe" && modulId === "abschluss") {
    bereichMenuZeigen("kneipe");
    abschlussOeffnen();
    return;
  }
  if (aktiverBereich === "kneipe" && modulId === "auswertung") {
    bereichMenuZeigen("kneipe");
    statistikOeffnen();
    return;
  }
  modulDatenZeigen(modulId);
}

function bereichOeffnen(bereich) {
  bereichMenuZeigen(bereich);
}



/* ===== RUDELBAR v90: MODE CREATOR ===== */
const CREATOR_PRODUKTE = [
  {id:"hoodie",name:"Hoodie",thumb:"data:image/jpeg;base64,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"},
  {id:"tshirt",name:"T-Shirt",thumb:"data:image/jpeg;base64,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"},
  {id:"polo",name:"Poloshirt",thumb:"data:image/jpeg;base64,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"},
  {id:"sweat",name:"Sweatshirt",thumb:"data:image/jpeg;base64,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"},
  {id:"zip",name:"Zip-Hoodie",thumb:"data:image/jpeg;base64,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"},
  {id:"softshell",name:"Softshell",thumb:"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAFAAUADASIAAhEBAxEB/8QAHAAAAgMBAQEBAAAAAAAAAAAAAQUCAwQABgcJ/8QAOBAAAQMDAwMDAQYEBwEBAQAAAQACEQMEIQUSMQZBURMiYXEHFBYjJjI2QlOBFSRDUmKRoTM0sf/EABYBAQEBAAAAAAAAAAAAAAAAAAABAv/EABwRAQEBAQEBAQEBAAAAAAAAAAABESExEkFxAv/aAAwDAQACEQMRAD8A/M1oqueKdFpc9xgAL3ejdIWOhWrNY12sGVHjcxvdL/s20ylWrP6gvGB9Gk3g8Srtd1StrWo1fUcfu7D+WzsFq8Yk05d1zXo+y0p7qYwCq3dfag4QaK840NGGiAgptayH7ut70mPSUT1neE4pZSHkwAjtA+qv1TDw9Y3kH8tAdY3namke1At7BPpD8dZX3aku/GN8eaSQNxypjj5T6NPh1dff00fxffdqaQwfJXSQOVNXT0dXX4/0lL8X3/8ASSJp+USVdQ+HWV9x6SB60v8AtSXn5JMSuGO6IffjPUJn0V3401D+j/6kUnyiJPdA8HWeoD/SR/Geo/0UjAPlETOUDz8Z6h/RRHWd+P8ARSM54Q7Jqnn401Af6KkOtb/+kkLhOAVwlND/APGl+f8ASyuPWeoHmikQ+Cu3RhTQ9/GN9/SUT1lfj/SSSfCi52E0h6es77+kqz1rf/0UkmTlRdjhXQ8PWuof0UPxtqPaikREjlRIJ+E0PT1vqB5pIjrW+70kg2kLozKso9COs70/6akOs7z+mvPtaIUgAFPqj0B62vogUkXdUOvR6V63bTOCUgEKR2HDmyE+laNZ6Msby3fqnT9YVHNE1G9142HAmnVBa9pggr2ml3lTTb2n6byKLz72+Vg6/wBLpWtZutWzQynVH7R5VZO/s/AHQd46MpC10klPOgnx0HeNSKnOZT/XkWJg90dpQYY5R3FYAiOFIeVE84/uuBIKDshExH1XZK76oAGglEeVIEHuuQjpnlAkIkqIycqwrgYXTPC6DwV0HsnoI8d0e0QubKmASoYgRCLeVIAkwAptpgc1GqoDR2XFvlSAZP8A9GokN/qNUXFceEJhTc08BwQNPw4IqBMIg/8AqDgWwefogPPcqolMLpQzC4T3UEhCBb5XAwu3FF9RMDsgVI5x2QAhXTEdo8IkeUczKMdympUCBCjA4Vqg7PCSjgQBhduQIPARAhKuCJ7Iz4QBIXcHCiO3fmNlMvtBaD0lbGMwlpP5jU0+0KB0hax4WoB0I+OiLtqTU+6cdDtjou6x2ShkCcJQeOeECIUsHCA4yoODfldt7Lp/suklNNc0/KMz/ZAfREBKBBJwUcwpDmF0BNR0TldtnhS4wCiBCaIwUQO3lSDcIgIqIpklW0KDrip6VPJ7oCeyadMMp1NQdSc2C4RKix5nqTWaelRbW0OecO+F5V+r3r3bvVcP7p91305e6TqdS4INSnUJMjsvJkhxwUXG+nqd27Brun6rZTvLyq5rRWd/2kYeWkOTG0vQwbiMoGVS8uqTSDUM9lnbqt7/ADPPKx3F7UuXHYDjlbtLpUrgA13hseUDC21erRLXXA9vyvT2ti3UrN13QOGiSvL3ooV9tjbtD3Hhw7Lfq2uO0LRqenWToquEPgqDVTO4GDIBhWQCs+hl1XSvUqZc4zK1xA4Wqyr2gSZQ291In4US6MJFEc5RACgDPZHd/wCJiJcGShyc4XAzyu75UXQIiVHtypk8hRiM8qypXYGCVxAHdc7lcBjKCBJRnyjGJQicwovHGfUYmv2hiOkLX6JUZ9Rqa/aEf0ha/RagHRDv0VdfRJmE5Tjokx0PdFKKQEJfEggdypASEIgoDAUwFwOFyO7t5XR/2gE4hEHwgGqYaD/ZEdBiV0E8I7Z4UoxhRQAhTaJygBCIEoDGJXQUeUcAZQRPtB8nhei6f0S/bbHUS0gDIwkVJ9tRJr3ZhrMj5XodI6yvb+gbG3tgKDR+6EakZdWqtvQ61vWBwdiSvE6n0a173OsnAd16rUb+k6s7dALSlFa/a1xPqxKg8bc9N6jbAlzQQPCxvt7mg4bmkr2Nzq4p0Khjd7SVt6E6Yu+p9H1LVBSa5ttJM9lR4Wnb3ZM0mEl3OE4tOm759EVqlXYzkiVO21D7nd1qDqIOwkDCputYvbgFgcWM4wp0bLi7sNLpj7od1cDlILm4q3T33FZ0ud2K58NdLnbiVRUzuzCYPb9Luq1NL2xITE8keF5Xp3qdumU/ulZo2HuvTsvLG8Aq29UEnsqjnT2UFJwdKgRKp/XEwolE4XCO6peC2Yypbu3dCJGFEcrKJHK4YC4BH5ViCB5XRyu+SgUtWIu4QnspbZQ25RXfztTL7Qf4Qtfolpw9qYfaC+ekrUfCsQeiR+hbopJScQJT7oRu7oW7+iRsbBVpFjTOSEYxlc0DhdPlZHQMFEZygDn/APikqjgMYR4jC4YC4ZyUxU2oqLT3RB8qA/2Xbg0wSp29vVu6gpUQc904oaNQtc3rg4qGaUUqNxWgU6RIPeEzt9FDYq16kD/aVoffUKDfTtmgfKx17qs8y44RrFl9p1ndt9LcAAsjajtDoFts3cDiUGlznEyVbu3Uy1wx8oFRoG8Lq+/JyQl1zaVS4gtwE2r2lVrt1o6AeVhrXtak406lOY5MKBU+g+CxzJBEJn0/1VqPSulXek2khl3O5Z33bag2tpkH6KFxbVK1Hc2EGQNY9j7hzZe6SSllV4eC1pjK2VPXNM0qRyOVgNjcNBqPcqKqjgOcrO5xcVvo6bWrmYwtDNIc0+5ArFEv/lW6yp3tCo11JxaPCZ0NPYBJat1O1AIxhE1osL972hlYf3TDa1+WFLm0hwFbTqPpiGlEaHtjBCECIC5t1TMNqDKnDXZYZV1pCTELoj5U4x8rtuEZoA+QjI4hCJ4XEQEQe8HKHnCMxyhzJSASRwuXEeF05hLF0D+9q3faBnpO2+ixGC9sLZ19/ClsPhWDR0Ef0Pdj4SVgkmU76BAPQ92fhJmDJwreEECRCBbhS4Q5ypUAA4UkefhAgqYCAIhcZCIELonMpqhM8ohjqr20qf7iYQjk8Qm3TVsKt569Qe1quh5b2VDSNOaYBr1BISSpXqPqOFd53eFq1TUHOvImWsOFh1Ags9dvJWWkC8QR3lQL90NWelWDm7TytVJskCEBpskzOFN5aWQEXQzAVbjjAlBXMmATHdB7KZBDmAz3Vu0NgjkqDhMlTBirW1EMMMAJWYtbTouk4Wyu+Wlqzfd31KLhCZgTCgQ91RmfCst9Or3YmsIbKYMpftpbeOVvB2sFNgVGWnY0bZgYBOFW62aXSVuInnsowCSCMBQZm0BEQpupgQIVxAiAP7qMjk9lUUubsEqIOMKNauN2wLXZW+8y4YGUViu9tGnLjBKxUb99nUaah9ryjr1yH6gy1pnCW65ULKbGN5Yg9c1zajBVbwQuInASzp2+F1aCg8+4BM8gkeFYzXcYUXQFIlQdlMBnMld3UZPP/iM/CuIJIjKgiROV0DlTxXHDmhauvc9K23wFliXtWzr0R0tbfRUaugsdDXZ+AkzDHCcdCGOhrv6JPTAVpIJ8jlEDuVICFxZCygDJ+ikBKIAOEYgpojGJQhSbwjKuCLhIAHJXotNYLTTSTh5SCkw1K7AOxym9WuDXbbtONqkUuvKrnB75yhavdc2zmuMkLNc1YuH0D3Ks0twbWqUVFjHRLm1y1xzKfU6cUge6Rvbtv4+V6Og1vpt3eEViqyMd1BshuStFw0BxcOFldHZTRIOwZKrfVBkDlAunjsqn5JhUZ67yDErZbwaW0RlLKzgME5TCzH5cHnsgqdTLant5Vzmw0EHKBAa/3cqL3kuhSjnB0gzyomZgK4thsHuqjiQFNXAJkQCs91W2s9pyrHHaMLDdOzJ4VRXR3VKo3Hkr0No30qL93ZqQ2DQam88BO6jwLV7++1UeJfXNfXXPJw0rNqNc3F66mDhVGpsvqtQHuVFoNSu6oEDHp+5NtqAY52DhexqDIcDg5Xz5j/TvGVB5XvqTxVtabx4RHOKjJ5KPZRPwtJ+Dxkoecrh5XYnKdBAPYroKO3C5TVAD3thbevf4Xt/osbhDgtfXf8K2/wBFUaehAfwNdH4SekcTCc9BCehbsfCU0mgJbwgg90SSUCCCjGYUEgjMchAIgdynB23C7aO64HOSi+Q0kJRo0qnvrvcRhuVGlX36sW+MLXpNPbb1q5/24SXTKjqmpPfP8yi+s+v1nWeptqAYJWuwqD1hcMz6izdYUS4tqBLunL5zrj0qrsAwEId3rNmoMcBynNOsPSH0Sm9aXXLXk4WyiHFoO7CKlVe55KocSWxCveDPwqXxGDCCh5MwEATmAg8ycFAuLWE94QYL2RUAA7pvZN/yweRwEjqGpUcPqn9qJt2tHEZQUV4Dd/dV0mkw8qdX3OLJwFK2buGeAgsLSRJxCzVtwPtElbKuBEqFi+my5Br5bKmdC+o2oB72wl10TwRhek1yrb1XA27AAkd7QApb92VRVp7j6kEYTO+qhts4NiNqU6eTuMladQeRbu93ZB4qu/8AzD47labUEUnFwhY6ua7o8piW7bUHjCDE2XVAfBXuNFrerZwey8VZ+6oQey9N09WIDqRPKsSw7ieeyjHwpEGeV0HynURjHCEROFOc/CEDKLgAmMhEoEwFyYnjjJcMLX13/Ctv9FjJMhbOujPSltnsrCtPQZjoi6HwlLDIMJn0IY6LugfCV0wchX8RMOkQiHA8hcGnhAyDEKUSB8IgyVGD4RBIwoLIwg8+wgLpMITue1o7qNQ13Nt9Hc7y1ea0R4+8vd/yT/WH+jpAb5C8zoz4rOPlA21xjbm2ce4C8torNt/sPZy9RfOLqDo8JBozQ7UnYyCg9HewXNb8K1lb02hihe5c3cIUWAuiRwirTcbhBVFR+ICjXqBj9oVnoudR3AKeDOHbiAFKWkFnwqmyHwpk8thUZK4FMY5lN9PcHWsDlJ7mdnGUx0l5FEgoBce0/JWmzYS2TwqqrRVeAeysuboW9DY3lB1cjdzwsr3AEnwpWZfVDnvyoXQcJwgz1rqWHylt1c1H+ycK64qBrSsjPzHyiL7SKbS5w54VN/cOFItK3bWinAA4SrUCdhlFIHQa5nuVtrvigAsbc1lquCQwBBDTmg1SE80x3pXzWDglJtOafWn5TUk0bym8Ij1LhBUTPZcxxdRY/wAhFWJiPJwujx2U4E4QICqIESFykcDCimqDuVq64P6Utx8LK7lauuB+lbf6KpV3Q/8ABtz9EvZ5W/oY/o65+iwMM4HdBNpKIAOZXNAHKO2As0AjwVwEcrsdlydgIzhToU99w0AqLWrTprN9yD4RYq6pq+naClPZed0h35nPdNusKmdnYJLpDwKgCi4e3A3UXZ7Lz+kO2auRPdP3uHpuHkLzNm8U9aDf+SK9lqDcsPwoMaadLcT2Wm8aHMYI7BYrqrtpBgQZGTcXIE908qUdlAAeEr0qjurbiE9uGj0vog8/Vhr4CiTIwco3QiqXDsVXTcCSUPVNz+0ZW3SzFI5lZLhkM3EStWmwKRKC3cRU3Ss164PeBuVj3ZLgsYPq15+VA3s6YbQws95+0k4WmiR6YAWW9EgqraQXb/cVC2ku5XXn7j9V1pmEZ3W0yGzKUagXEnOE3dBaYHCVX0FhICKSsbFWSe6urkkcqhpPqE9lZVdIwoNWmD81Mr4Bga/uCsGkNmpJTLVG/wCW3eCqH9i71LCmZ7KyMcrF0/WFayDf9oW7EK6zgTGOUSMYXbYK7hKBGIlEt8Lo7qWBhPRU9pkLV1zjpS3z2VL2wQVd16I6VtvorBZ0OP0bc/RYKeBKYdDCejbnPZL2qoluKkAYkoNAPJUgPKg7mAiBBQI4RA+VAeFt0Vh99Q9ljLSG5/7TTT2ijZPLv5gjUjy3VNU1KhI8pRp7yyoCmmuNmXHyk9mYq5Kyr0e4mlPkLzNNxGuNA/3J8K3p0i9xkALzdCqK2tscDHuVTH0S6JFCm7vtCU3Dy4hNdQ9lCnn+VJjl+Simmls25AyUzrkimWhYtNZtp7nFarh0UznKBBdz6hHZZ2uIdA4C0XTgXkSspzInKlF1xVZ6UfCt0kmrScAMLO633USXHK26JTAt6gBVFVWWlzQqaIaBuH7iVbcOALgDlZaIc90A91KHFAEskrJeEw5agYYAD2WG9eIcJQIb0+4wjZHsELsF0kKFkYqRKoZPwxJr9+1p8JxXMUyJSHUc0zlArYZefCm5x4VTOVYCCgc6JSJ9xW/UGl1s4FZNEb7ZBla9QP5REoLek6pLX0/CdgEFeY6Wqhl09hdyvVvHvwqlA4OEPafquP1lDb8piCRie6iSee6PHJRSHiD+RKv67E9KW5PhUVFo66/hO2+ios6FP6Nuh8Jewd0w6GI/Btz9EvYJVpIkCAeFLcSFFrSTlWDhZRGeFMeYXBs/2RHMJYJOG5gb8prcRR09oHJCVNG57W/KY6k8i3ps+FK1HkdXeXMLY4Sei8B4xEJ5qLd5IjhJH0i1xgYRTaPWtiB4SHT6ca2xpHD080yt6kUysNlQI6hkxAcg9lq7wKdIf8Uqoj1KgCYayZLB2hY7Fp9QEIHtuGsptbCheP8ATYZUqbz4WS+qy07gUCuu4F5PlRp05O8j5QfBdI4U6TnSQApRKu78k7Qp6NW2UKoPdCo1xokqrTpFOpPKomYL3EiZVttQaw7i1RpCSS4StLS7bLhhTAXkRIEJZcu3uMLdcVcQQl9V7QcTlUYazRsIjKwUn+nVhM7n20yQEnrEioH/ACgcvINLcUh1N0NwMJxRealDcfCT6pJBBQKgc/VEEk7R3QA7q23E1RPEoPR6LSNOiHEK2/Ac0kKVrUAoBrVVekhhA7oMOjO9O/HyV7V7hI+QvDWjjTv6ZHle3Dt1Nrh4ViUJAOVKAP7qOZRmFEoO4RUXDuuMnKGBUyQtHXX8KW/0WZxJIWnrr+FLf6KxU+h/4OufoFiptx8Ld0L/AAfc/RYmAwteJB+QpcrmgHHhEDEALKCPj+6IglDjspNAnhUWWzA64aFp1ZwDGieFVp4BuZIVeqVN1Rw7BZajz988OcfcsJ2PBErTft3E7UtDKkQOZRfU3VvuTg9hQ0Oq681j1CTyqrm2qemHu4Cs6RLTqbsIPYasB7QDOFTYFtP3OOAtGogOiQsDyWgUG8uOFA7Zcmi01Ws3A8JfdXr6jSXUoTW6DbLSaDXU/ceUtvi0sADeQil7qp3CGYUm1XA4ZhU7iXBqvpmBthECo/8AKMmFDT2bqb4cjcw2kZCOlEGjUIVGq1eynO7KsqXTtvtp4VVBrXTIVriNu0YQY6lw8/uYsT7gh5JZharh5mFhrOmRCCu6u3OZAp4lLb+mS0VDgJyxtOpQMt4ysFVouLOqYy3hANNqB9IieEs1T3PLQc+FbpVxsc6m4qu6c03BMSgV5Bgq2h+8CUK4BfIwp2jZrNkSg9JYU4pAvMYULsBrSCfotFNzBSE4wsV3W9UwBwgxhu2ux4PdeytHB1oxwOYXk6rNtIO2xC9JpFT1NPae4SJWwu7LpB78KIzmEQMq+pojGUSBygQpEeUw1B/IV/XR/Slv9FU8DGFb16I6Vt1ZF2Vd0H/CFz9FiZhbOgv4OuvosLDzCtSLZhHcVFsRlSwMKUEKWOQoCB35UpwVM0bdNad5d2WDUXfm1PkprprWize8pLeul7x5SqSXji1ziFgp3QaTIW28G6Wyl4tyT8KKN5fA0HMjMYUekHH/ABKe6p1OmylTGclT6UB/xDHwg9xfyXA/Cz6PS+/a7QpnLQcqy+fGe0K/pKiGitfnlnBQMupKode/cWxtphJrtxIA7cK65rm5vH3RMysdZ0tOVFZjG8bfKvYYGeVjBIdK10mY3OPKkRlvXPeyBwrNJltB8I3lNjKBBOVHSyBQeAeVRutyYKlUGIChbQGmTypvbFMknKoX3ZjB5WFxMlabp2520LLEEycoL7aS1wPhYWy2q+ieHZWugQ3E8rLeAU7htWcIEjmvo3zmjAlGq+KsnurtSaDVbXHdYrk+9jp7oI16T2vDnDBVtkSKw8Smt7ZsfpjblvIalVmZIJ8oHwDnNGUK1FogBGlhgyplsuAcgpv2lln/AGTDpyoXWm2Uv1WG222eVr6TI2up91ZxKdDkqYMrtnuP1XRCMjGJUoBURHdGcpVRqdld17P4Utz8KmpBhX9eGOkrZWUWdBfwbdfRYaYmcLf0GJ6OuvosNNVE2iMFE5C7MSOUWtMLIAPwicBGCounAHcqqYWtbZp7hCT3JmTHKbVW+lZYPKS1nEtOcrLRRev2kmFjFxDSCtV/ME90qc87TuKDJqFd9Z2eBwnnRNk59y+4c3AGEhuGmo9rG917zp22FnYUyBBdygnqjy2jgZmE00si00twiPUCW3tJ1zdtt6eQTJTG8DqFKnSnAEFBimAT5WS4fAgLRUfBIHCy1ASJUGdpO7hMaIAaNwWOnTO4FamlwGSkGTV6wazY0ZVemOcLdxhU3+5xOVfYnbbkTlUMaBAZuKz3FyctCspEikqKzQAScygx1nwZjKzOeSSVoqt8lZyMlBKm8iCULtoq08BAZCqqV49soF9wfUaWH+VL65loMcFbq/tc6O6x1mn00HoaH5/TlQx+0JFZN3Bojgr0OisNbp6s34SK2aWVtngoHNL9gEcK5sOcDHChTZLRC0ijsbuHhAu1Rwc3bC0dKv23ZYst6S95ypdPPLNQIJRK9i4DcTCrIE8K2oeCq+ThXUwNoiUDypnjKg4d1FiDuVo68E9JWyocOFp67j8J22OysKt6CH6NuvMLAwAFbugifwdc/RYRzwtVmLWwMygccoBwGIR5UxXSFwje2fKMAQQubmozHdQaNSeGUWtB7JHUMCZTjWJG0R2Sar7go0W6gBtLkhqOyV6O5G5pBCQXzBScRHKCu0aK19TaM5X0OyAbQbS+F4Pp+l62oMdHBX0C3AFaAJACCttalZXXqvy5UXGoPua0ngnCnd0Dc3kBuFXVsnU3QFNBG0zlVPaAtFG2LZkyoVqRAkCU/gpphoMzwrDDxM8KsEBwae6FaqGsIZ2CoW39Rpq7QcqywMUnCclZhTNSo6u4YCv0127eUDGm4CnE5Weq+MlGmS9zlGrlpJHCDLUeOZVZIOeyrr1C10RhClU3YjCnRJ2BI4WC5eAZW+plsBLbs/ykZVGd1QGdxwVnqH2Quc4yQRwovcDTiEHsOk2ippNZnkFedePS1Cow4gleh6IfNu9h4SjX6H3XUjUiN5QMrIAsBKvr1AxhEqqxj7uD8Lrg7ggXVXDd9VXpjxT1EGe60Op7pO3hL6VQs1BkDG5Er6ARLWHyEIhFvuoUnf8AFcidR5yeEdoXO4QLkO0HCCFf16P0nbLO45AV/X5jpO2hahVvQMfg+5Pwl4OStvQZjo+5+iXtd7sq1IsAPMotMDJUQRyiRCipzJwrLdpfXaPBVTey16a0OrmeylIq1p22q1hPZKKu04bhMtWY6pcTuEBKq7HNyDwo0z1iGNJcQvMalWL6pEyE7uvVqywFIry39H9xkkomHPSNDfUdVI4K9hakmo/PZee6VpCnaudGSvQWhbDieUVbSpuDi8nKz3F3tdESVGpd7QRnlYqt0wOBhBcy5ql5gHKlWqOZSJmFkZfta47WFUXN3Urj2gwp0WVK290NOVcaJFLdOXcrLZUHF4qVOAr7y6ZSBa0qjFdPbSpljSMoaX/8XmVlqEuY5zitGn//AJ3hvCDbQMzlQuXbW84VVCs3aW9wqbmo9/tnCDNXdufAMoMLmcq6lTo0nb6rlXc3Fs8ltNAXOlm4OS24qb3QTlaQWFm0uySqatmHHduCJrNVDNkgiViJIEErbUYxktJ+ixOG0nwivXdFkihUdPdVdYUiX0qo8rR0nTDNPqP8lT6npCtZNeB+0IMti4utWkFWPDnEBV6S31bAbfotjaTwMtKDHXBoUiXGEkDpuadQH+ZO72hVuhsJgBKLm2ZbmnsdJ3IPodvDrOk7n2rj8KGmHdprCedqlwETUXcKJwpO4UHcqyamg79wV/2gyOlLYLMf3tWn7Qz+lbVWeA9DSOkLmPCXtPuITLoYR0fc/RLQ3JhWrPFjT2hSPOFBrTCkAR3ypWU29lbReabjt5KpmIUmE+qzPdQYtSZe0Xmo4GClNW5uZ/byvS67VIDGlwiF524fAwp61C24vajCfblKa1SpXqAESZTS5c2TIyqNOpMq6i1ruJRXsdJtfu2n0yRlwTSxpB7XmOAsoaRSZTBwOFrsrptmHh4mQgx1hTAdvbBlZHii8xtW2rVo3Di4iBKpd91BgkKYMoFEHaKYUKrqLWQGLW51o2feFQ42hH7wqMn3klpaBCxOJqE7jwmNQ2s/vCpeLfs4IF7pcwiMK+yl1tUDRwrXmh6ZDYV1nc2dpp1YPI3nhELxWDGFsZCodWeWwtdFlvUp+s549yJFrGXhFKqheYDnGFUQGnBTVzbU43hVmhbZO8IhbGJLjKhUe+MvITJ9C2jDwstShS5LpQLXlzjJKrc4kZC11aeTsZKq9C4f+23d/wBKK9f0jNTTnshM720+96dVpgSQEv6PoVqVo8VmFk8Ap/Sbso1QTyFdHk9HqOsqTrcslwK2u1CoQSKX/iFnTpm/fuHdaLkU2khrUCG8u65cQAWysVtRdeXTKTn8FMbwtJdAylttUdQvWPBgFyD6HSYLe2p0R4UHOxA7IOeX0qT5wQq90yrjIueeJUS4lcfK4iEQCfe1avtCH6WtvospafUatf2hgjpW2langs6FbPR9yfhYGNElMOgs9HXX0WACClNSAAygfKKE4wsgGe65joqAngFAqBBcmDNrd011QAAkBJLi4LRhhKfvoU35cJUPutDuwFRqPIV6zi4n03KejOc/Umk0yF602dq7Bot/6UqNla0XbqdNoKGxtBENU5DsEKodlOJQD0aREFVPsqB7lX8IEyhvWV2m27uSVWdJt4w4rYcnC7ERKGl50i3HcrhpdsBklb4A4Ki5s5Q1h/wy3juoV9HtajIBK3n/AMQjKDEzSLUUhTJMhD/A7SMkrdBUg0wiF50SzB9xKI0SwPlMAPKm2mDlF8YGaFpxGZVv+AaaVuDR4UoyPCEY6eiabTyGSrW2lpSHspN/6WiRxCg4jgBFAloIDWgD4UmOBY8HwqiYwgXwgRtuG2+ou3AqF3qIaXbWEymtSzt3vNQjJUPuts3loKJz15etWqVSS2m7Pwsjra7q1WFrHCCvZ+lQbMUWrgKY4ohOmrbVzhaU2v5DVPcVBsq1rQQqgbsQpgygGduytayOycA2zUZ9Vs+0hgHSdqfhZzh7Vq+0aXdJWoA7Kw1l+zq4FXQrjS5/OeMNVT2Op3FS3cIczkLzGk6vW0DUmalTPsBghfRbqyodUWTdY0gek+Jqx3WknCAgjlRmPlF5dSeWVMkGFT6o7BZFhKjknwo+pPbhSD5Sg7D3Q9NTDpRDhKQQ2eBlSDIHGVMSSgSW8oOEjspgxmFWakdkDWHEKYurCccqM/Kr+8NA4UTdU+4TBfuHZRJCo+80/CIuWeEVbM5mFwz3UPXp+F3rUz2SRKkRKkBiFEVmcQpCrT7hRpwbCkG4XCtT7hca1LsEBIlFmFza1PwuNekOyCwcIyPCqFzTHIR+9UvCMpE/KgXBRNzT8KDrinExlF1J31UD3UXXNMdlA3TM4VBPCiWz2UfvLPC4Vw7gKoOwqQb2hR9X4R9X4Si1oHhTaFUKncBTFQqYL2wBwpwFnFUgcKTC+u8UqeCcJi8XMb6t1TotMuceFb9pNzSp6HQ06R6rRlqa2ek0+nrR2sar+Y5oli+da7qz9f1J96//AOc7QFYy/9k="},
  {id:"tank",name:"Tanktop",thumb:"data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAFAAUADASIAAhEBAxEB/8QAHAAAAQUBAQEAAAAAAAAAAAAAAQACBAUGAwcJ/8QAOxAAAQMDAwIEBAMFCQADAAAAAQACEQMEIRIxQQUGEyJRYTIzcYEWIyUHFCRCUxU1Q1JikaGxwTTh8P/EABcBAQEBAQAAAAAAAAAAAAAAAAABAgP/xAAbEQEBAQEBAQEBAAAAAAAAAAAAARExQSECcf/aAAwDAQACEQMRAD8A+afT7C76peN6fZMLnuOTxC31p0no3Z9FjzXDrxwGpo4Kj9q0KPbnb1fqFamDeRDSRlU9SvUvKpvLl2t1TP0W9c8aV3e900wylIC5nvq8jNJZ2QNgmuAhZ9aaB3fF2f8ADTD3peEYprOkZSV3BfnvW+4pIHvW9J+UqByBbJwmjRfjS7I+Wl+MbwjNNZ4NOyOmN01GiHeV5PykT3le4/LWfa2U+CpqxfDvG938NdR3lef0lnm4C6S04Cati+/Gd5Hyige87z+mVQmB6JpI9E1IvvxreA/LQ/Gd2T8tUMAoYB2TVsaA953kfLTfxle/0lRbZTTlNRe/jG8/poHvK9/pKhnEJAwmri9/GN6T8tL8X3v9NURMlBNTi/8Axfd/0kR3feDIpKgG6cDBTRffjK+/pIjvK/j5SoS6cJAwd01V/wDjO/8A6Kae8r+flKi1b53QLo5TUxe/jG+P+Emu7yvRjwlRAkHJSO5TRdHvO9B+Uge870/4RVKQkGxwrpF2O8rzmknt70veaSohTCcGj0TRoaffN43/AAl1PfF28aXUsFZsNHAToCauLuv0roHdrS2tcaLw/A0+qxvV+iX3Qbs2d+whv8ruIVz8r863/LqsyHBaK4ps7w6HTsawm6p4NTlVly7laKdDw2CGk5CzgADAAtL3UYt591l2umm0qVYegTwhJmUt/qoGkSUYCLhAxuhDiEDSATCWngJ5bIS0xshgNA9E7SOQkGu4TtJhRAA9k4ZwlJmCkdSNEihJG6GrMYQElNmUmsqVnaaQn3QINN5Y7cbopzd0T6pocEC6UBJQBlDUUtRKJpASgREpa5SGdkDQcyU6cI4G6CIQMoieEoJOkCUjLDDgQilB3RB5O6ROJCR9UhSjlKAcwhk5RBjfZE6JHqgBuEiSd90Wg5KLhacIgJHbKWZlCDpESlEbJAyjGJQwW7oExsgZ4S4yhS1TK037Pj4nUKjCJA4WYkDZab9nZjqdU/RX89Zs+OfdZP7v91mKfy2rTd1GbfHqswwnQ3CutnIxiUEQY4WQRA3RBAQ23ykBmUTDsbpQPVAe4Tj8QRQ2lLMJfVKTugRxhIH1KUHc5QdsSEBdqOGAkqVadEvrx48hawndXHalCzr6nXFMOICv21qbRooMDQCkGZ69bUu1OjPqsGuq4brJdO6izqVLxnOiryFsf2jkv6OXbwF5BbXVa1cH0nEZyqNvrIcdSIqA8qoset07mGVRB9VYsdTqD8uoCoO5M8oHGxQh7YGklFzX8MKIBcDlFpjblBrHkQ5hCe2k4HzGAil9U5gc46WiUYotnXVAhQrzrVO3pllBsv2lBIvup0Ol0/L56voulh1H+0qOu4p6Fl9NW4qeLXkklaK0phts1sbqpErwg5s0TqTYeMEI2rKlOoWt2GVC/tCpcdSFu1uAYKgljlECRunvYGvLQhpIV1PQjSZKQzmUj7oD1VQ+fVFNMxJQBnKUHmUQeUDkSltlZbPwcyghISRmmndaX9nxA6jVWaO60XYRjqVSVZ1fDO5yfBWcZ8AWj7lzRWdZ8DVaEnApacoxiAogwBulHqhEbogSVF0htnZLnKRzslvuhoxO6HsUh/3sgQilJmUjMEhKM5Qf5WE8ILztioWvfB3Cu21CJLTmVnu3Ma3TiFeWpmm6Tygh93UX3nQKwblwC8X0lriw7gr3xluy5t6lq/OsGF413J0yp0zrFak9hawuMFBHsqDX42KtqVvVtxqpuJVbYEU355V3SIjJRCbfXlMAOErtQ6nWNdjXMnUYhIaDEgKT0oWtG+bXuQNLTKmKd1u7dbvp06bNLnCVWm4vasBWvcde36r1GnXtwBTYIwo4DG4ATgrzaXFYkvcQg3p4bg5KtIBEA5QcxrWwdyqkQ6NrNVoOys6VMl4pj4QuLaJoUSXfE74VOs6YFIT8RRXSlTNI1Hf6VQdImrfVanIcVp6lLRa1J3LSs30FkVLh3+oonFo+S8k8paSi4hDERKIbAKbsU8iEwiZVgIPqlGcIbI/fCoWSlB5S+iOoRCyFGU2eE8O4CY4eiLpDdaHsg6eoVCs6CMK+7LP6hUhaiWj3L8n7rPsA0BaDuf5KzzASxpSrh85hEf8A4pQSl7LKFImEUCIhIyOUOET6IE5ARmcIEf7opav+ECTElLf6oOnaULRLpXOs8ik6eE6cwuVeTTcPVCVoeg09FkapGCFdWTJtXPjlVnT5odGoj/Mru2p+HZgHYopUdQHiN3Cou9u22desTc2rQK1ISfdX9EOGOClVLqJBZt/MErWPC2Oq21Y29wwsqNMQQrW2uDpAOVs+6uzbbrQN508CncASfdYQ2l/0qo6jc0Hu0mJhIxZ9Wjamxhd2Q/cKBQumuAlun6qZSe07PCGu4DGtOgJ9ODuE13hhvleJRpkkjS0korqGwZXW2ofvFTzDyNzKdQtalWXPOkD1RquqPi1tWkZglA8t/frgFjfy6OCpNuwPrlrRgbLo2iLO3FJnxOHmRsGlr3atwoJdxS/hKgLf5Vk+jDR+8N/1FbF1SbaoHb6Ssj01umtXHq4qiYJiDlLjZPjdAmETTTnhKPZGeAkT/wDaEANBQiMQnT6bJblEwzbbKUYCMQiim7FNOyeSmHZEwBur3sv+8Kiohur7skfqNQqzpo90GaQ+qoafwNV/3IJo7cqhpiWBWrpxOENhBRRjMwonAiB9UIj/AMT98+iYTmYUXS/7SwBCU+oQJQgFAkQjM8JrgY2QImEyoPM2md3FOIkrrY0/3jqNFumQDlBogyen2tAbgjCvqjIpMpc6VBsbXx74s0+SmJCsrh0vkDLREI1I4B4BE8Jr3SdTtimlpILiMpmswA4Y4RdF1uXnXTcR7BQbq2bcAtuLZp94U4OqNdgGEH1Q5pDkRmLrtrp1Q6h5T7KA7oFlSefzHLWP8M+UsH1XN1vbvmWBEZcdMsqYy9xUijRosIFu0ud7q9FlaxJYCntZb0c06IlQVlOxr181hoC7ClQoM0Umgu9VKque8kgwPRRntAEgZTBwfBcNRSpENqZwEXbgkIbmYQOq1HHWThsLP2kNuagncq5q3IM04xCovE0dQDYxKqLEuAJQMJzwAcCZTTAMoQ0CEYkYThHpCWBKJ9NA4COBslPtCRxhDTSQkcwkfogUU0tk+6MFLKAJ5VQoyr7skfqNRUQ3V/2SP1GorKD3HPgYWfZhjQtF3KB4P3WfbBYAEBRM+qAaBulEb7qAk+iYQd0S31S0hCgASECIK6ZCaRJypVhkcpRjKeQP9kxw9EDXQMgq07esqj9dUjPBVTUAMD7rUdrV23T2U6TfKz4k9Vp+m2poW3iuP5jt1zqNLXEncqY8skU2YCPgN+J/2VX6qX6mAl2ZXF1TVu3Csa1NrCSdlCrOYRDREKIjurGYKj1KhMwUq9UElqjB4OEHcOJ3KUepwuQIwE9pAw5A8UyTpnC6eGGkCZTqZphumcoHSfKDugjXEhxDTCiyeThTq1IFukbqE6kR5OEHN3mO+FycSJgrrUDf5eFGqVWiWqCNdeVp0nKz/UK5pVg9pzKtr24bTaQOVmOpVgZM8oNVaVfHtWuBzGV0iBnJVH25eF7HMccDZXU4lVDhkTykOZQkTIRwUC33Sg+qQzhAmSrxDSDskZGE4OGRylplQNDfVAjhPAlEtEK6OY3Cv+yT+o1FRBolXnZg/UKkKxHbuefAiFnWCKbVp+66eilCzLfgCVYJIhIxMpsEHKQnlZQ+cJgdkynbDKbHqi04H1SOUG+hKdnhCGZyCmkEbBdCECiot0TTpaxucLefs/6d4VhUu3MHmErE1qHiU9M7ZWx7J6rVfQdYtbhuEVoHuAPiBO/e2xkSot+40XaQfsq6pckOkuwgn3FUOBMYVZc1NO2y5Vb0j+bCh170BvxTKKbc1g10hRxWzgrjVrF5wUxur1yp1E5tSBldG1YOQoIe4ASU9lRxdJcqJ9NxHmUmk6CDvKrqdR0yThd6dUgnzIJ9QtAJgKBUeMhc69y6YBUSrcktwcoG16hBjZV1zcCmSE+7uCGxqyqW7ucOl2VOBl9dggkrP3VUvcSu13clxLZUMS45Koue2HB1VzXGJWocC0xGFiukvqU7xgZtK2xktBJzCRPQ9oSgokTkFLfEqoG+AEY4/wCUvb/lOkRCBmn2RgjblLblLIUMEY90iQAgJmCUD7lDAkyCFe9lmeo1FRjhXfZmOpVFZ08WHd4ml91lG/AFre8Pk/dZMGaYCuLKWoDdNBlGJwkB6BTEpZO/CIglI52QQO0iJSQBOyKgW+E4NACanNHKNHtZgrcfsrsravSuqrx5mrEUyST9Frv2ZXb6FzWt27PKQWPWKbTcPI+yztUPBJMwtV1xpF+aQG6ruq2jLXp5qkAEoMrU1lxaCYKi1muadJlWtjRNRrqjh9FHuKeqoZEQggsZBldBgrqGZgjC5mdoUDgAd0WtGrKaCY22TmS4kwqOjTiCukyIamAFwiE9jHAYGEEeq/JCg1Hw4t5U65jOFWvJa8hBXXtZzHRO6pL99VsunCvepUoZrjKp7kGtROMhBTO/MyURAzwEiC1xaUsxHqgsu3mtq3eRsVsHRIHss12tQPiOeQtK4AlWM+h7FICSQlmJjKUkZ9VTgkcIbfVGTEoe/KBf9o/XdDbJS3ErK6GQUYxlIbzykTiFU4bMEK67NM9SqKliVc9nf3i9J1fFl3Y6aAWXb8DcLTd0/IWaaYY1VAI+yHEApxIKEBNAPoEt8JGJhHAWT+BxhI7oExkIiJ90X6KcDwmgInCDqw5PGFf9i1hS6sBqgErNh5BVn25W8LqdNw9UV6B1CibjrODIVN3lVNKi22Dt1o7amH1jcO9Fj+6Kwu+ptYDIBQNtKBp2AdOSFW1xLonlaA0hTsmiMQqKsA6oY2BQR6jI22XB+/spL/NjhR3DBaAg5k8Snsy6GnCYacRldWNE+VMEik2RCkaQxhC40nNAkJ9Wo3TpCgrK1Qmo4cKsfU/P06pyrC7cGFxVIypruSR6qiXdtD6LpMlZ8Oh7qZK0VQB1Mj2Wauvyrr7oK68pFtWZXJx8qnXoDm6gFXvMAINX2qz8olXTh7qp7WA/dyR6K2O6rPoJR6ojBSJGUQ3ZD/tGZ32SP+YIpA+qRxsUE6MAqIaASUjJTozKHGNlVNAM5Kuuzm/qNTKp8YVz2d/eNRIam90Emgs034AtJ3MZt/us234ArQj7Ib55RjO6DcZKmoRBwUcozzCW/smhpHKUQRG6TkgDuilKByjG6QjlQBWPb8nqdIepUDCsO3iB1SjPqiyvUHvNtZuJwNCwbS666o5xz5lr+4LkUOngB3xNWU6KzXcl7vWUVdX4LLUNI4WbcC6oW+60fVnA0dM7LNk+aJ+6Br2FstAworpaT6KY+oI0g5UWoAdjKIju1F2dk5jnNdpSdBxMQuRdDoJyipzX7DhCq4tGFzpnyROShUdAyUEC/eQxx5VBRrOZcE8Eq4vnFxdB3VLUZDsHMqQXFNwe2VQdWZpql4CtraoSwAH6qD1elqbqCdFZIfSyq+q0j/dSqTslhK4XIh2+JVGt7XEWpPqFZkcqu7YH8HvwrLHKs4zehEJpE7p5goEK9DcHdLMyUtPKcBKIAaN0pRjfKBErKyG7nKdmUoygdkMwtz9Fddm56jUVL6QrzssfqNRWdK79yn+Hk+qzjDLAtH3KP4afdZpnwNKoccZhI7JSl/qUDgJRIA4TASURPKi4Hudkg7KcAlGYQ6G6Wkeid7D7pRxwiYaBmTspvQ5PV6MDlRWgbKz7WZ4nVacjYoNP3XX00GU54Cr+htBcHJd03Bfemj6BdOiNLaWoI079XqgtgcKjeGv+HCsOr1TqgbHdVDy4bbIHOIDohc3Q0RG66AkmAmVNUQ5BGedJj1XLBdkSV1e4DBTKfxSUElha1kO3XGs6RtsurWlwzum3ALW4UtFTcnJKqbohjtQCt7kCSVV3TZaSnQrKtmDynXolhB5Ua3fpdJ4Uq5Iq0pG6S6M44+HWLY5TLwDSDHK6XgLamv3Ta3noAneVUaztcfwW3CsokKH25TNPp7T6hTiOVUpm31Snf3T9/qgWIADwjA2SGAgZ4TSFEY9Uo4QyEf8A1RS2cgQIS9kEAIghXnZf941FSq87JbPUqkKxHXubFr91mmGabQtN3OP4SfdZmmIptKVYcB6pGOEg71RACgA4hOgeqQEZhHHplE0AJ5RO6QwJhERMlDAAx9UoxBToAygSrpA32Vp2qQOoDzZlVjcGCp/bJ/VGwOVFWnW2OqdScSrLpjAy0MqH1fzdR0gZKsqTBRswHDMIqk6kQXnzYVaXE+XhTbyo1z3AjCinQcDEInQb5eUyo4v+ieIcYAwmugAt07oqLUA9cJUh5onCLyAdMI0gAdKCTSEYXG6kCBmV3YIEndc64BEwgpq+CZKrrkwCZ+ytLpoklVdeHEiEFdqh+TCmUaoggnhRazYMkZRa4hupBF6jTglyhscHQwncqxrgVqUlVc6aoxsUqRvekM02LB7KSWkLj0dwfYsMcKUY3Wohmn3QHITiITTAUpAOPdAY3SmUSPUJpw3PJSjEokE7oZAkpDS+qIzwjpBySlGMKBsZwr/sZk9TqSqJsDcLRdjgf2nUwrOgd0Am0x6rMsH5bVpu6D/DfdZluKbVauDA2RAhN3yiBPKyh0kowdymbnKM5RcHMoiYQmTlLbnCJoieUgOSiD6IxOSiAyTP0Vn2hSc+9c//AClVhAaJWg7JY0U7io7hFibUYa/VZ3hTuqVPDoBg3AXPp1EPvKlZ2yj9VrNDzLsI0obpzjMFcG6sTyn14LySd0KY1HOyUd2MdGlgQqMJaY3XRh07beqY8yT6IIdQFp90GOaXQd0+q1s7rmKXmknCCZTJ0yeFyrnMp9OA2Zwo9ZwDiScIK2/JkkKqJLvLyrK+ySZwq9jQ4kk5QRK7XAZUcOOW+in3VMOCrT5XEFAQ+JaeVX3LSx+r3Ut8apK4XbdTQ5Bs+3Xl9i2PRT3TwqrtR02sTwrY7fdNZ5TPMgU9MO6LPoAGZKcDOChEHUjg7qoQ9eEiZSAnKaeCoshwEoRCAMp+4RMNG60XYZ/VKqzvK0PYJ/Vaq0F3SIoLMtB0Bajun5IWZafIEXQIS490UNs8qIQ990TjKAHJThHKi6WIRmIwmGQfZOGcoYQ9U4OnCEFFEwXkAZCv+03abeswDLlnajvKtV2Hb+MKjnbBVYuWNFral5GXKgvHl73F2yvuqvIf4Q+EKjuKet2+ISqqagmSRgJ1LzgNATqzSHlv8qVJpLgG7LI7wGt0wuLo+Ehd6ji4aBuo9SYiVRxqFoMELnrE6UXAnBQaxoPmUHVrmhkHlRqxnHC6VNoBwo9UkACUwQLsySCMKvLi12FZXWQc5VZUBbJOyoVR2oRG6ra7Sx+QrBrsZUa6YSCURAqOBTakPoGOEqjS0TymsJNMhFajtM/wzvYK41Ykqn7VEUX/AEVqXSc7ImHzhN3SAKMwUQj9Et+EiQUp4CBTEhNcnDYhLSjQAIiYKRMYCMhE3SA2V/2GI6tVVACr/sU/qlSFZULuv5AWZb8LVqO6wP3fHqssz4GlKvDiBuU3XyjJJMpBo5CRCBG6PrOxSx/skDO6lhCJEQEmkDZDfYIgQfVDTjlEGAkISIlAyqAWLdfs+ptFlWedwFh6gloELedjjwul1yRuEWG37w+u4H1VZclrBg8KxrQ97iRyqu5dqJEYSqr6pD5lG3qNYY/3XN5OrSB905gB8gGfVIO76rA7Gyj1Ny4lPI0eUiVxJc3DhKBrvUrkYnddSQ7AXJxgxCBrngiFErPgwCu9RwEwFErEDA5QRrjkzlQi4GRyplZwaDPKgyJgIOUkO8yTi0iU97Y4mVzduQgg3DQ2XKIH6X5OFNuhIIjCr3SXxGyDWdrOlr84Vw5s4VF2q/cLQOGfRIGgAJFE7oDJRnDdjhGQiQE2CEDgeEd9uEwH2TwfZFHBTTKI+LCWn3RQHC0HYv8AedRZ/Yq/7GM9TqKzrN4f3UZt/usw35TVpe6SP3bCzLDNNqtMFImdkk0GFlcEgzhITMIzP2RAEe6HCgjlOA5QDhynQEQhvhOiQmxCIPIRBqD8sfVb3tZpp9GqEchYCsfI2PVek9AotHRATiWo1FTUDyNYPKqr6podAKs+o3FOizRTMlUFYPrVDvBSq5Al/KeCWgQcommwNgbpkhm6DpqMZOUxxlpk5Q1NmSuFR+kzKAPLmnylMdUBxOUC4HJXN4BkhA17iG75UWqfQrqQQCVGqOAdHqg41tTgRKiQQJlS3ENOeVxc1syg5EwJdlcXPZJUnwwQZUWtQMkgqCPcEOEg4VdVBDvKVOqMc1sKC8jVCo0HbL4fAWmfusj23VAuA33WvfGoD2QNglBEmU0kbIhDdGRHum74CJEoYQ2KUwMokSJQ04lDRBEol3om4HKR2QomVfdiT/adRZ/VBCvuyan6lUVieOnc8G1+6zLAPDbBWk7n/wDi/dZlny2qqcZ4SARSSpCgYhEk8BBIGFAATyE4OKanGBstAyeUQTCZPuj8WxWUJ5cSwD/MF6bbVXUOg0mtGXNXm1IDxmAnGoL05wtX9JtxSuGlwaJEo1KytzSrOdre3lQ67nA+RqvLqmRiQ5VVwHMdDWSoquqPcBOnK4uqgZcFMc4CdVNcKuhwnw0HB1UFcHPdBkSFKbSa8zphc327yCNgiIrnHkQFzc93Awu7qDwYOy4Po1NRjAQxzHiGXEYUas8l0wpTy5oIlcXNBglqCKXEzIXLUYyFLNPzTCYabXDAhFcWkuwAotwyqCYViyjEwo9w2SQDCCluDVHCimdUkZVlXaBhzgq95Y10lwKCw7fdovWiNytxUZDgY4WA6XVqC+pGkwkTuFvnvJY1x3IQMITY9k+ZQ2nKJpsIzxCE+pQzKHS1ZhImEjHshO0oASSdk4HGUCQdkEBiSrvswR1GplUUmVedlebqNQKzpmOvc5/h491m6fy2rR91EiiAFm2GGBW0h6GRkpSEVFCf+Uj/ANogFIgBOpw04EITGE4+wQgp9iQIT2bSmwQnNlB0AEYUilfX1EQyq6OBKjbJwM8oJv8Aa9+BBMpHqt0fiAJUMHCIcOVCOzr2sZkBczd1DuE3fMJD6I0cLtwOqMJr75zhGlDE5CRaCJ0hGdcKl28/ylcn3NQmNKkPAONIQDWxloRpCL6hMwmONYnDTCsoAEaQljhgRFSRcSQAi2hcuEAK1gf5AnNxkNRVWbK9OAuT+kXrzur7XGwRBcTIQZx3bdeoPMU+l2nQDga2VoYPJQJnlBEtOl2FiJpsBcF1c6clPcAuZnhE0pgoa8lInSITCQEKcXcFLWuepIkbhDroDKRBKYDKInhAYIRQE8p0FFCJIV92M0HqlQKmawEhX/YrP1WqArEqH1S4HVemuvqB1MbuQqBhmm0gzKPZPW6NmXdD6g3xKVXGVb9Y7cq9Pf8AvNJ35D8tHsrYkqpThsgS0GITfFbwpi66gpHJhMDwnB45QENKWlIVOIXQQ4qHHPSU5rcJxAREBX6hpGNkAYRNRo4TDWYOEDpMQjOfRc/GbMgJGoDmE6OocfREujhcPGI4TTdAKHEnByUDM+y5NumchEXLDwhDyJSgJC4pxsj41I8IoaTG6IEfdIVqU7JwrUuAhS0yd0gI5R8an6Jvj0o2QdMAzCIM52XL94aNgmm5Ycwg7H6oZK4m6ZtCP7y1DT3GMJshc3XDMmEw12nYIHuMBcnOhE1Q47Jp0nhEoapG6dqHCa7SBMIB7QUWHAkLqzZMYW+i6At4CBw3T2iVzDgERWA2Q13MMbqOANytB2WBb3T76qdNF2zjyqnpPQ7rrlYBj9NIHzj2Q737gt+n2lPtzpLNFWl8ThuVZEr/2Q=="},
  {id:"cap",name:"Cap",thumb:"data:image/jpeg;base64,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"},
  {id:"bag",name:"Tasche",thumb:"data:image/jpeg;base64,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"},
  {id:"custom",name:"Weiterer Artikel",thumb:""}
];
const CREATOR_FARBEN=["#111111","#444444","#b9b9b9","#f2f2f2","#173a64","#214d38","#9f1f24","#d7c7a6"];
const CREATOR_GROESSEN=["XS","S","M","L","XL","XXL","3XL"];
// v96: echte 360°-Architektur. Pro Artikel können hier reale Rundum-Frames hinterlegt werden.
// Solange nur das hochwertige Frontbild vorhanden ist, wird bewusst KEINE 2D-Perspektiv-Verzerrung simuliert.
const CREATOR_360_FRAMES={
  hoodie:[],tshirt:[],polo:[],sweatshirt:[],ziphoodie:[],softshell:[],tank:[],cap:[],bag:[],custom:[]
};
function creatorFramesFuerProdukt(){
  const produkt=CREATOR_PRODUKTE.find(p=>p.id===creatorState.produkt);
  const frames=CREATOR_360_FRAMES[creatorState.produkt]||[];
  return frames.length?frames:(produkt?.thumb?[produkt.thumb]:[]);
}
function creatorHatEchte360(){return (CREATOR_360_FRAMES[creatorState.produkt]||[]).length>1;}
const CREATOR_KEY="rudelbar_creator_entwuerfe";
let creatorState={produkt:"hoodie",farbe:"#111111",groesse:"M",view:"front",angle:0,bg:"light",scale:1,x:0,y:0,rot:0,flipX:1,flipY:1};
let creatorImg=null, creatorPngData="";
let creatorDrag=null;

function creatorOeffnen(){
  aktiverBereich="mode";
  alleHauptansichtenVerstecken();
  $("creatorAnsicht").classList.remove("versteckt");
  creatorUIRendern();
  creatorZeichnen();
  nachOben();
}
function creatorProduktSvg(id,name){
  const common=`fill="none" stroke="#d6d6d6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
  let shape="";
  if(id==="hoodie"||id==="ziphoodie") shape=`<path ${common} d="M42 34 Q50 18 58 34 L72 40 86 58 76 66 69 56 69 94 31 94 31 56 24 66 14 58 28 40Z"/><path ${common} d="M42 34 Q50 46 58 34 Q58 20 50 18 Q42 20 42 34Z"/>${id==="ziphoodie"?`<path ${common} d="M50 43V94"/>`:``}<path ${common} d="M39 73 Q50 80 61 73"/>`;
  else if(id==="tshirt") shape=`<path ${common} d="M36 27 Q50 36 64 27 L82 38 73 55 65 50 65 94 35 94 35 50 27 55 18 38Z"/><path ${common} d="M42 28 Q50 38 58 28"/>`;
  else if(id==="polo") shape=`<path ${common} d="M36 27 Q50 35 64 27 L82 38 73 55 65 50 65 94 35 94 35 50 27 55 18 38Z"/><path ${common} d="M42 27 50 39 58 27M50 39V50"/><circle cx="50" cy="45" r="1.4" fill="#d6d6d6"/>`;
  else if(id==="sweatshirt") shape=`<path ${common} d="M36 28 Q50 36 64 28 L78 36 88 67 77 71 68 49 66 94 34 94 32 49 23 71 12 67 22 36Z"/><path ${common} d="M43 29 Q50 37 57 29"/>`;
  else if(id==="softshell") shape=`<path ${common} d="M38 25 50 31 62 25 75 36 70 94 30 94 25 36Z"/><path ${common} d="M50 31V94M38 25 43 43 50 31 57 43 62 25"/>`;
  else if(id==="tank") shape=`<path ${common} d="M39 25 Q50 34 61 25 L68 38 63 94 37 94 32 38Z"/><path ${common} d="M43 26 Q50 36 57 26"/>`;
  else if(id==="cap") shape=`<path ${common} d="M24 58 Q29 31 52 31 Q75 31 79 58Z"/><path ${common} d="M24 58 Q58 54 88 66 Q61 70 35 64Z"/><path ${common} d="M52 31V57"/>`;
  else if(id==="bag") shape=`<path ${common} d="M24 43H76V94H24Z"/><path ${common} d="M37 43 Q37 22 50 22 Q63 22 63 43"/>`;
  else shape=`<path ${common} d="M30 30H70V90H30Z"/><path ${common} d="M50 42V78M32 60H68"/>`;
  return `<svg class="creator-produkt-svg" viewBox="0 0 100 110" role="img" aria-label="${name}"><defs><radialGradient id="g-${id}" cx="50%" cy="30%"><stop offset="0" stop-color="#3b3b3b"/><stop offset="1" stop-color="#111"/></radialGradient></defs><rect x="2" y="2" width="96" height="106" rx="12" fill="url(#g-${id})"/>${shape}</svg>`;
}
function creatorUIRendern(){
  $("creatorProduktGrid").innerHTML=CREATOR_PRODUKTE.map(p=>`<button type="button" data-cprod="${p.id}" class="${creatorState.produkt===p.id?'aktiv':''}">${p.id!=="custom"?`<img class="creator-produkt-foto" src="${p.thumb}" alt="${p.name}" loading="eager">`:`<span class="creator-plus">＋</span>`}<strong>${p.name}</strong></button>`).join("");
  document.querySelectorAll("[data-cprod]").forEach(b=>b.onclick=()=>{creatorState.produkt=b.dataset.cprod;creatorState.x=0;creatorState.y=0;creatorState.angle=0;creatorDrag=null;creatorUIRendern();creatorReglerSetzen();});
  $("creatorFarben").innerHTML=CREATOR_FARBEN.map(c=>`<button type="button" aria-label="Farbe ${c}" data-cfarbe="${c}" class="${creatorState.farbe===c?'aktiv':''}" style="--creator-farbe:${c}"></button>`).join("");
  document.querySelectorAll("[data-cfarbe]").forEach(b=>b.onclick=()=>{creatorState.farbe=b.dataset.cfarbe;creatorUIRendern();creatorZeichnen();});
  $("creatorGroessen").innerHTML=CREATOR_GROESSEN.map(g=>`<button type="button" data-csize="${g}" class="${creatorState.groesse===g?'aktiv':''}">${g}</button>`).join("");
  document.querySelectorAll("[data-csize]").forEach(b=>b.onclick=()=>{creatorState.groesse=b.dataset.csize;creatorUIRendern();});
  document.querySelectorAll("#creatorHintergruende [data-bg]").forEach(b=>b.classList.toggle("aktiv",b.dataset.bg===creatorState.bg));
  creatorEntwuerfeRendern();
}
function creatorHexToRgb(hex){const h=hex.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function creatorShade(hex,delta){const [r,g,b]=creatorHexToRgb(hex);return `rgb(${Math.max(0,Math.min(255,r+delta))},${Math.max(0,Math.min(255,g+delta))},${Math.max(0,Math.min(255,b+delta))})`;}
function creatorBg(ctx,w,h){
  if(creatorState.bg==="transparent"){ctx.clearRect(0,0,w,h);return;}
  const grad=ctx.createRadialGradient(w*.5,h*.38,30,w*.5,h*.45,w*.7);
  if(creatorState.bg==="light"){grad.addColorStop(0,"#ffffff");grad.addColorStop(1,"#d8d8d8");} else {grad.addColorStop(0,"#363636");grad.addColorStop(1,"#080808");}
  ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
}
function creatorKleidungsstueck(ctx,w,h){
  const c=creatorState.farbe, side=creatorState.view, prod=creatorState.produkt;
  const hi=creatorShade(c,42), mid=creatorShade(c,14), lo=creatorShade(c,-34), seam=creatorShade(c,-52);
  ctx.save();
  ctx.translate(w/2,h/2+18);
  ctx.lineJoin="round"; ctx.lineCap="round";

  // weicher Produktschatten für mehr Tiefe
  ctx.save(); ctx.globalAlpha=.42; ctx.filter="blur(20px)"; ctx.fillStyle="#000";
  ctx.beginPath(); ctx.ellipse(0,315,230,38,0,0,Math.PI*2); ctx.fill(); ctx.restore();

  if(side==="left"||side==="right") ctx.scale(side==="left"?-1:1,1);

  const fillBody=()=>{
    const g=ctx.createLinearGradient(-240,-250,250,270);
    g.addColorStop(0,lo); g.addColorStop(.28,c); g.addColorStop(.55,hi); g.addColorStop(.74,c); g.addColorStop(1,lo);
    ctx.fillStyle=g; ctx.strokeStyle=seam; ctx.lineWidth=5;
  };
  const stoffFalten=(xs,ys,xe,ye,count=4)=>{
    ctx.save(); ctx.globalAlpha=.22; ctx.strokeStyle=hi; ctx.lineWidth=3;
    for(let i=1;i<=count;i++){ const t=i/(count+1); ctx.beginPath(); ctx.moveTo(xs+(xe-xs)*t-8,ys); ctx.quadraticCurveTo(xs+(xe-xs)*t+18,(ys+ye)/2,xs+(xe-xs)*t,ye); ctx.stroke(); }
    ctx.restore();
  };

  if(prod==="cap"){
    fillBody();
    ctx.beginPath(); ctx.moveTo(-220,25); ctx.quadraticCurveTo(-185,-155,10,-160); ctx.quadraticCurveTo(190,-155,225,5); ctx.quadraticCurveTo(95,65,-80,58); ctx.quadraticCurveTo(-165,52,-220,25); ctx.fill(); ctx.stroke();
    ctx.fillStyle=creatorShade(c,4); ctx.beginPath(); ctx.moveTo(40,18); ctx.quadraticCurveTo(240,5,310,70); ctx.quadraticCurveTo(150,105,-25,64); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle=hi; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(0,-150); ctx.lineTo(5,52); ctx.stroke();
    ctx.restore(); return;
  }
  if(prod==="bag"){
    fillBody(); ctx.beginPath(); ctx.roundRect(-235,-245,470,520,26); ctx.fill(); ctx.stroke();
    ctx.strokeStyle=hi; ctx.lineWidth=24; ctx.beginPath(); ctx.arc(0,-245,145,Math.PI,0); ctx.stroke();
    ctx.strokeStyle=seam; ctx.lineWidth=3; ctx.strokeRect(-210,-215,420,455); stoffFalten(-180,-195,180,215,5); ctx.restore(); return;
  }
  if(prod==="custom"){
    fillBody(); ctx.beginPath(); ctx.roundRect(-270,-310,540,620,30); ctx.fill(); ctx.stroke();
    ctx.setLineDash([18,14]); ctx.strokeStyle=hi; ctx.strokeRect(-230,-270,460,540); ctx.setLineDash([]); ctx.restore(); return;
  }

  if(side==="left"||side==="right"){
    fillBody(); ctx.beginPath(); ctx.moveTo(-82,-305); ctx.quadraticCurveTo(20,-348,120,-260); ctx.lineTo(212,226); ctx.quadraticCurveTo(175,286,112,278); ctx.lineTo(24,-118); ctx.lineTo(8,302); ctx.lineTo(-153,302); ctx.lineTo(-176,-178); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle=hi; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(68,-210); ctx.quadraticCurveTo(100,0,130,210); ctx.stroke();
    if(prod==="hoodie"||prod==="zip"){ctx.strokeStyle=lo;ctx.lineWidth=24;ctx.beginPath();ctx.arc(-20,-287,108,Math.PI*1.04,Math.PI*1.96);ctx.stroke();}
    ctx.restore(); return;
  }

  // Torso mit natürlicher Schulter- und Ärmelkontur
  fillBody();
  ctx.beginPath();
  ctx.moveTo(-148,-296); ctx.quadraticCurveTo(-72,-337,0,-334); ctx.quadraticCurveTo(72,-337,148,-296);
  ctx.quadraticCurveTo(222,-270,302,-194); ctx.lineTo(228,-58); ctx.lineTo(170,-96);
  ctx.quadraticCurveTo(177,65,168,303); ctx.quadraticCurveTo(0,325,-168,303);
  ctx.quadraticCurveTo(-177,65,-170,-96); ctx.lineTo(-228,-58); ctx.lineTo(-302,-194);
  ctx.quadraticCurveTo(-222,-270,-148,-296); ctx.closePath(); ctx.fill(); ctx.stroke();

  // Ärmel-Schatten und Nähte
  ctx.save(); ctx.globalAlpha=.32; ctx.fillStyle=lo;
  ctx.beginPath();ctx.moveTo(-175,-250);ctx.lineTo(-300,-190);ctx.lineTo(-228,-58);ctx.lineTo(-170,-96);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(175,-250);ctx.lineTo(300,-190);ctx.lineTo(228,-58);ctx.lineTo(170,-96);ctx.closePath();ctx.fill();ctx.restore();
  ctx.strokeStyle=hi;ctx.lineWidth=2.6;ctx.globalAlpha=.35;ctx.beginPath();ctx.moveTo(-145,-285);ctx.quadraticCurveTo(-175,-80,-160,260);ctx.moveTo(145,-285);ctx.quadraticCurveTo(175,-80,160,260);ctx.stroke();ctx.globalAlpha=1;
  stoffFalten(-130,-225,130,250,5);

  if(prod==="tshirt"||prod==="polo"||prod==="tank"){
    ctx.fillStyle=creatorShade(c,3);ctx.strokeStyle=seam;ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,-294,72,35,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  }
  if(prod==="tank"){
    const bg=creatorState.bg==="light"?"#efefef":creatorState.bg==="transparent"?"rgba(0,0,0,0)":"#151515";
    ctx.fillStyle=bg; ctx.beginPath();ctx.moveTo(-175,-274);ctx.lineTo(-305,-192);ctx.lineTo(-230,-50);ctx.lineTo(-145,-110);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(175,-274);ctx.lineTo(305,-192);ctx.lineTo(230,-50);ctx.lineTo(145,-110);ctx.closePath();ctx.fill();
  }
  if(prod==="hoodie"||prod==="zip"){
    const hg=ctx.createRadialGradient(0,-350,20,0,-290,150); hg.addColorStop(0,hi); hg.addColorStop(.45,c); hg.addColorStop(1,lo);
    ctx.fillStyle=hg;ctx.strokeStyle=seam;ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(-132,-290);ctx.quadraticCurveTo(0,-445,132,-290);ctx.quadraticCurveTo(78,-214,0,-228);ctx.quadraticCurveTo(-78,-214,-132,-290);ctx.fill();ctx.stroke();
    ctx.strokeStyle=creatorShade(c,70);ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-58,-256);ctx.lineTo(-53,-105);ctx.moveTo(58,-256);ctx.lineTo(53,-105);ctx.stroke();
    if(side==="front"){ctx.fillStyle=lo;ctx.strokeStyle=seam;ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(-118,118,236,94,30);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(0,118);ctx.lineTo(0,208);ctx.strokeStyle=hi;ctx.globalAlpha=.25;ctx.stroke();ctx.globalAlpha=1;}
  }
  if(prod==="zip"||prod==="softshell"){
    ctx.strokeStyle=creatorShade(c,76);ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,-260);ctx.lineTo(0,300);ctx.stroke();
    ctx.fillStyle=hi;ctx.fillRect(-3,-12,6,18);
  }
  if(prod==="polo"){
    ctx.fillStyle=mid;ctx.strokeStyle=seam;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-75,-298);ctx.lineTo(-10,-232);ctx.lineTo(0,-278);ctx.lineTo(10,-232);ctx.lineTo(75,-298);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,-278);ctx.lineTo(0,-175);ctx.stroke();
    for(let y=-238;y<-185;y+=20){ctx.fillStyle=hi;ctx.beginPath();ctx.arc(7,y,4,0,Math.PI*2);ctx.fill();}
  }
  if(prod==="sweat"||prod==="softshell"){
    ctx.strokeStyle=seam;ctx.lineWidth=8;ctx.beginPath();ctx.ellipse(0,-298,76,37,0,0,Math.PI*2);ctx.stroke();
  }
  // Bündchen und Saum
  ctx.strokeStyle=seam;ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(-162,294);ctx.quadraticCurveTo(0,314,162,294);ctx.stroke();
  ctx.restore();
}

function creatorBgPatch(ctx,c,x,y,w,h){ctx.save();ctx.fillStyle=c;ctx.fillRect(x,y,w,h);ctx.restore();}
function creatorDesignBounds(){
  if(!creatorImg) return null;
  let base=creatorState.produkt==="cap"?170:creatorState.produkt==="bag"?280:280;
  const ratio=creatorImg.width/creatorImg.height;let dw=base*creatorState.scale,dh=dw/ratio;if(dh>base*1.35){dh=base*1.35*creatorState.scale;dw=dh*ratio;}
  let cx=450+creatorState.x, cy=(creatorState.produkt==="cap"?455:creatorState.produkt==="bag"?470:430)+creatorState.y;
  return {cx,cy,dw,dh};
}
const creatorProduktFotoCache=new Map();
function creatorBildLaden(src){
  if(!src)return null;
  if(creatorProduktFotoCache.has(src))return creatorProduktFotoCache.get(src);
  const img=new Image(); creatorProduktFotoCache.set(src,img);
  img.onload=()=>creatorZeichnen(); img.src=src; return img;
}
function creatorAktuellerFrame(){
  const frames=creatorFramesFuerProdukt();
  if(!frames.length)return {src:null,index:0,total:0,angle:0};
  if(!creatorHatEchte360())return {src:frames[0],index:0,total:1,angle:0};
  const a=((Number(creatorState.angle)||0)%360+360)%360;
  const idx=Math.round((a/360)*frames.length)%frames.length;
  return {src:frames[idx],index:idx,total:frames.length,angle:a};
}
function creatorProduktFotoZeichnen(ctx,w,h){
  const frame=creatorAktuellerFrame();
  const img=creatorBildLaden(frame.src);
  ctx.save();
  const card=ctx.createRadialGradient(w*.5,h*.39,60,w*.5,h*.45,w*.64);
  card.addColorStop(0,"#f8f8f8"); card.addColorStop(.58,"#dedede"); card.addColorStop(1,"#bdbdbd");
  ctx.fillStyle=card; ctx.beginPath(); ctx.roundRect(42,42,w-84,h-84,34); ctx.fill();
  ctx.save();ctx.globalAlpha=.20;ctx.filter="blur(20px)";ctx.fillStyle="#000";ctx.beginPath();ctx.ellipse(w*.5,h*.80,220,30,0,0,Math.PI*2);ctx.fill();ctx.restore();
  if(!img || !img.complete || !img.naturalWidth){
    ctx.restore(); creatorKleidungsstueck(ctx,w,h); return;
  }
  const pad=Math.max(10,Math.round(Math.min(img.naturalWidth,img.naturalHeight)*.025));
  const sx=pad,sy=pad,sw=Math.max(1,img.naturalWidth-pad*2),sh=Math.max(1,img.naturalHeight-pad*2);
  const ratio=sw/sh; let dh=620,dw=dh*ratio; if(dw>620){dw=620;dh=dw/ratio;}
  const cx=w/2,cy=h/2+8;
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality="high";
  ctx.shadowColor="rgba(0,0,0,.26)";ctx.shadowBlur=24;ctx.shadowOffsetY=12;
  ctx.drawImage(img,sx,sy,sw,sh,cx-dw/2,cy-dh/2,dw,dh);
  ctx.restore();
}
function creatorZeichnen(){
  const canvas=$("creatorCanvas"),ctx=canvas.getContext("2d"),w=canvas.width,h=canvas.height;
  creatorBg(ctx,w,h);creatorProduktFotoZeichnen(ctx,w,h);
  const frame=creatorAktuellerFrame();
  if($("creator360Out")) $("creator360Out").textContent="FRONT";
  if($("creator360Hinweis")) $("creator360Hinweis").textContent="Realistische Vorderansicht · Motiv direkt mit dem Finger verschieben";
  if($("creator360Status")) $("creator360Status").classList.add("bereit");
  if(creatorImg){
    const b=creatorDesignBounds();ctx.save();ctx.translate(b.cx,b.cy);ctx.rotate(creatorState.rot*Math.PI/180);ctx.scale(creatorState.flipX,creatorState.flipY);ctx.drawImage(creatorImg,-b.dw/2,-b.dh/2,b.dw,b.dh);ctx.restore();
    $("creatorHinweis").classList.add("versteckt");
  } else $("creatorHinweis").classList.remove("versteckt");
}
function creatorReglerSync(){
  creatorState.scale=Number($("creatorScale").value)/100;creatorState.x=Number($("creatorX").value);creatorState.y=Number($("creatorY").value);creatorState.rot=Number($("creatorRot").value);
  $("creatorScaleOut").textContent=Math.round(creatorState.scale*100)+" %";$("creatorXOut").textContent=creatorState.x;$("creatorYOut").textContent=creatorState.y;$("creatorRotOut").textContent=creatorState.rot+"°";creatorZeichnen();
}
function creatorReglerSetzen(){
  $("creatorScale").value=Math.round(creatorState.scale*100);$("creatorX").value=creatorState.x;$("creatorY").value=creatorState.y;$("creatorRot").value=creatorState.rot;creatorReglerSync();
}
function creatorDateiLaden(file){
  if(!file) return;if(file.type!=="image/png"){alert("Bitte eine PNG-Datei auswählen.");return;}if(file.size>12*1024*1024){alert("Die PNG-Datei ist zu groß. Bitte maximal 12 MB verwenden.");return;}
  const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>{creatorImg=img;creatorPngData=reader.result;creatorState.scale=1;creatorState.x=0;creatorState.y=0;creatorState.rot=0;creatorState.flipX=1;creatorState.flipY=1;creatorReglerSetzen();};img.src=reader.result;};reader.readAsDataURL(file);
}
function creatorCanvasDatei(){return new Promise(resolve=>$("creatorCanvas").toBlob(b=>resolve(new File([b],`Rudelbar-${creatorState.produkt}-${Date.now()}.png`,{type:"image/png"})),"image/png"));}
async function creatorTeilen(){
  const file=await creatorCanvasDatei();if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:"Rudelbar Mode Creator",files:[file]});return;}creatorDownload();
}
function creatorDownload(){const c=$("creatorCanvas"),a=document.createElement("a");a.download=`Rudelbar-${creatorState.produkt}-${Date.now()}.png`;a.href=c.toDataURL("image/png");a.click();}
function creatorEntwuerfeLesen(){try{return JSON.parse(localStorage.getItem(CREATOR_KEY)||"[]");}catch{return [];}}
function creatorEntwurfSpeichern(){
  if(!creatorPngData){alert("Bitte zuerst ein PNG-Design hochladen.");return;}
  const arr=creatorEntwuerfeLesen();const item={id:neueID(),datum:new Date().toISOString(),state:{...creatorState},png:creatorPngData};arr.unshift(item);
  try{localStorage.setItem(CREATOR_KEY,JSON.stringify(arr.slice(0,8)));creatorEntwuerfeRendern();alert("Entwurf gespeichert.");}catch{alert("Der Entwurf ist für den lokalen Speicher zu groß. Bitte die PNG-Vorschau herunterladen.");}
}
function creatorEntwuerfeRendern(){
  const box=$("creatorEntwuerfe");if(!box)return;const arr=creatorEntwuerfeLesen();
  if(!arr.length){box.innerHTML='<div class="creator-keine">Noch keine Entwürfe gespeichert.</div>';return;}
  box.innerHTML=arr.map(e=>`<div class="creator-entwurf"><img src="${e.png}" alt="Entwurf"><div><strong>${CREATOR_PRODUKTE.find(p=>p.id===e.state.produkt)?.name||'Artikel'}</strong><small>${new Date(e.datum).toLocaleDateString('de-DE')}</small></div><button data-cload="${e.id}" type="button">Öffnen</button><button data-cdel="${e.id}" type="button">×</button></div>`).join("");
  box.querySelectorAll("[data-cload]").forEach(b=>b.onclick=()=>{const e=arr.find(x=>x.id===b.dataset.cload);if(!e)return;creatorState={...creatorState,...e.state};creatorPngData=e.png;const img=new Image();img.onload=()=>{creatorImg=img;creatorUIRendern();creatorReglerSetzen();};img.src=e.png;});
  box.querySelectorAll("[data-cdel]").forEach(b=>b.onclick=()=>{const neu=arr.filter(x=>x.id!==b.dataset.cdel);localStorage.setItem(CREATOR_KEY,JSON.stringify(neu));creatorEntwuerfeRendern();});
}
function creatorReset(){creatorState={...creatorState,scale:1,x:0,y:0,rot:0,flipX:1,flipY:1};creatorReglerSetzen();}
function creatorPointerPos(ev){const c=$("creatorCanvas"),r=c.getBoundingClientRect(),p=ev.touches?ev.touches[0]:ev;return {x:(p.clientX-r.left)*c.width/r.width,y:(p.clientY-r.top)*c.height/r.height};}
function creatorPointerDown(ev){if(!creatorImg)return;const p=creatorPointerPos(ev),b=creatorDesignBounds();if(Math.abs(p.x-b.cx)<=b.dw*.7&&Math.abs(p.y-b.cy)<=b.dh*.7){creatorDrag={sx:p.x,sy:p.y,ox:creatorState.x,oy:creatorState.y};ev.preventDefault();}}
function creatorPointerMove(ev){if(!creatorDrag)return;const p=creatorPointerPos(ev);creatorState.x=Math.max(-260,Math.min(260,creatorDrag.ox+p.x-creatorDrag.sx));creatorState.y=Math.max(-260,Math.min(260,creatorDrag.oy+p.y-creatorDrag.sy));creatorReglerSetzen();ev.preventDefault();}
function creatorPointerUp(){creatorDrag=null;}

/* ===== RUDELBAR v80: RECHNUNGEN ===== */

const FIRMEN_DATEN = {
  inhaber: "Martin Küster",
  strasse: "Kielort 16 C",
  ort: "22850 Norderstedt",
  telefon: "015259574522"
};

const RECHNUNGS_SETTINGS_KEY="rudelbar_rechnungs_einstellungen_v94";
const RECHNUNGS_STANDARD_DATEN={
  inhaber:"Martin Küster",strasse:"Kielort 16 C",ort:"22850 Norderstedt",telefon:"015259574522",
  email:"",website:"",iban:"",bic:"",bank:"",steuernummer:"",ustid:""
};
let rechnungsSettings={
  shared:{...RECHNUNGS_STANDARD_DATEN},
  apply:{mode:true,service:true,security:true},
  area:{mode:{...RECHNUNGS_STANDARD_DATEN},service:{...RECHNUNGS_STANDARD_DATEN},security:{...RECHNUNGS_STANDARD_DATEN}}
};
const RECHNUNGS_FELDER=[
  ["inhaber","Inhaber"],["telefon","Telefon"],["strasse","Straße & Hausnummer"],["ort","PLZ & Ort"],
  ["email","E-Mail"],["website","Webseite"],["iban","IBAN"],["bic","BIC"],["bank","Kreditinstitut"],
  ["steuernummer","Steuernummer"],["ustid","USt-IdNr."]
];
function rechnungsSettingsLaden(){
  try{
    const x=JSON.parse(localStorage.getItem(RECHNUNGS_SETTINGS_KEY)||"{}");
    rechnungsSettings={
      shared:{...RECHNUNGS_STANDARD_DATEN,...(x.shared||{})},
      apply:{mode:true,service:true,security:true,...(x.apply||{})},
      area:{
        mode:{...RECHNUNGS_STANDARD_DATEN,...(x.area?.mode||{})},
        service:{...RECHNUNGS_STANDARD_DATEN,...(x.area?.service||{})},
        security:{...RECHNUNGS_STANDARD_DATEN,...(x.area?.security||{})}
      }
    };
  }catch{}
}
function rechnungsDatenFuerBereich(bereich){
  return rechnungsSettings.apply[bereich] ? {...rechnungsSettings.shared} : {...rechnungsSettings.area[bereich]};
}
function rechnungsAreaFormHTML(bereich){
  return RECHNUNGS_FELDER.map(([key,label],i)=>`<label class="${[2,3,6].includes(i)?'span-2':''}">${label}<input id="rechnung${bereich[0].toUpperCase()+bereich.slice(1)}${key[0].toUpperCase()+key.slice(1)}" type="text"></label>`).join("");
}
function rechnungsSettingsUIInit(){
  document.querySelectorAll("[data-rechnung-area]").forEach(box=>{ box.innerHTML=rechnungsAreaFormHTML(box.dataset.rechnungArea); });
}
function rechnungsSettingsInUI(){
  const ids={inhaber:"Inhaber",telefon:"Telefon",strasse:"Strasse",ort:"Ort",email:"Email",website:"Website",iban:"Iban",bic:"Bic",bank:"Bank",steuernummer:"Steuernummer",ustid:"Ustid"};
  Object.entries(ids).forEach(([k,suf])=>{ const el=$("rechnungShared"+suf); if(el)el.value=rechnungsSettings.shared[k]||""; });
  ["mode","service","security"].forEach(b=>{
    const cap=b[0].toUpperCase()+b.slice(1), check=$("rechnungApply"+cap); if(check) check.checked=!!rechnungsSettings.apply[b];
    Object.entries(ids).forEach(([k,suf])=>{ const el=$("rechnung"+cap+suf); if(el)el.value=rechnungsSettings.area[b][k]||""; });
  });
  rechnungsOverrideSichtbarkeit();
}
function rechnungsOverrideSichtbarkeit(){
  ["mode","service","security"].forEach(b=>{
    const cap=b[0].toUpperCase()+b.slice(1), use=$("rechnungApply"+cap)?.checked!==false;
    $("rechnungOverride"+cap)?.classList.toggle("versteckt",use);
  });
}
function rechnungsSettingsAusUI(){
  const ids={inhaber:"Inhaber",telefon:"Telefon",strasse:"Strasse",ort:"Ort",email:"Email",website:"Website",iban:"Iban",bic:"Bic",bank:"Bank",steuernummer:"Steuernummer",ustid:"Ustid"};
  Object.entries(ids).forEach(([k,suf])=>{ rechnungsSettings.shared[k]=($("rechnungShared"+suf)?.value||"").trim(); });
  ["mode","service","security"].forEach(b=>{
    const cap=b[0].toUpperCase()+b.slice(1); rechnungsSettings.apply[b]=!!$("rechnungApply"+cap)?.checked;
    Object.entries(ids).forEach(([k,suf])=>{ rechnungsSettings.area[b][k]=($("rechnung"+cap+suf)?.value||"").trim(); });
  });
  localStorage.setItem(RECHNUNGS_SETTINGS_KEY,JSON.stringify(rechnungsSettings));
}
function rechnungsSettingsSpeichern(){ rechnungsSettingsAusUI(); rechnungsOverrideSichtbarkeit(); alert("Rechnungsdaten gespeichert."); }
rechnungsSettingsLaden();

const RECHNUNGS_BEREICHE = {
  mode: { name: "Rudelbar Mode", prefix: "RBM", logo: "Logo-Mode.png", header: "data:image/jpeg;base64,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", accent: [230,166,35], claim: "TRAG DAS RUDEL." },
  service: { name: "Rudelbar Facility Service", prefix: "RBF", logo: "Logo-Service.png", header: "data:image/jpeg;base64,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", accent: [65,190,75], claim: "ZUVERLÄSSIG. FLEXIBEL. STARK." },
  security: { name: "Rudelbar Security", prefix: "RBS", logo: "Logo-Haupt.png", header: "data:image/jpeg;base64,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", accent: [220,55,55], claim: "SICHERHEIT. VERTRAUEN. RUDEL." }
};

let rechnungEditID = null;
let rechnungPositionen = [];
let rechnungReservierteNummer = "";

function isoHeute(){ return new Date().toISOString().slice(0,10); }
function datumDE(iso){ if(!iso) return ""; const [y,m,d]=String(iso).slice(0,10).split("-"); return `${d}.${m}.${y}`; }
function plusTage(iso,tage){ const d=new Date(`${iso}T12:00:00`); d.setDate(d.getDate()+tage); return d.toISOString().slice(0,10); }

async function naechsteRechnungsnummer(){
  if(!navigator.onLine){ throw new Error("Für eine neue fortlaufende Nummer muss die App online sein."); }
  const cfg=RECHNUNGS_BEREICHE[aktiverBereich];
  if(!cfg) throw new Error("Für diesen Bereich ist kein Nummernkreis eingerichtet.");
  const { data, error } = await sb.rpc("naechste_rudelbar_nummer", { p_bereich: aktiverBereich, p_jahr: new Date().getFullYear() });
  if(error) throw error;
  return String(data || "");
}

function rechnungPositionNeu(pos={}){
  rechnungPositionen.push({
    id: pos.id || neueID(),
    beschreibung: pos.beschreibung || "",
    menge: Number(pos.menge ?? 1),
    einheit: pos.einheit || "Stk.",
    einzelpreis: Number(pos.einzelpreis ?? 0),
    mwst: Number(pos.mwst ?? 19)
  });
  rechnungPositionenRendern();
}

function rechnungPositionenRendern(){
  const box=$("rechnungPositionen");
  if(!rechnungPositionen.length){ box.innerHTML='<div class="daten-leer"><strong>Noch keine Position</strong><span>Füge mindestens eine Rechnungsposition hinzu.</span></div>'; rechnungSummenAktualisieren(); return; }
  box.innerHTML=rechnungPositionen.map((p,i)=>`<div class="rechnung-position" data-pos-id="${p.id}">
    <label>Beschreibung<input data-rf="beschreibung" value="${esc(p.beschreibung)}" placeholder="Leistung / Artikel"></label>
    <label>Menge<input data-rf="menge" type="number" step="0.01" inputmode="decimal" value="${p.menge}"></label>
    <label>Einheit<input data-rf="einheit" value="${esc(p.einheit)}"></label>
    <label>Einzelpreis €<input data-rf="einzelpreis" type="number" step="0.01" inputmode="decimal" value="${p.einzelpreis}"></label>
    <label>MwSt.<select data-rf="mwst"><option value="19" ${p.mwst===19?'selected':''}>19 %</option><option value="7" ${p.mwst===7?'selected':''}>7 %</option><option value="0" ${p.mwst===0?'selected':''}>0 %</option></select></label>
    <button type="button" class="rechnung-pos-loeschen" data-pos-del="${p.id}">×</button>
  </div>`).join("");
  box.querySelectorAll("[data-pos-id]").forEach(row=>{
    const id=row.dataset.posId;
    row.querySelectorAll("[data-rf]").forEach(input=>input.oninput=()=>{
      const p=rechnungPositionen.find(x=>x.id===id); if(!p) return;
      const k=input.dataset.rf;
      p[k]=["menge","einzelpreis","mwst"].includes(k)?Number(input.value||0):input.value;
      rechnungSummenAktualisieren();
    });
  });
  box.querySelectorAll("[data-pos-del]").forEach(btn=>btn.onclick=()=>{ rechnungPositionen=rechnungPositionen.filter(x=>x.id!==btn.dataset.posDel); rechnungPositionenRendern(); });
  rechnungSummenAktualisieren();
}

function rechnungSummen(){
  let netto=0,mwst=0;
  rechnungPositionen.forEach(p=>{ const n=Number(p.menge||0)*Number(p.einzelpreis||0); netto+=n; mwst+=n*Number(p.mwst||0)/100; });
  return { netto, mwst, gesamt: netto+mwst };
}
function rechnungSummenAktualisieren(){ const s=rechnungSummen(); $("rechnungNetto").textContent=euro(s.netto); $("rechnungMwst").textContent=euro(s.mwst); $("rechnungGesamt").textContent=euro(s.gesamt); }

async function rechnungOeffnen(id=null){
  if(!["mode","service","security"].includes(aktiverBereich)) return;
  rechnungEditID=id;
  const daten=modulDatenLaden();
  const alt=id?daten.find(x=>x.id===id):null;
  try{
    rechnungReservierteNummer=alt?.nummer || await naechsteRechnungsnummer();
  }catch(e){ alert(`Neue Rechnung konnte nicht gestartet werden: ${e.message||e}`); return; }
  const heute=isoHeute();
  $("rechnungFormTitel").textContent=alt?"Rechnung bearbeiten":"Neue Rechnung";
  $("rechnungNummerHinweis").textContent=`Fortlaufende Nummer: ${rechnungReservierteNummer}`;
  $("rechnungKunde").value=alt?.kunde||"";
  $("rechnungAdresse").value=alt?.adresse||"";
  $("rechnungDatum").value=alt?.datum||heute;
  $("rechnungLeistungsdatum").value=alt?.leistungsdatum||heute;
  $("rechnungFaellig").value=alt?.faellig||plusTage(heute,14);
  $("rechnungStatus").value=alt?.status||"Entwurf";
  $("rechnungBetreff").value=alt?.titel||"";
  $("rechnungNotiz").value=alt?.notiz||"Vielen Dank für Ihren Auftrag.";
  rechnungPositionen=(alt?.positionen||[]).map(x=>({...x,id:x.id||neueID()}));
  if(!rechnungPositionen.length) rechnungPositionen=[{id:neueID(),beschreibung:"",menge:1,einheit:"Stk.",einzelpreis:0,mwst:19}];
  rechnungPositionenRendern();
  $("rechnungDialog").showModal();
}

function rechnungFormNeuStarten(){
  if(!confirm("Eingaben dieser Rechnung verwerfen und neu beginnen? Die bereits reservierte Nummer wird nicht wiederverwendet.")) return;
  $("rechnungDialog").close();
  rechnungEditID=null; rechnungReservierteNummer=""; rechnungPositionen=[];
  rechnungOeffnen();
}

async function rechnungSpeichern(){
  if(!$("rechnungKunde").value.trim() || !$("rechnungAdresse").value.trim() || !$("rechnungDatum").value){ alert("Bitte Kunde, Anschrift und Rechnungsdatum ausfüllen."); return; }
  if(!rechnungPositionen.length || rechnungPositionen.some(p=>!String(p.beschreibung||"").trim())){ alert("Bitte alle Rechnungspositionen vollständig beschreiben."); return; }
  const daten=modulDatenLaden();
  const alt=rechnungEditID?daten.find(x=>x.id===rechnungEditID):null;
  const sum=rechnungSummen();
  const neu={...(alt||{}), id:rechnungEditID||neueID(), createdAt:alt?.createdAt||new Date().toISOString(), updatedAt:new Date().toISOString(),
    titel:$("rechnungBetreff").value.trim()||`Rechnung ${rechnungReservierteNummer}`,
    nummer:rechnungReservierteNummer, kunde:$("rechnungKunde").value.trim(), adresse:$("rechnungAdresse").value.trim(),
    datum:$("rechnungDatum").value, leistungsdatum:$("rechnungLeistungsdatum").value, faellig:$("rechnungFaellig").value,
    status:$("rechnungStatus").value, notiz:$("rechnungNotiz").value.trim(), positionen:rechnungPositionen.map(x=>({...x})),
    netto:sum.netto, mwst:sum.mwst, betrag:sum.gesamt, bereich:aktiverBereich
  };
  if(rechnungEditID){ const i=daten.findIndex(x=>x.id===rechnungEditID); if(i>=0) daten[i]=neu; } else daten.push(neu);

  // Die Rechnung bleibt als Datensatz lokal + in Supabase archiviert.
  // Direkt danach wird die PDF erzeugt und das native Teilen-Menü geöffnet.
  modulDatenSpeichern(daten);
  queueUpsert("moduldaten",modulZuDB(aktiverBereich,"rechnungen",neu));

  $("rechnungDialog").close();
  rechnungEditID=null;
  rechnungReservierteNummer="";
  rechnungPositionen=[];
  modulRendern();

  await rechnungPDFAktion(neu.id,"share");
}

function rechnungenRendern(){
  const daten=modulDatenLaden();
  const jetzt=new Date(); const monat=`${jetzt.getFullYear()}-${String(jetzt.getMonth()+1).padStart(2,"0")}`;
  const monatDaten=daten.filter(x=>String(x.datum||"").startsWith(monat));
  const offen=daten.filter(x=>x.status==="Offen").reduce((s,x)=>s+Number(x.betrag||0),0);
  const monatSum=monatDaten.reduce((s,x)=>s+Number(x.betrag||0),0);
  $("modulStatistik").innerHTML=`<div class="statbox"><span>Rechnungen</span><strong>${daten.length}</strong></div><div class="statbox"><span>Dieser Monat</span><strong>${euro(monatSum)}</strong></div><div class="statbox"><span>Offen</span><strong>${euro(offen)}</strong></div>`;
  if(!daten.length){ $("modulListe").innerHTML='<div class="daten-leer"><strong>Noch keine Rechnungen</strong><span>Mit „+ Neu“ erstellst du die erste Rechnung mit fortlaufender Nummer.</span></div>'; return; }
  const sort=[...daten].sort((a,b)=>String(b.datum||b.createdAt).localeCompare(String(a.datum||a.createdAt)));
  $("modulListe").innerHTML=sort.map(x=>`<article class="daten-karte"><div class="daten-karte-kopf"><div><h3>${esc(x.nummer||"Rechnung")}</h3><div class="meta"><span>${esc(x.kunde||"")}</span><span> · ${datumDE(x.datum)}</span><span> · <span class="status-chip">${esc(x.status||"Entwurf")}</span></span></div></div><div class="betrag">${euro(x.betrag||0)}</div></div>${x.titel?`<div class="notiz">${esc(x.titel)}</div>`:""}<div class="rechnung-card-aktionen"><button class="daten-bearbeiten" data-re-edit="${x.id}">Bearbeiten</button><button class="rechnung-pdf" data-re-pdf="${x.id}">PDF</button><button class="rechnung-teilen" data-re-share="${x.id}">Teilen</button><button class="rechnung-drucken" data-re-print="${x.id}">Drucken</button>${x.status!=="Storniert"?`<button class="rechnung-storno" data-re-storno="${x.id}">Stornieren</button>`:""}${x.status==="Entwurf"?`<button class="daten-loeschen" data-re-del="${x.id}">Löschen</button>`:""}</div></article>`).join("");
  document.querySelectorAll("[data-re-edit]").forEach(b=>b.onclick=()=>rechnungOeffnen(b.dataset.reEdit));
  document.querySelectorAll("[data-re-pdf]").forEach(b=>b.onclick=()=>rechnungPDFAktion(b.dataset.rePdf,"download"));
  document.querySelectorAll("[data-re-share]").forEach(b=>b.onclick=()=>rechnungPDFAktion(b.dataset.reShare,"share"));
  document.querySelectorAll("[data-re-print]").forEach(b=>b.onclick=()=>rechnungDrucken(b.dataset.rePrint));
  document.querySelectorAll("[data-re-storno]").forEach(b=>b.onclick=()=>rechnungStornieren(b.dataset.reStorno));
  document.querySelectorAll("[data-re-del]").forEach(b=>b.onclick=()=>rechnungEntwurfLoeschen(b.dataset.reDel));
}

function rechnungEntwurfLoeschen(id){
  const daten=modulDatenLaden(); const r=daten.find(x=>x.id===id); if(!r) return;
  if(r.status!=="Entwurf"){ alert("Nur Entwürfe können gelöscht werden. Bereits ausgestellte Rechnungen bitte stornieren."); return; }
  if(!confirm(`Entwurf ${r.nummer} wirklich löschen? Die Nummer wird nicht erneut vergeben.`)) return;
  modulDatenSpeichern(daten.filter(x=>x.id!==id)); queueDelete("moduldaten",id); modulRendern();
}

function rechnungStornieren(id){
  const daten=modulDatenLaden(); const i=daten.findIndex(x=>x.id===id); if(i<0) return;
  if(!confirm(`Rechnung ${daten[i].nummer} als storniert markieren?`)) return;
  daten[i]={...daten[i],status:"Storniert",updatedAt:new Date().toISOString()}; modulDatenSpeichern(daten); queueUpsert("moduldaten",modulZuDB(aktiverBereich,"rechnungen",daten[i])); modulRendern();
}

function bildAlsDataURL(src){ return new Promise((resolve,reject)=>{ const img=new Image(); img.onload=()=>{ const c=document.createElement("canvas"); c.width=img.naturalWidth; c.height=img.naturalHeight; c.getContext("2d").drawImage(img,0,0); resolve(c.toDataURL("image/png")); }; img.onerror=reject; img.src=src; }); }

async function rechnungPDFBlob(r){
  if(!window.jspdf?.jsPDF) throw new Error("PDF-Modul konnte nicht geladen werden. Bitte Seite einmal neu laden.");
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4",compress:true});
  const bereich=r.bereich||aktiverBereich;
  const cfg=RECHNUNGS_BEREICHE[bereich]||RECHNUNGS_BEREICHE.mode;
  const firma=rechnungsDatenFuerBereich(bereich);
  const accent=cfg.accent||[230,166,35];
  const schwarz=[12,12,12];

  // Bildbasierter Briefkopf im Stil der freigegebenen Rudelbar-Rechnungsentwürfe.
  // Die Motive liegen lokal in der App, damit keine fremden Bildserver oder Stockfotos benötigt werden.
  let headerGeladen=false;
  if(cfg.header){
    try{
      const header=await bildAlsDataURL(cfg.header);
      doc.addImage(header,"PNG",0,0,210,48,undefined,"FAST");
      headerGeladen=true;
    }catch(e){ console.warn("Rechnungs-Briefkopf konnte nicht geladen werden",e); }
  }
  if(!headerGeladen){
    doc.setFillColor(...schwarz); doc.rect(0,0,210,48,"F");
    try{
      const logo=await bildAlsDataURL(cfg.logo);
      doc.addImage(logo,"PNG",10,4,39,39,undefined,"FAST");
    }catch(e){}
    doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(20);
    doc.text(cfg.name.toUpperCase(),54,17);
    doc.setFontSize(9); doc.setFont("helvetica","normal"); doc.text(cfg.claim||"EIN RUDEL.",54,24);
  }
  doc.setFillColor(...accent); doc.rect(0,47,210,1.2,"F");

  // Absenderzeile und Empfänger
  doc.setTextColor(90,90,90); doc.setFontSize(7.5);
  doc.text(`${cfg.name} · ${firma.inhaber} · ${firma.strasse} · ${firma.ort}`,14,58);
  doc.setTextColor(20,20,20); doc.setFontSize(10); doc.setFont("helvetica","normal");
  const adr=doc.splitTextToSize(`${r.kunde}\n${r.adresse}`,82);
  doc.text(adr,14,68);

  // Rechnungsdaten rechts
  doc.setFillColor(244,244,244); doc.roundedRect(122,57,74,38,2,2,"F");
  const meta=[
    ["Rechnungsnummer",String(r.nummer||"")],
    ["Rechnungsdatum",datumDE(r.datum)],
    ["Leistungsdatum",datumDE(r.leistungsdatum||r.datum)],
    ["Zahlungsziel",datumDE(r.faellig)]
  ];
  let my=64; doc.setFontSize(8.5);
  meta.forEach(([k,v])=>{ doc.setFont("helvetica","bold"); doc.text(`${k}:`,126,my); doc.setFont("helvetica","normal"); doc.text(v,161,my); my+=7; });

  doc.setFont("helvetica","bold"); doc.setFontSize(23); doc.text("RECHNUNG",14,108);
  if(r.titel){ doc.setFont("helvetica","normal"); doc.setFontSize(9); doc.text(doc.splitTextToSize(r.titel,180),14,115); }

  // Positionstabelle
  let y=124;
  const tableHead=()=>{
    doc.setFillColor(...schwarz); doc.rect(14,y,182,9,"F");
    doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(8);
    doc.text("Pos.",17,y+6); doc.text("Beschreibung",29,y+6); doc.text("Menge",119,y+6);
    doc.text("Einzelpreis",151,y+6,{align:"right"}); doc.text("Gesamt",192,y+6,{align:"right"});
    y+=9; doc.setTextColor(20,20,20); doc.setFont("helvetica","normal");
  };
  tableHead();
  (r.positionen||[]).forEach((p,i)=>{
    const line=Number(p.menge||0)*Number(p.einzelpreis||0);
    const desc=doc.splitTextToSize(String(p.beschreibung||""),82);
    const h=Math.max(10,desc.length*4.2+3);
    if(y+h>246){ doc.addPage(); y=18; tableHead(); }
    doc.setDrawColor(218,218,218); doc.rect(14,y,182,h);
    doc.setFontSize(8.5); doc.text(String(i+1),18,y+6); doc.text(desc,29,y+6);
    doc.text(`${p.menge} ${p.einheit||""}`,119,y+6);
    doc.text(euro(p.einzelpreis).replace(/\s/g," "),151,y+6,{align:"right"});
    doc.text(euro(line).replace(/\s/g," "),192,y+6,{align:"right"});
    y+=h;
  });

  // Summen
  const netto=Number(r.netto??0), mwst=Number(r.mwst??0), gesamt=Number(r.betrag??(netto+mwst));
  y+=5; if(y>247){ doc.addPage(); y=25; }
  doc.setFillColor(245,245,245); doc.rect(116,y,80,23,"F"); doc.setFontSize(9);
  doc.text("Nettobetrag",121,y+6); doc.text(euro(netto),192,y+6,{align:"right"});
  doc.text("Umsatzsteuer",121,y+12); doc.text(euro(mwst),192,y+12,{align:"right"});
  doc.setFillColor(...schwarz); doc.rect(116,y+15,80,9,"F"); doc.setTextColor(255,255,255); doc.setFont("helvetica","bold");
  doc.text("Gesamtbetrag",121,y+21); doc.text(euro(gesamt),192,y+21,{align:"right"});

  // Hinweis und kompletter Marken-Fußbereich wie in den Rudelbar-Mustern
  doc.setTextColor(25,25,25); doc.setFont("helvetica","normal"); doc.setFontSize(9);
  const note=doc.splitTextToSize(r.notiz||"Vielen Dank für Ihren Auftrag.",180);
  let noteY=y+34;
  if(noteY>258){ doc.addPage(); noteY=30; }
  doc.text(note,14,noteY);
  doc.setFont("helvetica","bold"); doc.setFontSize(8.5);
  doc.text("Vielen Dank für Ihren Auftrag!",14,Math.min(noteY+15,258));

  const fy=269;
  doc.setFillColor(...accent); doc.rect(0,fy,210,1.2,"F");
  doc.setFillColor(...schwarz); doc.rect(0,fy+1.2,210,26.8,"F");
  // diagonale Akzente unten links/rechts
  doc.setFillColor(...accent);
  doc.triangle(0,fy+1.2,8,fy+1.2,0,fy+13,"F");
  doc.triangle(210,fy+28,202,fy+28,210,fy+16,"F");
  try{ const logo=await bildAlsDataURL(cfg.logo); doc.addImage(logo,"PNG",7,272,20,20,undefined,"FAST"); }catch(e){}
  doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(7.2);
  doc.text(cfg.name,31,276);
  doc.setFont("helvetica","normal"); doc.setFontSize(6.7);
  const kontakt=[firma.inhaber,firma.strasse,firma.ort,firma.telefon,firma.email].filter(Boolean);
  kontakt.slice(0,5).forEach((t,i)=>doc.text(String(t),31,280+i*3.1));
  const bank=[firma.bank,firma.iban?`IBAN: ${firma.iban}`:"",firma.bic?`BIC: ${firma.bic}`:""].filter(Boolean);
  if(bank.length){ doc.setFont("helvetica","bold"); doc.text("Bankverbindung",112,276); doc.setFont("helvetica","normal"); bank.forEach((t,i)=>doc.text(String(t),112,280+i*3.2)); }
  if(firma.website){ doc.setTextColor(...accent); doc.setFont("helvetica","bold"); doc.text(firma.website,181,276,{align:"right"}); }
  doc.setTextColor(220,220,220); doc.setFont("helvetica","normal"); doc.setFontSize(5.8);
  const recht=[firma.steuernummer?`Steuernummer: ${firma.steuernummer}`:"",firma.ustid?`USt-IdNr.: ${firma.ustid}`:"",`Inhaber: ${firma.inhaber}`].filter(Boolean).join("  |  ");
  doc.text(recht,31,295);
  doc.setTextColor(...accent); doc.setFont("helvetica","bolditalic"); doc.setFontSize(9); doc.text(cfg.claim||"EIN RUDEL.",198,290,{align:"right"});
  return doc.output("blob");
}

function istIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1); }

async function rechnungPDFAktion(id,art){
  const r=modulDatenLaden().find(x=>x.id===id); if(!r) return;
  try{
    const blob=await rechnungPDFBlob(r);
    const file=new File([blob],`${r.nummer}.pdf`,{type:"application/pdf"});
    const cfg=RECHNUNGS_BEREICHE[r.bereich||aktiverBereich]||RECHNUNGS_BEREICHE.mode;
    if(art==="share" && navigator.share && navigator.canShare?.({files:[file]})){
      await navigator.share({title:`Rechnung ${r.nummer}`,text:`Rechnung ${r.nummer} von ${cfg.name}`,files:[file]});
      return;
    }
    const url=URL.createObjectURL(blob);
    if(istIOS()){
      // iPhone/iPad: PDF direkt öffnen. Von dort über das iOS-Teilen-Menü speichern, senden oder drucken.
      const w=window.open(url,"_blank");
      if(!w) location.href=url;
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      return;
    }
    const a=document.createElement("a"); a.href=url; a.download=`${r.nummer}.pdf`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
  }catch(e){
    // Abbruch im iOS/Android-Teilen-Menü ist kein Fehler und braucht keine Warnung.
    if(e?.name==="AbortError") return;
    alert(`PDF konnte nicht erstellt oder geteilt werden: ${e.message||e}`);
  }
}

async function rechnungDrucken(id){
  const r=modulDatenLaden().find(x=>x.id===id); if(!r) return;
  try{
    const blob=await rechnungPDFBlob(r); const url=URL.createObjectURL(blob);
    const w=window.open(url,"_blank");
    if(!w){ location.href=url; return; }
    // Desktop-Browser können nach dem Laden den Druckdialog öffnen. Auf iOS öffnet sich die PDF zum Drucken über Teilen.
    if(!istIOS()) setTimeout(()=>{ try{ w.print(); }catch(e){} },1200);
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){ alert(`Druck-PDF konnte nicht erstellt werden: ${e.message||e}`); }
}

function rechnungenMonatsauszug(){
  if(aktivesModul!=="rechnungen") return;
  const wert=prompt("Monat für den Auszug eingeben (JJJJ-MM)",new Date().toISOString().slice(0,7)); if(!wert) return;
  const daten=modulDatenLaden().filter(x=>String(x.datum||"").startsWith(wert)); if(!daten.length){alert("Für diesen Monat sind keine Rechnungen gespeichert.");return;}
  const header=["Rechnungsnummer","Datum","Kunde","Status","Netto","Umsatzsteuer","Gesamt","Betreff"];
  const csv="\uFEFF"+[header.join(";"),...daten.map(r=>[r.nummer,r.datum,r.kunde,r.status,r.netto,r.mwst,r.betrag,r.titel].map(csvWert).join(";"))].join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`Rudelbar_${aktiverBereich}_Rechnungen_${wert}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

rechnungsSettingsUIInit();
appSettingsLaden();

/* BUTTONS */

document.querySelectorAll(".bereich-karte").forEach(button => {
  button.addEventListener("click", () => {
    bereichOeffnen(button.dataset.bereich);
  });
});

$("zurBereichsauswahl").onclick = () => bereichMenuZeigen("kneipe");
$("bereichMenuZurueck").onclick = startseiteZeigen;
$("modulZurueck").onclick = () => bereichMenuZeigen(aktiverBereich);
$("modulNeu").onclick = () => aktivesModul === "rechnungen" ? rechnungOeffnen() : modulFormOeffnen();
$("modulExport").onclick = modulExportieren;
$("modulFormAbbrechen").onclick = () => $("modulFormDialog").close();
$("modulFormSpeichern").onclick = modulFormSpeichern;
$("modulMonatExport").onclick = rechnungenMonatsauszug;
$("rechnungAbbrechen").onclick = () => $("rechnungDialog").close();
$("rechnungPositionNeu").onclick = () => rechnungPositionNeu();
$("rechnungNeuStarten").onclick = rechnungFormNeuStarten;
$("rechnungSpeichern").onclick = rechnungSpeichern;

document.querySelectorAll("[data-settings-page]").forEach(btn=>btn.addEventListener("click",()=>settingsSeiteOeffnen(btn.dataset.settingsPage)));
document.querySelectorAll(".settings-back").forEach(btn=>btn.addEventListener("click",()=>settingsSeiteOeffnen("home")));
$("settingsBtn").onclick = einstellungenOeffnen;
$("settingsSchliessen").onclick = einstellungenSchliessen;
$("settingsStartbereich").onchange = appSettingsSpeichern;
$("settingsCreatorSpalten").onchange = appSettingsSpeichern;
$("settingsAnimationen").onchange = appSettingsSpeichern;
["Mode","Service","Security"].forEach(cap=>{ const el=$("rechnungApply"+cap); if(el)el.onchange=rechnungsOverrideSichtbarkeit; });
$("rechnungSettingsSpeichern").onclick = rechnungsSettingsSpeichern;
$("rechnungSettingsSpeichernRechnung")?.addEventListener("click",rechnungsSettingsSpeichern);
$("settingsInviteBtn").onclick = () => { settingsSeiteOeffnen("team"); einladungenOeffnen(); };
$("settingsAppTeilenBtn").onclick = appAdresseTeilen;
$("settingsLogoutBtn").onclick = () => { if($("einstellungenDialog").open) $("einstellungenDialog").close(); abmelden(); };
$("settingsKontoLoeschen")?.addEventListener("click", eigenesKontoLoeschen);
$("einladungSchliessen").onclick = () => {
  $("einladungDialog").close();
  if ($("einstellungenDialog").open) settingsSeiteOeffnen("team");
};
$("einladungErstellen").onclick = einladungErstellen;
$("einladungKopieren").onclick = einladungLinkKopieren;
if ($("einladungCodeKopieren")) $("einladungCodeKopieren").onclick = einladungCodeKopieren;
$("einladungTeilen").onclick = einladungLinkTeilen;
$("registrierenOeffnen").onclick = registrierungOeffnen;
$("registerZurLogin").onclick = registrierungZurLogin;
$("registerButton").onclick = registrierenMitEinladung;
if ($("registerInviteUebernehmen")) $("registerInviteUebernehmen").onclick = inviteManuellUebernehmen;
if ($("registerInviteManuell")) $("registerInviteManuell").addEventListener("keydown", event => {
  if (event.key === "Enter") inviteManuellUebernehmen();
});

$("loginButton").onclick = anmelden;

$("loginPasswort").addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") anmelden();
  }
);

$("registerPasswort2").addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") registrierenMitEinladung();
  }
);

$("getraenkHinzufuegen").onclick = neuesGetraenkOeffnen;

$("getraenkSpeichern").onclick = getraenkSpeichern;

$("getraenkAbbrechen").onclick = () =>
  $("getraenkDialog").close();

function centWert(wert) {
  return Math.round(Number(wert || 0) * 100);
}

function euroAusCent(cent) {
  return euro(cent / 100);
}

function barzahlungOeffnen() {
  const gesamtCent = centWert(gesamtpreis());
  if (gesamtCent <= 0) return;

  $("barzahlungGesamt").textContent = euroAusCent(gesamtCent);
  $("barzahlungGegeben").value = "";
  $("barzahlungRueckgeld").textContent = "0,00 €";
  $("barzahlungHinweis").textContent = "";
  $("barzahlungRueckgeldBox").classList.remove("zu-wenig");
  $("barzahlungBestaetigen").disabled = true;

  const scheine = [5, 10, 20, 50, 100];

  $("barzahlungSchnellwahl").innerHTML =
    `<button type="button" data-bar-exakt>Passend</button>` +
    scheine.map(x => `<button type="button" data-bar-wert="${x}">${x} €</button>`).join("");

  $("barzahlungDialog").showModal();
  setTimeout(() => $("barzahlungGegeben").focus(), 80);
}

function barzahlungBerechnen() {
  const gesamtCent = centWert(gesamtpreis());
  const roh = $("barzahlungGegeben").value.trim().replace(/\s/g, "").replace(",", ".");
  const gegebenCent = Math.round(Number(roh) * 100);
  const gueltig = roh !== "" && Number.isFinite(gegebenCent);

  if (!gueltig) {
    $("barzahlungRueckgeld").textContent = "0,00 €";
    $("barzahlungHinweis").textContent = "";
    $("barzahlungRueckgeldBox").classList.remove("zu-wenig");
    $("barzahlungBestaetigen").disabled = true;
    return;
  }

  const differenz = gegebenCent - gesamtCent;
  if (differenz < 0) {
    $("barzahlungRueckgeld").textContent = euroAusCent(Math.abs(differenz));
    $("barzahlungHinweis").textContent = "Es fehlen noch " + euroAusCent(Math.abs(differenz)) + ".";
    $("barzahlungRueckgeldBox").classList.add("zu-wenig");
    $("barzahlungBestaetigen").disabled = true;
  } else {
    $("barzahlungRueckgeld").textContent = euroAusCent(differenz);
    $("barzahlungHinweis").textContent = differenz === 0 ? "Passend bezahlt." : "An den Kunden zurückgeben.";
    $("barzahlungRueckgeldBox").classList.remove("zu-wenig");
    $("barzahlungBestaetigen").disabled = false;
  }
}

$("barButton").onclick = barzahlungOeffnen;

$("barzahlungGegeben").addEventListener("input", barzahlungBerechnen);

$("barzahlungSchnellwahl").onclick = event => {
  const exakt = event.target.closest("[data-bar-exakt]");
  const wert = event.target.closest("[data-bar-wert]");
  if (!exakt && !wert) return;
  $("barzahlungGegeben").value = exakt
    ? (centWert(gesamtpreis()) / 100).toFixed(2).replace(".", ",")
    : Number(wert.dataset.barWert).toFixed(2).replace(".", ",");
  barzahlungBerechnen();
};

$("barzahlungAbbrechen").onclick = () => $("barzahlungDialog").close();

$("barzahlungBestaetigen").onclick = () => {
  if ($("barzahlungBestaetigen").disabled) return;
  $("barzahlungDialog").close();
  verkaufAbschliessen("Bar");
};

function kartenzahlungOeffnen() {
  const gesamtCent = centWert(gesamtpreis());
  if (gesamtCent <= 0) return;

  $("kartenzahlungGesamt").textContent = euroAusCent(gesamtCent);
  $("kartenzahlungBetrag").value = "";
  $("kartenzahlungHinweis").textContent = "Betrag eingeben oder Passend wählen.";
  $("kartenzahlungHinweis").classList.remove("zahlung-fehler", "zahlung-ok");
  $("kartenzahlungBestaetigen").disabled = true;

  $("kartenzahlungDialog").showModal();
  setTimeout(() => $("kartenzahlungBetrag").focus(), 80);
}

function kartenzahlungBerechnen() {
  const gesamtCent = centWert(gesamtpreis());
  const roh = $("kartenzahlungBetrag").value.trim().replace(/\s/g, "").replace(",", ".");
  const betragCent = Math.round(Number(roh) * 100);
  const gueltig = roh !== "" && Number.isFinite(betragCent);
  const hinweis = $("kartenzahlungHinweis");

  hinweis.classList.remove("zahlung-fehler", "zahlung-ok");

  if (!gueltig) {
    hinweis.textContent = "Betrag eingeben oder Passend wählen.";
    $("kartenzahlungBestaetigen").disabled = true;
    return;
  }

  if (betragCent < gesamtCent) {
    hinweis.textContent = "Es fehlen noch " + euroAusCent(gesamtCent - betragCent) + ".";
    hinweis.classList.add("zahlung-fehler");
    $("kartenzahlungBestaetigen").disabled = true;
    return;
  }

  if (betragCent > gesamtCent) {
    hinweis.textContent = "Der Kartenbetrag ist " + euroAusCent(betragCent - gesamtCent) + " zu hoch.";
    hinweis.classList.add("zahlung-fehler");
    $("kartenzahlungBestaetigen").disabled = true;
    return;
  }

  hinweis.textContent = "Passend bezahlt.";
  hinweis.classList.add("zahlung-ok");
  $("kartenzahlungBestaetigen").disabled = false;
}

$("karteButton").onclick = kartenzahlungOeffnen;
$("kartenzahlungBetrag").addEventListener("input", kartenzahlungBerechnen);

$("kartenzahlungPassend").onclick = () => {
  $("kartenzahlungBetrag").value = (centWert(gesamtpreis()) / 100).toFixed(2).replace(".", ",");
  kartenzahlungBerechnen();
};

$("kartenzahlungAbbrechen").onclick = () => $("kartenzahlungDialog").close();

$("kartenzahlungBestaetigen").onclick = () => {
  if ($("kartenzahlungBestaetigen").disabled) return;
  $("kartenzahlungDialog").close();
  verkaufAbschliessen("Karte");
};

$("bestellungLoeschen").onclick = () => {
  warenkorb = {};
  render();
};

$("statistikBtn").onclick = statistikOeffnen;

$("abschlussBtn").onclick = abschlussOeffnen;

$("statistikSchliessen").onclick = () =>
  $("statistikDialog").close();

$("getraenkeTeilen").onclick = tagesuebersichtTeilen;

$("abschlussSchliessen").onclick = () =>
  $("abschlussDialog").close();

$("abschlussSpeichern").onclick = abschlussSpeichern;

$("abschlussTeilen").onclick = tagesabschlussTeilen;

$("verkaufAbbrechen").onclick = () =>
  $("verkaufDialog").close();

$("verkaufSpeichern").onclick = verkaufBearbeitungSpeichern;

$("verkaufLoeschen").onclick = verkaufBearbeitungLoeschen;

[
  "anfangsbestandInput",
  "einlagenInput",
  "entnahmenInput",
  "ausgabenInput",
  "istKasseInput"
].forEach(id => {
  $(id).oninput = abschlussAktualisieren;
});



/* MODE CREATOR EVENTS */
$("creatorZurueck").onclick=()=>bereichMenuZeigen("mode");
$("creatorDateiBtn").onclick=()=>$("creatorDatei").click();
$("creatorDatei").onchange=e=>creatorDateiLaden(e.target.files?.[0]);
["creatorScale","creatorX","creatorY","creatorRot"].forEach(id=>$(id).oninput=creatorReglerSync);
$("creatorFlipX").onclick=()=>{creatorState.flipX*=-1;creatorZeichnen();};
$("creatorFlipY").onclick=()=>{creatorState.flipY*=-1;creatorZeichnen();};
$("creatorReset").onclick=creatorReset;
$("creatorDownload").onclick=creatorDownload;
$("creatorTeilen").onclick=()=>creatorTeilen().catch(e=>{console.error(e);alert("Vorschau konnte nicht geteilt werden.");});
$("creatorSpeichern").onclick=creatorEntwurfSpeichern;
document.querySelectorAll("#creatorHintergruende [data-bg]").forEach(b=>b.onclick=()=>{creatorState.bg=b.dataset.bg;creatorUIRendern();creatorZeichnen();});
const creatorCanvas=$("creatorCanvas");
creatorCanvas.addEventListener("mousedown",creatorPointerDown);window.addEventListener("mousemove",creatorPointerMove);window.addEventListener("mouseup",creatorPointerUp);
creatorCanvas.addEventListener("touchstart",creatorPointerDown,{passive:false});window.addEventListener("touchmove",creatorPointerMove,{passive:false});window.addEventListener("touchend",creatorPointerUp);


/* ONLINE / OFFLINE */

window.addEventListener("offline", () => {
  statusAktualisieren();
});

window.addEventListener("online", async () => {
  statusAktualisieren();

  await syncStarten();

  if (!syncQueue.length) {
    await remoteNeuLaden();
  }

  realtimeStarten();
});


/* START */

render();
statusAktualisieren();

authStart();


/* SERVICE WORKER */

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("service-worker.js")
    .catch(error => {
      console.error("Service Worker:", error);
    });
}