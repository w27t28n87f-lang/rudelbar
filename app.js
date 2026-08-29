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

  if (data.session) {
    angemeldet = true;
    await nachLogin();
    return;
  }

  $("loginEmail").value = localStorage.getItem(EMAIL_KEY) || "";
  $("loginDialog").showModal();
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

  $("loginDialog").close();

  await nachLogin();
}

async function nachLogin() {
  statusAktualisieren();

  if (syncQueue.length) {
    await syncStarten();

    if (syncQueue.length) {
      realtimeStarten();
      return;
    }
  }

  await ersteSynchronisierung();
  realtimeStarten();
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
    remoteAbschluesse
  ] = await Promise.all([
    sb.from("getraenke").select("*").eq("aktiv", true),
    sb.from("verkaeufe").select("*"),
    sb.from("tagesabschluesse").select("*")
  ]);

  if (
    remoteGetraenke.error ||
    remoteVerkaeufe.error ||
    remoteAbschluesse.error
  ) {
    console.error(
      remoteGetraenke.error,
      remoteVerkaeufe.error,
      remoteAbschluesse.error
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

  speichernLokal();
  render();

  await syncStarten();
  statusAktualisieren();
}


/* REMOTE KOMPLETT NEU LADEN */

async function remoteNeuLaden() {
  if (!angemeldet || !navigator.onLine || syncQueue.length) return;

  const [g, v, a] = await Promise.all([
    sb.from("getraenke").select("*").eq("aktiv", true),
    sb.from("verkaeufe").select("*"),
    sb.from("tagesabschluesse").select("*")
  ]);

  if (g.error || v.error || a.error) return;

  getraenke = g.data.map(getraenkVonDB);
  verkaeufe = v.data.map(verkaufVonDB);
  abschluesse = a.data.map(abschlussVonDB);

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


/* BUTTONS */

$("loginButton").onclick = anmelden;

$("loginPasswort").addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") anmelden();
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