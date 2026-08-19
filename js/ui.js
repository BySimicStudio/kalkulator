/* =====================================================================
   UI — modal i sitni pomoćnici koje dele svi ekrani
   ===================================================================== */

const $ = (s) => document.querySelector(s);

export function otvoriModal(naslov, telo, naSnimi, tekstSnimi = 'Sačuvaj') {
  $('#modal-naslov').textContent = naslov;
  $('#modal-telo').innerHTML = telo;
  $('#modal-sloj').classList.add('otvoren');

  const snimi = $('#modal-snimi');
  snimi.textContent = tekstSnimi;
  snimi.style.display = naSnimi ? '' : 'none';
  snimi.onclick = naSnimi || null;

  const prvi = $('#modal-telo input, #modal-telo select, #modal-telo textarea');
  if (prvi) setTimeout(() => prvi.focus(), 40);
}

export function zatvoriModal() {
  $('#modal-sloj').classList.remove('otvoren');
  $('#modal-telo').innerHTML = '';
  $('#modal-snimi').style.display = '';
}

export function vred(id) {
  const el = $('#' + id);
  return el ? el.value.trim() : '';
}

export function broj(id) {
  const v = vred(id);
  return v === '' ? null : Number(v);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

export const rsd = (n) => Math.round(Number(n) || 0).toLocaleString('sr-RS');

export function povezModal() {
  $('#modal-zatvori').onclick = zatvoriModal;
  $('#modal-otkazi').onclick  = zatvoriModal;
  $('#modal-sloj').onclick = (e) => { if (e.target.id === 'modal-sloj') zatvoriModal(); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modal-sloj').classList.contains('otvoren')) zatvoriModal();
  });
}
