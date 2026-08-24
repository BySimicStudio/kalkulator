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
     tipLeda: 'bez' | 'hdf' | 'puna', zazorLeda, debljinaLeda,
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

  /* --- police ---
     Puna leđa upadaju unutar korpusa i oduzimaju svoju debljinu od dubine
     police. HDF leđa naležu spolja, pa policu ne skraćuju.               */
  if (el.brojPolica > 0) {
    const tL = el.tipLeda === 'puna' ? (el.debljinaLeda ?? t) : 0;
    const dubP = el.dubinaPolice ? el.dubinaPolice : D - uvl - tL;
    dodaj('polica', S - 2 * t - zP, dubP, el.brojPolica);
  }

  /* --- krila --- */
  if (el.tipKrila === 'jednodelno') {
    dodaj('krilo', V - 2 * zK, S - 2 * zK, 1);
  } else if (el.tipKrila === 'dvodelno') {
    dodaj('krilo', V - 2 * zK, (S - 3 * zK) / 2, 2);
  }

  /* --- leđa ---
     HDF  → naležu preko cele zadnje strane, minus mali zazor sa svih strana
     puna → upadaju unutar korpusa između bočnih, dna i plafona            */
  if (el.tipLeda === 'hdf') {
    const zL = el.zazorLeda ?? 2;
    dodaj('leda', V - 2 * zL, S - 2 * zL, 1);
  } else if (el.tipLeda === 'puna') {
    const tL = el.debljinaLeda ?? t;
    const visinaLeda = el.tipSpoja === 2 ? V - tL : V - 2 * tL;
    dodaj('leda', visinaLeda, S - 2 * tL, 1);
  }

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

/* ---------------------------------------------------------------------
   RAD, LOGISTIKA I PROFIT — Faza 2
   Sve ostaje bez DOM-a, ulaz su obični brojevi.

   rad    = { sati, pomocniDana, spratovi, kilometri, danaSmestaj, marza, popust }
   profil = { satnica, pomocni_dnevnica, cena_sprat, dnevnica,
              km_besplatno, km_cena_bliza, km_cena_dalja,
              marza_default, buffer_avans }
   marza u radu je null kad projekat koristi podrazumevanu iz profila.
   --------------------------------------------------------------------- */
export function izracunajPut(kilometri, profil = {}) {
  const km = Number(kilometri) || 0;
  const besplatno = Number(profil.km_besplatno) || 0;
  // Naplaćuje se samo ono preko servisnog radijusa, i to povratno.
  const naplativi = Math.max(0, km - besplatno) * 2;
  const stopa = km > 80
    ? (Number(profil.km_cena_dalja) || 0)
    : (Number(profil.km_cena_bliza) || 0);
  return { naplativiKm: naplativi, stopa, iznos: naplativi * stopa };
}

export function izracunajProjekat({ materijal = 0, okovi = 0, rad = {}, profil = {} }) {
  const n = (x) => Number(x) || 0;

  const sati  = n(rad.sati);
  const marza = (rad.marza ?? profil.marza_default ?? 0) / 100;
  const popustProcenat = n(rad.popust) / 100;

  /* --- prihod --- */
  const prihodMaterijal = materijal * (1 + marza);
  const prihodOkovi     = okovi * (1 + marza);
  const iznosRada       = sati * n(profil.satnica);

  const iznosSpratova = n(rad.spratovi) * n(profil.cena_sprat);
  const put           = izracunajPut(rad.kilometri, profil);
  const iznosSmestaja = n(rad.danaSmestaj) * n(profil.dnevnica);
  const logistika     = iznosSpratova + put.iznos + iznosSmestaja;

  const prePopusta = prihodMaterijal + prihodOkovi + iznosRada + logistika;
  const popust     = prePopusta * popustProcenat;
  const prihod     = prePopusta - popust;

  /* --- trošak --- */
  const pomocni = n(rad.pomocniDana) * n(profil.pomocni_dnevnica);
  const trosak  = materijal + okovi + pomocni;

  /* --- šta zaista ostaje --- */
  const zarada = prihod - trosak;

  return {
    prihod: {
      materijal: prihodMaterijal,
      okovi: prihodOkovi,
      rad: iznosRada,
      spratovi: iznosSpratova,
      put: put.iznos,
      smestaj: iznosSmestaja,
      logistika,
      popust,
      ukupno: prihod,
    },
    trosak: { materijal, okovi, pomocni, ukupno: trosak },
    put,
    marzaProcenat: marza * 100,
    zarada,
    udeoZarade: prihod ? (zarada / prihod) * 100 : 0,
    efektivnaSatnica: sati ? zarada / sati : 0,
    avans: (materijal + okovi) * (1 + n(profil.buffer_avans) / 100),
  };
}

/* =====================================================================
   SEČENJE — guillotine raspored delova po tablama
   Čiste funkcije, bez DOM-a, kao i ostatak motora.

   Testera jede 5 mm po rezu (kerf), a od ivice table se odmiče 10 mm
   jer fabrička ivica nije prava.

   Tekstura: ploča sa šarom ne sme da se okreće — svi delovi idu u istom
   pravcu. Bela i jednobojna smeju, pa ih ima manje otpada.
   ===================================================================== */
export const KERF  = 5;
export const ODMAK = 10;
export const TABLA_PODRAZUMEVANA = { duzina: 2800, sirina: 2070 };

/* Slobodan pravougaonik se posle postavljanja dela cepa na dva.
   Bira se ono cepanje koje ostavlja veći upotrebljiv komad —
   dugačka uska traka je manje vredna od kvadratnijeg ostatka.        */
function pocepaj(s, w, h, kerf) {
  const desnoA = { x: s.x + w + kerf, y: s.y,             w: s.w - w - kerf, h };
  const doleA  = { x: s.x,            y: s.y + h + kerf,  w: s.w,            h: s.h - h - kerf };
  const desnoB = { x: s.x + w + kerf, y: s.y,             w: s.w - w - kerf, h: s.h };
  const doleB  = { x: s.x,            y: s.y + h + kerf,  w,                 h: s.h - h - kerf };

  const povrs = (r) => (r.w > 0 && r.h > 0) ? r.w * r.h : 0;
  const najveciA = Math.max(povrs(desnoA), povrs(doleA));
  const najveciB = Math.max(povrs(desnoB), povrs(doleB));

  return (najveciA >= najveciB ? [desnoA, doleA] : [desnoB, doleB])
    .filter(r => r.w > 0.001 && r.h > 0.001);
}

function postavi(tabla, komad, kerf, rotacija) {
  let izbor = null;

  tabla.slobodni.forEach((s, i) => {
    const varijante = rotacija
      ? [[komad.duzina, komad.sirina, false], [komad.sirina, komad.duzina, true]]
      : [[komad.duzina, komad.sirina, false]];

    varijante.forEach(([w, h, okrenut]) => {
      if (w > s.w + 0.001 || h > s.h + 0.001) return;
      /* Najtešnje ležište se meri kraćom preostalom stranicom, ne ostatkom
         površine: površina je ista za deo i za taj isti deo okrenut, pa bi
         po njoj rotacija nikad ne bi bila izabrana.                        */
      const kratki = Math.min(s.w - w, s.h - h);
      const dugi   = Math.max(s.w - w, s.h - h);
      if (!izbor || kratki < izbor.kratki - 0.001 ||
          (Math.abs(kratki - izbor.kratki) <= 0.001 && dugi < izbor.dugi)) {
        izbor = { i, s, w, h, okrenut, kratki, dugi };
      }
    });
  });

  if (!izbor) return false;

  const { i, s, w, h, okrenut } = izbor;
  tabla.delovi.push({
    vrsta: komad.vrsta, naziv: komad.naziv,
    x: s.x, y: s.y, duzina: w, sirina: h, okrenut,
  });
  tabla.slobodni.splice(i, 1, ...pocepaj(s, w, h, kerf));
  return true;
}

/* ---------- 1. slobodno pakovanje: deo ide u najtešnju rupu ---------- */
function slobodnoPakovanje(komadi, korisnaW, korisnaH, odmak, kerf, rotacija) {
  const table = [];
  komadi.forEach(k => {
    if (table.some(t => postavi(t, k, kerf, rotacija))) return;
    const nova = { slobodni: [{ x: odmak, y: odmak, w: korisnaW, h: korisnaH }], delovi: [] };
    table.push(nova);
    postavi(nova, k, kerf, rotacija);
  });
  return table;
}

/* ---------- 2. pakovanje po trakama ----------
   Panel testera ionako reže tako: prvo traka preko cele table, pa se iz
   trake vade komadi. Kod nameštaja se iste mere ponavljaju, pa se trake
   popune do kraja i otpada bude manje nego kad se rupe pune pohlepno.

   `kakoOkrenuti` bira šta postaje visina trake — duža ili kraća stranica
   dela. Obe varijante se probaju, pa se uzme ona sa manje tabli.        */
function trakePakovanje(komadi, korisnaW, korisnaH, odmak, kerf, rotacija, kakoOkrenuti) {
  const staje = (w, h) => w <= korisnaW + 0.001 && h <= korisnaH + 0.001;

  const parcad = komadi.map(k => {
    let w = k.duzina, h = k.sirina, okrenut = false;
    if (rotacija && kakoOkrenuti !== 'bez') {
      const zeljenaVisina = kakoOkrenuti === 'visoko'
        ? Math.max(k.duzina, k.sirina)
        : Math.min(k.duzina, k.sirina);
      if (Math.abs(h - zeljenaVisina) > 0.001) { w = k.sirina; h = k.duzina; okrenut = true; }
    }
    /* ako u željenom položaju ne staje na tablu, vrati ga kako je bio */
    if (!staje(w, h)) { w = k.duzina; h = k.sirina; okrenut = false; }
    return { ...k, w, h, okrenut };
  });

  parcad.sort((a, b) => b.h - a.h || b.w - a.w);

  const table = [];
  parcad.forEach(p => {
    for (const t of table) {
      const traka = t.trake.find(tr => tr.h >= p.h - 0.001 && tr.x + p.w <= odmak + korisnaW + 0.001);
      if (traka) {
        t.delovi.push({ vrsta: p.vrsta, naziv: p.naziv, x: traka.x, y: traka.y, duzina: p.w, sirina: p.h, okrenut: p.okrenut });
        traka.x += p.w + kerf;
        return;
      }
      if (t.visina + p.h <= odmak + korisnaH + 0.001) {
        const nova = { y: t.visina, h: p.h, x: odmak + p.w + kerf };
        t.trake.push(nova);
        t.delovi.push({ vrsta: p.vrsta, naziv: p.naziv, x: odmak, y: t.visina, duzina: p.w, sirina: p.h, okrenut: p.okrenut });
        t.visina += p.h + kerf;
        return;
      }
    }
    const t = { trake: [{ y: odmak, h: p.h, x: odmak + p.w + kerf }], delovi: [], visina: odmak + p.h + kerf, slobodni: [] };
    t.delovi.push({ vrsta: p.vrsta, naziv: p.naziv, x: odmak, y: odmak, duzina: p.w, sirina: p.h, okrenut: p.okrenut });
    table.push(t);
  });

  return table;
}

/* ---------------------------------------------------------------------
   spakujDelove(delovi, ploca, opcije)
   delovi — iz generisiDelove, sa poljem kom
   ploca  — { duzina, sirina } u mm

   Obe metode se puste da rade, pa se uzme ona koja potroši manje tabli.
   Ulazi su mali (desetine komada), pa je to jeftinije nego pogađati koja
   će biti bolja za dati posao.
   --------------------------------------------------------------------- */
export function spakujDelove(delovi, ploca = TABLA_PODRAZUMEVANA, opcije = {}) {
  const kerf     = opcije.kerf ?? KERF;
  const odmak    = opcije.odmak ?? ODMAK;
  const rotacija = opcije.rotacija ?? true;

  const korisnaW = ploca.duzina - 2 * odmak;
  const korisnaH = ploca.sirina - 2 * odmak;

  /* svaki komad zasebno, najveći prvi — mali posle lakše popune rupe */
  const svi = [];
  delovi.forEach(d => {
    for (let i = 0; i < d.kom; i++) {
      svi.push({ vrsta: d.vrsta, naziv: d.naziv, duzina: d.duzina, sirina: d.sirina });
    }
  });

  const staje = (w, h) => w <= korisnaW + 0.001 && h <= korisnaH + 0.001;
  const nestali = svi.filter(k => !staje(k.duzina, k.sirina) && !(rotacija && staje(k.sirina, k.duzina)));
  const komadi = svi.filter(k => !nestali.includes(k));

  komadi.sort((a, b) =>
    Math.max(b.duzina, b.sirina) - Math.max(a.duzina, a.sirina) ||
    b.duzina * b.sirina - a.duzina * a.sirina);

  const kandidati = [slobodnoPakovanje(komadi, korisnaW, korisnaH, odmak, kerf, rotacija)];
  (rotacija ? ['visoko', 'siroko'] : ['bez']).forEach(kako =>
    kandidati.push(trakePakovanje(komadi, korisnaW, korisnaH, odmak, kerf, rotacija, kako)));

  const table = kandidati.reduce((a, b) => (b.length < a.length ? b : a));

  const povrsinaDelova = komadi.reduce((s, k) => s + k.duzina * k.sirina, 0) / 1e6;
  const povrsinaTabli  = table.length * (ploca.duzina * ploca.sirina) / 1e6;

  return {
    table, nestali, ploca,
    brojTabli: table.length,
    m2Delova: povrsinaDelova,
    m2Tabli: povrsinaTabli,
    otpadProcenat: povrsinaTabli ? ((povrsinaTabli - povrsinaDelova) / povrsinaTabli) * 100 : 0,
  };
}

/* ---------------------------------------------------------------------
   planSecenja(stavke, rabat, opcije)
   stavke = [{ deo, materijal }] — delovi iz svih elemenata, svaki sa
   svojom pločom. Grupiše se po materijalu, jer se delovi istog
   materijala iz raznih elemenata seku sa istih tabli.

   Vraća i cenu po m² (kako DrvoLux naplaćuje kad zadrži višak) i cenu
   po celim tablama (kad viškove uzimaš sebi).
   --------------------------------------------------------------------- */
export function planSecenja(stavke, rabat = 0, opcije = {}) {
  const poMaterijalu = new Map();

  stavke.forEach(({ deo, materijal }) => {
    if (!materijal || materijal.vrsta !== 'ploca') return;
    const grupa = poMaterijalu.get(materijal.id) || { materijal, delovi: [] };
    grupa.delovi.push(deo);
    poMaterijalu.set(materijal.id, grupa);
  });

  return Array.from(poMaterijalu.values()).map(({ materijal, delovi }) => {
    const ploca = {
      duzina: materijal.ploca_duzina || TABLA_PODRAZUMEVANA.duzina,
      sirina: materijal.ploca_sirina || TABLA_PODRAZUMEVANA.sirina,
    };
    const raspored = spakujDelove(delovi, ploca, { ...opcije, rotacija: !materijal.tekstura });
    const cena = (materijal.cena || 0) * (1 - rabat);

    return {
      ...raspored,
      materijal,
      tekstura: !!materijal.tekstura,
      cenaPoM2:     raspored.m2Delova * cena,
      cenaPoTablama: raspored.m2Tabli * cena,
    };
  });
}
