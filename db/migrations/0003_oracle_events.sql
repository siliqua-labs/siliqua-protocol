-- Oracle events as the indexer reads them (docs/spec/oracle-v1.md section 11). Every row carries
-- the block it came from, so a reorg deletes by block number and nothing else.
begin;

create table indexer_state (
    name         text primary key,
    block_number bigint not null check (block_number >= 0),
    block_hash   text not null check (block_hash ~ '^0x[0-9a-f]{64}$')
);

-- Recent block hashes, to find the fork point when the chain reorganizes.
create table chain_blocks (
    block_number bigint primary key,
    block_hash   text not null check (block_hash ~ '^0x[0-9a-f]{64}$')
);

create table oracle_operator_values (
    block_number        bigint not null,
    log_index           integer not null,
    block_hash          text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
    tx_hash             text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
    block_time          timestamptz not null,
    index_id            text not null check (index_id ~ '^0x[0-9a-f]{64}$'),
    slot_ts             bigint not null,
    operator            text not null check (operator ~ '^0x[0-9a-f]{40}$'),
    value               numeric(39, 0) not null,
    sources             smallint not null,
    methodology_version bigint not null,
    nonce               numeric(78, 0) not null,
    counted             boolean not null,
    primary key (block_number, log_index)
);
create index oracle_operator_values_slot on oracle_operator_values (index_id, slot_ts);

create table oracle_rejections (
    block_number bigint not null,
    log_index    integer not null,
    block_hash   text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
    tx_hash      text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
    block_time   timestamptz not null,
    index_id     text not null check (index_id ~ '^0x[0-9a-f]{64}$'),
    slot_ts      bigint not null,
    operator     text not null check (operator ~ '^0x[0-9a-f]{40}$'),
    reason       smallint not null,
    primary key (block_number, log_index)
);

create table oracle_slots (
    block_number        bigint not null,
    log_index           integer not null,
    block_hash          text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
    block_time          timestamptz not null,
    index_id            text not null check (index_id ~ '^0x[0-9a-f]{64}$'),
    slot_ts             bigint not null,
    value               numeric(39, 0) not null,
    kept_count          smallint not null,
    submitted_count     smallint not null,
    methodology_version bigint not null,
    primary key (block_number, log_index),
    -- A slot finalizes once; a second row would mean a reorg was not unwound.
    unique (index_id, slot_ts)
);

create table oracle_operator_changes (
    block_number bigint not null,
    log_index    integer not null,
    block_hash   text not null check (block_hash ~ '^0x[0-9a-f]{64}$'),
    block_time   timestamptz not null,
    operator     text not null check (operator ~ '^0x[0-9a-f]{40}$'),
    added        boolean not null,
    primary key (block_number, log_index)
);

alter table indexer_state           enable row level security;
alter table chain_blocks            enable row level security;
alter table oracle_operator_values  enable row level security;
alter table oracle_rejections       enable row level security;
alter table oracle_slots            enable row level security;
alter table oracle_operator_changes enable row level security;

commit;
