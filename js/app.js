import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $  = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let korisnik = null;

/* ===================================================================
   PORUKE
   =================================================================== */
function poruka(el, tekst, vrsta = 'ok') {
  el.textContent = tekst;
  el.className = `poruka vidljiva ${vrsta}`;
}
function sakrijPoruku(el) { el.className = 'poruka'; }

/* ===================================================================
   PRIJAVA
   =================================================================== */
async function prijavi(e) {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const lozinka = $('#login-lozinka').value;
  const dugme = $('#login-dugme');
  const msg = $('#login-poruka');

  dugme.disabled = true;
  poruka(msg, 'Prijavljujem…', 'rad');

  const { data, error } = await db.auth.signInWithPassword({ email, password: lozinka });

  if (error) {
    poruka(msg, prevediGresku(error.message), 'gre');
    dugme.disabled = false;
    return;
  }

  korisnik = data.user;
  sakrijPoruku(msg);
  dugme.disabled = false;
  await pokreniAplikaciju();
}

function prevediGresku(poruka) {
  if (/invalid login credentials/i.test(poruka)) return 'Pogrešan email ili lozinka.';
  if (/email not confirmed/i.test(poruka))       return 'Nalog još nije potvrđen.';
  if (/failed to fetch/i.test(poruka))           return 'Nema veze sa serverom. Proveri internet.';
  return poruka;
}

async function odjavi() {
  await db.auth.signOut();
  korisnik = null;
  $('#app').classList.remove('active');
  $('#login').style.display = 'grid';
  $('#login-lozinka').value = '';
}

/* ===================================================================
   NAVIGACIJA
   =================================================================== */
const STRANE = {
  projekti:    { naslov: 'Projekti',   sub: 'Svi poslovi na jednom mestu' },
  materijali:  { naslov: 'Materijali', sub: 'Ploče, kant trake i konfiguracije' },
  okovi:       { naslov: 'Okovi',      sub: 'Šifarnik sa cenama po komadu' },
  klijenti:    { naslov: 'Klijenti',   sub: 'Kontakti i istorija saradnje' },
  ponude:      { naslov: 'Ponude',     sub: 'Predračuni i ugovori' },
  podesavanja: { naslov: 'Podešavanja', sub: 'Cenovnik rada, marže i podaci firme' },
};

function otvori(strana) {
  $$('.view').forEach(v => v.style.display = 'none');
  const view = $(`#view-${strana}`);
  if (view) view.style.display = 'block';

  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.strana === strana));
  $$('.mob-item').forEach(b => b.classList.toggle('active', b.dataset.strana === strana));

  const meta = STRANE[strana];
  if (meta) {
    $('#page-naslov').textContent = meta.naslov;
    $('#page-sub').textContent = meta.sub;
  }
  window.scrollTo(0, 0);
}

/* ===================================================================
   PODEŠAVANJA — čita i piše u tabelu `profili`
   =================================================================== */
const POLJA_PROFILA = [
  'naziv_firme', 'telefon', 'adresa', 'email_kontakt',
  'satnica', 'pomocni_dnevnica', 'cena_sprat', 'dnevnica',
  'km_besplatno', 'km_cena_bliza', 'km_cena_dalja',
  'marza_default', 'buffer_avans', 'rabat_dobavljac',
];

async function ucitajProfil() {
  const { data, error } = await db.from('profili').select('*').eq('id', korisnik.id).single();
  if (error || !data) return;
  POLJA_PROFILA.forEach(k => {
    const el = $(`#p-${k}`);
    if (el && data[k] !== null && data[k] !== undefined) el.value = data[k];
  });
}

async function sacuvajProfil(e) {
  e.preventDefault();
  const msg = $('#pod-poruka');
  const dugme = $('#pod-dugme');

  const izmene = { id: korisnik.id };
  POLJA_PROFILA.forEach(k => {
    const el = $(`#p-${k}`);
    if (!el) return;
    izmene[k] = el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value.trim();
  });

  dugme.disabled = true;
  poruka(msg, 'Čuvam…', 'rad');

  const { error } = await db.from('profili').upsert(izmene);

  dugme.disabled = false;
  if (error) poruka(msg, 'Nije sačuvano: ' + error.message, 'gre');
  else       poruka(msg, 'Podešavanja sačuvana.', 'ok');
}

/* ===================================================================
   PROJEKTI — Faza 0: samo prikaz kanban kolona
   =================================================================== */
async function ucitajProjekte() {
  const { data, error } = await db
    .from('projekti')
    .select('id, naziv, status, rok')
    .order('created_at', { ascending: false });

  const brojevi = { na_cekanju: 0, u_izradi: 0, zavrseno: 0 };
  if (!error && data) data.forEach(p => { if (brojevi[p.status] !== undefined) brojevi[p.status]++; });

  $('#broj-cekanje').textContent = brojevi.na_cekanju;
  $('#broj-izrada').textContent  = brojevi.u_izradi;
  $('#broj-gotovo').textContent  = brojevi.zavrseno;
}

/* ===================================================================
   POKRETANJE
   =================================================================== */
async function pokreniAplikaciju() {
  $('#login').style.display = 'none';
  $('#app').classList.add('active');
  $('#nav-email').textContent = korisnik.email;

  await Promise.all([ucitajProfil(), ucitajProjekte()]);
  otvori('projekti');
}

async function init() {
  $('#login-forma').addEventListener('submit', prijavi);
  $('#pod-forma').addEventListener('submit', sacuvajProfil);
  $$('.nav-item, .mob-item').forEach(b =>
    b.addEventListener('click', () => otvori(b.dataset.strana))
  );
  $('#odjava').addEventListener('click', odjavi);

  const { data } = await db.auth.getSession();
  if (data.session) {
    korisnik = data.session.user;
    await pokreniAplikaciju();
  } else {
    $('#login').style.display = 'grid';
  }
}

init();
