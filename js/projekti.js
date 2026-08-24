/* =====================================================================
   PROJEKTI — kanban, kontejner projekta i pet podtabova:
   Elementi · Okovi · Rad · Cena · Zadaci
   ===================================================================== */

import { db, poruka, otvori, korisnik } from './app.js';
import { otvoriModal, zatvoriModal, vred, broj, esc, rsd } from './ui.js';
import {
  generisiDelove, zbirniPodaci, autoOkovi, izracunajCenu, izracunajProjekat,
  planSecenja,
} from './motor.js';
import { trenutniElement, postaviElement } from './element.js';

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const cm = (mm) => (Number(mm) / 10).toFixed(1);

const STATUSI = ['na_cekanju', 'u_izradi', 'zavrseno'];
const IME_STATUSA = { na_cekanju: 'Na čekanju', u_izradi: 'U izradi', zavrseno: 'Završeno' };
const KOLONA_ID   = { na_cekanju: 'cekanje', u_izradi: 'izrada', zavrseno: 'gotovo' };

/* Tok posla, redom kojim se dešava. `auto` znači da aplikacija upiše
   današnji datum kad posao pređe u taj status — ali samo ako je polje
   prazno, da nikad ne pregazi ono što je Filip sam upisao.              */
const ROKOVI = [
  { kolona: 'datum_merenja',     ime: 'Merenje' },
  { kolona: 'datum_porucivanja', ime: 'Poručivanje materijala' },
  { kolona: 'datum_pocetka',     ime: 'Početak izrade', auto: 'u_izradi' },
  { kolona: 'datum_montaze',     ime: 'Montaža' },
  { kolona: 'datum_zavrsetka',   ime: 'Završetak',      auto: 'zavrseno' },
];
const idRoka = (kolona) => 'pr-' + kolona.replace(/_/g, '-');

/* ------------------------------ stanje ------------------------------ */
let projekti = [];
let sviElementi = [];      // elementi svih projekata — kanban računa iz njih
let sviOkovi = [];         // ručno dodati okovi svih projekata
let materijali = [];
let konfiguracije = [];
let okovi = [];
let sabloni = [];
let profil = {};

let aktivan = null;        // otvoren projekat
let zadaci = [];
let podtab = 'elementi';

/* Veza između Element taba i projekta. null → element je brza računica. */
let veza = null;           // { projekat_id, element_id, naziv }

const rabat    = () => (Number(profil.rabat_dobavljac) || 0) / 100;
const okovPoId = (id) => okovi.find(o => o.id == id) || null;
const matPoId  = (id) => materijali.find(m => m.id == id) || null;

/* ===================================================================
   UČITAVANJE
   =================================================================== */
export async function ucitajProjekte() {
  const [p, e, o, m, k, ok, pr] = await Promise.all([
    db.from('projekti').select('*').order('redosled').order('id', { ascending: false }),
    db.from('projekat_elementi').select('*').order('redosled').order('id'),
    db.from('projekat_okovi').select('*').order('id'),
    db.from('materijali').select('*').order('naziv'),
    db.from('konfiguracije').select('*').order('naziv'),
    db.from('okovi').select('*').order('naziv'),
    db.from('profili').select('*').eq('id', korisnik().id).single(),
  ]);

  const greska = p.error || e.error;
  if (greska) {
    const kutija = $('#kanban-greska');
    kutija.innerHTML = `Tabele za projekte još ne postoje u bazi. Pokreni <code>schema-faza2.sql</code>
      u Supabase SQL editoru, pa osveži stranicu.
      <div class="red-sifra">${esc(greska.message)}</div>`;
    kutija.style.display = 'block';
    return;
  }
  $('#kanban-greska').style.display = 'none';

  projekti      = p.data || [];
  sviElementi   = e.data || [];
  sviOkovi      = o.data || [];
  materijali    = m.data || [];
  konfiguracije = k.data || [];
  okovi         = ok.data || [];
  profil        = pr.data || {};

  crtajKanban();

  /* projekat je možda otvoren — osveži i njega */
  if (aktivan) {
    const svez = projekti.find(x => x.id == aktivan.id);
    if (svez) { aktivan = svez; crtajProjekat(); }
  }
  crtajVezu();
}

async function ucitajSablone() {
  const { data } = await db.from('sabloni').select('*').order('naziv');
  sabloni = data || [];
}

/* ===================================================================
   RAČUN — jedan element projekta
   Ništa se ne pamti izračunato. Svaki prikaz ide kroz motor, pa element
   sam prati aktuelne cene iz šifarnika.
   =================================================================== */
function materijaliZa(konfiguracija_id) {
  const k = konfiguracije.find(x => x.id == konfiguracija_id);
  if (!k) return null;
  const korpus = matPoId(k.mat_korpus_id);
  const kantK  = matPoId(k.kant_korpus_id);
  return {
    korpus,
    police:     matPoId(k.mat_police_id) || korpus,
    krila:      matPoId(k.mat_krila_id)  || korpus,
    leda:       matPoId(k.mat_leda_id)   || korpus,
    kantKorpus: kantK,
    kantPolice: matPoId(k.kant_police_id) || kantK,
    kantKrila:  matPoId(k.kant_krila_id)  || kantK,
  };
}

function racunElementa(z) {
  const p      = z.parametri || {};
  const delovi = generisiDelove(p);
  const zbir   = zbirniPodaci(delovi);
  const mat    = materijaliZa(z.konfiguracija_id);
  const imaMat = !!(mat && mat.korpus);
  const cena   = imaMat ? izracunajCenu(delovi, mat, rabat()) : { stavke: [], ukupno: 0 };

  const ao = autoOkovi(p);
  const okovRedovi = [
    { tip: 'sarka',        ime: 'Šarke',         kom: ao.sarka,        okov: okovPoId(z.okov_sarka_id) },
    { tip: 'nosac_police', ime: 'Nosači polica', kom: ao.nosac_police, okov: okovPoId(z.okov_nosac_id) },
    { tip: 'nogica',       ime: 'Nogice',        kom: ao.nogica,       okov: okovPoId(z.okov_nogica_id) },
  ].filter(r => r.kom > 0);

  const cenaOkova = okovRedovi.reduce(
    (s, r) => s + (r.okov ? r.kom * (r.okov.cena_kom || 0) * (1 - rabat()) : 0), 0);

  return {
    delovi, zbir, imaMat, okovRedovi, cenaOkova,
    m2: Object.values(zbir.povrsina).reduce((a, b) => a + b, 0),
    stavke: cena.stavke,
    cenaMaterijala: cena.ukupno,
  };
}

/* ===================================================================
   RAČUN — ceo projekat
   =================================================================== */
function zbirProjekta(projekat) {
  const mojiElementi = sviElementi.filter(e => e.projekat_id == projekat.id);
  const mojiOkovi    = sviOkovi.filter(o => o.projekat_id == projekat.id);

  let materijal = 0, okoviAuto = 0, m2 = 0, komada = 0, bezCene = 0;
  const auto = new Map();          // okov_id → { okov, kom }

  mojiElementi.forEach(z => {
    const r = racunElementa(z);
    materijal += r.cenaMaterijala;
    okoviAuto += r.cenaOkova;
    m2        += r.m2;
    komada    += r.zbir.ukupnoKom;
    if (!r.imaMat) bezCene++;

    r.okovRedovi.forEach(red => {
      if (!red.okov || !red.okov.cena_kom) { bezCene++; if (!red.okov) return; }
      const bio = auto.get(red.okov.id) || { okov: red.okov, kom: 0 };
      bio.kom += red.kom;
      auto.set(red.okov.id, bio);
    });
  });

  const rucni = mojiOkovi.map(r => {
    const o = okovPoId(r.okov_id);
    return { red: r, okov: o, iznos: o ? r.kolicina * (o.cena_kom || 0) * (1 - rabat()) : 0 };
  });
  const okoviRucno = rucni.reduce((s, x) => s + x.iznos, 0);

  const racun = izracunajProjekat({
    materijal,
    okovi: okoviAuto + okoviRucno,
    rad: {
      sati:        projekat.sati,
      pomocniDana: projekat.pomocni_dana,
      spratovi:    projekat.spratovi,
      kilometri:   projekat.kilometri,
      danaSmestaj: projekat.dana_smestaj,
      marza:       projekat.marza,
      popust:      projekat.popust,
    },
    profil,
  });

  return {
    elementi: mojiElementi, materijal, okoviAuto, okoviRucno,
    m2, komada, bezCene, autoLista: Array.from(auto.values()), rucni, racun,
  };
}

/* ===================================================================
   KANBAN
   =================================================================== */
function crtajKanban() {
  STATUSI.forEach(s => {
    const lista = projekti.filter(p => p.status === s);
    $('#broj-' + KOLONA_ID[s]).textContent = lista.length;
    $('#kolona-' + KOLONA_ID[s]).innerHTML = lista.length
      ? lista.map(kartaProjekta).join('')
      : '<div class="kolona-prazna">Prazno</div>';
  });

  $$('.pkarta').forEach(k => {
    k.onclick = (e) => { if (!e.target.closest('.pkarta-pomeri')) otvoriProjekat(k.dataset.id); };
    k.ondragstart = (e) => { e.dataTransfer.setData('text/plain', k.dataset.id); k.classList.add('vuce'); };
    k.ondragend   = () => k.classList.remove('vuce');
  });
  $$('.pkarta-pomeri').forEach(b =>
    b.onclick = (e) => { e.stopPropagation(); promeniStatus(b.dataset.id, b.dataset.status); });
}

function kartaProjekta(p) {
  const z = zbirProjekta(p);
  const korak = sledeciKorak(p);
  const i = STATUSI.indexOf(p.status);
  const strelica = (smer, znak) => {
    const cilj = STATUSI[i + smer];
    return cilj
      ? `<button class="pkarta-pomeri" data-id="${p.id}" data-status="${cilj}"
                 title="Prebaci u ${IME_STATUSA[cilj]}">${znak}</button>`
      : '';
  };

  return `<article class="pkarta" data-id="${p.id}" draggable="true">
    <div class="pkarta-vrh">
      <div class="pkarta-naziv">${esc(p.naziv)}</div>
      <div class="pkarta-strelice">${strelica(-1, '←')}${strelica(1, '→')}</div>
    </div>
    ${p.klijent ? `<div class="pkarta-klijent">${esc(p.klijent)}</div>` : ''}
    <div class="pkarta-brojke">
      <span class="num">${z.elementi.length} el.</span>
      <span class="num">${z.m2.toFixed(2)} m²</span>
      ${korak ? `<span class="num ${korak.kasni ? 'lose' : ''}">${esc(korak.tekst)}</span>` : ''}
    </div>
    <div class="pkarta-cena">
      <span class="num">${rsd(z.racun.prihod.ukupno)} RSD</span>
      <b class="num ${z.racun.zarada >= 0 ? 'dobro' : 'lose'}">${rsd(z.racun.zarada)} tebi</b>
    </div>
  </article>`;
}

/* ===================================================================
   DATUMI
   Sve ide po lokalnom danu, ne po UTC — u avgustu smo dva sata ispred,
   pa bi toISOString() pre dva ujutru upisao jučerašnji datum.
   =================================================================== */
function danasISO() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Koliko dana od danas do datuma: negativno je prošlost, 0 je danas. */
function danaDo(iso) {
  if (!iso) return null;
  const [g, m, d] = iso.split('-').map(Number);
  const cilj = new Date(g, m - 1, d);
  const sad = new Date();
  const danas = new Date(sad.getFullYear(), sad.getMonth(), sad.getDate());
  return Math.round((cilj - danas) / 86400000);
}

function datum(iso) {
  if (!iso) return '';
  const [g, m, d] = iso.split('-').map(Number);
  return `${d}.${m}.`;
}

function datumPun(iso) {
  if (!iso) return '';
  const [g, m, d] = iso.split('-').map(Number);
  return `${d}.${m}.${g}.`;
}

const dan = (n) => (Math.abs(n) % 10 === 1 && Math.abs(n) % 100 !== 11) ? 'dan' : 'dana';

function kada(iso) {
  const n = danaDo(iso);
  if (n === null) return '';
  if (n === 0) return 'danas';
  if (n === 1) return 'sutra';
  if (n === -1) return 'juče';
  return n > 0 ? `za ${n} ${dan(n)}` : `pre ${-n} ${dan(n)}`;
}

/* Prvi datum koji tek dolazi — to je ono što stoji na kartici. */
function sledeciKorak(p) {
  const buduci = ROKOVI
    .filter(r => p[r.kolona] && danaDo(p[r.kolona]) >= 0)
    .sort((a, b) => p[a.kolona] < p[b.kolona] ? -1 : 1)[0];

  if (buduci) return { tekst: `${buduci.ime.toLowerCase()} ${datum(p[buduci.kolona])}`, kasni: false };

  if (p.rok && p.status !== 'zavrseno') {
    const n = danaDo(p.rok);
    return { tekst: `rok ${datum(p.rok)}`, kasni: n < 0 };
  }
  if (p.datum_zavrsetka) return { tekst: `gotovo ${datum(p.datum_zavrsetka)}`, kasni: false };
  return null;
}

async function promeniStatus(id, status) {
  const p = projekti.find(x => x.id == id);
  const izmene = { status };

  /* Datum početka i završetka se upisuju sami — ali ne diraju ono
     što je već upisano, ni kad se posao vrati u raniju kolonu.        */
  ROKOVI.filter(r => r.auto === status).forEach(r => {
    if (!p || !p[r.kolona]) izmene[r.kolona] = danasISO();
  });

  const { error } = await db.from('projekti').update(izmene).eq('id', id);
  if (error) return poruka($('#projekti-poruka'), 'Nije prebačeno: ' + error.message, 'gre');
  await ucitajProjekte();
}

/* ===================================================================
   FORMA PROJEKTA
   =================================================================== */
function formaProjekta(p = null) {
  const je = p || { status: 'na_cekanju' };
  otvoriModal(p ? 'Podaci projekta' : 'Novi projekat', `
    <div class="field">
      <label for="pj-naziv">Naziv posla</label>
      <input type="text" id="pj-naziv" value="${esc(je.naziv || '')}" placeholder="npr. Kuhinja Mirijevo">
    </div>
    <div class="field-grid">
      <div class="field">
        <label for="pj-klijent">Klijent</label>
        <input type="text" id="pj-klijent" value="${esc(je.klijent || '')}">
      </div>
      <div class="field">
        <label for="pj-telefon">Telefon</label>
        <input type="text" id="pj-telefon" value="${esc(je.telefon || '')}">
      </div>
    </div>
    <div class="field">
      <label for="pj-adresa">Adresa montaže</label>
      <input type="text" id="pj-adresa" value="${esc(je.adresa || '')}">
    </div>
    <div class="field-grid">
      <div class="field">
        <label for="pj-status">Status</label>
        <select id="pj-status">
          ${STATUSI.map(s => `<option value="${s}" ${je.status === s ? 'selected' : ''}>${IME_STATUSA[s]}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="pj-rok">Rok</label>
        <input type="date" id="pj-rok" value="${je.rok || ''}">
      </div>
    </div>
    <div class="field">
      <label for="pj-napomena">Napomena</label>
      <input type="text" id="pj-napomena" value="${esc(je.napomena || '')}">
    </div>
  `, async () => {
    const naziv = vred('pj-naziv');
    if (!naziv) return poruka($('#projekti-poruka'), 'Projekat mora imati naziv.', 'gre');

    const red = {
      naziv,
      klijent:  vred('pj-klijent') || null,
      telefon:  vred('pj-telefon') || null,
      adresa:   vred('pj-adresa') || null,
      status:   vred('pj-status'),
      rok:      vred('pj-rok') || null,
      napomena: vred('pj-napomena') || null,
    };
    if (p) red.id = p.id;

    const { data, error } = await db.from('projekti').upsert(red).select().single();
    if (error) return poruka($('#projekti-poruka'), 'Nije sačuvano: ' + error.message, 'gre');
    zatvoriModal();
    await ucitajProjekte();
    if (!p && data) otvoriProjekat(data.id);
  });
}

/* ===================================================================
   OTVARANJE PROJEKTA
   =================================================================== */
export async function otvoriProjekat(id) {
  const p = projekti.find(x => x.id == id);
  if (!p) return;
  aktivan = p;

  const { data } = await db.from('projekat_zadaci')
    .select('*').eq('projekat_id', p.id).order('gotov').order('redosled').order('id');
  zadaci = data || [];

  otvori('projekat');
  crtajProjekat();
}

function crtajProjekat() {
  if (!aktivan) return;
  const z = zbirProjekta(aktivan);

  $('#page-sub').textContent = IME_STATUSA[aktivan.status] || '';
  $('#pr-naziv').textContent = aktivan.naziv;
  const korak = sledeciKorak(aktivan);
  $('#pr-sub').textContent = [
    aktivan.klijent, aktivan.adresa, aktivan.telefon,
    korak ? korak.tekst : null,
  ].filter(Boolean).join(' · ');
  $('#pr-status').value = aktivan.status;

  $('#pt-broj-elementi').textContent = z.elementi.length;
  $('#pt-broj-okovi').textContent    = z.autoLista.length + z.rucni.length;
  $('#pt-broj-zadaci').textContent   = zadaci.filter(x => !x.gotov).length;

  crtajElemente(z);
  crtajOkove(z);
  crtajRad();
  crtajRokove();
  crtajCenu(z);
  crtajZadatke();
  prikaziPodtab(podtab);
}

function prikaziPodtab(ime) {
  podtab = ime;
  $$('.podstrana').forEach(v => v.style.display = 'none');
  const v = $('#pod-' + ime);
  if (v) v.style.display = 'block';
  $$('.podtab').forEach(b => b.classList.toggle('active', b.dataset.podtab === ime));
}

/* ===================================================================
   PODTAB — ELEMENTI
   =================================================================== */
function crtajElemente(z) {
  crtajTable(z);

  if (!z.elementi.length) {
    $('#pel-prazno').style.display = 'block';
    $('#pel-tabela-okvir').style.display = 'none';
    return;
  }
  $('#pel-prazno').style.display = 'none';
  $('#pel-tabela-okvir').style.display = 'block';

  $('#pel-telo').innerHTML = z.elementi.map(e => {
    const r = racunElementa(e);
    const p = e.parametri || {};
    const kon = konfiguracije.find(k => k.id == e.konfiguracija_id);
    return `<tr>
      <td>
        <div class="red-naziv">${esc(e.naziv)}</div>
        <div class="red-sifra">${kon ? esc(kon.naziv) : 'bez konfiguracije'}${e.prostorija ? ' · ' + esc(e.prostorija) : ''}</div>
      </td>
      <td class="num">${cm(p.visina)} × ${cm(p.sirina)} × ${cm(p.dubina)}</td>
      <td class="num r">${p.brojElemenata || 1}</td>
      <td class="num r">${r.m2.toFixed(3)}</td>
      <td class="num r">${r.imaMat
        ? rsd(r.cenaMaterijala + r.cenaOkova)
        : '<span style="color:var(--alert)">nema cene</span>'}</td>
      <td class="r"><div class="akcije">
        <button class="ikona-btn" data-el-izmeni="${e.id}">Izmeni</button>
        <button class="ikona-btn" data-el-kopija="${e.id}">Kopiraj</button>
        <button class="ikona-btn opasno" data-el-brisi="${e.id}">Obriši</button>
      </div></td>
    </tr>`;
  }).join('');

  const telo = $('#pel-telo');
  telo.querySelectorAll('[data-el-izmeni]').forEach(b => b.onclick = () => urediUElementu(b.dataset.elIzmeni));
  telo.querySelectorAll('[data-el-kopija]').forEach(b => b.onclick = () => kopirajElement(b.dataset.elKopija));
  telo.querySelectorAll('[data-el-brisi]').forEach(b => b.onclick = () => obrisiElement(b.dataset.elBrisi));
}

/* ---------- table i sečenje ----------
   Delovi svih elemenata se skupe i grupišu po materijalu, jer se isti
   materijal iz raznih elemenata seče sa istih tabli. Cena po m² ostaje
   ono što DrvoLux naplati kad zadrži višak; cena celih tabli je koliko
   bi bilo da viškove uzimaš sebi.                                       */
function parametriSecenja() {
  return {
    kerf:       profil.kerf ?? undefined,
    odmak:      profil.odmak_table ?? undefined,
    minOstatak: profil.min_ostatak ?? undefined,
  };
}

function planZaProjekat(z) {
  const stavke = [];
  z.elementi.forEach(e => {
    const mat = materijaliZa(e.konfiguracija_id);
    if (!mat) return;
    generisiDelove(e.parametri || {}).forEach(deo => {
      const m = mat[deo.grupa];
      if (m) stavke.push({ deo, materijal: m, element: e.naziv });
    });
  });
  return planSecenja(stavke, rabat(), parametriSecenja());
}

function crtajTable(z) {
  const plan = planZaProjekat(z);
  const kutija = $('#pel-table');

  if (!plan.length) { kutija.style.display = 'none'; return; }
  kutija.style.display = 'block';

  $('#pel-table-telo').innerHTML = plan.map((p, i) => `<tr>
    <td>
      <div class="red-naziv">${esc(p.materijal.naziv)}</div>
      <div class="red-sifra">${p.ploca.duzina}×${p.ploca.sirina}${p.tekstura ? ' · tekstura' : ''}</div>
    </td>
    <td class="num r">${p.m2Delova.toFixed(2)}</td>
    <td class="num r">${p.brojTabli}</td>
    <td class="num r ${p.otpadProcenat > 30 ? 'lose' : ''}">${p.otpadProcenat.toFixed(0)}%</td>
    <td class="num r">${rsd(p.cenaPoM2)}</td>
    <td class="num r" style="color:var(--ink-2)">${rsd(p.cenaPoTablama)}</td>
    <td class="r"><button class="ikona-btn" data-raspored="${i}">Raspored</button></td>
  </tr>`).join('');

  const poM2 = plan.reduce((s, p) => s + p.cenaPoM2, 0);
  const poTablama = plan.reduce((s, p) => s + p.cenaPoTablama, 0);
  const nestali = plan.reduce((s, p) => s + p.nestali.length, 0);
  const ostataka = plan.reduce((s, p) => s + p.ostaci.length, 0);
  const m2Ostataka = plan.reduce((s, p) => s + p.m2Ostataka, 0);
  const m2Skarta = plan.reduce((s, p) => s + p.m2Skarta, 0);

  $('#pel-table-zbir').innerHTML =
    `<div class="stav"><span>Plaćaš po m² — DrvoLux zadrži višak</span><b class="num">${rsd(poM2)} RSD</b></div>
     <div class="stav"><span>Cele table — višak ostaje tebi</span><b class="num">${rsd(poTablama)} RSD</b></div>
     <div class="stav jaka"><span>Razlika</span><b class="num">${rsd(poTablama - poM2)} RSD</b></div>
     <div class="stav"><span>Upotrebljiv višak — ${ostataka} ${ostataka === 1 ? 'komad' : 'komada'} preko ${profil.min_ostatak ?? 300} mm</span><b class="num">${m2Ostataka.toFixed(2)} m²</b></div>
     <div class="stav"><span>Škart</span><b class="num">${m2Skarta.toFixed(2)} m²</b></div>
     <div class="hint" style="margin-top:8px">U cenu projekta ulazi iznos po m². Rez ${profil.kerf ?? 5} mm, odmak ${profil.odmak_table ?? 10} mm — menja se u Podešavanjima.</div>
     ${nestali ? `<div class="poruka vidljiva gre" style="margin-top:10px">${nestali} ${nestali === 1 ? 'deo je veći' : 'delova je veće'} od same table — proveri dimenzije elementa.</div>` : ''}`;

  $('#pel-table-telo').querySelectorAll('[data-raspored]').forEach(b =>
    b.onclick = () => prikaziRaspored(plan[b.dataset.raspored]));
}

/* Crtež table sa razmeštenim delovima — mere su u milimetrima, pa je
   viewBox baš tabla i sve se skalira samo.                             */
function crtezTable(tabla, ploca, redni) {
  const delovi = tabla.delovi.map(d => {
    const malo = Math.min(d.duzina, d.sirina) < 260;
    return `<g>
      <rect x="${d.x}" y="${d.y}" width="${d.duzina}" height="${d.sirina}"
            fill="var(--blueprint-soft)" stroke="var(--blueprint)" stroke-width="4"/>
      ${malo ? '' : `<text x="${d.x + d.duzina / 2}" y="${d.y + d.sirina / 2 - 10}"
            text-anchor="middle" font-family="var(--font-mono)" font-size="72" fill="var(--blueprint)">
        ${(d.duzina / 10).toFixed(1)}×${(d.sirina / 10).toFixed(1)}</text>`}
      ${malo ? '' : `<text x="${d.x + d.duzina / 2}" y="${d.y + d.sirina / 2 + 62}"
            text-anchor="middle" font-family="var(--font-ui)" font-size="58" fill="var(--ink-2)">
        ${esc(d.naziv)}${d.okrenut ? ' ↻' : ''}</text>`}
    </g>`;
  }).join('');

  return `<div class="tabla-crtez">
    <div class="tabla-glava">
      <span>Tabla ${redni + 1}</span>
      <span class="num">${ploca.duzina} × ${ploca.sirina} · ${tabla.delovi.length} kom</span>
    </div>
    <svg viewBox="0 0 ${ploca.duzina} ${ploca.sirina}" width="100%" role="img"
         aria-label="Raspored delova na tabli ${redni + 1}">
      <rect x="0" y="0" width="${ploca.duzina}" height="${ploca.sirina}"
            fill="var(--surface-2)" stroke="var(--line)" stroke-width="6"/>
      ${delovi}
    </svg>
  </div>`;
}

function prikaziRaspored(p) {
  otvoriModal(`Raspored — ${p.materijal.naziv}`, `
    <div class="stav"><span>Tabli</span><b class="num">${p.brojTabli} × ${p.ploca.duzina}×${p.ploca.sirina}</b></div>
    <div class="stav"><span>Iskorišćeno</span><b class="num">${p.m2Delova.toFixed(2)} m² od ${p.m2Tabli.toFixed(2)} m²</b></div>
    <div class="stav"><span>Otpad</span><b class="num">${p.otpadProcenat.toFixed(0)}%</b></div>
    ${p.tekstura ? '<div class="hint" style="margin-top:8px">Ploča ima teksturu — delovi se ne okreću, pa otpada bude više.</div>' : ''}
    <div class="pod-sekcija">Table</div>
    ${p.table.map((t, i) => crtezTable(t, p.ploca, i)).join('')}
    <div class="hint">Rez testere 5 mm, odmak od ivice 10 mm. Delovi označeni sa ↻ su okrenuti.</div>
  `, null);
}

/* ---------- izvoz krojne liste ----------
   CSV je tačka-zarez razdvojen i sa BOM-om, jer ga tako i Excel na
   srpskom i optimizatori (OptiCut, CutRite, Ardis) otvore bez pitanja.
   Kolone su standardna lista delova: mera, količina, materijal, kant.  */
function redoviKrojneListe(z) {
  const redovi = [];
  z.elementi.forEach(e => {
    const mat = materijaliZa(e.konfiguracija_id);
    generisiDelove(e.parametri || {}).forEach(d => {
      const m = mat ? mat[d.grupa] : null;
      redovi.push({
        element: e.naziv,
        naziv: d.naziv,
        duzina: d.duzina,
        sirina: d.sirina,
        kom: d.kom,
        materijal: m ? m.naziv : 'nije izabran',
        tekstura: m && m.tekstura ? 'da' : 'ne',
        kant: d.kant,
      });
    });
  });
  return redovi;
}

function izveziCSV() {
  if (!aktivan) return;
  const z = zbirProjekta(aktivan);
  const redovi = redoviKrojneListe(z);
  if (!redovi.length) return poruka($('#pr-poruka'), 'Projekat nema nijedan element.', 'gre');

  const ivica = (r, i) => r.kant.includes(i) ? 1 : 0;
  const zaglavlje = ['Materijal', 'Deo', 'Element', 'Duzina', 'Sirina', 'Kolicina',
                     'Tekstura', 'Kant gore', 'Kant dole', 'Kant levo', 'Kant desno'];

  const linije = [zaglavlje.join(';')].concat(redovi.map(r => [
    r.materijal, r.naziv, r.element, r.duzina, r.sirina, r.kom, r.tekstura,
    ivica(r, 'gore'), ivica(r, 'dole'), ivica(r, 'levo'), ivica(r, 'desno'),
  ].map(v => (typeof v === 'string' && /[;"\n]/.test(v)) ? `"${v.replace(/"/g, '""')}"` : v).join(';')));

  preuzmi(`krojna-lista-${imeFajla(aktivan.naziv)}.csv`,
          '﻿' + linije.join('\r\n'), 'text/csv;charset=utf-8');
  poruka($('#pr-poruka'), `Krojna lista izvezena — ${redovi.length} stavki.`, 'ok');
}

function imeFajla(s) {
  return String(s).toLowerCase()
    .replace(/[čćĉ]/g, 'c').replace(/[šŝ]/g, 's').replace(/[žŵ]/g, 'z').replace(/đ/g, 'dj')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'projekat';
}

function preuzmi(ime, sadrzaj, tip) {
  const veza = document.createElement('a');
  veza.href = URL.createObjectURL(new Blob([sadrzaj], { type: tip }));
  veza.download = ime;
  document.body.appendChild(veza);
  veza.click();
  document.body.removeChild(veza);
  setTimeout(() => URL.revokeObjectURL(veza.href), 1000);
}

/* PDF ide kroz štampu pregledača — „Sačuvaj kao PDF" u dijalogu.
   Bez biblioteke i bez build koraka, kako i treba ovom projektu.       */
function stampajKrojnuListu() {
  if (!aktivan) return;
  const z = zbirProjekta(aktivan);
  const plan = planZaProjekat(z);
  const redovi = redoviKrojneListe(z);
  if (!redovi.length) return poruka($('#pr-poruka'), 'Projekat nema nijedan element.', 'gre');

  const kantOpis = (kant) => kant.length
    ? kant.map(i => ({ gore: 'G', dole: 'D', levo: 'L', desno: 'R' }[i])).join(' ')
    : '—';

  const poMaterijalu = {};
  redovi.forEach(r => (poMaterijalu[r.materijal] = poMaterijalu[r.materijal] || []).push(r));

  $('#stampa').innerHTML = `
    <div class="stampa-glava">
      <div>
        <div class="stampa-firma">${esc(profil.naziv_firme || 'By Simic Studio')}</div>
        <div class="stampa-sitno">${esc(profil.telefon || '')} ${esc(profil.email_kontakt || '')}</div>
      </div>
      <div class="stampa-desno">
        <div class="stampa-naslov">Krojna lista</div>
        <div class="stampa-sitno">${esc(aktivan.naziv)}${aktivan.klijent ? ' · ' + esc(aktivan.klijent) : ''}</div>
        <div class="stampa-sitno num">${new Date().toLocaleDateString('sr-RS')}</div>
      </div>
    </div>

    <div class="stampa-uslovi num">
      Rez ${profil.kerf ?? 5} mm · odmak od ivice ${profil.odmak_table ?? 10} mm ·
      najmanji ostatak ${profil.min_ostatak ?? 300} mm
    </div>

    ${Object.entries(poMaterijalu).map(([mat, lista]) => {
      const p = plan.find(x => x.materijal.naziv === mat);
      return `<section class="stampa-blok">
        <h3>${esc(mat)}${p ? ` — ${p.brojTabli} × ${p.ploca.duzina}×${p.ploca.sirina}${p.tekstura ? ', tekstura' : ''}` : ''}</h3>
        <table class="stampa-tabela">
          <thead><tr><th>Deo</th><th>Element</th><th class="r">Dužina</th><th class="r">Širina</th><th class="r">Kom</th><th>Kant</th></tr></thead>
          <tbody>${lista.map(r => `<tr>
            <td>${esc(r.naziv)}</td><td>${esc(r.element)}</td>
            <td class="r num">${r.duzina}</td><td class="r num">${r.sirina}</td>
            <td class="r num">${r.kom}</td><td class="num">${kantOpis(r.kant)}</td>
          </tr>`).join('')}</tbody>
        </table>
        ${p ? p.table.map((t, i) => crtezTable(t, p.ploca, i)).join('') : ''}
      </section>`;
    }).join('')}

    <div class="stampa-sitno">G gore · D dole · L levo · R desno. Delovi sa ↻ su okrenuti u odnosu na unetu meru.</div>`;

  document.body.classList.add('stampanje');
  const ocisti = () => { document.body.classList.remove('stampanje'); window.removeEventListener('afterprint', ocisti); };
  window.addEventListener('afterprint', ocisti);
  window.print();
}

/* Uređivanje ide kroz Element tab — nema smisla praviti drugu formu za
   istu stvar. Traka na vrhu pamti odakle je element došao.             */
function urediUElementu(id) {
  const e = sviElementi.find(x => x.id == id);
  if (!e) return;
  veza = { projekat_id: e.projekat_id, element_id: e.id, naziv: e.naziv };
  postaviElement(e);
  crtajVezu();
  otvori('element');
}

function crtajVezu() {
  const traka = $('#veza-traka');
  if (!traka) return;
  if (!veza) { traka.style.display = 'none'; return; }
  const p = projekti.find(x => x.id == veza.projekat_id);
  traka.style.display = 'flex';
  $('#veza-tekst').innerHTML = veza.element_id
    ? `Uređuješ <b>${esc(veza.naziv)}</b> — projekat <b>${esc(p?.naziv || '')}</b>`
    : `Novi element za projekat <b>${esc(p?.naziv || '')}</b>`;
  $('#veza-sacuvaj').style.display = veza.element_id ? '' : 'none';
}

async function kopirajElement(id) {
  const e = sviElementi.find(x => x.id == id);
  if (!e) return;
  const kopija = {
    projekat_id: e.projekat_id,
    naziv: e.naziv + ' — kopija',
    prostorija: e.prostorija,
    konfiguracija_id: e.konfiguracija_id,
    okov_sarka_id: e.okov_sarka_id,
    okov_nosac_id: e.okov_nosac_id,
    okov_nogica_id: e.okov_nogica_id,
    parametri: e.parametri,
  };
  const { error } = await db.from('projekat_elementi').insert(kopija);
  if (error) return poruka($('#pr-poruka'), 'Nije kopirano: ' + error.message, 'gre');
  await ucitajProjekte();
  poruka($('#pr-poruka'), 'Element kopiran.', 'ok');
}

async function obrisiElement(id) {
  if (!confirm('Obrisati ovaj element iz projekta?')) return;
  const { error } = await db.from('projekat_elementi').delete().eq('id', id);
  if (error) return poruka($('#pr-poruka'), 'Nije obrisano: ' + error.message, 'gre');
  if (veza && veza.element_id == id) { veza = null; crtajVezu(); }
  await ucitajProjekte();
}

/* ---------- Element tab → projekat ---------- */
async function dodajUProjekat() {
  if (!projekti.length) {
    return poruka($('#el-poruka'), 'Prvo napravi projekat na tabu Projekti.', 'gre');
  }
  const z = trenutniElement();
  const predlozen = veza?.projekat_id ?? aktivan?.id ?? projekti[0].id;

  otvoriModal('Dodaj element u projekat', `
    <div class="field">
      <label for="dp-projekat">Projekat</label>
      <select id="dp-projekat">
        ${projekti.map(p => `<option value="${p.id}" ${p.id == predlozen ? 'selected' : ''}>${esc(p.naziv)}</option>`).join('')}
      </select>
    </div>
    <div class="field-grid">
      <div class="field">
        <label for="dp-naziv">Naziv elementa</label>
        <input type="text" id="dp-naziv" value="Element ${cm(z.parametri.sirina)}" placeholder="npr. Donji element 60">
      </div>
      <div class="field">
        <label for="dp-prostorija">Prostorija</label>
        <input type="text" id="dp-prostorija" placeholder="npr. Kuhinja">
      </div>
    </div>
    <div class="hint">Pamte se parametri, ne iznos — element uvek računa po aktuelnom cenovniku.</div>
  `, async () => {
    const red = {
      projekat_id: Number(vred('dp-projekat')),
      naziv: vred('dp-naziv') || 'Element',
      prostorija: vred('dp-prostorija') || null,
      ...z,
    };
    const { error } = await db.from('projekat_elementi').insert(red);
    if (error) return poruka($('#el-poruka'), 'Nije dodato: ' + error.message, 'gre');
    zatvoriModal();
    veza = null;
    await ucitajProjekte();
    poruka($('#el-poruka'), 'Element dodat u projekat.', 'ok');
  }, 'Dodaj');
}

async function sacuvajVezu() {
  if (!veza || !veza.element_id) return;
  const { error } = await db.from('projekat_elementi').update(trenutniElement()).eq('id', veza.element_id);
  if (error) return poruka($('#el-poruka'), 'Nije sačuvano: ' + error.message, 'gre');

  const nazad = veza.projekat_id;
  veza = null;
  crtajVezu();
  await ucitajProjekte();
  otvoriProjekat(nazad);
  poruka($('#pr-poruka'), 'Element izmenjen.', 'ok');
}

/* ---------- šabloni ---------- */
async function sacuvajKaoSablon() {
  const z = trenutniElement();
  otvoriModal('Sačuvaj kao šablon', `
    <div class="field">
      <label for="sb-naziv">Naziv šablona</label>
      <input type="text" id="sb-naziv" placeholder="npr. Donji element 60">
      <div class="hint">Šablon je zapamćen unos elementa — ubacuješ ga u bilo koji projekat.</div>
    </div>
  `, async () => {
    const naziv = vred('sb-naziv');
    if (!naziv) return poruka($('#el-poruka'), 'Šablon mora imati naziv.', 'gre');
    const { error } = await db.from('sabloni').insert({ naziv, ...z });
    if (error) return poruka($('#el-poruka'), 'Nije sačuvano: ' + error.message, 'gre');
    zatvoriModal();
    await ucitajSablone();
    poruka($('#el-poruka'), 'Šablon sačuvan.', 'ok');
  });
}

async function izSablona() {
  if (!aktivan) return;
  await ucitajSablone();

  if (!sabloni.length) {
    return otvoriModal('Šabloni', `<div class="nema-cene">Nema nijednog šablona.
      Podesi element na tabu Element, pa klikni „Sačuvaj kao šablon”.</div>`, null);
  }

  otvoriModal('Ubaci iz šablona', `
    <div class="field">
      <label for="sb-izbor">Šablon</label>
      <select id="sb-izbor">${sabloni.map(s => `<option value="${s.id}">${esc(s.naziv)}</option>`).join('')}</select>
    </div>
    <div class="field-grid">
      <div class="field">
        <label for="sb-ime">Naziv u projektu</label>
        <input type="text" id="sb-ime" placeholder="prazno = naziv šablona">
      </div>
      <div class="field">
        <label for="sb-prostorija">Prostorija</label>
        <input type="text" id="sb-prostorija">
      </div>
    </div>
    <div class="pod-sekcija">Sačuvani šabloni</div>
    <div class="lista-sitno">
      ${sabloni.map(s => `<div class="lista-red">
        <span>${esc(s.naziv)}</span>
        <button class="ikona-btn opasno" data-sb-brisi="${s.id}">Obriši</button>
      </div>`).join('')}
    </div>
  `, async () => {
    const s = sabloni.find(x => x.id == vred('sb-izbor'));
    if (!s) return;
    const { error } = await db.from('projekat_elementi').insert({
      projekat_id: aktivan.id,
      naziv: vred('sb-ime') || s.naziv,
      prostorija: vred('sb-prostorija') || null,
      konfiguracija_id: s.konfiguracija_id,
      okov_sarka_id: s.okov_sarka_id,
      okov_nosac_id: s.okov_nosac_id,
      okov_nogica_id: s.okov_nogica_id,
      parametri: s.parametri,
    });
    if (error) return poruka($('#pr-poruka'), 'Nije ubačeno: ' + error.message, 'gre');
    zatvoriModal();
    await ucitajProjekte();
    poruka($('#pr-poruka'), 'Element ubačen iz šablona.', 'ok');
  }, 'Ubaci');

  $$('[data-sb-brisi]').forEach(b => b.onclick = async () => {
    if (!confirm('Obrisati šablon?')) return;
    await db.from('sabloni').delete().eq('id', b.dataset.sbBrisi);
    zatvoriModal();
    izSablona();
  });
}

/* Novi prazan element — otvara Element tab vezan za ovaj projekat */
function noviElementUProjektu() {
  if (!aktivan) return;
  veza = { projekat_id: aktivan.id, element_id: null, naziv: '' };
  crtajVezu();
  otvori('element');
  poruka($('#el-poruka'), 'Podesi element, pa klikni „Dodaj u projekat”.', 'rad');
}

/* ===================================================================
   PODTAB — OKOVI
   =================================================================== */
function crtajOkove(z) {
  $('#pok-auto').innerHTML = z.autoLista.length
    ? z.autoLista.map(a => `<div class="stav">
        <span>${esc(a.okov.naziv)} <span class="num" style="color:var(--ink-3)">× ${a.kom}</span></span>
        <b class="num">${a.okov.cena_kom
          ? rsd(a.kom * a.okov.cena_kom * (1 - rabat())) + ' RSD'
          : '<span style="color:var(--alert)">nema cene</span>'}</b>
      </div>`).join('')
    : '<div class="nema-cene">Nema automatskih okova — dodaj elemente sa krilima, policama ili nogicama.</div>';

  if (!z.rucni.length) {
    $('#pok-prazno').style.display = 'block';
    $('#pok-tabela-okvir').style.display = 'none';
  } else {
    $('#pok-prazno').style.display = 'none';
    $('#pok-tabela-okvir').style.display = 'block';
    $('#pok-telo').innerHTML = z.rucni.map(x => `<tr>
      <td>
        <div class="red-naziv">${esc(x.okov ? x.okov.naziv : 'obrisan okov')}</div>
        ${x.red.napomena ? `<div class="red-sifra">${esc(x.red.napomena)}</div>` : ''}
      </td>
      <td class="num r">${x.red.kolicina}</td>
      <td class="num r">${x.okov?.cena_kom ? rsd(x.okov.cena_kom * (1 - rabat())) : '—'}</td>
      <td class="num r">${rsd(x.iznos)}</td>
      <td class="r"><div class="akcije">
        <button class="ikona-btn opasno" data-rok-brisi="${x.red.id}">Obriši</button>
      </div></td>
    </tr>`).join('');

    $('#pok-telo').querySelectorAll('[data-rok-brisi]').forEach(b => b.onclick = async () => {
      const { error } = await db.from('projekat_okovi').delete().eq('id', b.dataset.rokBrisi);
      if (error) return poruka($('#pr-poruka'), 'Nije obrisano: ' + error.message, 'gre');
      await ucitajProjekte();
    });
  }

  $('#pok-zbir').innerHTML =
    `<div class="stav"><span>Automatski iz elemenata</span><b class="num">${rsd(z.okoviAuto)} RSD</b></div>
     <div class="stav"><span>Ručno dodato</span><b class="num">${rsd(z.okoviRucno)} RSD</b></div>
     <div class="stav jaka"><span><b>Okovi ukupno — nabavno</b></span><b class="num">${rsd(z.okoviAuto + z.okoviRucno)} RSD</b></div>`;
}

function formaRucnogOkova() {
  if (!aktivan) return;
  if (!okovi.length) return poruka($('#pr-poruka'), 'Šifarnik okova je prazan.', 'gre');

  otvoriModal('Dodaj okov u projekat', `
    <div class="field">
      <label for="ro-okov">Okov</label>
      <select id="ro-okov">
        ${okovi.map(o => `<option value="${o.id}">${esc(o.naziv)}${o.cena_kom ? ` — ${rsd(o.cena_kom)} RSD` : ' — nema cene'}</option>`).join('')}
      </select>
      <div class="hint">Klizači, ručice, podizni mehanizmi — sve što se ne računa samo.</div>
    </div>
    <div class="field-grid">
      <div class="field">
        <label for="ro-kolicina">Količina</label>
        <input type="number" id="ro-kolicina" value="1" min="0" step="1">
      </div>
      <div class="field">
        <label for="ro-napomena">Napomena</label>
        <input type="text" id="ro-napomena" placeholder="npr. fioke ispod sudopere">
      </div>
    </div>
  `, async () => {
    const { error } = await db.from('projekat_okovi').insert({
      projekat_id: aktivan.id,
      okov_id: Number(vred('ro-okov')),
      kolicina: broj('ro-kolicina') ?? 1,
      napomena: vred('ro-napomena') || null,
    });
    if (error) return poruka($('#pr-poruka'), 'Nije dodato: ' + error.message, 'gre');
    zatvoriModal();
    await ucitajProjekte();
  }, 'Dodaj');
}

/* ===================================================================
   PODTAB — RAD
   =================================================================== */
const POLJA_RADA = {
  'pr-sati':          'sati',
  'pr-pomocni-dana':  'pomocni_dana',
  'pr-spratovi':      'spratovi',
  'pr-kilometri':     'kilometri',
  'pr-dana-smestaj':  'dana_smestaj',
  'pr-marza':         'marza',
  'pr-popust':        'popust',
};

function crtajRad() {
  Object.entries(POLJA_RADA).forEach(([id, kolona]) => {
    const el = $('#' + id);
    if (el) el.value = aktivan[kolona] ?? '';
  });
  $('#pr-marza').placeholder = `podrazumevano ${profil.marza_default ?? 0}`;

  const p = profil;
  $('#rad-cenovnik').innerHTML =
    `<div class="stav"><span>Satnica</span><b class="num">${rsd(p.satnica)} RSD/h</b></div>
     <div class="stav"><span>Pomoćni radnik</span><b class="num">${rsd(p.pomocni_dnevnica)} RSD/dan</b></div>
     <div class="stav"><span>Sprat bez lifta</span><b class="num">${rsd(p.cena_sprat)} RSD</b></div>
     <div class="stav"><span>Dnevnica sa smeštajem</span><b class="num">${rsd(p.dnevnica)} RSD/dan</b></div>
     <div class="stav"><span>Put besplatno do</span><b class="num">${p.km_besplatno ?? 0} km</b></div>
     <div class="stav"><span>Put do 80 km / preko 80</span><b class="num">${rsd(p.km_cena_bliza)} / ${rsd(p.km_cena_dalja)} RSD/km</b></div>`;
}

async function sacuvajRad(e) {
  e.preventDefault();
  if (!aktivan) return;

  const izmene = {};
  Object.entries(POLJA_RADA).forEach(([id, kolona]) => {
    const v = $('#' + id).value;
    /* prazna marža znači: uzmi podrazumevanu iz profila */
    izmene[kolona] = v === '' ? (kolona === 'marza' ? null : 0) : Number(v);
  });

  const dugme = $('#rad-dugme');
  dugme.disabled = true;
  const { error } = await db.from('projekti').update(izmene).eq('id', aktivan.id);
  dugme.disabled = false;

  if (error) return poruka($('#rad-poruka'), 'Nije sačuvano: ' + error.message, 'gre');
  Object.assign(aktivan, izmene);
  await ucitajProjekte();
  poruka($('#rad-poruka'), 'Sačuvano. Cena je preračunata.', 'ok');
}

/* ===================================================================
   PODTAB — ROKOVI
   =================================================================== */
function crtajRokove() {
  ROKOVI.forEach(r => {
    const el = $('#' + idRoka(r.kolona));
    if (el) el.value = aktivan[r.kolona] || '';
  });
  $('#pr-rok').value = aktivan.rok || '';

  /* --- vremeplov --- */
  $('#rokovi-vremeplov').innerHTML = ROKOVI.map(r => {
    const d = aktivan[r.kolona];
    const n = danaDo(d);
    const stanje = !d ? 'prazan' : n < 0 ? 'prosao' : n === 0 ? 'danas' : 'buduci';
    return `<div class="korak ${stanje}">
      <i class="korak-tacka"></i>
      <div class="korak-ime">${r.ime}${r.auto ? '<span class="korak-auto">sam</span>' : ''}</div>
      <div class="korak-datum num">${d ? datumPun(d) : '—'}</div>
      <div class="korak-kad">${d ? kada(d) : 'nije zakazano'}</div>
    </div>`;
  }).join('') + (aktivan.rok ? `<div class="korak rok ${danaDo(aktivan.rok) < 0 && aktivan.status !== 'zavrseno' ? 'prosao' : ''}">
      <i class="korak-tacka"></i>
      <div class="korak-ime">Ugovoreni rok</div>
      <div class="korak-datum num">${datumPun(aktivan.rok)}</div>
      <div class="korak-kad">${kada(aktivan.rok)}</div>
    </div>` : '');

  /* --- rečenica koja kaže gde si --- */
  const poceo = aktivan.datum_pocetka;
  const gotov = aktivan.datum_zavrsetka;
  const redovi = [];

  if (poceo && gotov) {
    const trajanje = Math.max(0, danaDo(gotov) - danaDo(poceo));
    redovi.push(['dobro', `Posao je trajao ${trajanje} ${dan(trajanje)} — od ${datumPun(poceo)} do ${datumPun(gotov)}.`]);
  } else if (poceo) {
    const proslo = -danaDo(poceo);
    redovi.push(['', proslo < 0
      ? `Početak je zakazan za ${datumPun(poceo)} — ${kada(poceo)}.`
      : proslo === 0
        ? 'Posao je počeo danas.'
        : `Posao je počeo ${datumPun(poceo)} — traje ${proslo} ${dan(proslo)}.`]);
  } else {
    redovi.push(['', 'Posao još nije počeo. Datum početka se upiše sam kad ga prebaciš u izradu.']);
  }

  if (aktivan.rok && !gotov) {
    const n = danaDo(aktivan.rok);
    redovi.push(n < 0
      ? ['lose', `Ugovoreni rok je prošao pre ${-n} ${dan(n)}.`]
      : ['', `Do ugovorenog roka ${n === 0 ? 'je danas' : `ima ${n} ${dan(n)}`}.`]);
  }

  $('#rokovi-sazetak').innerHTML = redovi
    .map(([k, t]) => `<div class="rok-red ${k}">${t}</div>`).join('');
}

async function sacuvajRokove(e) {
  e.preventDefault();
  if (!aktivan) return;

  const izmene = { rok: $('#pr-rok').value || null };
  ROKOVI.forEach(r => { izmene[r.kolona] = $('#' + idRoka(r.kolona)).value || null; });

  const dugme = $('#rokovi-dugme');
  dugme.disabled = true;
  const { error } = await db.from('projekti').update(izmene).eq('id', aktivan.id);
  dugme.disabled = false;

  if (error) return poruka($('#rokovi-poruka'), 'Nije sačuvano: ' + error.message, 'gre');
  Object.assign(aktivan, izmene);
  await ucitajProjekte();
  poruka($('#rokovi-poruka'), 'Datumi sačuvani.', 'ok');
}

/* ===================================================================
   PODTAB — CENA
   =================================================================== */
function crtajCenu(z) {
  const r = z.racun;
  const linija = (ime, iznos, klasa = '') =>
    `<div class="stav ${klasa}"><span>${ime}</span><b class="num">${rsd(iznos)} RSD</b></div>`;

  $('#cena-prihod').innerHTML =
    linija(`Materijal + marža ${r.marzaProcenat.toFixed(0)}%`, r.prihod.materijal) +
    linija('Okovi + marža', r.prihod.okovi) +
    linija(`Rad — ${Number(aktivan.sati) || 0} h`, r.prihod.rad) +
    (r.prihod.spratovi ? linija(`Spratovi — ${aktivan.spratovi}`, r.prihod.spratovi) : '') +
    (r.prihod.put ? linija(`Put — ${r.put.naplativiKm} km naplativo`, r.prihod.put) : '') +
    (r.prihod.smestaj ? linija(`Smeštaj — ${aktivan.dana_smestaj} dana`, r.prihod.smestaj) : '') +
    (r.prihod.popust ? linija(`Popust ${aktivan.popust}%`, -r.prihod.popust) : '') +
    linija('<b>Ukupno za klijenta</b>', r.prihod.ukupno, 'jaka');

  $('#cena-trosak').innerHTML =
    linija('Materijal — nabavno, sa rabatom', r.trosak.materijal) +
    linija('Okovi — nabavno, sa rabatom', r.trosak.okovi) +
    (r.trosak.pomocni ? linija(`Pomoćni radnik — ${aktivan.pomocni_dana} dana`, r.trosak.pomocni) : '') +
    linija('<b>Ukupan trošak</b>', r.trosak.ukupno, 'jaka');

  $('#cena-metrike').innerHTML = `
    <div class="metrika">
      <div class="metrika-labela">Ostaje tebi</div>
      <div class="metrika-broj num ${r.zarada >= 0 ? 'dobro' : 'lose'}">${rsd(r.zarada)}</div>
      <div class="metrika-sub">${r.udeoZarade.toFixed(1)}% od cene posla</div>
    </div>
    <div class="metrika">
      <div class="metrika-labela">Efektivna satnica</div>
      <div class="metrika-broj num">${rsd(r.efektivnaSatnica)}</div>
      <div class="metrika-sub">RSD po satu tvog rada</div>
    </div>
    <div class="metrika">
      <div class="metrika-labela">Avans</div>
      <div class="metrika-broj num">${rsd(r.avans)}</div>
      <div class="metrika-sub">materijal i okovi + ${profil.buffer_avans ?? 0}% buffer</div>
    </div>
    <div class="metrika">
      <div class="metrika-labela">Materijal</div>
      <div class="metrika-broj num">${z.m2.toFixed(2)}</div>
      <div class="metrika-sub">m² · ${z.komada} komada za sečenje</div>
    </div>`;

  const upoz = $('#cena-upozorenje');
  upoz.style.display = z.bezCene ? 'block' : 'none';
  upoz.textContent = z.bezCene
    ? `${z.bezCene} stavki nema cenu — element bez konfiguracije materijala ili okov bez cene u šifarniku. Račun je manji nego što posao stvarno jeste.`
    : '';

  $('#cena-ukupno').textContent = rsd(r.prihod.ukupno) + ' RSD';
  $('#cena-ukupno-detalj').textContent =
    `Trošak ${rsd(r.trosak.ukupno)} · zarada ${rsd(r.zarada)} · avans ${rsd(r.avans)}`;
}

/* ===================================================================
   PODTAB — ZADACI
   =================================================================== */
function osveziBrojZadataka() {
  $('#pt-broj-zadaci').textContent = zadaci.filter(x => !x.gotov).length;
}

function crtajZadatke() {
  const telo = $('#pz-telo');
  if (!zadaci.length) {
    telo.innerHTML = '<div class="nema-cene">Nema zadataka. Upiši šta te čeka — merenje, poručivanje, sečenje, montaža.</div>';
    return;
  }

  telo.innerHTML = zadaci.map(z => `<div class="zadatak ${z.gotov ? 'gotov' : ''}">
    <label class="zadatak-levo">
      <input type="checkbox" data-zad="${z.id}" ${z.gotov ? 'checked' : ''}>
      <span class="zadatak-tekst">${esc(z.tekst)}</span>
    </label>
    ${z.rok ? `<span class="zadatak-rok num">${esc(z.rok)}</span>` : ''}
    <button class="ikona-btn opasno" data-zad-brisi="${z.id}">Obriši</button>
  </div>`).join('');

  telo.querySelectorAll('[data-zad]').forEach(c => c.onchange = async () => {
    const { error } = await db.from('projekat_zadaci').update({ gotov: c.checked }).eq('id', c.dataset.zad);
    if (error) return poruka($('#pr-poruka'), 'Nije sačuvano: ' + error.message, 'gre');
    const z = zadaci.find(x => x.id == c.dataset.zad);
    if (z) z.gotov = c.checked;
    c.closest('.zadatak').classList.toggle('gotov', c.checked);
    osveziBrojZadataka();
  });

  telo.querySelectorAll('[data-zad-brisi]').forEach(b => b.onclick = async () => {
    const { error } = await db.from('projekat_zadaci').delete().eq('id', b.dataset.zadBrisi);
    if (error) return poruka($('#pr-poruka'), 'Nije obrisano: ' + error.message, 'gre');
    zadaci = zadaci.filter(x => x.id != b.dataset.zadBrisi);
    crtajZadatke();
    osveziBrojZadataka();
  });
}

async function dodajZadatak(e) {
  e.preventDefault();
  if (!aktivan) return;
  const tekst = $('#pz-tekst').value.trim();
  if (!tekst) return;

  const { data, error } = await db.from('projekat_zadaci')
    .insert({ projekat_id: aktivan.id, tekst, rok: $('#pz-rok').value || null })
    .select().single();
  if (error) return poruka($('#pr-poruka'), 'Nije dodato: ' + error.message, 'gre');

  zadaci.push(data);
  $('#pz-tekst').value = '';
  $('#pz-rok').value = '';
  crtajZadatke();
  osveziBrojZadataka();
}

/* ===================================================================
   VEZIVANJE
   =================================================================== */
export function povezProjekte() {
  $('#pr-novi').onclick = () => formaProjekta();

  /* kanban — prevlačenje karte u drugu kolonu */
  STATUSI.forEach(s => {
    const kolona = $('#kolona-' + KOLONA_ID[s]);
    kolona.ondragover  = (e) => { e.preventDefault(); kolona.classList.add('meta'); };
    kolona.ondragleave = () => kolona.classList.remove('meta');
    kolona.ondrop = (e) => {
      e.preventDefault();
      kolona.classList.remove('meta');
      const id = e.dataTransfer.getData('text/plain');
      if (id) promeniStatus(id, s);
    };
  });

  /* glava projekta */
  $('#pr-nazad').onclick  = () => { aktivan = null; otvori('projekti'); };
  $('#pr-izmeni').onclick = () => aktivan && formaProjekta(aktivan);
  $('#pr-status').onchange = async () => {
    if (!aktivan) return;
    aktivan.status = $('#pr-status').value;
    await promeniStatus(aktivan.id, aktivan.status);
  };
  $('#pr-brisi').onclick = async () => {
    if (!aktivan) return;
    if (!confirm(`Obrisati projekat „${aktivan.naziv}” sa svim elementima, okovima i zadacima?`)) return;
    const { error } = await db.from('projekti').delete().eq('id', aktivan.id);
    if (error) return poruka($('#pr-poruka'), 'Nije obrisano: ' + error.message, 'gre');
    aktivan = null;
    veza = null;
    crtajVezu();
    await ucitajProjekte();
    otvori('projekti');
  };

  $$('.podtab').forEach(b => b.onclick = () => prikaziPodtab(b.dataset.podtab));

  $('#pel-novi').onclick   = noviElementUProjektu;
  $('#pel-sablon').onclick = izSablona;
  $('#pel-csv').onclick    = izveziCSV;
  $('#pel-stampa').onclick = stampajKrojnuListu;
  $('#pok-novi').onclick   = formaRucnogOkova;
  $('#rad-forma').addEventListener('submit', sacuvajRad);
  $('#rokovi-forma').addEventListener('submit', sacuvajRokove);
  $('#pz-forma').addEventListener('submit', dodajZadatak);

  /* Element tab → projekat */
  $('#el-u-projekat').onclick = dodajUProjekat;
  $('#el-sablon').onclick     = sacuvajKaoSablon;
  $('#veza-sacuvaj').onclick  = sacuvajVezu;
  $('#veza-otkazi').onclick   = () => { veza = null; crtajVezu(); };
}
