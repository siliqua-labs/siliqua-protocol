-- CMI tables (PLAN 5.3, docs/methodology/cmi-v1.0.md). Post text is never stored: whether it may
-- be is an open owner decision, and the index only needs the ID, label, bot score and model hash.
-- RLS is on for every table with no policy, like the baseline.
--
-- social_posts is a plain table, not partitioned. At the Neynar Free budget (about 33,000 casts
-- per day) it grows by roughly 1,000,000 rows per month, which is a real share of the Supabase
-- Free 500 MB. Retention and partitioning are an owner decision before the collectors run live.
begin;

create table social_posts (
    platform          text not null check (platform in ('x', 'farcaster', 'bluesky')),
    post_id           text not null,
    author_id         text not null,
    created_at        timestamptz not null,
    author_created_at timestamptz,
    label             text not null,
    bot_score_bps     integer not null check (bot_score_bps between 0 and 10000),
    credibility_bps   integer not null check (credibility_bps >= 0),
    model_hash        text not null,
    collected_at      timestamptz not null default now(),
    primary key (platform, post_id)
);

create index social_posts_created_at_idx on social_posts (created_at);

-- One row per platform per day, so "at least 2 of 3 platforms returned data" and the per-platform
-- health shown on the site are both read from stored facts.
create table social_platform_days (
    day       date not null,
    platform  text not null check (platform in ('x', 'farcaster', 'bluesky')),
    posts     integer not null check (posts >= 0),
    returned_data boolean not null,
    primary key (day, platform),
    check (returned_data = (posts > 0))
);

-- methodology_version is not a foreign key: methodology_versions is keyed by version alone and
-- already holds the GRI "1.0".
create table cmi_daily (
    day                 date primary key,
    status              text not null check (status in ('LIVE', 'STALE')),
    stale_reason        text check (stale_reason in ('platforms', 'zero_total')),
    platforms_with_data integer not null check (platforms_with_data between 0 and 3),
    posts_used          integer not null check (posts_used >= 0),
    methodology_version text not null,
    input_hash          text not null,
    check ((status = 'STALE') = (stale_reason is not null))
);

create table cmi_daily_values (
    day       date not null references cmi_daily (day),
    narrative text not null,
    value_bps integer not null check (value_bps between 0 and 10000),
    primary key (day, narrative)
);

alter table social_posts         enable row level security;
alter table social_platform_days enable row level security;
alter table cmi_daily            enable row level security;
alter table cmi_daily_values     enable row level security;

commit;
