-- Signed operator reports waiting for the relayer (docs/spec/oracle-v1.md section 5).
-- The board stores exactly what the contract will verify; the contract stays the authority.
begin;

create table oracle_reports (
    id                  bigint generated always as identity primary key,
    index_id            text not null check (index_id ~ '^0x[0-9a-f]{64}$'),
    slot_ts             bigint not null check (slot_ts > 0),
    operator            text not null check (operator ~ '^0x[0-9a-f]{40}$'),
    value               numeric(39, 0) not null
        check (value > 0 and value < 340282366920938463463374607431768211456),
    sources             smallint not null check (sources between 0 and 255),
    methodology_version bigint not null check (methodology_version between 0 and 4294967295),
    nonce               numeric(78, 0) not null check (nonce >= 0),
    signature           text not null check (signature ~ '^0x[0-9a-f]{130}$'),
    status              text not null default 'pending' check (status in ('pending', 'relayed', 'expired')),
    received_at         timestamptz not null default now(),
    relayed_at          timestamptz,
    relay_tx            text check (relay_tx is null or relay_tx ~ '^0x[0-9a-f]{64}$'),
    -- One value per operator per slot, as on chain.
    unique (operator, index_id, slot_ts),
    unique (operator, nonce),
    check ((status = 'relayed') = (relay_tx is not null))
);

create index oracle_reports_pending on oracle_reports (index_id, slot_ts) where status = 'pending';

alter table oracle_reports enable row level security;

commit;
