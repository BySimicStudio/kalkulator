/* =====================================================================
   ELEMENT — forma, živa skica, izbor ivica, lista delova i cena
   ===================================================================== */

import { db, korisnik } from './app.js';
import {
  generisiDelove, zbirniPodaci, autoOkovi, izracunajCenu,
  duzinaKanta, IVICE, KANT_PODRAZUMEVANO,
} from './motor.js';

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const rsd = (n) => Math.round(Number(n) || 0).toLocaleString('sr-RS');
const cm  = (mm) => (mm / 10).toFixed(1);

const NACRT = 'bss-element-nacrt';

let materijali = [];
let konfiguracije = [];
let okovi = [];
let rabat = 0;
let spremno = false;

let kant = JSON.parse(JSON.stringify(KANT_PODRAZUMEVANO));

/* ===================================================================
   PAMĆENJE UNOSA — preživljava osvežavanje stranice
   =================================================================== */
const UNOSI = [
  'e-konfiguracija','e-visina','e-sirina','e-dubina','e-debljina','e-broj',
  'e-vez-sirina','e-police','e-polica-dubina','e-polica-uvlacenje','e-polica-zazor',
  'e-krilo-zazor','e-leda-zazor','e-leda-debljina',
  'e-okov-sarka','e-okov-nosac','e-okov-nogica',
];
const KVACICE = ['e-polica-fiksna','e-nogice'];
const RADIJA  = ['tip-spoja','plafon','krilo','leda'];

function sacuvajNacrt() {
  if (!spremno) return;
  const n = { polja: {}, kvacice: {}, radija: {}, kant };
  UNOSI.forEach(id => { const el = $('#' + id); if (el) n.polja[id] = el.value; });
  KVACICE.forEach(id => { const el = $('#' + id); if (el) n.kvacice[id] = el.checked; });
  RADIJA.forEach(ime => {
    const el = $(`input[name=${ime}]:checked`);
    if (el) n.radija[ime] = el.value;
  });
  try { localStorage.setItem(NACRT, JSON.stringify(n)); } catch {}
}

function vratiNacrt() {
  let n;
  try { n = JSON.parse(localStorage.getItem(NACRT) || 'null'); } catch { return; }
  if (!n) return;
  Object.entries(n.polja || {}).forEach(([id, v]) => {
    const el = $('#' + id);
    if (!el) return;
    if (el.tagName === 'SELECT' && v && !Array.from(el.options).some(o => o.value === v)) return;
    el.value = v;
  });
  Object.entries(n.kvacice || {}).forEach(([id, v]) => { const el = $('#' + id); if (el) el.checked = v; });
  Object.entries(n.radija || {}).forEach(([ime, v]) => {
    const el = $(`input[name=${ime}][value="${v}"]`);
    if (el) el.checked = true;
  });
  if (n.kant) kant = { ...JSON.parse(JSON.stringify(KANT_PODRAZUMEVANO)), ...n.kant };
}

/* ===================================================================
   ČITANJE FORME
   =================================================================== */
function br(id, pod = 0) {
  const v = $('#' + id)?.value;
  return v === '' || v === undefined ? pod : Number(v);
}

function procitajElement() {
  return {
    tipSpoja:        Number($('input[name=tip-spoja]:checked')?.value || 1),
    visina:          br('e-visina', 800),
    sirina:          br('e-sirina', 600),
    dubina:          br('e-dubina', 400),
    debljina:        br('e-debljina', 18),
    brojElemenata:   br('e-broj', 1),
    plafonVezovi:    $('input[name=plafon]:checked')?.value || 'plafon',
    sirinaVeza:      br('e-vez-sirina', 80),
    brojPolica:      br('e-police', 0),
    dubinaPolice:    br('e-polica-dubina', 0),
    uvlacenjePolice: br('e-polica-uvlacenje', 10),
    zazorPolice:     br('e-polica-zazor', 1),
    fiksnaPolica:    $('#e-polica-fiksna')?.checked || false,
    tipKrila:        $('input[name=krilo]:checked')?.value || 'bez',
    zazorKrila:      br('e-krilo-zazor', 2.5),
    tipLeda:         $('input[name=leda]:checked')?.value || 'hdf',
    zazorLeda:       br('e-leda-zazor', 2),
    debljinaLeda:    br('e-leda-debljina', 18),
    imaNogice:       $('#e-nogice')?.checked || false,
    kant,
  };
}

/* ===================================================================
   MATERIJALI IZ KONFIGURACIJE
   =================================================================== */
const matPoId = (id) => materijali.find(m => m.id == id) || null;

function aktivniMaterijali() {
  const k = konfiguracije.find(x => x.id == $('#e-konfiguracija').value);
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

/* ===================================================================
   ŽIVA SKICA — pogled spreda
   =================================================================== */
function crtajSkicu(el) {
  const box = $('#skica');
  const W = 260, H = 200, pad = 26;
  const raz = Math.min((W - pad * 2) / el.sirina, (H - pad * 2) / el.visina);
  const w = el.sirina * raz, h = el.visina * raz;
  const x = (W - w) / 2, y = (H - h) / 2;
  const t = Math.max(2, el.debljina * raz);

  let unutra = '';
  if (el.brojPolica > 0) {
    const korisnaV = h - 2 * t;
    for (let i = 1; i <= el.brojPolica; i++) {
      const py = y + t + (korisnaV / (el.brojPolica + 1)) * i;
      unutra += `<line x1="${x + t}" y1="${py.toFixed(1)}" x2="${x + w - t}" y2="${py.toFixed(1)}"
                       stroke="var(--ink-3)" stroke-width="${Math.max(1.5, t * 0.7).toFixed(1)}"/>`;
    }
  }
  if (el.tipKrila === 'dvodelno') {
    unutra += `<line x1="${x + w / 2}" y1="${y}" x2="${x + w / 2}" y2="${y + h}"
                     stroke="var(--blueprint)" stroke-width="1" stroke-dasharray="4 3"/>`;
  }

  const gore = el.plafonVezovi === 'bez'
    ? ''
    : el.plafonVezovi === 'vezovi'
      ? `<rect x="${x + t}" y="${y}" width="${(w - 2 * t) * 0.28}" height="${t}" fill="var(--ink-2)"/>
         <rect x="${x + w - t - (w - 2 * t) * 0.28}" y="${y}" width="${(w - 2 * t) * 0.28}" height="${t}" fill="var(--ink-2)"/>`
      : `<rect x="${x + t}" y="${y}" width="${w - 2 * t}" height="${t}" fill="var(--ink-2)"/>`;

  const dno = el.tipSpoja === 2
    ? `<rect x="${x}" y="${y + h - t}" width="${w}" height="${t}" fill="var(--ink)"/>`
    : `<rect x="${x + t}" y="${y + h - t}" width="${w - 2 * t}" height="${t}" fill="var(--ink)"/>`;
  const bocneH = el.tipSpoja === 2 ? h - t : h;
  const bocne = `
    <rect x="${x}" y="${y}" width="${t}" height="${bocneH}" fill="var(--ink)"/>
    <rect x="${x + w - t}" y="${y}" width="${t}" height="${bocneH}" fill="var(--ink)"/>`;

  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="200" role="img"
      aria-label="Skica elementa ${cm(el.sirina)} sa ${cm(el.visina)} centimetara">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="var(--surface-2)" stroke="var(--line)"/>
    ${unutra}${gore}${dno}${bocne}
    <line x1="${x}" y1="${y + h + 12}" x2="${x + w}" y2="${y + h + 12}" stroke="var(--ink-3)" stroke-width=".7"/>
    <line x1="${x}" y1="${y + h + 8}" x2="${x}" y2="${y + h + 16}" stroke="var(--ink-3)" stroke-width=".7"/>
    <line x1="${x + w}" y1="${y + h + 8}" x2="${x + w}" y2="${y + h + 16}" stroke="var(--ink-3)" stroke-width=".7"/>
    <text x="${x + w / 2}" y="${y + h + 24}" text-anchor="middle"
          font-family="var(--font-mono)" font-size="9" fill="var(--ink-2)">${cm(el.sirina)}</text>
    <line x1="${x - 12}" y1="${y}" x2="${x - 12}" y2="${y + h}" stroke="var(--ink-3)" stroke-width=".7"/>
    <line x1="${x - 16}" y1="${y}" x2="${x - 8}" y2="${y}" stroke="var(--ink-3)" stroke-width=".7"/>
    <line x1="${x - 16}" y1="${y + h}" x2="${x - 8}" y2="${y + h}" stroke="var(--ink-3)" stroke-width=".7"/>
    <text x="${x - 16}" y="${y + h / 2}" text-anchor="middle"
          font-family="var(--font-mono)" font-size="9" fill="var(--ink-2)"
          transform="rotate(-90 ${x - 16} ${y + h / 2})">${cm(el.visina)}</text>
  </svg>`;
}

/* ===================================================================
   IZBOR IVICA
   =================================================================== */
function crtezIvica(deo) {
  const W = 54, H = 38, m = 7;
  const x1 = m, y1 = m, x2 = W - m, y2 = H - m;
  const aktivna = (i) => deo.kant.includes(i);
  const boja = (i) => aktivna(i) ? 'var(--blueprint)' : 'var(--line)';
  const deb  = (i) => aktivna(i) ? 3.4 : 1.2;

  const linija = (i, a, b, c, d) => `
    <line x1="${a}" y1="${b}" x2="${c}" y2="${d}"
          stroke="${boja(i)}" stroke-width="${deb(i)}" stroke-linecap="round"/>
    <line x1="${a}" y1="${b}" x2="${c}" y2="${d}"
          stroke="transparent" stroke-width="11" class="ivica-klik"
          data-vrsta="${deo.vrsta}" data-ivica="${i}" style="cursor:pointer"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="ivice"
      role="group" aria-label="Ivice za kantovanje">
    <rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="var(--surface-2)"/>
    ${linija('gore',  x1, y1, x2, y1)}
    ${linija('dole',  x1, y2, x2, y2)}
    ${linija('levo',  x1, y1, x1, y2)}
    ${linija('desno', x2, y1, x2, y2)}
  </svg>`;
}

/* ===================================================================
   PRERAČUN
   =================================================================== */
function preracunaj() {
  const el = procitajElement();
  crtajSkicu(el);

  $('#red-leda-zazor').style.display    = el.tipLeda === 'hdf'  ? '' : 'none';
  $('#red-leda-debljina').style.display = el.tipLeda === 'puna' ? '' : 'none';
  $('#nota-leda').textContent = el.tipLeda === 'puna'
    ? `Puna leđa upadaju unutar korpusa — polica je kraća za ${el.debljinaLeda} mm.`
    : el.tipLeda === 'hdf'
      ? 'HDF naleže spolja preko cele zadnje strane, policu ne skraćuje.'
      : '';

  const delovi = generisiDelove(el);
  const zbir = zbirniPodaci(delovi);
  const mat = aktivniMaterijali();

  $('#delovi-telo').innerHTML = delovi.map(d => `<tr>
    <td>
      <div class="red-naziv">${d.naziv}</div>
      <div class="red-sifra">${d.grupa}</div>
    </td>
    <td class="num">${cm(d.duzina)} × ${cm(d.sirina)}</td>
    <td class="num r">${d.kom}</td>
    <td class="num r">${((d.duzina / 1000) * (d.sirina / 1000) * d.kom).toFixed(3)}</td>
    <td>${crtezIvica(d)}</td>
    <td class="num r">${(duzinaKanta(d) / 1000).toFixed(2)}</td>
  </tr>`).join('');

  $$('.ivica-klik').forEach(l => l.onclick = () => {
    const { vrsta, ivica } = l.dataset;
    const set = new Set(kant[vrsta] || []);
    set.has(ivica) ? set.delete(ivica) : set.add(ivica);
    kant[vrsta] = IVICE.filter(i => set.has(i));
    preracunaj();
  });

  const imeGrupe = { korpus: 'Korpus', police: 'Police', krila: 'Krila', leda: 'Leđa' };
  $('#zbir-povrsina').innerHTML =
    Object.entries(zbir.povrsina).map(([g, m2]) =>
      `<div class="stav"><span>${imeGrupe[g] || g}</span><b class="num">${m2.toFixed(3)} m²</b></div>`).join('') +
    Object.entries(zbir.kant).map(([g, m]) =>
      `<div class="stav"><span>Kant — ${(imeGrupe[g] || g).toLowerCase()}</span><b class="num">${m.toFixed(2)} m</b></div>`).join('');

  /* --- okovi --- */
  const ao = autoOkovi(el);
  const nadji = (id) => okovi.find(o => o.id == id) || null;
  const redovi = [
    ['Šarke',         ao.sarka,        nadji($('#e-okov-sarka').value)],
    ['Nosači polica', ao.nosac_police, nadji($('#e-okov-nosac').value)],
    ['Nogice',        ao.nogica,       nadji($('#e-okov-nogica').value)],
  ].filter(([, kom]) => kom > 0);

  let cenaOkova = 0;
  $('#zbir-okovi').innerHTML = redovi.length
    ? redovi.map(([ime, kom, o]) => {
        const iznos = o ? kom * o.cena_kom * (1 - rabat) : 0;
        cenaOkova += iznos;
        const desno = !o
          ? '<span style="color:var(--alert);font-weight:400">nije izabran</span>'
          : !o.cena_kom
            ? '<span style="color:var(--alert);font-weight:400">nema cene</span>'
            : rsd(iznos) + ' RSD';
        return `<div class="stav">
          <span>${ime} <span class="num" style="color:var(--ink-3)">× ${kom}</span>
            ${o ? `<div class="red-sifra">${o.naziv}</div>` : ''}</span>
          <b class="num">${desno}</b>
        </div>`;
      }).join('')
    : '<div class="stav" style="color:var(--ink-3)">Nema automatskih okova</div>';

  /* --- cena --- */
  const kutija = $('#zbir-cena');
  if (!mat || !mat.korpus) {
    kutija.innerHTML = '<div class="nema-cene">Izaberi konfiguraciju materijala da bi se izračunala cena.</div>';
    $('#ukupno-iznos').textContent = '—';
    $('#ukupno-detalj').textContent = `${zbir.ukupnoKom} komada za sečenje`;
    sacuvajNacrt();
    return;
  }

  const { stavke, ukupno } = izracunajCenu(delovi, mat, rabat);
  kutija.innerHTML = stavke.map(s => `<div class="stav">
    <span>${s.naziv} <span class="num" style="color:var(--ink-3)">${s.kolicina.toFixed(s.jed === 'm²' ? 3 : 2)} ${s.jed}</span></span>
    <b class="num">${rsd(s.iznos)} RSD</b>
  </div>`).join('');

  $('#ukupno-iznos').textContent = rsd(ukupno + cenaOkova) + ' RSD';
  $('#ukupno-detalj').textContent =
    `Materijal ${rsd(ukupno)} · Okovi ${rsd(cenaOkova)} · ${zbir.ukupnoKom} komada za sečenje`;

  sacuvajNacrt();
}

/* ===================================================================
   UČITAVANJE — poziva se i pri svakom otvaranju taba
   =================================================================== */
export async function ucitajElement() {
  const [m, k, o, p] = await Promise.all([
    db.from('materijali').select('*').order('naziv'),
    db.from('konfiguracije').select('*').order('naziv'),
    db.from('okovi').select('*').order('naziv'),
    db.from('profili').select('rabat_dobavljac').eq('id', korisnik().id).single(),
  ]);
  materijali    = m.data || [];
  konfiguracije = k.data || [];
  okovi         = o.data || [];
  rabat         = (p.data?.rabat_dobavljac || 0) / 100;

  const pre = {
    kon:    $('#e-konfiguracija').value,
    sarka:  $('#e-okov-sarka').value,
    nosac:  $('#e-okov-nosac').value,
    nogica: $('#e-okov-nogica').value,
  };

  $('#e-konfiguracija').innerHTML =
    '<option value="">— bez konfiguracije, samo dimenzije —</option>' +
    konfiguracije.map(k => `<option value="${k.id}">${k.naziv}</option>`).join('');

  napuniOkove('e-okov-sarka',  'sarka',        'šarku');
  napuniOkove('e-okov-nosac',  'nosac_police', 'nosač police');
  napuniOkove('e-okov-nogica', 'nogica',       'nogicu');

  vratiPostojece('#e-konfiguracija', pre.kon);
  vratiPostojece('#e-okov-sarka',    pre.sarka);
  vratiPostojece('#e-okov-nosac',    pre.nosac);
  vratiPostojece('#e-okov-nogica',   pre.nogica);

  if (!spremno) { vratiNacrt(); spremno = true; }
  preracunaj();
}

function napuniOkove(id, tip, sta) {
  const lista = okovi.filter(o => o.auto_tip === tip);
  const el = $('#' + id);
  el.innerHTML = lista.length
    ? `<option value="">— izaberi ${sta} —</option>` +
      lista.map(o => `<option value="${o.id}">${o.naziv}${o.cena_kom ? ` — ${rsd(o.cena_kom)} RSD` : ' — nema cene'}</option>`).join('')
    : `<option value="">nema stavke u šifarniku</option>`;
  if (lista.length === 1) el.value = lista[0].id;
}

function vratiPostojece(sel, v) {
  const el = $(sel);
  if (v && Array.from(el.options).some(o => o.value === v)) el.value = v;
}

/* ===================================================================
   VEZIVANJE
   =================================================================== */
export function povezElement() {
  UNOSI.forEach(id => {
    const el = $('#' + id);
    if (!el) return;
    el.addEventListener('input', preracunaj);
    el.addEventListener('change', preracunaj);
  });
  KVACICE.forEach(id => $('#' + id)?.addEventListener('change', preracunaj));
  RADIJA.forEach(ime =>
    $$(`input[name=${ime}]`).forEach(r => r.addEventListener('change', preracunaj)));

  $('#kant-reset').onclick = () => {
    kant = JSON.parse(JSON.stringify(KANT_PODRAZUMEVANO));
    preracunaj();
  };

  $('#element-reset').onclick = () => {
    if (!confirm('Isprazniti element i vratiti početne vrednosti?')) return;
    try { localStorage.removeItem(NACRT); } catch {}
    location.reload();
  };
}

/* ===================================================================
   MOST KA PROJEKTIMA — Faza 2
   Element tab ostaje brza računica, ali ume i da preda svoj unos
   projektu, i da primi nazad element koji se uređuje.
   =================================================================== */
export function trenutniElement() {
  const id = (sel) => {
    const v = $(sel)?.value;
    return v === '' || v === undefined ? null : Number(v);
  };
  return {
    parametri:        procitajElement(),
    konfiguracija_id: id('#e-konfiguracija'),
    okov_sarka_id:    id('#e-okov-sarka'),
    okov_nosac_id:    id('#e-okov-nosac'),
    okov_nogica_id:   id('#e-okov-nogica'),
  };
}

export function postaviElement(zapis) {
  const p = zapis?.parametri || {};
  const upisi = (id, v) => { const el = $('#' + id); if (el && v !== undefined && v !== null) el.value = v; };
  const cekiraj = (ime, v) => { const el = $(`input[name=${ime}][value="${v}"]`); if (el) el.checked = true; };

  upisi('e-visina', p.visina);
  upisi('e-sirina', p.sirina);
  upisi('e-dubina', p.dubina);
  upisi('e-debljina', p.debljina);
  upisi('e-broj', p.brojElemenata);
  upisi('e-vez-sirina', p.sirinaVeza);
  upisi('e-police', p.brojPolica);
  upisi('e-polica-dubina', p.dubinaPolice);
  upisi('e-polica-uvlacenje', p.uvlacenjePolice);
  upisi('e-polica-zazor', p.zazorPolice);
  upisi('e-krilo-zazor', p.zazorKrila);
  upisi('e-leda-zazor', p.zazorLeda);
  upisi('e-leda-debljina', p.debljinaLeda);

  cekiraj('tip-spoja', p.tipSpoja ?? 1);
  cekiraj('plafon', p.plafonVezovi ?? 'plafon');
  cekiraj('krilo', p.tipKrila ?? 'bez');
  cekiraj('leda', p.tipLeda ?? 'hdf');

  const kv = (id, v) => { const el = $('#' + id); if (el) el.checked = !!v; };
  kv('e-polica-fiksna', p.fiksnaPolica);
  kv('e-nogice', p.imaNogice);

  kant = { ...JSON.parse(JSON.stringify(KANT_PODRAZUMEVANO)), ...(p.kant || {}) };

  const izaberi = (sel, v) => {
    const el = $(sel);
    if (!el) return;
    const s = v === null || v === undefined ? '' : String(v);
    el.value = Array.from(el.options).some(o => o.value === s) ? s : '';
  };
  izaberi('#e-konfiguracija', zapis?.konfiguracija_id);
  izaberi('#e-okov-sarka',    zapis?.okov_sarka_id);
  izaberi('#e-okov-nosac',    zapis?.okov_nosac_id);
  izaberi('#e-okov-nogica',   zapis?.okov_nogica_id);

  preracunaj();
}
