# By Simic Studio — poslovna aplikacija

Alat za Filipa, stolara iz Beograda koji radi nameštaj po meri (kuhinje, plakari,
kosi plakari). Iz dimenzija elementa računa krojnu listu, materijal, okove i cenu —
a zatim, za razliku od konkurencije, i **koliko na poslu zaista ostaje**.

## Kako se pokreće

Nema build koraka. Statički fajlovi, ES moduli preko CDN-a.
Lokalno: bilo koji static server (`python3 -m http.server`) — `file://` ne radi zbog modula.
Deploy: push na `main` → Vercel sam objavljuje.

## Stek

| Sloj | Alat |
|---|---|
| Frontend | čist HTML/CSS/JS, ES moduli, bez framework-a i bez build-a |
| Baza + Auth | Supabase (`cybggjhgsqzwyzoxldkw`) |
| Hosting | Vercel, povezan na GitHub `BySimicStudio/kalkulator` |

## Struktura

```
index.html          sve stranice u jednom fajlu, prikaz se prebacuje preko .view
css/styles.css      dizajn tokeni + komponente
js/config.js        Supabase URL i anon ključ
js/app.js           auth, navigacija, Podešavanja; izvozi db, korisnik(), poruka(), otvori()
js/ui.js            modal i sitni pomoćnici koje dele svi ekrani
js/sifarnik.js      materijali, konfiguracije materijala, okovi (CRUD)
js/motor.js         PRORAČUN — čiste funkcije, bez DOM-a
js/element.js       forma elementa, skica, izbor ivica, prikaz cene
js/projekti.js      kanban, projekat i pet podtabova
schema.sql          kompletna šema baze (referenca, već je pokrenuta)
schema-faza2.sql    tabele za projekte (idempotentna, pokreće se u SQL editoru)
schema-secenje.sql  kolona tekstura na materijalima (idempotentna)
```

`motor.js` mora ostati bez DOM zavisnosti — to je jedini deo koji se testira izolovano.

## Domenska pravila — NE MENJATI bez Filipove potvrde

Sve u milimetrima. `t` = debljina korpusa (podrazumevano 18).

**Tip spoja 1** — bočne pune visine, dno ulazi između njih
- bočne: 2 × (visina × dubina)
- dno: (širina − 2t) × dubina

**Tip spoja 2** — dno ide celom širinom, bočne naležu na njega
- dno: širina × dubina
- bočne: 2 × ((visina − t) × dubina)

**Zajedničko**
- plafon: (širina − 2t) × dubina
- vezovi: 2 × ((širina − 2t) × 80), umesto plafona
- polica: (širina − 2t − zazorPolice) × (dubina − uvlačenje − debljinaPunihLeđa)
  - zazorPolice je **ukupan**, ne po strani; podrazumevano 1 → praktično širina − 37
  - uvlačenje podrazumevano 10
- krilo jednodelno: (visina − 2z) × (širina − 2z), z podrazumevano 2.5
- krilo dvodelno: 2 × ((visina − 2z) × ((širina − 3z) / 2)) — zazor i na sredini

**Leđa** — tri režima
- `hdf`: (visina − 2z) × (širina − 2z), z 1–3 mm; naležu spolja, policu NE skraćuju
- `puna`: širina − 2t; visina − 2t kod tipa 1, **visina − t kod tipa 2**;
  upadaju unutar korpusa i skraćuju dubinu police za svoju debljinu
- `bez`: nema dela

**Kantovanje** — samo vidne ivice. Podrazumevano u `KANT_PODRAZUMEVANO`.
Korisnik menja klikom na mini crtež u koloni „Kant" u tabeli delova.
Ivice `gore`/`dole` nose dužinu dela, `levo`/`desno` njegovu širinu.

**Automatski okovi**
- šarke = broj krila × 2 × broj elemenata
- nosači polica = broj polica × 4 (nula ako je polica fiksna)
- nogice = 4 po elementu, ako je uključeno

## Cene

- Kod DrvoLux-a **kant traka i usluga kantovanja idu kao jedna cena po metru**
  (ABS 138 + 78 = 216, PVC 51 + 45 = 96 — poklapa se sa njihovim Winplate ispisom).
  U šifarniku se upisuje zbir, ne dve stavke.
- U šifarnik ide **kataloška cena**; rabat (podrazumevano 10%) se oduzima u računu,
  vuče se iz `profili.rabat_dobavljac`.
- Standardna tabla bele iverice: 2800 × 2070.

## Sečenje — NE MENJATI bez Filipove potvrde

- Rez testere (kerf) **5 mm**, odmak od ivice table **10 mm sa sve četiri strane**.
- **Tekstura** je osobina materijala (`materijali.tekstura`). Ploča sa šarom se pri
  sečenju ne okreće — delovi idu samo u jednom pravcu. Bela i jednobojna se okreću
  slobodno. Razlika nije mala: ista krila znaju da traže tablu više.
- Delovi se grupišu **po materijalu, ne po elementu** — isti materijal iz raznih
  elemenata seče se sa istih tabli. Leđa idu na svoju tablu (HDF 1803 × 2070).
- Rade **dve metode pakovanja** i uzima se ona sa manje tabli: slobodno (deo ide u
  najtešnju rupu) i po trakama (kao panel testera — traka preko table, pa komadi iz
  nje). Kod nameštaja se mere ponavljaju, pa trake obično pobede.
- Najtešnje ležište se meri **kraćom preostalom stranicom**, ne ostatkom površine.
  Po površini rotacija nikad ne bi bila izabrana — okrenut deo ima istu površinu.

**Cena ostaje po m².** DrvoLux naplaćuje iskorišćeno i zadržava višak koji može da
preproda, pa je to Filipov stvarni trošak i to ulazi u cenu projekta. Cena celih
tabli se **samo prikazuje**, za slučaj kad hoće da zadrži viškove za sebe.
Materijal u svakom slučaju plaća klijent.

## Rad i profit — NE MENJATI bez Filipove potvrde

Sve stope dolaze iz `profili`, količine iz `projekti`. Računa `izracunajProjekat`.

**Prihod** (šta klijent plaća)
- materijal × (1 + marža) + okovi × (1 + marža)
- rad = sati × satnica
- logistika = spratovi × cena_sprat + put + dana_smestaj × dnevnica
- popust se oduzima na kraju, procentom od svega gore

**Put** — naplaćuje se samo preko servisnog radijusa, i to povratno
- naplativi km = max(0, km − km_besplatno) × 2
- stopa je `km_cena_bliza` do 80 km, `km_cena_dalja` preko 80

**Trošak** (šta tebi izlazi)
- materijal i okovi po nabavnoj ceni, sa rabatom
- pomoćni radnik = pomocni_dana × pomocni_dnevnica

**Rezultat**
- zarada = prihod − trošak
- efektivna satnica = zarada / sati
- avans = (materijal + okovi) × (1 + buffer_avans)

Marža na projektu koja je `null` znači: uzmi `profili.marza_default`.

## Faze

Gotovo — auth i RLS, šifarnici, motor sa tipovima 1 i 2, živa skica, izbor ivica,
izbor okova, pamćenje unosa u localStorage; projekti sa kanbanom i podtabovima
Elementi / Okovi / Rad / Rokovi / Cena / Zadaci, šabloni elemenata, rad i profit.

**Rokovi** — merenje, poručivanje, početak izrade, montaža, završetak, plus
ugovoreni `rok`. Datum početka i završetka aplikacija upiše sama kad posao pređe
u `u_izradi` odnosno `zavrseno`, ali **samo ako je polje prazno** — ručni unos se
nikad ne pregazi, ni kad se posao vrati u raniju kolonu. Sve po lokalnom danu,
ne po UTC, jer bi `toISOString()` pre dva ujutru upisao jučerašnji datum.

Projekat pamti **parametre elementa, ne iznos** — cena se svaki put izračuna kroz
motor, pa promena cenovnika sama povuče sve projekte.

**Sečenje** — guillotine raspored sa vizuelnim prikazom table, broj tabli i otpad
po materijalu, cena po m² i po celim tablama. Vidi se u projektu, podtab Elementi,
kartica „Table i sečenje".

Sledeće:
1. **Zalihe viškova** — šta je ostalo od prethodnih poslova i može da se upotrebi
   umesto nove table. Tek to zatvara priču o otpadu.
2. **Klijenti i predračun** — PDF ponuda, ugovor, garancija. Štampa iz pregledača
   uz `@media print`, bez biblioteka i bez build koraka.

## Konvencije

- Sav tekst u interfejsu, nazivi promenljivih i kolone u bazi su na **srpskom**.
- Boje samo preko CSS promenljivih iz `:root`. Vizuelni jezik je radionička tehnička
  dokumentacija: grafit, vellum, blueprint plava, `.kota` kao potpis sekcije.
- Svi brojevi u interfejsu nose klasu `.num` (mono, tabelarne cifre).
- Dimenzije se računaju u mm, prikazuju u cm sa jednom decimalom.
- Na telefonu je meni **ista ona bočna traka**, izvučena sa strane hamburger
  dugmetom (`#meni-dugme`, `.sidebar.otvoren`). Ne praviti zasebnu donju traku —
  imala je svoj kraći spisak stavki, pa su Materijali umeli da fale.
- Prelom je na 860 px. Tabele klize vodoravno unutar `.tabela-skrol`, sve ostalo
  mora da stane u širinu ekrana.

## Svaki ekran se radi za telefon i desktop odjednom

Filip radi na oba — u radionici na telefonu, uveče za stolom. Nova stvar nije
gotova dok ne radi na oba, u istom potezu. Ne „pa ćemo posle za telefon”.

Pre nego što se kaže da je gotovo, proveri **na 1280 px**:
- bočna traka stoji, hamburger je sakriven
- `.el-mreza` je dvokolonska — forma levo, rezime u `.el-desno` desno
- podtabovi imaju pun razmak (`10px 14px`)

i **na 375 px**:
- stranica ne preliva u stranu: `document.documentElement.scrollWidth <= innerWidth`
  na **svakoj** strani i **svakom** podtabu, ne samo na onom koji si menjao
- svi podtabovi staju u red bez skrolovanja — kad se doda nov, suzi razmak
  dok `scrollWidth <= clientWidth`, ne ostavljaj da klizi
- `.field-grid` pada u jednu kolonu, polja sa `max-width` idu celom širinom
- sitna dugmad (`.ikona-btn`, strelice na kartici) imaju metu za prst, ~36 px

Vodoravno klizanje je dozvoljeno **samo** unutar `.tabela-skrol` i `.podtabovi`.
Ako preliva bilo šta drugo, to je greška, ne osobina.

## Ne raditi

- Ne uvoditi build korak, bundler ni framework — Filip menja fajlove preko GitHub weba.
- Ne stavljati `service_role` ključ u repo. Samo `anon` ide u `config.js`.
- Ne dirati formule iz sekcije domenskih pravila bez potvrde — proverene su na
  stvarnim DrvoLux krojnim listama.
- Ne pisati u tabelu `poslovi` — to je ostatak starog kalkulatora, RLS joj je zatvoren.
- Ne slati cele fajlove u chat kad je dovoljna izmena par linija.
