import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { ucitajSifarnike, povezSifarnike } from './sifarnik.js';
import { ucitajElement, povezElement } from './element.js';
import { ucitajProjekte, povezProjekte } from './projekti.js';
import { povezModal } from './ui.js';

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let _korisnik = null;
export const korisnik = () => _korisnik;

/* ===================================================================
   PORUKE
   =================================================================== */
export function poruka(el, tekst, vrsta = 'ok') {
  if (!el) return;
  el.textContent = tekst;
  el.className = `poruka vidljiva ${vrsta}`;
  if (vrsta === 'ok') setTimeout(() => { el.className = 'poruka'; }, 4000);
}
function sakrijPoruku(el) { if (el) el.className = 'poruka'; }

/* ===================================================================
   PRIJAVA
   =================================================================== */
async function prijavi(e) {
  e.preventDefault();
  const dugme = $('#login-dugme');
  const msg = $('#login-poruka');

  dugme.disabled = true;
  poruka(msg, 'Prijavljujem…', 'rad');

  const { data, error } = await db.auth.signInWithPassword({
    email: $('#login-email').value.trim(),
    password: $('#login-lozinka').value,
  });

  dugme.disabled = false;
  if (error) return poruka(msg, prevediGresku(error.message), 'gre');

  _korisnik = data.user;
  sakrijPoruku(msg);
  await pokreniAplikaciju();
}

function prevediGresku(p) {
  if (/invalid login credentials/i.test(p)) return 'Pogrešan email ili lozinka.';
  if (/email not confirmed/i.test(p))       return 'Nalog još nije potvrđen.';
  if (/failed to fetch/i.test(p))           return 'Nema veze sa serverom. Proveri internet.';
  return p;
}

async function odjavi() {
  await db.auth.signOut();
  _korisnik = null;
  zatvoriMeni();
  $('#app').classList.remove('active');
  $('#login').style.display = 'grid';
  $('#login-lozinka').value = '';
}

/* ===================================================================
   NAVIGACIJA
   =================================================================== */
const STRANE = {
  projekti:    { naslov: 'Projekti',    sub: 'Svi poslovi na jednom mestu' },
  projekat:    { naslov: 'Projekat',    sub: '' },
  element:     { naslov: 'Element',     sub: 'Dimenzije ulaze, delovi i cena izlaze' },
  materijali:  { naslov: 'Materijali',  sub: 'Ploče, kant trake i konfiguracije' },
  okovi:       { naslov: 'Okovi',       sub: 'Šifarnik sa cenama po komadu' },
  klijenti:    { naslov: 'Klijenti',    sub: 'Kontakti i istorija saradnje' },
  ponude:      { naslov: 'Ponude',      sub: 'Predračuni i ugovori' },
  podesavanja: { naslov: 'Podešavanja', sub: 'Cenovnik rada, marže i podaci firme' },
};

/* ---------- meni na telefonu ---------- */
function meni(otvoren) {
  $('#sidebar').classList.toggle('otvoren', otvoren);
  $('#sloj-meni').classList.toggle('vidljiv', otvoren);
  $('#meni-dugme').classList.toggle('otvoren', otvoren);
  $('#meni-dugme').setAttribute('aria-expanded', String(otvoren));
  document.body.classList.toggle('meni-otvoren', otvoren);
}
const zatvoriMeni = () => meni(false);

export function otvori(strana) {
  $$('.view').forEach(v => v.style.display = 'none');
  const view = $(`#view-${strana}`);
  if (view) view.style.display = 'block';

  /* Otvoren projekat živi pod stavkom Projekti u meniju */
  const uMeniju = strana === 'projekat' ? 'projekti' : strana;
  $$('.nav-item[data-strana]').forEach(b => b.classList.toggle('active', b.dataset.strana === uMeniju));
  zatvoriMeni();

  const meta = STRANE[strana];
  if (meta) {
    $('#page-naslov').textContent = meta.naslov;
    $('#page-sub').textContent = meta.sub;
  }
  window.scrollTo(0, 0);

  /* Cene se možda menjale u drugom tabu — povuci sveže stanje.
     Unos u formi elementa ostaje netaknut, čuva se posebno. */
  if (strana === 'element') ucitajElement();
  if (strana === 'materijali' || strana === 'okovi') ucitajSifarnike();
  if (strana === 'projekti') ucitajProjekte();
}

/* ===================================================================
   PODEŠAVANJA
   =================================================================== */
const POLJA = [
  'naziv_firme', 'telefon', 'adresa', 'email_kontakt',
  'satnica', 'pomocni_dnevnica', 'cena_sprat', 'dnevnica',
  'km_besplatno', 'km_cena_bliza', 'km_cena_dalja',
  'marza_default', 'buffer_avans', 'rabat_dobavljac',
];

async function ucitajProfil() {
  const { data } = await db.from('profili').select('*').eq('id', _korisnik.id).single();
  if (!data) return;
  POLJA.forEach(k => {
    const el = $(`#p-${k}`);
    if (el && data[k] !== null && data[k] !== undefined) el.value = data[k];
  });
}

async function sacuvajProfil(e) {
  e.preventDefault();
  const msg = $('#pod-poruka');
  const dugme = $('#pod-dugme');

  const izmene = { id: _korisnik.id };
  POLJA.forEach(k => {
    const el = $(`#p-${k}`);
    if (!el) return;
    izmene[k] = el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value.trim();
  });

  dugme.disabled = true;
  poruka(msg, 'Čuvam…', 'rad');
  const { error } = await db.from('profili').upsert(izmene);
  dugme.disabled = false;

  if (error) return poruka(msg, 'Nije sačuvano: ' + error.message, 'gre');
  poruka(msg, 'Podešavanja sačuvana.', 'ok');
  await ucitajSifarnike();   // rabat se možda promenio
  await ucitajElement();
  await ucitajProjekte();    // satnica i marža ulaze u svaki projekat
}

/* ===================================================================
   POKRETANJE
   =================================================================== */
async function pokreniAplikaciju() {
  $('#login').style.display = 'none';
  $('#app').classList.add('active');
  $('#nav-email').textContent = _korisnik.email;

  await ucitajProfil();
  await Promise.all([ucitajProjekte(), ucitajSifarnike()]);
  await ucitajElement();
  otvori('projekti');
}

async function init() {
  $('#login-forma').addEventListener('submit', prijavi);
  $('#pod-forma').addEventListener('submit', sacuvajProfil);
  $$('.nav-item[data-strana]').forEach(b =>
    b.addEventListener('click', () => otvori(b.dataset.strana)));
  $('#odjava').addEventListener('click', odjavi);

  $('#meni-dugme').addEventListener('click', () => meni(!$('#sidebar').classList.contains('otvoren')));
  $('#sloj-meni').addEventListener('click', zatvoriMeni);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') zatvoriMeni(); });
  povezModal();
  povezSifarnike();
  povezElement();
  povezProjekte();

  const { data } = await db.auth.getSession();
  if (data.session) {
    _korisnik = data.session.user;
    await pokreniAplikaciju();
  } else {
    $('#login').style.display = 'grid';
  }
}

init();
