const getraenkeListe = document.getElementById("getraenkeListe");
const warenkorbElement = document.getElementById("warenkorb");
const gesamtpreisElement = document.getElementById("gesamtpreis");

const buttonNeu = document.getElementById("getraenkHinzufuegen");
const buttonBar = document.getElementById("barButton");
const buttonKarte = document.getElementById("karteButton");
const buttonLoeschen = document.getElementById("bestellungLoeschen");

const GETRAENKE_KEY = "rudelbar_getraenke";
const VERKAEUFE_KEY = "rudelbar_verkaeufe";

let getraenke = laden(GETRAENKE_KEY, [
    { id: crypto.randomUUID(), name: "Pils", preis: 3.50 },
    { id: crypto.randomUUID(), name: "Radler", preis: 3.50 },
    { id: crypto.randomUUID(), name: "Cola", preis: 3.00 },
    { id: crypto.randomUUID(), name: "Wasser", preis: 2.50 }
]);

let verkaeufe = laden(VERKAEUFE_KEY, []);
let warenkorb = {};

function laden(key, standardwert) {
    try {
        const daten = localStorage.getItem(key);
        return daten ? JSON.parse(daten) : standardwert;
    } catch {
        return standardwert;
    }
}

function speichern(key, wert) {
    localStorage.setItem(key, JSON.stringify(wert));
}

function euro(wert) {
    return Number(wert).toLocaleString("de-DE", {
        style: "currency",
        currency: "EUR"
    });
}

function getraenkeRendern() {
    getraenkeListe.innerHTML = "";

    for (const getraenk of getraenke) {
        const anzahl = warenkorb[getraenk.id] || 0;

        const karte = document.createElement("article");
        karte.className = "getraenk";

        karte.innerHTML = `
            <button class="getraenk-hauptbereich" data-id="${getraenk.id}">
                <div class="getraenk-bild">
                    ${
                        getraenk.bild
                        ? `<img src="${getraenk.bild}" alt="${escapeHTML(getraenk.name)}">`
                        : `<div class="getraenk-symbol">🍺</div>`
                    }
                </div>

                <div class="getraenk-name">
                    ${escapeHTML(getraenk.name)}
                </div>

                <div class="getraenk-preis">
                    ${euro(getraenk.preis)}
                </div>

                ${
                    anzahl > 0
                    ? `<div class="ausgewaehlt">${anzahl} × gewählt</div>`
                    : ""
                }
            </button>

            <div class="getraenk-aktionen">
                <button class="aktion bearbeiten" data-edit="${getraenk.id}">
                    ✎
                </button>

                <button class="aktion entfernen" data-delete="${getraenk.id}">
                    <svg viewBox="0 0 24 24" width="24" height="24"
     fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round"
     aria-hidden="true">
  <path d="M3 6h18"/>
  <path d="M8 6V4h8v2"/>
  <path d="M19 6l-1 14H6L5 6"/>
  <path d="M10 11v5"/>
  <path d="M14 11v5"/>
</svg>
                </button>
            </div>
        `;

        getraenkeListe.appendChild(karte);
    }

    document.querySelectorAll(".getraenk-hauptbereich").forEach(button => {
        button.addEventListener("click", () => {
            const id = button.dataset.id;
            warenkorb[id] = (warenkorb[id] || 0) + 1;
            allesRendern();
        });
    });

    document.querySelectorAll("[data-edit]").forEach(button => {
        button.addEventListener("click", () => {
            getraenkBearbeiten(button.dataset.edit);
        });
    });

    document.querySelectorAll("[data-delete]").forEach(button => {
        button.addEventListener("click", () => {
            getraenkLoeschen(button.dataset.delete);
        });
    });
}

function warenkorbRendern() {
    const positionen = getraenke.filter(
        getraenk => (warenkorb[getraenk.id] || 0) > 0
    );

    if (positionen.length === 0) {
        warenkorbElement.innerHTML = `
            <div class="leer">
                <div class="warenkorb-symbol">🛒</div>
                <p>Noch keine Getränke</p>
            </div>
        `;
    } else {
        warenkorbElement.innerHTML = "";

        for (const getraenk of positionen) {
            const anzahl = warenkorb[getraenk.id];

            const zeile = document.createElement("div");
            zeile.className = "warenkorb-zeile";

            zeile.innerHTML = `
                <div class="warenkorb-info">
                    <strong>${escapeHTML(getraenk.name)}</strong>
                    <small>${euro(getraenk.preis)}</small>
                </div>

                <div class="warenkorb-steuerung">
                    <button data-minus="${getraenk.id}">−</button>
                    <span>${anzahl}</span>
                    <button data-plus="${getraenk.id}">+</button>
                </div>

                <strong class="warenkorb-summe">
                    ${euro(getraenk.preis * anzahl)}
                </strong>
            `;

            warenkorbElement.appendChild(zeile);
        }

        document.querySelectorAll("[data-minus]").forEach(button => {
            button.addEventListener("click", () => {
                const id = button.dataset.minus;

                if ((warenkorb[id] || 0) <= 1) {
                    delete warenkorb[id];
                } else {
                    warenkorb[id]--;
                }

                allesRendern();
            });
        });

        document.querySelectorAll("[data-plus]").forEach(button => {
            button.addEventListener("click", () => {
                const id = button.dataset.plus;
                warenkorb[id] = (warenkorb[id] || 0) + 1;
                allesRendern();
            });
        });
    }

    gesamtpreisElement.textContent = euro(gesamtpreis());
}

function gesamtpreis() {
    return getraenke.reduce((summe, getraenk) => {
        return summe +
            (warenkorb[getraenk.id] || 0) *
            Number(getraenk.preis);
    }, 0);
}

function neuesGetraenk() {
    const name = prompt("Name des Getränks:");

    if (!name || !name.trim()) return;

    const preisText = prompt("Preis in Euro, z. B. 3,50:");

    if (preisText === null) return;

    const preis = Number(
        preisText
            .replace(",", ".")
            .trim()
    );

    if (!Number.isFinite(preis) || preis < 0) {
        alert("Bitte einen gültigen Preis eingeben.");
        return;
    }

    getraenke.push({
        id: crypto.randomUUID(),
        name: name.trim(),
        preis: preis
    });

    speichern(GETRAENKE_KEY, getraenke);
    allesRendern();
}

function getraenkBearbeiten(id) {
    const getraenk = getraenke.find(g => g.id === id);

    if (!getraenk) return;

    const neuerName = prompt(
        "Name:",
        getraenk.name
    );

    if (neuerName === null || !neuerName.trim()) return;

    const neuerPreisText = prompt(
        "Preis:",
        String(getraenk.preis).replace(".", ",")
    );

    if (neuerPreisText === null) return;

    const neuerPreis = Number(
        neuerPreisText
            .replace(",", ".")
            .trim()
    );

    if (!Number.isFinite(neuerPreis) || neuerPreis < 0) {
        alert("Bitte einen gültigen Preis eingeben.");
        return;
    }

    getraenk.name = neuerName.trim();
    getraenk.preis = neuerPreis;

    speichern(GETRAENKE_KEY, getraenke);
    allesRendern();
}

function getraenkLoeschen(id) {
    const getraenk = getraenke.find(g => g.id === id);

    if (!getraenk) return;

    const bestaetigt = confirm(
        `${getraenk.name} wirklich löschen?`
    );

    if (!bestaetigt) return;

    getraenke = getraenke.filter(g => g.id !== id);
    delete warenkorb[id];

    speichern(GETRAENKE_KEY, getraenke);
    allesRendern();
}

function verkaufAbschliessen(zahlungsart) {
    const gesamt = gesamtpreis();

    if (gesamt <= 0) {
        alert("Die Bestellung ist leer.");
        return;
    }

    const positionen = getraenke
        .filter(g => (warenkorb[g.id] || 0) > 0)
        .map(g => ({
            getraenkId: g.id,
            getraenkName: g.name,
            anzahl: warenkorb[g.id],
            einzelpreis: g.preis
        }));

    const verkauf = {
        id: crypto.randomUUID(),
        datum: new Date().toISOString(),
        zahlungsart: zahlungsart,
        gesamtbetrag: gesamt,
        positionen: positionen
    };

    verkaeufe.push(verkauf);
    speichern(VERKAEUFE_KEY, verkaeufe);

    warenkorb = {};
    allesRendern();

    alert(
        `${zahlungsart}: ${euro(gesamt)} gespeichert ✓`
    );
}

function bestellungLoeschen() {
    warenkorb = {};
    allesRendern();
}

function escapeHTML(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function allesRendern() {
    getraenkeRendern();
    warenkorbRendern();
}

buttonNeu.addEventListener(
    "click",
    neuesGetraenk
);

buttonBar.addEventListener(
    "click",
    () => verkaufAbschliessen("Bar")
);

buttonKarte.addEventListener(
    "click",
    () => verkaufAbschliessen("Karte")
);

buttonLoeschen.addEventListener(
    "click",
    bestellungLoeschen
);

allesRendern();

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker
            .register("service-worker.js")
            .catch(error => {
                console.log(
                    "Service Worker Fehler:",
                    error
                );
            });
    });
}