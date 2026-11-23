-- Baseline for the GRI pipeline (PLAN 5.3). Social, oracle and market tables come with their stages.
-- RLS is on for every table with no policy: only the owning service role reads or writes.
begin;

create table gpu_classes (
    id  text primary key,
    sku text not null
);

insert into gpu_classes (id, sku) values
    ('h100', 'H100 80GB SXM'),
    ('h200', 'H200 SXM'),
    ('b200', 'B200'),
    ('a100', 'A100 80GB'),
    ('4090', 'RTX 4090 24GB');

create table sources (
    id         text primary key,
    created_at timestamptz not null default now()
);

create table methodology_versions (
    version        text primary key,
    announced_at   timestamptz not null,
    effective_from timestamptz not null,
    spec_hash      text not null
);

create table price_observations (
    source_id         text not null references sources (id),
    gpu_class         text not null references gpu_classes (id),
    observed_at       timestamptz not null,
    price             numeric(18, 6) not null check (price > 0),
    available_gpus    integer check (available_gpus >= 0),
    payload_sha256    text not null,
    collector_version text not null,
    primary key (source_id, gpu_class, observed_at)
) partition by range (observed_at);

-- A missing partition makes the insert fail loudly; there is no default partition.
create function ensure_price_observation_partition(month date) returns void
language plpgsql as $$
declare
    start_at timestamptz := date_trunc('month', month::timestamp) at time zone 'UTC';
    end_at   timestamptz := start_at + interval '1 month';
    part     text := 'price_observations_' || to_char(start_at at time zone 'UTC', 'YYYY_MM');
begin
    execute format(
        'create table if not exists %I partition of price_observations for values from (%L) to (%L)',
        part, start_at, end_at
    );
    -- A partition is also a table: without its own RLS a direct read would bypass the parent.
    execute format('alter table %I enable row level security', part);
end;
$$;

select ensure_price_observation_partition(
    (date_trunc('month', now() at time zone 'UTC') + make_interval(months => m))::date
)
from generate_series(0, 2) as m;

create table gri_hourly (
    index_id            text not null,
    hour                timestamptz not null
        check (hour = date_trunc('hour', hour at time zone 'UTC') at time zone 'UTC'),
    value               numeric(18, 6),
    valid_sources       integer not null check (valid_sources >= 0),
    status              text not null check (status in ('LIVE', 'STALE', 'INSUFFICIENT_SOURCES')),
    methodology_version text not null references methodology_versions (version),
    input_hash          text not null,
    primary key (index_id, hour),
    check ((status = 'LIVE') = (value is not null)),
    check (value is null or value > 0)
);

create table gri_inputs (
    index_id  text not null,
    hour      timestamptz not null,
    source_id text not null references sources (id),
    price     numeric(18, 6) not null check (price > 0),
    weight    integer not null check (weight > 0),
    kept      boolean not null,
    primary key (index_id, hour, source_id),
    foreign key (index_id, hour) references gri_hourly (index_id, hour)
);

alter table gpu_classes          enable row level security;
alter table sources              enable row level security;
alter table methodology_versions enable row level security;
alter table price_observations   enable row level security;
alter table gri_hourly           enable row level security;
alter table gri_inputs           enable row level security;

commit;
