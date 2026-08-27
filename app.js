const $ = id =>
  document.getElementById(id);


const GETRAENKE_KEY =
  "rudelbar_getraenke";

const VERKAEUFE_KEY =
  "rudelbar_verkaeufe";

const ABSCHLUSS_KEY =
  "rudelbar_abschluesse";


let getraenke =
  laden(
    GETRAENKE_KEY,
    [
      {
        id: neueID(),
        name: "Pils",
        preis: 3.50,
        bild: null
      },
      {
        id: neueID(),
        name: "Radler",
        preis: 3.50,
        bild: null
      },
      {
        id: neueID(),
        name: "Cola",
        preis: 3.00,
        bild: null
      },
      {
        id: neueID(),
        name: "Wasser",
        preis: 2.50,
        bild: null
      }
    ]
  );


let verkaeufe =
  laden(
    VERKAEUFE_KEY,
    []
  );


let abschluesse =
  laden(
    ABSCHLUSS_KEY,
    []
  );


let warenkorb = {};

let editID = null;

let neuesBild = null;

let verkaufEditID = null;

let verkaufEditPositionen = [];


/* GRUNDLAGEN */

function neueID() {
  return crypto.randomUUID();
}


function laden(
  key,
  fallback
) {

  try {

    const daten =
      localStorage.getItem(key);

    return daten
      ? JSON.parse(daten)
      : fallback;

  } catch {

    return fallback;

  }

}


function speichern() {

  try {

    localStorage.setItem(
      GETRAENKE_KEY,
      JSON.stringify(
        getraenke
      )
    );

    localStorage.setItem(
      VERKAEUFE_KEY,
      JSON.stringify(
        verkaeufe
      )
    );

    localStorage.setItem(
      ABSCHLUSS_KEY,
      JSON.stringify(
        abschluesse
      )
    );

    return true;

  } catch (error) {

    console.error(error);

    alert(
      "Speichern fehlgeschlagen. "
      +
      "Der lokale Speicher ist möglicherweise voll."
    );

    return false;

  }

}


function euro(wert) {

  return Number(wert)
    .toLocaleString(
      "de-DE",
      {
        style: "currency",
        currency: "EUR"
      }
    );

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
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    );

}


/* SVG */

function bierSVG() {

  return `
  <svg
    class="becher-icon"
    viewBox="0 0 24 24"
  >

    <path
      d="M6 3h9v17H6z"
    />

    <path
      d="
        M15 6
        h2.5
        a3.5 3.5 0 0 1
        0 7
        H15
      "
    />

    <path
      d="
        M8 7v9
        M11 7v9
      "
    />

    <path
      d="
        M6 5
        c2 1 3-1 5 0
        2 1 3-1 4 0
      "
    />

  </svg>`;

}


function stiftSVG() {

  return `
  <svg
    viewBox="0 0 24 24"
  >

    <path
      d="M12 20h9"
    />

    <path
      d="
        M16.5 3.5
        a2.1 2.1 0 0 1
        3 3
        L8 18
        l-4 1
        1-4Z
      "
    />

  </svg>`;

}


function trashSVG() {

  return `
  <svg
    viewBox="0 0 24 24"
  >

    <path
      d="M3 6h18"
    />

    <path
      d="M8 6V4h8v2"
    />

    <path
      d="
        M19 6
        l-1 14
        H6
        L5 6
      "
    />

    <path
      d="
        M10 11v5
        M14 11v5
      "
    />

  </svg>`;

}


/* WARENKORB LEER */

function leerWarenkorbHTML() {

  return `
  <div class="leer">

    <svg
      class="leer-icon"
      viewBox="0 0 24 24"
    >

      <path
        d="
          M3 3
          h2
          l2 12
          h10
          l3-8
          H6
        "
      />

      <circle
        cx="9"
        cy="20"
        r="1"
      />

      <circle
        cx="18"
        cy="20"
        r="1"
      />

    </svg>

    <p>
      Noch keine Getränke
    </p>

  </div>`;

}


/* HAUPT-RENDER */

function render() {

  renderGetraenke();

  renderWarenkorb();

}


/* GETRÄNKE */

function renderGetraenke() {

  $("getraenkeListe")
    .innerHTML =
      getraenke
        .map(g => {

          const anzahl =
            warenkorb[g.id]
            || 0;

          return `
          <article
            class="getraenk"
          >

            <button
              class="
                getraenk-hauptbereich
              "
              data-add="${g.id}"
            >

              <div
                class="getraenk-bild"
              >

                ${
                  g.bild

                    ? `
                      <img
                        src="${g.bild}"
                        alt="${esc(g.name)}"
                      >
                    `

                    : bierSVG()
                }

              </div>

              <div
                class="getraenk-name"
              >
                ${esc(g.name)}
              </div>

              <div
                class="getraenk-preis"
              >
                ${euro(g.preis)}
              </div>

              ${
                anzahl

                  ? `
                    <div
                      class="ausgewaehlt"
                    >
                      ${anzahl}
                      × gewählt
                    </div>
                  `

                  : ""
              }

            </button>


            <div
              class="getraenk-aktionen"
            >

              <button
                class="
                  aktion
                  bearbeiten
                "
                data-edit="${g.id}"
              >

                ${stiftSVG()}

              </button>


              <button
                class="
                  aktion
                  entfernen
                "
                data-delete="${g.id}"
              >

                ${trashSVG()}

              </button>

            </div>

          </article>`;

        })
        .join("");


  document
    .querySelectorAll(
      "[data-add]"
    )
    .forEach(button => {

      button.onclick =
        () => {

          const id =
            button.dataset.add;

          warenkorb[id] =
            (
              warenkorb[id]
              || 0
            )
            + 1;

          render();

        };

    });


  document
    .querySelectorAll(
      "[data-edit]"
    )
    .forEach(button => {

      button.onclick =
        () => {

          getraenkBearbeiten(
            button.dataset.edit
          );

        };

    });


  document
    .querySelectorAll(
      "[data-delete]"
    )
    .forEach(button => {

      button.onclick =
        () => {

          getraenkLoeschen(
            button.dataset.delete
          );

        };

    });

}


/* WARENKORB */

function renderWarenkorb() {

  const liste =
    getraenke.filter(
      g =>
        (
          warenkorb[g.id]
          || 0
        )
        > 0
    );


  if (!liste.length) {

    $("warenkorb")
      .innerHTML =
        leerWarenkorbHTML();

  } else {

    $("warenkorb")
      .innerHTML =
        liste
          .map(g => `
            <div
              class="warenkorb-zeile"
            >

              <div
                class="warenkorb-info"
              >

                <strong>
                  ${esc(g.name)}
                </strong>

                <small>
                  ${euro(g.preis)}
                </small>

              </div>


              <div
                class="
                  warenkorb-steuerung
                "
              >

                <button
                  data-minus="${g.id}"
                >
                  −
                </button>

                <strong>
                  ${warenkorb[g.id]}
                </strong>

                <button
                  data-plus="${g.id}"
                >
                  +
                </button>

              </div>


              <strong
                class="
                  warenkorb-summe
                "
              >
                ${
                  euro(
                    g.preis
                    *
                    warenkorb[g.id]
                  )
                }
              </strong>

            </div>
          `)
          .join("");

  }


  document
    .querySelectorAll(
      "[data-minus]"
    )
    .forEach(button => {

      button.onclick =
        () => {

          const id =
            button.dataset.minus;

          warenkorb[id]--;

          if (
            warenkorb[id]
            <= 0
          ) {

            delete warenkorb[id];

          }

          render();

        };

    });


  document
    .querySelectorAll(
      "[data-plus]"
    )
    .forEach(button => {

      button.onclick =
        () => {

          const id =
            button.dataset.plus;

          warenkorb[id] =
            (
              warenkorb[id]
              || 0
            )
            + 1;

          render();

        };

    });


  $("gesamtpreis")
    .textContent =
      euro(
        gesamtpreis()
      );

}


function gesamtpreis() {

  return getraenke
    .reduce(
      (
        summe,
        g
      ) => {

        return (
          summe
          +
          (
            warenkorb[g.id]
            || 0
          )
          *
          g.preis
        );

      },
      0
    );

}


/* GETRÄNK HINZUFÜGEN */

function neuesGetraenkOeffnen() {

  editID = null;

  neuesBild = null;


  $("dialogTitel")
    .textContent =
      "Getränk hinzufügen";


  $("nameInput").value =
    "";

  $("preisInput").value =
    "";

  $("bildInput").value =
    "";

  $("bildVorschau")
    .innerHTML =
      "";


  $("getraenkDialog")
    .showModal();

}


/* GETRÄNK BEARBEITEN */

function getraenkBearbeiten(
  id
) {

  const g =
    getraenke.find(
      x =>
        x.id === id
    );


  if (!g) {
    return;
  }


  editID =
    id;

  neuesBild =
    g.bild
    || null;


  $("dialogTitel")
    .textContent =
      "Getränk bearbeiten";


  $("nameInput").value =
    g.name;


  $("preisInput").value =
    String(g.preis)
      .replace(
        ".",
        ","
      );


  $("bildVorschau")
    .innerHTML =
      g.bild

        ? `
          <img
            src="${g.bild}"
            alt="${esc(g.name)}"
          >
        `

        : "";


  $("getraenkDialog")
    .showModal();

}


/* GETRÄNK SPEICHERN */

function getraenkSpeichern() {

  const name =
    $("nameInput")
      .value
      .trim();


  const preis =
    zahl(
      $("preisInput")
        .value
    );


  if (!name) {

    alert(
      "Bitte einen Namen eingeben."
    );

    return;

  }


  if (
    !preis
    ||
    preis <= 0
  ) {

    alert(
      "Bitte einen gültigen Preis eingeben."
    );

    return;

  }


  if (editID) {

    const g =
      getraenke.find(
        x =>
          x.id === editID
      );


    if (!g) {
      return;
    }


    g.name =
      name;

    g.preis =
      preis;

    g.bild =
      neuesBild;

  } else {

    getraenke.push(
      {
        id: neueID(),
        name,
        preis,
        bild: neuesBild
      }
    );

  }


  if (
    !speichern()
  ) {
    return;
  }


  render();


  $("getraenkDialog")
    .close();

}


/* GETRÄNK LÖSCHEN */

function getraenkLoeschen(
  id
) {

  const g =
    getraenke.find(
      x =>
        x.id === id
    );


  if (!g) {
    return;
  }


  if (
    !confirm(
      `${g.name} wirklich löschen?`
    )
  ) {
    return;
  }


  getraenke =
    getraenke.filter(
      x =>
        x.id !== id
    );


  delete warenkorb[id];


  speichern();

  render();

}


/* FOTO */

$("bildInput")
  .onchange =
    async event => {

      const file =
        event.target.files[0];


      if (!file) {
        return;
      }


      try {

        neuesBild =
          await bildVerkleinern(
            file,
            900,
            0.72
          );


        $("bildVorschau")
          .innerHTML =
            `
            <img
              src="${neuesBild}"
              alt="Getränk"
            >
            `;

      } catch (error) {

        console.error(error);

        alert(
          "Das Foto konnte nicht verarbeitet werden."
        );

      }

    };


function bildVerkleinern(
  file,
  maxGroesse = 900,
  qualitaet = 0.72
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      const reader =
        new FileReader();


      reader.onerror =
        reject;


      reader.onload =
        () => {

          const img =
            new Image();


          img.onerror =
            reject;


          img.onload =
            () => {

              let breite =
                img.width;

              let hoehe =
                img.height;


              if (
                breite > maxGroesse
                ||
                hoehe > maxGroesse
              ) {

                const faktor =
                  Math.min(
                    maxGroesse / breite,
                    maxGroesse / hoehe
                  );


                breite =
                  Math.round(
                    breite
                    *
                    faktor
                  );


                hoehe =
                  Math.round(
                    hoehe
                    *
                    faktor
                  );

              }


              const canvas =
                document.createElement(
                  "canvas"
                );


              canvas.width =
                breite;

              canvas.height =
                hoehe;


              const ctx =
                canvas.getContext(
                  "2d"
                );


              ctx.drawImage(
                img,
                0,
                0,
                breite,
                hoehe
              );


              resolve(
                canvas.toDataURL(
                  "image/jpeg",
                  qualitaet
                )
              );

            };


          img.src =
            reader.result;

        };


      reader.readAsDataURL(
        file
      );

    }
  );

}


/* VERKAUF ABSCHLIESSEN */

function verkaufAbschliessen(
  zahlungsart
) {

  const gesamt =
    gesamtpreis();


  if (!gesamt) {

    return;

  }


  const positionen =
    getraenke

      .filter(
        g =>
          warenkorb[g.id]
      )

      .map(
        g => ({
          getraenkId:
            g.id,

          name:
            g.name,

          preis:
            g.preis,

          anzahl:
            warenkorb[g.id]
        })
      );


  verkaeufe.push(
    {
      id:
        neueID(),

      datum:
        new Date()
          .toISOString(),

      zahlungsart,

      gesamt,

      positionen,

      abgeschlossen:
        false
    }
  );


  warenkorb =
    {};


  speichern();

  render();

  /*
  Absichtlich KEIN alert().
  Nach BAR oder KARTE
  kann sofort weiter kassiert werden.
  */

}


/* HEUTE */

function heuteVerkaeufe() {

  const heute =
    new Date()
      .toDateString();


  return verkaeufe
    .filter(
      v =>
        new Date(v.datum)
          .toDateString()
        ===
        heute
    );

}


/* OFFENE VERKÄUFE */

function offeneVerkaeufe() {

  return verkaeufe
    .filter(
      v =>
        !v.abgeschlossen
    );

}


/* AGGREGIEREN */

function aggregieren(
  liste
) {

  const map =
    {};


  let anzahl =
    0;


  let gesamt =
    0;


  liste
    .forEach(
      v => {

        gesamt +=
          Number(
            v.gesamt
          );


        v.positionen
          .forEach(
            p => {

              anzahl +=
                p.anzahl;


              if (
                !map[p.name]
              ) {

                map[p.name] =
                  {
                    anzahl: 0,
                    umsatz: 0
                  };

              }


              map[p.name]
                .anzahl +=
                  p.anzahl;


              map[p.name]
                .umsatz +=
                  p.preis
                  *
                  p.anzahl;

            }
          );

      }
    );


  return {
    map,
    anzahl,
    gesamt
  };

}


/* GETRÄNKETABELLE */

function getraenkeTabelle(
  daten
) {

  const zeilen =
    Object.entries(
      daten.map
    )

      .sort(
        (
          a,
          b
        ) =>
          b[1].anzahl
          -
          a[1].anzahl
      )

      .map(
        (
          [name, x]
        ) => `
          <tr>

            <td>
              ${esc(name)}
            </td>

            <td>
              ${x.anzahl}
            </td>

            <td>
              ${euro(x.umsatz)}
            </td>

          </tr>
        `
      )

      .join("");


  return `
  <table class="tabelle">

    <thead>

      <tr>

        <th>
          Getränk
        </th>

        <th>
          Stück
        </th>

        <th>
          Umsatz
        </th>

      </tr>

    </thead>


    <tbody>

      ${zeilen}


      <tr class="gesamt">

        <td>
          GESAMT
        </td>

        <td>
          ${daten.anzahl}
        </td>

        <td>
          ${euro(daten.gesamt)}
        </td>

      </tr>

    </tbody>

  </table>`;

}


/* TAGESÜBERSICHT */

function statistikOeffnen() {

  const v =
    heuteVerkaeufe();


  const daten =
    aggregieren(v);


  $("statistikInhalt")
    .innerHTML = `

    <div
      class="stat-karten"
    >

      <div class="stat">

        <span>
          Verkäufe
        </span>

        <strong>
          ${v.length}
        </strong>

      </div>


      <div class="stat">

        <span>
          Getränke
        </span>

        <strong>
          ${daten.anzahl}
        </strong>

      </div>


      <div class="stat">

        <span>
          Gesamt
        </span>

        <strong>
          ${euro(daten.gesamt)}
        </strong>

      </div>

    </div>


    <h3>
      Verkaufte Getränke
    </h3>

    ${getraenkeTabelle(daten)}


    <h3>
      Einzelne Verkäufe
    </h3>


    <table class="tabelle">

      <thead>

        <tr>

          <th>
            Zeit
          </th>

          <th>
            Zahlung
          </th>

          <th>
            Betrag
          </th>

          <th>
          </th>

        </tr>

      </thead>


      <tbody>

        ${
          v.map(
            x => `
            <tr>

              <td>
                ${
                  new Date(x.datum)
                    .toLocaleTimeString(
                      "de-DE",
                      {
                        hour:
                          "2-digit",

                        minute:
                          "2-digit"
                      }
                    )
                }
              </td>


              <td>
                ${x.zahlungsart}
              </td>


              <td>
                ${euro(x.gesamt)}
              </td>


              <td>

                <div
                  class="
                    verkauf-aktion
                  "
                >

                  <button
                    class="
                      mini-button
                    "
                    data-verkauf-edit="
                      ${x.id}
                    "
                  >

                    ${stiftSVG()}

                  </button>


                  <button
                    class="
                      mini-button
                      loeschen
                    "
                    data-verkauf-delete="
                      ${x.id}
                    "
                  >

                    ${trashSVG()}

                  </button>

                </div>

              </td>

            </tr>
            `
          )
          .join("")
        }

      </tbody>

    </table>
  `;


  document
    .querySelectorAll(
      "[data-verkauf-edit]"
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            verkaufBearbeitenOeffnen(
              button.dataset
                .verkaufEdit
                .trim()
            );

          };

      }
    );


  document
    .querySelectorAll(
      "[data-verkauf-delete]"
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            verkaufDirektLoeschen(
              button.dataset
                .verkaufDelete
                .trim()
            );

          };

      }
    );


  $("statistikDialog")
    .showModal();

}


/* VERKAUF BEARBEITEN ÖFFNEN */

function verkaufBearbeitenOeffnen(
  id
) {

  const verkauf =
    verkaeufe.find(
      v =>
        v.id === id
    );


  if (!verkauf) {
    return;
  }


  verkaufEditID =
    id;


  verkaufEditPositionen =
    getraenke.map(
      g => {

        const vorhandenePosition =
          verkauf.positionen
            .find(
              p =>
                (
                  p.getraenkId
                  &&
                  p.getraenkId
                  === g.id
                )
                ||
                (
                  !p.getraenkId
                  &&
                  p.name
                  === g.name
                )
            );


        return {
          getraenkId:
            g.id,

          name:
            g.name,

          preis:
            g.preis,

          anzahl:
            vorhandenePosition
              ? vorhandenePosition.anzahl
              : 0
        };

      }
    );


  $("verkaufZahlungsart")
    .value =
      verkauf.zahlungsart;


  renderVerkaufEdit();


  $("verkaufDialog")
    .showModal();

}


/* VERKAUF BEARBEITEN RENDERN */

function renderVerkaufEdit() {

  $("verkaufPositionen")
    .innerHTML =
      verkaufEditPositionen
        .map(
          p => `
          <div
            class="verkauf-position"
          >

            <div
              class="
                verkauf-position-info
              "
            >

              <strong>
                ${esc(p.name)}
              </strong>

              <small>
                ${euro(p.preis)}
              </small>

            </div>


            <div
              class="verkauf-menge"
            >

              <button
                data-edit-minus="
                  ${p.getraenkId}
                "
              >
                −
              </button>

              <strong>
                ${p.anzahl}
              </strong>

              <button
                data-edit-plus="
                  ${p.getraenkId}
                "
              >
                +
              </button>

            </div>


            <strong>
              ${
                euro(
                  p.preis
                  *
                  p.anzahl
                )
              }
            </strong>

          </div>
          `
        )
        .join("");


  document
    .querySelectorAll(
      "[data-edit-minus]"
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            const id =
              button.dataset
                .editMinus
                .trim();


            const p =
              verkaufEditPositionen
                .find(
                  x =>
                    x.getraenkId
                    === id
                );


            if (
              p
              &&
              p.anzahl > 0
            ) {

              p.anzahl--;

              renderVerkaufEdit();

            }

          };

      }
    );


  document
    .querySelectorAll(
      "[data-edit-plus]"
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            const id =
              button.dataset
                .editPlus
                .trim();


            const p =
              verkaufEditPositionen
                .find(
                  x =>
                    x.getraenkId
                    === id
                );


            if (p) {

              p.anzahl++;

              renderVerkaufEdit();

            }

          };

      }
    );


  const gesamt =
    verkaufEditPositionen
      .reduce(
        (
          summe,
          p
        ) =>
          summe
          +
          p.preis
          *
          p.anzahl,
        0
      );


  $("verkaufEditGesamt")
    .textContent =
      euro(gesamt);

}


/* BEARBEITETEN VERKAUF SPEICHERN */

function verkaufBearbeitungSpeichern() {

  const verkauf =
    verkaeufe.find(
      v =>
        v.id === verkaufEditID
    );


  if (!verkauf) {
    return;
  }


  const positionen =
    verkaufEditPositionen
      .filter(
        p =>
          p.anzahl > 0
      );


  if (!positionen.length) {

    alert(
      "Der Verkauf enthält keine Getränke mehr."
    );

    return;

  }


  verkauf.zahlungsart =
    $("verkaufZahlungsart")
      .value;


  verkauf.positionen =
    positionen.map(
      p => ({
        getraenkId:
          p.getraenkId,

        name:
          p.name,

        preis:
          p.preis,

        anzahl:
          p.anzahl
      })
    );


  verkauf.gesamt =
    positionen
      .reduce(
        (
          summe,
          p
        ) =>
          summe
          +
          p.preis
          *
          p.anzahl,
        0
      );


  speichern();


  $("verkaufDialog")
    .close();


  statistikNeuLaden();

}


/* VERKAUF AUS DIALOG LÖSCHEN */

function verkaufBearbeitungLoeschen() {

  if (
    !verkaufEditID
  ) {
    return;
  }


  if (
    !confirm(
      "Diesen Verkauf wirklich löschen?"
    )
  ) {
    return;
  }


  verkaeufe =
    verkaeufe.filter(
      v =>
        v.id
        !==
        verkaufEditID
    );


  speichern();


  $("verkaufDialog")
    .close();


  statistikNeuLaden();

}


/* VERKAUF DIREKT AUS TABELLE LÖSCHEN */

function verkaufDirektLoeschen(
  id
) {

  if (
    !confirm(
      "Diesen Verkauf wirklich löschen?"
    )
  ) {
    return;
  }


  verkaeufe =
    verkaeufe.filter(
      v =>
        v.id !== id
    );


  speichern();


  statistikNeuLaden();

}


/* STATISTIK NEU AUFBAUEN */

function statistikNeuLaden() {

  if (
    $("statistikDialog")
      .open
  ) {

    $("statistikDialog")
      .close();

  }


  statistikOeffnen();

}


/* TAGESABSCHLUSS */

function abschlussBerechnen() {

  const v =
    offeneVerkaeufe();


  const daten =
    aggregieren(v);


  const bar =
    v

      .filter(
        x =>
          x.zahlungsart
          ===
          "Bar"
      )

      .reduce(
        (
          summe,
          x
        ) =>
          summe
          +
          x.gesamt,
        0
      );


  const karte =
    v

      .filter(
        x =>
          x.zahlungsart
          ===
          "Karte"
      )

      .reduce(
        (
          summe,
          x
        ) =>
          summe
          +
          x.gesamt,
        0
      );


  const start =
    zahl(
      $("anfangsbestandInput")
        .value
    );


  const einlagen =
    zahl(
      $("einlagenInput")
        .value
    );


  const entnahmen =
    zahl(
      $("entnahmenInput")
        .value
    );


  const ausgaben =
    zahl(
      $("ausgabenInput")
        .value
    );


  const ist =
    zahl(
      $("istKasseInput")
        .value
    );


  const soll =
    start
    +
    bar
    +
    einlagen
    -
    entnahmen
    -
    ausgaben;


  const diff =
    ist
    -
    soll;


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


/* TAGESABSCHLUSS ANZEIGE */

function abschlussAktualisieren() {

  const d =
    abschlussBerechnen();


  $("abschlussInhalt")
    .innerHTML = `

    <h3>
      Umsatz
    </h3>

    <table class="tabelle">

      <tbody>

        <tr>

          <td>
            Barumsatz
          </td>

          <td>
            ${euro(d.bar)}
          </td>

        </tr>


        <tr>

          <td>
            Kartenumsatz
          </td>

          <td>
            ${euro(d.karte)}
          </td>

        </tr>


        <tr class="gesamt">

          <td>
            Gesamtumsatz
          </td>

          <td>
            ${euro(d.daten.gesamt)}
          </td>

        </tr>

      </tbody>

    </table>


    <h3>
      Kassenprüfung
    </h3>


    <table class="tabelle">

      <tbody>

        <tr>
          <td>
            Anfangsbestand
          </td>

          <td>
            ${euro(d.start)}
          </td>
        </tr>


        <tr>
          <td>
            Einlagen
          </td>

          <td>
            ${euro(d.einlagen)}
          </td>
        </tr>


        <tr>
          <td>
            Entnahmen
          </td>

          <td>
            ${euro(d.entnahmen)}
          </td>
        </tr>


        <tr>
          <td>
            Ausgaben
          </td>

          <td>
            ${euro(d.ausgaben)}
          </td>
        </tr>


        <tr>
          <td>
            Soll-Kassenbestand
          </td>

          <td>
            ${euro(d.soll)}
          </td>
        </tr>


        <tr>
          <td>
            Ist-Kassenbestand
          </td>

          <td>
            ${euro(d.ist)}
          </td>
        </tr>


        <tr class="gesamt">

          <td>
            Differenz
          </td>

          <td>
            ${euro(d.diff)}
          </td>

        </tr>

      </tbody>

    </table>


    <h3>
      Verkaufte Getränke
    </h3>


    ${getraenkeTabelle(d.daten)}
  `;


  return d;

}


/* TAGESABSCHLUSS ÖFFNEN */

function abschlussOeffnen() {

  abschlussAktualisieren();


  $("abschlussDialog")
    .showModal();

}


/* TAGESABSCHLUSS SPEICHERN */

function abschlussSpeichern() {

  const d =
    abschlussAktualisieren();


  if (!d.v.length) {

    alert(
      "Keine offenen Verkäufe."
    );

    return;

  }


  const abschlussID =
    neueID();


  abschluesse.push(
    {
      id:
        abschlussID,

      datum:
        new Date()
          .toISOString(),

      veranstaltung:
        $("veranstaltungInput")
          .value
          .trim()
        ||
        "Tagesabschluss",

      bar:
        d.bar,

      karte:
        d.karte,

      gesamt:
        d.daten.gesamt,

      soll:
        d.soll,

      ist:
        d.ist,

      diff:
        d.diff
    }
  );


  d.v.forEach(
    v => {

      v.abgeschlossen =
        true;

      v.abschlussID =
        abschlussID;

    }
  );


  if (
    !speichern()
  ) {
    return;
  }


  $("abschlussDialog")
    .close();

}


/* EXPORT HTML */

function exportHTML(
  titel,
  inhalt
) {

  return `
<!DOCTYPE html>

<html lang="de">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="
    width=device-width,
    initial-scale=1
  "
>

<title>
  ${titel}
</title>

<style>

body {

  margin: 0;

  padding: 30px;

  background: #171717;

  color: white;

  font-family:
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

}

.blatt {

  max-width: 900px;

  margin: auto;

}

h1 {

  margin: 0;

  color: #efa834;

  font-size: 34px;

}

.untertitel {

  margin-top: 4px;

  margin-bottom: 28px;

  color: #b87931;

  font-weight: 800;

  letter-spacing: 1px;

}

h2 {

  color: #efa834;

  margin-top: 30px;

}

table {

  width: 100%;

  border-collapse: collapse;

  margin:
    14px
    0
    28px;

  background: #242424;

}

th {

  background: #efa834;

  color: #222;

}

th,
td {

  padding: 12px;

  border:
    1px
    solid
    #555;

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

  td {

    border-color: #aaa;

  }

}

</style>

</head>


<body>

<div class="blatt">

  <h1>
    RUDELBAR
  </h1>

  <div class="untertitel">
    DIE MOBILE KNEIPE
  </div>

  <h2>
    ${titel}
  </h2>

  ${inhalt}

</div>

</body>

</html>
`;

}


/* HTML TEILEN */

async function htmlTeilen(
  html,
  dateiname
) {

  const blob =
    new Blob(
      [html],
      {
        type:
          "text/html;charset=utf-8"
      }
    );


  const datei =
    new File(
      [blob],
      dateiname,
      {
        type:
          "text/html"
      }
    );


  if (
    navigator.share
    &&
    (
      !navigator.canShare
      ||
      navigator.canShare(
        {
          files:
            [datei]
        }
      )
    )
  ) {

    try {

      await navigator.share(
        {
          title:
            "Rudelbar",

          files:
            [datei]
        }
      );


      return;

    } catch (error) {

      if (
        error.name
        ===
        "AbortError"
      ) {

        return;

      }

    }

  }


  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      "a"
    );


  link.href =
    url;

  link.download =
    dateiname;


  document.body
    .appendChild(
      link
    );


  link.click();


  link.remove();


  setTimeout(
    () =>
      URL.revokeObjectURL(
        url
      ),
    1000
  );

}


/* TAGESÜBERSICHT TEILEN */

async function tagesuebersichtTeilen() {

  const daten =
    aggregieren(
      heuteVerkaeufe()
    );


  const zeilen =
    Object.entries(
      daten.map
    )

      .sort(
        (
          a,
          b
        ) =>
          b[1].anzahl
          -
          a[1].anzahl
      )

      .map(
        (
          [name, x]
        ) => `
        <tr>

          <td>
            ${esc(name)}
          </td>

          <td>
            ${x.anzahl}
          </td>

          <td>
            ${euro(x.umsatz)}
          </td>

        </tr>
        `
      )

      .join("");


  const html =
    exportHTML(
      "Tagesübersicht",
      `

      <p>
        Datum:
        ${
          new Date()
            .toLocaleDateString(
              "de-DE"
            )
        }
      </p>


      <h2>
        Verkaufte Getränke
      </h2>


      <table>

        <thead>

          <tr>

            <th>
              Getränk
            </th>

            <th>
              Stück
            </th>

            <th>
              Umsatz
            </th>

          </tr>

        </thead>


        <tbody>

          ${zeilen}


          <tr class="gesamt">

            <td>
              GESAMT
            </td>

            <td>
              ${daten.anzahl}
            </td>

            <td>
              ${euro(daten.gesamt)}
            </td>

          </tr>

        </tbody>

      </table>
      `
    );


  await htmlTeilen(
    html,
    "Rudelbar_Tagesuebersicht.html"
  );

}


/* TAGESABSCHLUSS TEILEN */

async function tagesabschlussTeilen() {

  const d =
    abschlussAktualisieren();


  const zeilen =
    Object.entries(
      d.daten.map
    )

      .sort(
        (
          a,
          b
        ) =>
          b[1].anzahl
          -
          a[1].anzahl
      )

      .map(
        (
          [name, x]
        ) => `
        <tr>

          <td>
            ${esc(name)}
          </td>

          <td>
            ${x.anzahl}
          </td>

          <td>
            ${euro(x.umsatz)}
          </td>

        </tr>
        `
      )

      .join("");


  const veranstaltung =
    $("veranstaltungInput")
      .value
      .trim()
    ||
    "Tagesabschluss";


  const html =
    exportHTML(
      "Tagesabschluss",
      `

      <p>

        <strong>
          Veranstaltung:
        </strong>

        ${esc(veranstaltung)}

      </p>


      <p>

        <strong>
          Datum:
        </strong>

        ${
          new Date()
            .toLocaleDateString(
              "de-DE"
            )
        }

      </p>


      <h2>
        Umsatz
      </h2>


      <table>

        <tbody>

          <tr>

            <td>
              Barumsatz
            </td>

            <td>
              ${euro(d.bar)}
            </td>

          </tr>


          <tr>

            <td>
              Kartenumsatz
            </td>

            <td>
              ${euro(d.karte)}
            </td>

          </tr>


          <tr class="gesamt">

            <td>
              Gesamtumsatz
            </td>

            <td>
              ${euro(d.daten.gesamt)}
            </td>

          </tr>

        </tbody>

      </table>


      <h2>
        Kassenprüfung
      </h2>


      <table>

        <tbody>

          <tr>

            <td>
              Anfangsbestand
            </td>

            <td>
              ${euro(d.start)}
            </td>

          </tr>


          <tr>

            <td>
              Einlagen
            </td>

            <td>
              ${euro(d.einlagen)}
            </td>

          </tr>


          <tr>

            <td>
              Entnahmen
            </td>

            <td>
              ${euro(d.entnahmen)}
            </td>

          </tr>


          <tr>

            <td>
              Ausgaben
            </td>

            <td>
              ${euro(d.ausgaben)}
            </td>

          </tr>


          <tr>

            <td>
              Soll-Kassenbestand
            </td>

            <td>
              ${euro(d.soll)}
            </td>

          </tr>


          <tr>

            <td>
              Ist-Kassenbestand
            </td>

            <td>
              ${euro(d.ist)}
            </td>

          </tr>


          <tr class="gesamt">

            <td>
              Differenz
            </td>

            <td>
              ${euro(d.diff)}
            </td>

          </tr>

        </tbody>

      </table>


      <h2>
        Verkaufte Getränke
      </h2>


      <table>

        <thead>

          <tr>

            <th>
              Getränk
            </th>

            <th>
              Stück
            </th>

            <th>
              Umsatz
            </th>

          </tr>

        </thead>


        <tbody>

          ${zeilen}


          <tr class="gesamt">

            <td>
              GESAMT
            </td>

            <td>
              ${d.daten.anzahl}
            </td>

            <td>
              ${euro(d.daten.gesamt)}
            </td>

          </tr>

        </tbody>

      </table>
      `
    );


  await htmlTeilen(
    html,
    "Rudelbar_Tagesabschluss.html"
  );

}


/* BUTTONS */

$("getraenkHinzufuegen")
  .onclick =
    neuesGetraenkOeffnen;


$("getraenkSpeichern")
  .onclick =
    getraenkSpeichern;


$("getraenkAbbrechen")
  .onclick =
    () =>
      $("getraenkDialog")
        .close();


$("barButton")
  .onclick =
    () =>
      verkaufAbschliessen(
        "Bar"
      );


$("karteButton")
  .onclick =
    () =>
      verkaufAbschliessen(
        "Karte"
      );


$("bestellungLoeschen")
  .onclick =
    () => {

      warenkorb =
        {};

      render();

    };


$("statistikBtn")
  .onclick =
    statistikOeffnen;


$("abschlussBtn")
  .onclick =
    abschlussOeffnen;


$("statistikSchliessen")
  .onclick =
    () =>
      $("statistikDialog")
        .close();


$("getraenkeTeilen")
  .onclick =
    tagesuebersichtTeilen;


$("abschlussSchliessen")
  .onclick =
    () =>
      $("abschlussDialog")
        .close();


$("abschlussSpeichern")
  .onclick =
    abschlussSpeichern;


$("abschlussTeilen")
  .onclick =
    tagesabschlussTeilen;


$("verkaufAbbrechen")
  .onclick =
    () =>
      $("verkaufDialog")
        .close();


$("verkaufSpeichern")
  .onclick =
    verkaufBearbeitungSpeichern;


$("verkaufLoeschen")
  .onclick =
    verkaufBearbeitungLoeschen;


/* ABSCHLUSS FELDER LIVE BERECHNEN */

[
  "anfangsbestandInput",
  "einlagenInput",
  "entnahmenInput",
  "ausgabenInput",
  "istKasseInput"
]
.forEach(
  id => {

    $(id).oninput =
      abschlussAktualisieren;

  }
);


/* START */

render();


/* SERVICE WORKER */

if (
  "serviceWorker"
  in
  navigator
) {

  navigator.serviceWorker
    .register(
      "service-worker.js"
    )
    .catch(
      error => {

        console.error(
          "Service Worker:",
          error
        );

      }
    );

}