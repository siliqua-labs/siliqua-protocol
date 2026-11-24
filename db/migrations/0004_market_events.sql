-- Market events as the indexer reads them (docs/spec/market-v1.md). Same rule as the oracle
-- tables: every row carries its block, so a reorg deletes by block number and nothing else.
-- Market events share the oracle indexer cursor; set FACTORY_ADDRESS from the first run.
begin;

create table markets (
    block_number bigint not null,
    log_index    integer not null,
    block_hash   text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
    block_time   timestamptz not null,
    market       text not null unique check (market ~ '^0x[0-9a-f]{40}$'),
    index_id     text not null check (index_id ~ '^0x[0-9a-f]{64}$'),
    threshold    numeric(39, 0) not null,
    close_time   bigint not null,
    twap_from    bigint not null,
    twap_to      bigint not null,
    fee_bps      integer not null,
    bet_cap      numeric(39, 0) not null,
    primary key (block_number, log_index)
);

create table market_bets (
    block_number bigint not null,
    log_index    integer not null,
    block_hash   text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
    block_time   timestamptz not null,
    market       text not null check (market ~ '^0x[0-9a-f]{40}$'),
    account      text not null check (account ~ '^0x[0-9a-f]{40}$'),
    yes          boolean not null,
    amount       numeric(39, 0) not null check (amount > 0),
    primary key (block_number, log_index)
);
create index market_bets_market on market_bets (market);

-- Settled or void; a market ends once, so a second row means a reorg was not unwound.
create table market_outcomes (
    block_number bigint not null,
    log_index    integer not null,
    block_hash   text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
    block_time   timestamptz not null,
    market       text not null unique check (market ~ '^0x[0-9a-f]{40}$'),
    voided       boolean not null,
    twap_value   numeric(39, 0),
    yes_wins     boolean,
    -- RangeMarket.VoidReason: 0 stale oracle, 1 empty winning side, 2 expired.
    void_reason  smallint,
    primary key (block_number, log_index),
    check (voided = (void_reason is not null)),
    check (voided = (yes_wins is null))
);

create table market_payouts (
    block_number bigint not null,
    log_index    integer not null,
    block_hash   text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
    block_time   timestamptz not null,
    market       text not null check (market ~ '^0x[0-9a-f]{40}$'),
    kind         text not null check (kind in ('claimed', 'refunded', 'fees_swept')),
    account      text check (account ~ '^0x[0-9a-f]{40}$'),
    amount       numeric(39, 0) not null,
    primary key (block_number, log_index),
    check ((kind = 'fees_swept') = (account is null))
);
create index market_payouts_market on market_payouts (market);

alter table markets        enable row level security;
alter table market_bets    enable row level security;
alter table market_outcomes enable row level security;
alter table market_payouts enable row level security;

commit;
