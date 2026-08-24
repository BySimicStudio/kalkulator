-- =====================================================================
-- SEČENJE — tekstura ploče
-- Pokreni u Supabase SQL editoru. Idempotentno, može više puta.
--
-- Ploča sa šarom (drveni dekori) ne sme da se okreće pri sečenju — svi
-- delovi moraju da idu u istom pravcu, pa se sa iste table izvuče manje
-- komada. Bela i jednobojna nemaju to ograničenje.
-- =====================================================================

alter table public.materijali
  add column if not exists tekstura boolean not null default false;

-- ---------------------------------------------------------------------
-- Parametri sečenja — kao u programu koji koristi DrvoLux.
-- Stoje na profilu, važe za sve projekte, menjaju se u Podešavanjima.
-- ---------------------------------------------------------------------
alter table public.profili add column if not exists kerf         numeric not null default 5;
alter table public.profili add column if not exists odmak_table  numeric not null default 10;
alter table public.profili add column if not exists min_ostatak  numeric not null default 300;
