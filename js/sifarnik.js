/* =====================================================================
   ŠIFARNICI — materijali, konfiguracije materijala, okovi
   ===================================================================== */

import { db, korisnik, poruka } from './app.js';
import { otvoriModal, zatvoriModal, vred, broj, esc } from './ui.js';

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const rsd = (n) => Number(n || 0).toLocaleString('sr-RS', { maximumFractionDigits: 2 });

let materijali = [];
let konfiguracije = [];
let okovi = [];
let rabat = 0;
let filterMaterijala = 'sve';

/* ===================================================================
   UČITAVANJE
   =================================================================== */
export async function ucitajSifarnike() {
  const [m, k, o, p] = await Promise.all([
    db.from('materijali').select('*').order('vrsta').order('naziv'),
    db.from('konfiguracije').select('*').order('naziv'),
    db.from('okovi').select('*').order('kategorija').order('naziv'),
    db.from('profili').select('rabat_dobavljac').eq('id', korisnik().id).single(),
  ]);
  materijali    = m.data || [];
  konfiguracije = k.data || [];
  okovi         = o.data || [];
  rabat         = (p.data?.rabat_dobavljac || 0) / 100;
  crtajMaterijale();
  crtajKonfiguracije();
  crtajOkove();
}

/* ===================================================================
   MATERIJALI
   =================================================================== */
function crtajMaterijale() {
  const lista = materijali.filter(m =>
    filterMaterijala === 'sve' ? true : m.vrsta === filterMaterijala
  );
  const telo = $('#mat-telo');

  if (!lista.length) {
    $('#mat-prazno').style.display = 'block';
    $('#mat-tabela-okvir').style.display = 'none';
    return;
  }
  $('#mat-prazno').style.display = 'none';
  $('#mat-tabela-okvir').style.display = 'block';

  telo.innerHTML = lista.map(m => {
    const jed = m.vrsta === 'ploca' ? 'm²' : 'm';
    const sa = Math.round(m.cena * (1 - rabat));
    const dim = m.vrsta === 'ploca' && m.ploca_duzina
      ? `${m.ploca_duzina}×${m.ploca_sirina}` : '—';
    return `<tr>
      <td>
        <div class="red-naziv">${esc(m.naziv)}</div>
        ${m.sifra ? `<div class="red-sifra">${esc(m.sifra)}</div>` : ''}
      </td>
      <td>
        <span class="znacka ${m.vrsta}">${m.vrsta === 'ploca' ? 'ploča' : 'kant'}</span>
        ${m.tekstura ? '<span class="znacka tekstura">tekstura</span>' : ''}
      </td>
      <td class="r">
        <div class="cena-glavna">${rsd(m.cena)} / ${jed}</div>
        ${rabat ? `<div class="cena-rabat">${rsd(sa)} sa rabatom</div>` : ''}
      </td>
      <td class="num" style="color:var(--ink-2)">${m.debljina_mm ? m.debljina_mm + ' mm' : '—'}</td>
      <td class="num" style="color:var(--ink-2)">${dim}</td>
      <td class="r"><div class="akcije">
        <button class="ikona-btn" data-mat-izmeni="${m.id}">Izmeni</button>
        <button class="ikona-btn opasno" data-mat-brisi="${m.id}">Obriši</button>
      </div></td>
    </tr>`;
  }).join('');

  telo.querySelectorAll('[data-mat-izmeni]').forEach(b =>
    b.onclick = () => formaMaterijala(materijali.find(x => x.id == b.dataset.matIzmeni)));
  telo.querySelectorAll('[data-mat-brisi]').forEach(b =>
    b.onclick = () => obrisi('materijali', b.dataset.matBrisi, 'materijal'));
}

function formaMaterijala(m = null) {
  const je = m || { vrsta: 'ploca', ploca_duzina: 2800, ploca_sirina: 2070, dobavljac: 'DrvoLux' };
  otvoriModal(m ? 'Izmena materijala' : 'Novi materijal', `
    <div class="field">
      <label for="f-naziv">Naziv</label>
      <input type="text" id="f-naziv" value="${esc(je.naziv || '')}" placeholder="npr. Korpus bela Kastamonu 18mm">
    </div>
    <div class="field-grid">
      <div class="field">
        <label for="f-vrsta">Vrsta</label>
        <select id="f-vrsta">
          <option value="ploca" ${je.vrsta === 'ploca' ? 'selected' : ''}>Ploča — cena po m²</option>
          <option value="kant"  ${je.vrsta === 'kant'  ? 'selected' : ''}>Kant traka — cena po m</option>
        </select>
      </div>
      <div class="field">
        <label for="f-sifra">Šifra kod dobavljača</label>
        <input type="text" id="f-sifra" value="${esc(je.sifra || '')}" placeholder="D152/18">
      </div>
    </div>
    <div class="field-grid">
      <div class="field">
        <label for="f-cena">Cena (RSD)</label>
        <input type="number" id="f-cena" step="0.01" min="0" value="${je.cena ?? ''}">
        <div class="hint">Kataloška, pre rabata. Za kant: traka + kantovanje zajedno.</div>
      </div>
      <div class="field">
        <label for="f-debljina">Debljina (mm)</label>
        <input type="number" id="f-debljina" min="0" value="${je.debljina_mm ?? ''}">
      </div>
    </div>
    <div class="field-grid">
      <div class="field">
        <label for="f-duzina">Ploča — dužina (mm)</label>
        <input type="number" id="f-duzina" min="0" value="${je.ploca_duzina ?? ''}">
      </div>
      <div class="field">
        <label for="f-sirina">Ploča — širina (mm)</label>
        <input type="number" id="f-sirina" min="0" value="${je.ploca_sirina ?? ''}">
      </div>
    </div>
    <div class="field">
      <label for="f-dobavljac">Dobavljač</label>
      <input type="text" id="f-dobavljac" value="${esc(je.dobavljac || '')}">
    </div>
    <label class="prekidac">
      <input type="checkbox" id="f-tekstura" ${je.tekstura ? 'checked' : ''}>
      Ploča ima teksturu — šara ide u jednom pravcu
    </label>
    <div class="hint">Delovi sa teksturom se pri sečenju ne smeju okretati, pa sa table ode manje komada. Bela i jednobojna se slobodno okreću.</div>
  `, async () => {
    const naziv = vred('f-naziv');
    if (!naziv) return poruka($('#sif-poruka'), 'Materijal mora imati naziv.', 'gre');

    const red = {
      naziv,
      sifra: vred('f-sifra') || null,
      vrsta: vred('f-vrsta'),
      cena: broj('f-cena') ?? 0,
      debljina_mm: broj('f-debljina'),
      ploca_duzina: broj('f-duzina'),
      ploca_sirina: broj('f-sirina'),
      dobavljac: vred('f-dobavljac') || null,
      tekstura: $('#f-tekstura')?.checked || false,
    };
    if (m) red.id = m.id;

    const { error } = await db.from('materijali').upsert(red);
    if (error) return poruka($('#sif-poruka'), 'Nije sačuvano: ' + error.message, 'gre');
    zatvoriModal();
    await ucitajSifarnike();
    poruka($('#sif-poruka'), m ? 'Materijal izmenjen.' : 'Materijal dodat.', 'ok');
  });
}

/* ---------- početni DrvoLux cenovnik ---------- */
async function ubaciDrvoLux() {
  const set = [
    { naziv:'Korpus bela Kastamonu 18mm', sifra:'D152/18',   vrsta:'ploca', cena:1249, debljina_mm:18, ploca_duzina:2800, ploca_sirina:2070 },
    { naziv:'Kasmir grau 18mm',           sifra:'U12168/18', vrsta:'ploca', cena:1869, debljina_mm:18, ploca_duzina:2800, ploca_sirina:2070 },
    { naziv:'HDF beli PF',                sifra:'HDF2201',   vrsta:'ploca', cena:549,  debljina_mm:3,  ploca_duzina:1803, ploca_sirina:2070 },
    { naziv:'ABS bela glatka 23/1',       sifra:'10482G',    vrsta:'kant',  cena:165 },
    { naziv:'ABS Kasmir 23/0.8',          sifra:'U702',      vrsta:'kant',  cena:216 },
    { naziv:'PVC Kasmir 23/0.5',          sifra:'0730425',   vrsta:'kant',  cena:96  },
  ].map(x => ({ ...x, dobavljac: 'DrvoLux' }));

  const { error } = await db.from('materijali').insert(set);
  if (error) return poruka($('#sif-poruka'), 'Nije ubačeno: ' + error.message, 'gre');
  await ucitajSifarnike();
  poruka($('#sif-poruka'), '6 stavki sa tvojih računa ubačeno. Cene su kataloške, rabat se oduzima sam.', 'ok');
}

/* ===================================================================
   KONFIGURACIJE MATERIJALA
   =================================================================== */
function opcijeMat(vrsta, izabran) {
  const prazno = `<option value="">— nije izabrano —</option>`;
  return prazno + materijali.filter(m => m.vrsta === vrsta).map(m =>
    `<option value="${m.id}" ${m.id == izabran ? 'selected' : ''}>${esc(m.naziv)}</option>`
  ).join('');
}
const imeMat = (id) => materijali.find(m => m.id == id)?.naziv || '—';

function crtajKonfiguracije() {
  const telo = $('#kon-telo');
  if (!konfiguracije.length) {
    $('#kon-prazno').style.display = 'block';
    $('#kon-tabela-okvir').style.display = 'none';
    return;
  }
  $('#kon-prazno').style.display = 'none';
  $('#kon-tabela-okvir').style.display = 'block';

  telo.innerHTML = konfiguracije.map(k => `<tr>
    <td class="red-naziv">${esc(k.naziv)}</td>
    <td style="color:var(--ink-2)">${esc(imeMat(k.mat_korpus_id))}</td>
    <td style="color:var(--ink-2)">${esc(imeMat(k.mat_krila_id))}</td>
    <td style="color:var(--ink-2)">${esc(imeMat(k.kant_korpus_id))}</td>
    <td class="r"><div class="akcije">
      <button class="ikona-btn" data-kon-izmeni="${k.id}">Izmeni</button>
      <button class="ikona-btn opasno" data-kon-brisi="${k.id}">Obriši</button>
    </div></td>
  </tr>`).join('');

  telo.querySelectorAll('[data-kon-izmeni]').forEach(b =>
    b.onclick = () => formaKonfiguracije(konfiguracije.find(x => x.id == b.dataset.konIzmeni)));
  telo.querySelectorAll('[data-kon-brisi]').forEach(b =>
    b.onclick = () => obrisi('konfiguracije', b.dataset.konBrisi, 'konfiguraciju'));
}

function formaKonfiguracije(k = null) {
  const je = k || {};
  if (!materijali.length) {
    return poruka($('#sif-poruka'), 'Prvo unesi bar jedan materijal.', 'gre');
  }
  otvoriModal(k ? 'Izmena konfiguracije' : 'Nova konfiguracija', `
    <div class="field">
      <label for="k-naziv">Naziv konfiguracije</label>
      <input type="text" id="k-naziv" value="${esc(je.naziv || '')}" placeholder="npr. Kuhinja bela / Plakar kasmir">
      <div class="hint">Na elementu izabereš ovo jedno polje i sav materijal se popuni.</div>
    </div>

    <div class="pod-sekcija">Ploče</div>
    <div class="field">
      <label for="k-korpus">Korpus</label>
      <select id="k-korpus">${opcijeMat('ploca', je.mat_korpus_id)}</select>
    </div>
    <div class="field">
      <label for="k-police">Police</label>
      <select id="k-police">${opcijeMat('ploca', je.mat_police_id)}</select>
    </div>
    <div class="field">
      <label for="k-krila">Krila</label>
      <select id="k-krila">${opcijeMat('ploca', je.mat_krila_id)}</select>
    </div>
    <div class="field">
      <label for="k-leda">Leđa</label>
      <select id="k-leda">${opcijeMat('ploca', je.mat_leda_id)}</select>
    </div>

    <div class="pod-sekcija">Kant trake</div>
    <div class="field">
      <label for="k-kant-korpus">Kant — korpus</label>
      <select id="k-kant-korpus">${opcijeMat('kant', je.kant_korpus_id)}</select>
    </div>
    <div class="field">
      <label for="k-kant-police">Kant — police</label>
      <select id="k-kant-police">${opcijeMat('kant', je.kant_police_id)}</select>
      <div class="hint">Ostavi prazno da koristi isti kant kao korpus.</div>
    </div>
    <div class="field">
      <label for="k-kant-krila">Kant — krila</label>
      <select id="k-kant-krila">${opcijeMat('kant', je.kant_krila_id)}</select>
      <div class="hint">Ostavi prazno da koristi isti kant kao korpus.</div>
    </div>
  `, async () => {
    const naziv = vred('k-naziv');
    if (!naziv) return poruka($('#sif-poruka'), 'Konfiguracija mora imati naziv.', 'gre');

    const id = (x) => vred(x) === '' ? null : Number(vred(x));
    const red = {
      naziv,
      mat_korpus_id:  id('k-korpus'),
      mat_police_id:  id('k-police'),
      mat_krila_id:   id('k-krila'),
      mat_leda_id:    id('k-leda'),
      kant_korpus_id: id('k-kant-korpus'),
      kant_police_id: id('k-kant-police'),
      kant_krila_id:  id('k-kant-krila'),
    };
    if (k) red.id = k.id;

    const { error } = await db.from('konfiguracije').upsert(red);
    if (error) return poruka($('#sif-poruka'), 'Nije sačuvano: ' + error.message, 'gre');
    zatvoriModal();
    await ucitajSifarnike();
    poruka($('#sif-poruka'), k ? 'Konfiguracija izmenjena.' : 'Konfiguracija dodata.', 'ok');
  });
}

/* ===================================================================
   OKOVI
   =================================================================== */
const KATEGORIJE = ['sarke', 'klizaci', 'nosaci', 'nogice', 'rucice', 'podizni', 'vezni', 'ostalo'];
const IME_KAT = {
  sarke:'Šarke', klizaci:'Klizači', nosaci:'Nosači polica', nogice:'Nogice',
  rucice:'Ručice', podizni:'Podizni mehanizmi', vezni:'Vezni okov', ostalo:'Ostalo',
};
const IME_AUTO = { sarka:'2 po krilu', nosac_police:'4 po pomičnoj polici', nogica:'4 po elementu' };

function crtajOkove() {
  const telo = $('#okov-telo');
  if (!okovi.length) {
    $('#okov-prazno').style.display = 'block';
    $('#okov-tabela-okvir').style.display = 'none';
    return;
  }
  $('#okov-prazno').style.display = 'none';
  $('#okov-tabela-okvir').style.display = 'block';

  telo.innerHTML = okovi.map(o => `<tr>
    <td class="red-naziv">${esc(o.naziv)}</td>
    <td style="color:var(--ink-2)">${IME_KAT[o.kategorija] || '—'}</td>
    <td class="r cena-glavna">${o.cena_kom ? rsd(o.cena_kom) + ' / kom' : '<span style="color:var(--alert)">nema cene</span>'}</td>
    <td>${o.auto_tip ? `<span class="znacka auto">${IME_AUTO[o.auto_tip]}</span>` : ''}</td>
    <td class="r"><div class="akcije">
      <button class="ikona-btn" data-okov-izmeni="${o.id}">Izmeni</button>
      <button class="ikona-btn opasno" data-okov-brisi="${o.id}">Obriši</button>
    </div></td>
  </tr>`).join('');

  telo.querySelectorAll('[data-okov-izmeni]').forEach(b =>
    b.onclick = () => formaOkova(okovi.find(x => x.id == b.dataset.okovIzmeni)));
  telo.querySelectorAll('[data-okov-brisi]').forEach(b =>
    b.onclick = () => obrisi('okovi', b.dataset.okovBrisi, 'okov'));

  const bez = okovi.filter(o => !o.cena_kom).length;
  $('#okov-info').textContent = bez
    ? `${bez} ${bez === 1 ? 'stavka nema' : 'stavki nema'} cenu — dopuni pre nego što kreneš da računaš projekte.`
    : '';
}

function formaOkova(o = null) {
  const je = o || { kategorija: 'sarke' };
  otvoriModal(o ? 'Izmena okova' : 'Novi okov', `
    <div class="field">
      <label for="o-naziv">Naziv</label>
      <input type="text" id="o-naziv" value="${esc(je.naziv || '')}" placeholder="npr. GTV šarka soft-close ravna">
    </div>
    <div class="field-grid">
      <div class="field">
        <label for="o-kat">Kategorija</label>
        <select id="o-kat">
          ${KATEGORIJE.map(k => `<option value="${k}" ${je.kategorija === k ? 'selected' : ''}>${IME_KAT[k]}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="o-cena">Cena po komadu (RSD)</label>
        <input type="number" id="o-cena" step="0.01" min="0" value="${je.cena_kom ?? ''}">
      </div>
    </div>
    <div class="field">
      <label for="o-auto">Automatski se računa</label>
      <select id="o-auto">
        <option value="" ${!je.auto_tip ? 'selected' : ''}>Ne — dodajem ručno</option>
        <option value="sarka"        ${je.auto_tip === 'sarka' ? 'selected' : ''}>Šarka — 2 po krilu</option>
        <option value="nosac_police" ${je.auto_tip === 'nosac_police' ? 'selected' : ''}>Nosač police — 4 po pomičnoj polici</option>
        <option value="nogica"       ${je.auto_tip === 'nogica' ? 'selected' : ''}>Nogica — 4 po elementu</option>
      </select>
      <div class="hint">Označeni okovi se sami sabiraju iz elemenata na projektu.</div>
    </div>
  `, async () => {
    const naziv = vred('o-naziv');
    if (!naziv) return poruka($('#sif-poruka'), 'Okov mora imati naziv.', 'gre');

    const red = {
      naziv,
      kategorija: vred('o-kat'),
      cena_kom: broj('o-cena') ?? 0,
      auto_tip: vred('o-auto') || null,
    };
    if (o) red.id = o.id;

    const { error } = await db.from('okovi').upsert(red);
    if (error) return poruka($('#sif-poruka'), 'Nije sačuvano: ' + error.message, 'gre');
    zatvoriModal();
    await ucitajSifarnike();
    poruka($('#sif-poruka'), o ? 'Okov izmenjen.' : 'Okov dodat.', 'ok');
  });
}

/* ---------- početna struktura okova, bez cena ---------- */
async function ubaciOkove() {
  const set = [
    ['GTV šarka soft-close — ravna',      'sarke',   'sarka'],
    ['GTV šarka soft-close — polukriva',  'sarke',   'sarka'],
    ['GTV šarka soft-close — kriva',      'sarke',   'sarka'],
    ['GTV šarka žaba 135°',               'sarke',   'sarka'],
    ['Nosač police — plastični',          'nosaci',  'nosac_police'],
    ['Nosač police — inox',               'nosaci',  'nosac_police'],
    ['Nogica podesiva 100–150mm',         'nogice',  'nogica'],
    ['Klizač teleskop — puni izvlak',     'klizaci', null],
    ['Klizač teleskop — soft-close',      'klizaci', null],
    ['Tandembox — niska fioka',           'klizaci', null],
    ['Tandembox — srednja fioka',         'klizaci', null],
    ['Tandembox — visoka fioka',          'klizaci', null],
    ['Podizni mehanizam — srednji',       'podizni', null],
    ['Ručica sipo 128mm',                 'rucice',  null],
    ['Ručica sipo 256mm',                 'rucice',  null],
    ['Excentar spojnica Ø15',             'vezni',   null],
  ].map(([naziv, kategorija, auto_tip]) => ({ naziv, kategorija, auto_tip, cena_kom: 0 }));

  const { error } = await db.from('okovi').insert(set);
  if (error) return poruka($('#sif-poruka'), 'Nije ubačeno: ' + error.message, 'gre');
  await ucitajSifarnike();
  poruka($('#sif-poruka'), 'Struktura okova ubačena. Sad upiši cene — bez njih projekat ne može da se izračuna.', 'ok');
}

/* ===================================================================
   ZAJEDNIČKO
   =================================================================== */
async function obrisi(tabela, id, sta) {
  if (!confirm(`Obrisati ovaj ${sta}? Ne može da se vrati.`)) return;
  const { error } = await db.from(tabela).delete().eq('id', id);
  if (error) return poruka($('#sif-poruka'), 'Nije obrisano: ' + error.message, 'gre');
  await ucitajSifarnike();
  poruka($('#sif-poruka'), 'Obrisano.', 'ok');
}

/* ===================================================================
   VEZIVANJE DUGMADI
   =================================================================== */
export function povezSifarnike() {
  $('#mat-novi').onclick   = () => formaMaterijala();
  $('#mat-seed').onclick   = ubaciDrvoLux;
  $('#kon-nova').onclick   = () => formaKonfiguracije();
  $('#okov-novi').onclick  = () => formaOkova();
  $('#okov-seed').onclick  = ubaciOkove;

  $$('[data-filter]').forEach(b => b.onclick = () => {
    filterMaterijala = b.dataset.filter;
    $$('[data-filter]').forEach(x => x.classList.toggle('active', x === b));
    crtajMaterijale();
  });
}
