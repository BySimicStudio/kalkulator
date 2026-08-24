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
