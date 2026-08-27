const $ = id => document.getElementById(id);

const GETRAENKE_KEY = "rudelbar_getraenke";
const VERKAEUFE_KEY = "rudelbar_verkaeufe";
const ABSCHLUSS_KEY = "rudelbar_abschluesse";

let getraenke = laden(GETRAENKE_KEY, [
  {id:id(),name:"Pils",preis:3.50,bild:null},
  {id:id(),name:"Radler",preis:3.50,bild:null},
  {id:id(),name:"Cola",preis:3.00,bild:null},
  {id:id(),name:"Wasser",preis:2.50,bild:null}
]);

let verkaeufe = laden(VERKAEUFE_KEY, []);
let abschluesse = laden(ABSCHLUSS_KEY, []);
let warenkorb = {};
let editID = null;
let neuesBild = null;

function id(){
  return crypto.randomUUID();
}

function laden(key, fallback){
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function speichern(){
  localStorage.setItem(GETRAENKE_KEY, JSON.stringify(getraenke));
  localStorage.setItem(VERKAEUFE_KEY, JSON.stringify(verkaeufe));
  localStorage.setItem(ABSCHLUSS_KEY, JSON.stringify(abschluesse));
}

function euro(x){
  return Number(x).toLocaleString("de-DE", {
    style:"currency",
    currency:"EUR"
  });
}

function zahl(text){
  return Number(String(text).replace(/\./g,"").replace(",", ".")) || 0;
}

function esc(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function bierSVG(){
  return `
  <svg class="becher-icon" viewBox="0 0 24 24">
    <path d="M6 3h9v17H6z"/>
    <path d="M15 6h2.5a3.5 3.5 0 0 1 0 7H15"/>
    <path d="M8 7v9M11 7v9"/>
    <path d="M6 5c2 1 3-1 5 0 2 1 3-1 4 0"/>
  </svg>`;
}

function stiftSVG(){
  return `
  <svg viewBox="0 0 24 24">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>
  </svg>`;
}

function trashSVG(){
  return `
  <svg viewBox="0 0 24 24">
    <path d="M3 6h18"/>
    <path d="M8 6V4h8v2"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v5M14 11v5"/>
  </svg>`;
}

function render(){
  renderGetraenke();
  renderWarenkorb();
}

function renderGetraenke(){
  $("getraenkeListe").innerHTML = getraenke.map(g => {
    const anzahl = warenkorb[g.id] || 0;

    return `
    <article class="getraenk">
      <button class="getraenk-hauptbereich" data-add="${g.id}">
        <div class="getraenk-bild">
          ${g.bild
            ? `<img src="${g.bild}" alt="${esc(g.name)}">`
            : bierSVG()
          }
        </div>

        <div class="getraenk-name">${esc(g.name)}</div>
        <div class="getraenk-preis">${euro(g.preis)}</div>

        ${anzahl ? `<div class="ausgewaehlt">${anzahl} × gewählt</div>` : ""}
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

  document.querySelectorAll("[data-add]").forEach(b => {
    b.onclick = () => {
      warenkorb[b.dataset.add] = (warenkorb[b.dataset.add] || 0) + 1;
      render();
    };
  });

  document.querySelectorAll("[data-edit]").forEach(b => {
    b.onclick = () => editGetraenk(b.dataset.edit);
  });

  document.querySelectorAll("[data-delete]").forEach(b => {
    b.onclick = () => deleteGetraenk(b.dataset.delete);
  });
}

function renderWarenkorb(){
  const liste = getraenke.filter(g => (warenkorb[g.id] || 0) > 0);

  if (!liste.length) {
    $("warenkorb").innerHTML = `
    <div class="leer">
      <svg class="leer-icon" viewBox="0 0 24 24">
        <path d="M3 3h2l2 12h10l3-8H6"/>
        <circle cx="9" cy="20" r="1"/>
        <circle cx="18" cy="20" r="1"/>
      </svg>
      <p>Noch keine Getränke</p>
    </div>`;
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

  document.querySelectorAll("[data-minus]").forEach(b => {
    b.onclick = () => {
      let id = b.dataset.minus;
      warenkorb[id]--;

      if (warenkorb[id] <= 0) delete warenkorb[id];
      render();
    };
  });

  document.querySelectorAll("[data-plus]").forEach(b => {
    b.onclick = () => {
      let id = b.dataset.plus;
      warenkorb[id]++;
      render();
    };
  });

  $("gesamtpreis").textContent = euro(gesamtpreis());
}

function gesamtpreis(){
  return getraenke.reduce(
    (sum,g) => sum + (warenkorb[g.id] || 0) * g.preis,
    0
  );
}

function openNew(){
  editID = null;
  neuesBild = null;

  $("dialogTitel").textContent = "Getränk hinzufügen";
  $("nameInput").value = "";
  $("preisInput").value = "";
  $("bildInput").value = "";
  $("bildVorschau").innerHTML = "";

  $("getraenkDialog").showModal();
}

function editGetraenk(id){
  const g = getraenke.find(x => x.id === id);
  if (!g) return;

  editID = id;
  neuesBild = g.bild || null;

  $("dialogTitel").textContent = "Getränk bearbeiten";
  $("nameInput").value = g.name;
  $("preisInput").value = String(g.preis).replace(".",",");

  $("bildVorschau").innerHTML =
    g.bild ? `<img src="${g.bild}">` : "";

  $("getraenkDialog").showModal();
}

function saveGetraenk(){
  const name = $("nameInput").value.trim();
  const preis = zahl($("preisInput").value);

  if (!name || !preis) {
    alert("Bitte Name und Preis eingeben.");
    return;
  }

  if (editID) {
    let g = getraenke.find(x => x.id === editID);

    g.name = name;
    g.preis = preis;
    g.bild = neuesBild;

  } else {
    getraenke.push({
      id:id(),
      name,
      preis,
      bild:neuesBild
    });
  }

  speichern();
  render();
  $("getraenkDialog").close();
}

function deleteGetraenk(id){
  const g = getraenke.find(x => x.id === id);
  if (!g) return;

  if (!confirm(`${g.name} wirklich löschen?`)) return;

  getraenke = getraenke.filter(x => x.id !== id);
  delete warenkorb[id];

  speichern();
  render();
}

$("bildInput").onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    neuesBild = reader.result;

    $("bildVorschau").innerHTML =
      `<img src="${neuesBild}">`;
  };

  reader.readAsDataURL(file);
};

function verkauf(zahlungsart){
  const gesamt = gesamtpreis();

  if (!gesamt) {
    alert("Bestellung ist leer.");
    return;
  }

  const positionen = getraenke
    .filter(g => warenkorb[g.id])
    .map(g => ({
      name:g.name,
      preis:g.preis,
      anzahl:warenkorb[g.id]
    }));

  verkaeufe.push({
    id:id(),
    datum:new Date().toISOString(),
    zahlungsart,
    gesamt,
    positionen,
    abgeschlossen:false
  });

  warenkorb = {};

  speichern();
  render();

  alert(`${zahlungsart}: ${euro(gesamt)} gespeichert ✓`);
}

function heuteVerkaeufe(){
  const heute = new Date().toDateString();

  return verkaeufe.filter(v =>
    new Date(v.datum).toDateString() === heute
  );
}

function statistik(){
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

  ${getraenkeTabelle(daten)}

  <h3>Einzelne Verkäufe</h3>

  <table class="tabelle">
    <tr>
      <th>Zeit</th>
      <th>Zahlung</th>
      <th>Betrag</th>
    </tr>

    ${v.map(x => `
      <tr>
        <td>${new Date(x.datum).toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"})}</td>
        <td>${x.zahlungsart}</td>
        <td>${euro(x.gesamt)}</td>
      </tr>
    `).join("")}
  </table>`;

  $("statistikDialog").showModal();
}

function aggregieren(liste){
  let map = {};
  let anzahl = 0;
  let gesamt = 0;

  liste.forEach(v => {
    gesamt += v.gesamt;

    v.positionen.forEach(p => {
      anzahl += p.anzahl;

      if (!map[p.name]) {
        map[p.name] = {
          anzahl:0,
          umsatz:0
        };
      }

      map[p.name].anzahl += p.anzahl;
      map[p.name].umsatz += p.preis * p.anzahl;
    });
  });

  return {map,anzahl,gesamt};
}

function getraenkeTabelle(daten){
  const rows = Object.entries(daten.map)
    .sort((a,b) => b[1].anzahl - a[1].anzahl)
    .map(([name,x]) => `
    <tr>
      <td>${esc(name)}</td>
      <td>${x.anzahl}</td>
      <td>${euro(x.umsatz)}</td>
    </tr>`).join("");

  return `
  <table class="tabelle">
    <tr>
      <th>Getränk</th>
      <th>Stück</th>
      <th>Umsatz</th>
    </tr>

    ${rows}

    <tr class="gesamt">
      <td>GESAMT</td>
      <td>${daten.anzahl}</td>
      <td>${euro(daten.gesamt)}</td>
    </tr>
  </table>`;
}

function offeneVerkaeufe(){
  return verkaeufe.filter(v => !v.abgeschlossen);
}

function updateAbschluss(){
  const v = offeneVerkaeufe();
  const daten = aggregieren(v);

  const bar = v
    .filter(x => x.zahlungsart === "Bar")
    .reduce((s,x) => s + x.gesamt,0);

  const karte = v
    .filter(x => x.zahlungsart === "Karte")
    .reduce((s,x) => s + x.gesamt,0);

  const start = zahl($("anfangsbestandInput").value);
  const einlagen = zahl($("einlagenInput").value);
  const entnahmen = zahl($("entnahmenInput").value);
  const ausgaben = zahl($("ausgabenInput").value);
  const ist = zahl($("istKasseInput").value);

  const soll = start + bar + einlagen - entnahmen - ausgaben;
  const diff = ist - soll;

  $("abschlussInhalt").innerHTML = `
  <table class="tabelle">
    <tr><th>Bereich</th><th>Betrag</th></tr>
    <tr><td>Barumsatz</td><td>${euro(bar)}</td></tr>
    <tr><td>Kartenumsatz</td><td>${euro(karte)}</td></tr>
    <tr class="gesamt"><td>Gesamtumsatz</td><td>${euro(daten.gesamt)}</td></tr>
    <tr><td>Soll-Kasse</td><td>${euro(soll)}</td></tr>
    <tr><td>Ist-Kasse</td><td>${euro(ist)}</td></tr>
    <tr class="gesamt"><td>Differenz</td><td>${euro(diff)}</td></tr>
  </table>

  ${getraenkeTabelle(daten)}`;

  return {
    bar,karte,daten,start,einlagen,entnahmen,ausgaben,ist,soll,diff
  };
}

function openAbschluss(){
  updateAbschluss();
  $("abschlussDialog").showModal();
}

[
  "anfangsbestandInput",
  "einlagenInput",
  "entnahmenInput",
  "ausgabenInput",
  "istKasseInput"
].forEach(x => $(x).oninput = updateAbschluss);

function saveAbschluss(){
  const d = updateAbschluss();
  const offene = offeneVerkaeufe();

  if (!offene.length) {
    alert("Keine offenen Verkäufe.");
    return;
  }

  const abschlussID = id();

  abschluesse.push({
    id:abschlussID,
    datum:new Date().toISOString(),
    veranstaltung:$("veranstaltungInput").value.trim() || "Tagesabschluss",
    ...d
  });

  offene.forEach(v => v.abgeschlossen = true);

  speichern();

  alert("Tagesabschluss gespeichert ✓");
  $("abschlussDialog").close();
}

async function teilenGetraenke(){
  const daten = aggregieren(heuteVerkaeufe());

  let text =
`RUDELBAR – Verkaufte Getränke

Getränk | Stück | Umsatz
`;

  Object.entries(daten.map).forEach(([name,x]) => {
    text += `${name} | ${x.anzahl} | ${euro(x.umsatz)}\n`;
  });

  text += `\nGESAMT | ${daten.anzahl} | ${euro(daten.gesamt)}`;

  await teilen(text);
}

async function teilenAbschluss(){
  const d = updateAbschluss();

  const text =
`RUDELBAR – Tagesabschluss

Veranstaltung:
${$("veranstaltungInput").value || "-"}

Bar: ${euro(d.bar)}
Karte: ${euro(d.karte)}
Gesamt: ${euro(d.daten.gesamt)}

Soll-Kasse: ${euro(d.soll)}
Ist-Kasse: ${euro(d.ist)}
Differenz: ${euro(d.diff)}
`;

  await teilen(text);
}

async function teilen(text){
  if (navigator.share) {
    try {
      await navigator.share({
        title:"Rudelbar",
        text
      });
    } catch {}
  } else {
    await navigator.clipboard.writeText(text);
    alert("In Zwischenablage kopiert.");
  }
}

$("getraenkHinzufuegen").onclick = openNew;
$("getraenkSpeichern").onclick = saveGetraenk;

$("barButton").onclick = () => verkauf("Bar");
$("karteButton").onclick = () => verkauf("Karte");

$("bestellungLoeschen").onclick = () => {
  warenkorb = {};
  render();
};

$("statistikBtn").onclick = statistik;
$("statistikSchliessen").onclick = () => $("statistikDialog").close();

$("getraenkeTeilen").onclick = teilenGetraenke;

$("abschlussSchliessen").onclick = () => $("abschlussDialog").close();
$("abschlussSpeichern").onclick = saveAbschluss;
$("abschlussTeilen").onclick = teilenAbschluss;

$("statistikBtn").ondblclick = openAbschluss;

/* Langer Druck auf Statistik = Tagesabschluss */
let timer;

$("statistikBtn").onpointerdown = () => {
  timer = setTimeout(openAbschluss,700);
};

$("statistikBtn").onpointerup =
$("statistikBtn").onpointerleave = () => clearTimeout(timer);

render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
}