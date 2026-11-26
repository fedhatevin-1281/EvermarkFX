-- EvermarkFX — Supabase PostgreSQL Schema
-- Run this in your Supabase SQL Editor

create extension if not exists pgcrypto;

-- 1. Traders / Users
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  email text unique,
  phone text,
  real_balance numeric(14,2) not null default 0.00,
  demo_balance numeric(14,2) not null default 10000.00,
  sim_access boolean not null default false,
  role text not null default 'trader',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_username_lower on public.users (lower(username));
create index if not exists idx_users_phone on public.users (phone);

-- 2. Global Platform Settings (single row id = 1)
create table if not exists public.platform_settings (
  id int primary key default 1,
  win_rate numeric(5,2) not null default 45.00,
  demo_win_rate numeric(5,2) not null default 100.00,
  sim_win_rate numeric(5,2) not null default 80.00,
  force_outcome text not null default 'auto',
  force_win_rate numeric(5,2) not null default 85.00,
  force_loss_rate numeric(5,2) not null default 85.00,
  min_stake numeric(12,2) not null default 10.00,
  max_stake numeric(12,2) not null default 50000.00,
  min_deposit numeric(12,2) not null default 300.00,
  min_withdrawal numeric(12,2) not null default 100.00,
  usd_rate numeric(10,2) not null default 129.00,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id)
values (1)
on conflict (id) do nothing;

-- 3. Per-User Outcome Overrides
create table if not exists public.user_outcomes (
  identifier text primary key,
  rule text not null default 'auto',
  updated_at timestamptz not null default now()
);

-- 4. Financial Transactions Ledger (Deposits, Withdrawals, Manual Credits/Debits)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  checkout_request_id text,
  user_id uuid references public.users(id) on delete set null,
  username text not null,
  phone text,
  type text not null check (type in ('deposit', 'withdrawal', 'manual_credit', 'manual_debit')),
  amount numeric(14,2) not null check (amount > 0),
  status text not null check (status in ('pending', 'completed', 'failed', 'manual_credit', 'manual_debit')),
  gateway text not null default 'makamescopay',
  gateway_ref text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tx_status on public.transactions (status);
create index if not exists idx_tx_username on public.transactions (lower(username));
create index if not exists idx_tx_checkout_id on public.transactions (checkout_request_id);

-- 5. Trades History (Normal + /simuted + Demo)
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  trade_id text unique not null,
  user_id uuid references public.users(id) on delete set null,
  username text not null,
  is_demo boolean not null default false,
  is_simulated boolean not null default false,
  trade_type text not null check (trade_type in ('buy', 'sell')),
  stake numeric(14,2) not null,
  entry_rate numeric(10,4) not null,
  exit_rate numeric(10,4),
  payout numeric(14,2) not null default 0.00,
  won boolean,
  status text not null default 'open' check (status in ('open', 'settled')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists idx_trades_username on public.trades (lower(username));

-- 6. Admin Audit Log
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_username text not null,
  amount_or_change text not null,
  note text,
  created_at timestamptz not null default now()
);

-- 7. Admin Users (email-based access control for the admin portal)
create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed the initial admin user
insert into public.admin_users (email, name)
values ('fedhatevin@gmail.com', 'Admin')
on conflict (email) do nothing;

-- Atomic Balance Adjustment RPC
create or replace function public.adjust_user_balance(
  p_username text,
  p_delta numeric,
  p_is_demo boolean default false
)
returns numeric
language plpgsql
security definer
as $$
declare
  v_new_balance numeric;
begin
  if p_is_demo then
    update public.users
    set demo_balance = greatest(0, demo_balance + p_delta),
        updated_at = now()
    where lower(username) = lower(p_username)
    returning demo_balance into v_new_balance;
  else
    update public.users
    set real_balance = real_balance + p_delta,
        updated_at = now()
    where lower(username) = lower(p_username)
      and (real_balance + p_delta) >= 0
    returning real_balance into v_new_balance;
  end if;

  if v_new_balance is null then
    raise exception 'User not found or insufficient balance';
  end if;

  return v_new_balance;
end;
$$;

-- Idempotent MakamescoPay Deposit Completion RPC
create or replace function public.complete_makamesco_deposit(
  p_reference text,
  p_gateway_ref text default null
)
returns table (already_completed boolean, new_balance numeric, tx_username text, tx_amount numeric)
language plpgsql
security definer
as $$
declare
  v_tx record;
  v_bal numeric;
begin
  select * into v_tx
  from public.transactions
  where reference = p_reference or checkout_request_id = p_reference
  for update;

  if not found then
    raise exception 'Transaction not found';
  end if;

  if v_tx.status in ('completed', 'manual_credit') then
    select real_balance into v_bal from public.users where lower(username) = lower(v_tx.username);
    return query select true, coalesce(v_bal, 0), v_tx.username, v_tx.amount;
    return;
  end if;

  update public.transactions
  set status = 'completed',
      gateway_ref = coalesce(p_gateway_ref, gateway_ref),
      note = coalesce(note, 'MakamescoPay STK confirmed'),
      updated_at = now()
  where id = v_tx.id;

  v_bal := public.adjust_user_balance(v_tx.username, v_tx.amount, false);

  return query select false, v_bal, v_tx.username, v_tx.amount;
end;
$$;
