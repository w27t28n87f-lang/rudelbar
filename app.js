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
  if (token) {
    $("registrierenOeffnen").classList.remove("versteckt");
    registrierungOeffnen();
  } else {
    $("registrierenOeffnen").classList.add("versteckt");
    $("loginDialog").showModal();
  }
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
      startseiteZeigen();
      return;
    }
  }

  await ersteSynchronisierung();
  realtimeStarten();
  startseiteZeigen();
}


/* EINLADUNGEN / REGISTRIERUNG */

function einladungsTokenAusURL() {
  try {
    return new URL(window.location.href).searchParams.get("invite")?.trim() || "";
  } catch {
    return "";
  }
}

function basisAppURL() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url;
}

async function adminStatusLaden() {
  istAdmin = false;
  $("inviteAdminBtn")?.classList.add("versteckt");

  if (!aktuellerUser) return;

  const { data, error } = await sb.rpc("is_rudelbar_admin");
  if (error) {
    console.warn("Adminstatus konnte nicht geladen werden:", error.message);
    return;
  }

  istAdmin = data === true;
  if (istAdmin) $("inviteAdminBtn")?.classList.remove("versteckt");
}

function registrierungOeffnen() {
  const token = einladungsTokenAusURL();
  if (!token) {
    alert("Für die Registrierung wird ein gültiger Einladungslink benötigt.");
    return;
  }

  if ($("loginDialog").open) $("loginDialog").close();
  $("registerFehler").textContent = "";
  $("registerErfolg").textContent = "";
  $("registerPasswort").value = "";
  $("registerPasswort2").value = "";
  $("registrierungDialog").showModal();
}

function registrierungZurLogin() {
  if ($("registrierungDialog").open) $("registrierungDialog").close();
  $("loginDialog").showModal();
}

async function registrierenMitEinladung() {
  const token = einladungsTokenAusURL();
  const name = $("registerName").value.trim();
  const email = $("registerEmail").value.trim().toLowerCase();
  const passwort = $("registerPasswort").value;
  const passwort2 = $("registerPasswort2").value;

  $("registerFehler").textContent = "";
  $("registerErfolg").textContent = "";

  if (!token) {
    $("registerFehler").textContent = "Der Einladungslink fehlt oder ist ungültig.";
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
    const response = await fetch(`${SUPABASE_URL}/functions/v1/register-invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY
      },
      body: JSON.stringify({ token, name, email, password: passwort })
    });

    let result = {};
    try { result = await response.json(); } catch {}

    if (!response.ok) {
      throw new Error(result.error || "Registrierung fehlgeschlagen.");
    }

    $("registerErfolg").textContent = "Konto erstellt. Du wirst angemeldet…";

    const { error } = await sb.auth.signInWithPassword({ email, password: passwort });
    if (error) throw error;

    localStorage.setItem(EMAIL_KEY, email);
    angemeldet = true;
    const sessionResult = await sb.auth.getSession();
    aktuellerUser = sessionResult.data.session?.user || null;

    const clean = basisAppURL();
    history.replaceState({}, "", clean.pathname + clean.search + clean.hash);

    if ($("registrierungDialog").open) $("registrierungDialog").close();
    await nachLogin();
  } catch (error) {
    console.error(error);
    $("registerFehler").textContent = error.message || "Registrierung fehlgeschlagen.";
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
    .select("id,label,expires_at,used_at,created_at")
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
          <small>Gültig bis ${esc(bis)}</small>
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
  const tage = Math.max(1, Number($("einladungTage").value) || 7);
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
  const expires = new Date(Date.now() + tage * 86400000).toISOString();

  $("einladungErstellen").disabled = true;
  $("einladungErstellen").textContent = "Erstelle…";

  const { error } = await sb.from("einladungen").insert({
    token,
    label,
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
  url.searchParams.set("invite", token);
  $("einladungLink").value = url.toString();
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

async function einladungLinkTeilen() {
  const url = $("einladungLink").value;
  if (!url) return;
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Rudelbar Einladung",
        text: "Hier ist deine persönliche Einladung zur Rudelbar-App.",
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
  $("inviteAdminBtn")?.classList.add("versteckt");
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

  $("gesamtpreis").textContent = euro(gesamtpreis());
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
  ["bereichStart", "bereichMenu", "modulAnsicht", "kassenApp"].forEach(id => {
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


/* ===== RUDELBAR v80: RECHNUNGEN ===== */

const FIRMEN_DATEN = {
  inhaber: "Martin Küster",
  strasse: "Kielort 16 C",
  ort: "22850 Norderstedt",
  telefon: "015259574522"
};

const RECHNUNGS_BEREICHE = {
  mode: { name: "Rudelbar Mode", prefix: "RBM", logo: "Logo-Mode.png", accent: [230,166,35], claim: "TRAG DAS RUDEL." },
  service: { name: "Rudelbar Facility Service", prefix: "RBF", logo: "Logo-Service.png", accent: [65,190,75], claim: "ZUVERLÄSSIG. FLEXIBEL. STARK." },
  security: { name: "Rudelbar Security", prefix: "RBS", logo: "Logo-Haupt.png", accent: [220,55,55], claim: "SICHERHEIT. VERTRAUEN. RUDEL." }
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

function rechnungSpeichern(){
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
  modulDatenSpeichern(daten); queueUpsert("moduldaten",modulZuDB(aktiverBereich,"rechnungen",neu));
  $("rechnungDialog").close(); rechnungEditID=null; rechnungReservierteNummer=""; rechnungPositionen=[]; modulRendern();
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
  if(!window.jspdf?.jsPDF) throw new Error("PDF-Bibliothek konnte nicht geladen werden. Bitte App mit Internetverbindung neu öffnen.");
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF({unit:"mm",format:"a4",compress:true});
  const bereich=r.bereich||aktiverBereich;
  const cfg=RECHNUNGS_BEREICHE[bereich]||RECHNUNGS_BEREICHE.mode;
  const accent=cfg.accent||[230,166,35];
  const schwarz=[12,12,12];

  // Kopf im Rudelbar-Stil
  doc.setFillColor(...schwarz); doc.rect(0,0,210,48,"F");
  doc.setFillColor(...accent); doc.rect(0,47,210,1.2,"F");
  try{
    const logo=await bildAlsDataURL(cfg.logo);
    doc.addImage(logo,"PNG",10,4,39,39,undefined,"FAST");
  }catch(e){}
  doc.setTextColor(255,255,255); doc.setFont("helvetica","bold"); doc.setFontSize(20);
  doc.text(cfg.name.toUpperCase(),54,17);
  doc.setFontSize(9); doc.setFont("helvetica","normal");
  doc.text(cfg.claim||"EIN RUDEL.",54,24);
  doc.setTextColor(...accent); doc.setFont("helvetica","bold"); doc.setFontSize(10);
  doc.text("RUDELBAR",54,33);
  doc.setTextColor(220,220,220); doc.setFont("helvetica","normal"); doc.setFontSize(8);
  doc.text(`${FIRMEN_DATEN.inhaber} | ${FIRMEN_DATEN.strasse} | ${FIRMEN_DATEN.ort} | Tel. ${FIRMEN_DATEN.telefon}`,54,39);

  // Absenderzeile und Empfänger
  doc.setTextColor(90,90,90); doc.setFontSize(7.5);
  doc.text(`${cfg.name} · ${FIRMEN_DATEN.inhaber} · ${FIRMEN_DATEN.strasse} · ${FIRMEN_DATEN.ort}`,14,58);
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

  // Hinweis und Footer
  doc.setTextColor(25,25,25); doc.setFont("helvetica","normal"); doc.setFontSize(9);
  const note=doc.splitTextToSize(r.notiz||"Vielen Dank für Ihren Auftrag.",180);
  const noteY=Math.min(270,y+36); doc.text(note,14,noteY);
  doc.setFillColor(...accent); doc.rect(0,284,210,1,"F");
  doc.setFillColor(...schwarz); doc.rect(0,285,210,12,"F");
  doc.setTextColor(255,255,255); doc.setFontSize(7.5);
  doc.text(`${cfg.name} | ${FIRMEN_DATEN.inhaber} | ${FIRMEN_DATEN.strasse}, ${FIRMEN_DATEN.ort} | ${FIRMEN_DATEN.telefon}`,14,292);
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
  }catch(e){ alert(`PDF konnte nicht erstellt werden: ${e.message||e}`); }
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

$("inviteAdminBtn").onclick = einladungenOeffnen;
$("logoutBtn").onclick = abmelden;
$("einladungSchliessen").onclick = () => $("einladungDialog").close();
$("einladungErstellen").onclick = einladungErstellen;
$("einladungKopieren").onclick = einladungLinkKopieren;
$("einladungTeilen").onclick = einladungLinkTeilen;
$("registrierenOeffnen").onclick = registrierungOeffnen;
$("registerZurLogin").onclick = registrierungZurLogin;
$("registerButton").onclick = registrierenMitEinladung;

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

$("barButton").onclick = () =>
  verkaufAbschliessen("Bar");

$("karteButton").onclick = () =>
  verkaufAbschliessen("Karte");

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