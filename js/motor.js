/* =====================================================================
   MOTOR — iz parametara elementa izvlači listu delova
   Sve računice idu u milimetrima. Prikaz je u centimetrima.
   ===================================================================== */

/* Ivice pravougaonika:
   deo se crta kao dužina (vodoravno) × širina (uspravno)
   gore / dole  → ivica dužine = dužina
   levo / desno → ivica dužine = širina                                */
export const IVICE = ['gore', 'dole', 'levo', 'desno'];

/* Podrazumevano kantovanje po vrsti dela — samo vidne ivice */
export const KANT_PODRAZUMEVANO = {
  bocna:  ['dole'],          // prednja ivica bočne stranice
  dno:    ['dole'],          // prednja ivica
  plafon: ['dole'],          // prednja ivica
  vez:    ['dole'],
  polica: ['dole'],          // prednja ivica police
  krilo:  ['gore', 'dole', 'levo', 'desno'],
  leda:   [],                // leđa se ne kantuju
};

export const IME_DELA = {
  bocna:  'Bočna stranica',
  dno:    'Dno',
  plafon: 'Plafon',
  vez:    'Vez',
  polica: 'Polica',
  krilo:  'Krilo',
  leda:   'Leđa',
};

/* Koja grupa materijala se koristi za koji deo */
export const GRUPA_DELA = {
  bocna: 'korpus', dno: 'korpus', plafon: 'korpus', vez: 'korpus',
  polica: 'police', krilo: 'krila', leda: 'leda',
};

/* ---------------------------------------------------------------------
   generisiDelove(el)
   el = {
     tipSpoja: 1 | 2,
     visina, sirina, dubina,        // mm
     debljina,                      // mm, debljina korpusa
     brojElemenata,
     plafonVezovi: 'bez' | 'plafon' | 'vezovi',
     sirinaVeza,                    // mm
     brojPolica, dubinaPolice, uvlacenjePolice, zazorPolice,
     fiksnaPolica,
     tipKrila: 'bez' | 'jednodelno' | 'dvodelno',
     zazorKrila,                    // mm
     imaLeda,
     kant: { bocna: [...], dno: [...], ... }
   }
   --------------------------------------------------------------------- */
export function generisiDelove(el) {
  const t   = el.debljina;
  const V   = el.visina;
  const S   = el.sirina;
  const D   = el.dubina;
  const n   = Math.max(1, el.brojElemenata || 1);
  const zP  = el.zazorPolice ?? 1;
  const zK  = el.zazorKrila ?? 2.5;
  const uvl = el.uvlacenjePolice ?? 10;

  const delovi = [];
  const dodaj = (vrsta, duzina, sirina, kom) => {
    if (duzina <= 0 || sirina <= 0 || kom <= 0) return;
    delovi.push({
      vrsta,
      naziv: IME_DELA[vrsta],
      duzina: round1(duzina),
      sirina: round1(sirina),
      kom: kom * n,
      grupa: GRUPA_DELA[vrsta],
      kant: el.kant?.[vrsta] ?? KANT_PODRAZUMEVANO[vrsta] ?? [],
    });
  };

  /* --- korpus --- */
  if (el.tipSpoja === 2) {
    // dno ide celom širinom, bočne naležu na njega
    dodaj('dno',   S,         D, 1);
    dodaj('bocna', V - t,     D, 2);
  } else {
    // tip 1 — bočne pune visine, dno ulazi između njih
    dodaj('bocna', V,         D, 2);
    dodaj('dno',   S - 2 * t, D, 1);
  }

  /* --- gornje zatvaranje --- */
  if (el.plafonVezovi === 'plafon') {
    dodaj('plafon', S - 2 * t, D, 1);
  } else if (el.plafonVezovi === 'vezovi') {
    dodaj('vez', S - 2 * t, el.sirinaVeza ?? 80, 2);
  }

  /* --- police --- */
  if (el.brojPolica > 0) {
    const dubP = el.dubinaPolice ? el.dubinaPolice : D - uvl;
    dodaj('polica', S - 2 * t - zP, dubP, el.brojPolica);
  }

  /* --- krila --- */
  if (el.tipKrila === 'jednodelno') {
    dodaj('krilo', V - 2 * zK, S - 2 * zK, 1);
  } else if (el.tipKrila === 'dvodelno') {
    dodaj('krilo', V - 2 * zK, (S - 3 * zK) / 2, 2);
  }

  /* --- leđa --- */
  if (el.imaLeda) dodaj('leda', V, S, 1);

  return delovi;
}

/* ---------------------------------------------------------------------
   Kvadratura i kant metri
   --------------------------------------------------------------------- */
export function duzinaKanta(deo) {
  // gore i dole nose dužinu dela, levo i desno njegovu širinu
  let mm = 0;
  deo.kant.forEach(i => {
    mm += (i === 'gore' || i === 'dole') ? deo.duzina : deo.sirina;
  });
  return mm * deo.kom;
}

export function zbirniPodaci(delovi) {
  const povrsina = {};   // grupa -> m²
  const kant = {};       // grupa -> m
  let ukupnoKom = 0;

  delovi.forEach(d => {
    const m2 = (d.duzina / 1000) * (d.sirina / 1000) * d.kom;
    povrsina[d.grupa] = (povrsina[d.grupa] || 0) + m2;

    const m = duzinaKanta(d) / 1000;
    if (m > 0) {
      const gk = d.grupa === 'leda' ? 'korpus' : d.grupa;
      kant[gk] = (kant[gk] || 0) + m;
    }
    ukupnoKom += d.kom;
  });

  return { povrsina, kant, ukupnoKom };
}

/* ---------------------------------------------------------------------
   Automatski okovi iz elementa
   --------------------------------------------------------------------- */
export function autoOkovi(el) {
  const n = Math.max(1, el.brojElemenata || 1);
  const brojKrila = el.tipKrila === 'dvodelno' ? 2 : el.tipKrila === 'jednodelno' ? 1 : 0;
  return {
    sarka:        brojKrila * 2 * n,
    nosac_police: el.fiksnaPolica ? 0 : (el.brojPolica || 0) * 4 * n,
    nogica:       el.imaNogice ? 4 * n : 0,
  };
}

/* ---------------------------------------------------------------------
   Cena elementa
   materijali = { korpus:{cena}, police:{cena}, krila:{cena}, leda:{cena},
                  kantKorpus:{cena}, kantPolice:{cena}, kantKrila:{cena} }
   --------------------------------------------------------------------- */
export function izracunajCenu(delovi, materijali, rabat = 0) {
  const { povrsina, kant } = zbirniPodaci(delovi);
  const r = 1 - rabat;
  const stavke = [];
  let ukupno = 0;

  const KANT_ZA = { korpus: 'kantKorpus', police: 'kantPolice', krila: 'kantKrila' };

  Object.entries(povrsina).forEach(([grupa, m2]) => {
    const mat = materijali[grupa];
    if (!mat) return;
    const cena = mat.cena * r;
    const iznos = m2 * cena;
    ukupno += iznos;
    stavke.push({ tip: 'ploca', grupa, naziv: mat.naziv, kolicina: m2, jed: 'm²', cena, iznos });
  });

  Object.entries(kant).forEach(([grupa, m]) => {
    const mat = materijali[KANT_ZA[grupa]] || materijali.kantKorpus;
    if (!mat) return;
    const cena = mat.cena * r;
    const iznos = m * cena;
    ukupno += iznos;
    stavke.push({ tip: 'kant', grupa, naziv: mat.naziv, kolicina: m, jed: 'm', cena, iznos });
  });

  return { stavke, ukupno };
}

function round1(x) { return Math.round(x * 10) / 10; }
