create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.app_role as enum ('ADMIN', 'EMPLOYEE');
create type public.order_priority as enum ('NORMAL', 'HIGH', 'URGENT');
create type public.workflow_status as enum ('UNASSIGNED', 'IN_PROGRESS', 'COMPLETED');
create type public.auxiliary_status as enum ('NONE', 'PENDING_CONFIRMATION', 'OUT_OF_STOCK');
create type public.file_section as enum ('ORIGINAL', 'PICKING', 'INVOICE', 'TICKET');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text not null,
  email text,
  role public.app_role not null default 'EMPLOYEE',
  active boolean not null default true,
  can_change_priority boolean not null default true,
  can_change_aux_status boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9][a-z0-9._-]{1,39}$')
);
create unique index profiles_username_lower_idx on public.profiles (lower(username));

create table public.order_number_counters (
  order_date date primary key,
  last_number integer not null check (last_number > 0)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_date date not null,
  daily_order_number integer not null check (daily_order_number > 0),
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 160),
  original_text text,
  notes text,
  picking_text text,
  priority public.order_priority not null default 'NORMAL',
  workflow_status public.workflow_status not null default 'UNASSIGNED',
  auxiliary_status public.auxiliary_status not null default 'NONE',
  accepted_by uuid references public.profiles(id),
  accepted_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  deletion_reason text,
  constraint daily_order_number_unique unique (order_date, daily_order_number),
  constraint acceptance_fields_together check ((accepted_by is null) = (accepted_at is null)),
  constraint unassigned_has_no_acceptor check (workflow_status <> 'UNASSIGNED' or accepted_by is null),
  constraint completed_has_timestamp check ((workflow_status = 'COMPLETED') = (completed_at is not null))
);

create table public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  section_type public.file_section not null,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  replaced_by_file_id uuid references public.order_files(id)
);
create unique index one_active_processing_file_per_section
  on public.order_files(order_id, section_type)
  where deleted_at is null and section_type <> 'ORIGINAL';

create table public.order_activity_logs (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  user_id uuid references public.profiles(id),
  action_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index orders_active_date_idx on public.orders(order_date desc, daily_order_number desc) where deleted_at is null;
create index orders_customer_trgm_idx on public.orders using gin (customer_name gin_trgm_ops);
create index orders_original_text_trgm_idx on public.orders using gin (original_text gin_trgm_ops);
create index order_files_order_idx on public.order_files(order_id, section_type) where deleted_at is null;
create index activity_order_time_idx on public.order_activity_logs(order_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

create or replace function public.business_date(p_at timestamptz default now())
returns date language sql immutable
return (p_at at time zone 'Pacific/Auckland')::date;

create or replace function public.is_active_user(p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
return coalesce((select active from public.profiles where id = p_user_id), false);

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = public
return coalesce((select active and role = 'ADMIN' from public.profiles where id = p_user_id), false);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_base text;
  v_username text;
begin
  v_base := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'employee'), '[^a-zA-Z0-9._-]', '', 'g'));
  if char_length(v_base) < 2 then v_base := 'employee'; end if;
  v_username := left(v_base, 32) || '-' || left(new.id::text, 6);
  insert into public.profiles (id, username, display_name, email)
  values (
    new.id,
    v_username,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1), 'Employee'),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.add_order_activity(
  p_order_id uuid,
  p_user_id uuid,
  p_action_type text,
  p_details jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.order_activity_logs(order_id, user_id, action_type, details)
  values (p_order_id, p_user_id, p_action_type, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function public.create_order(
  p_customer_name text,
  p_original_text text default null,
  p_notes text default null,
  p_priority public.order_priority default 'NORMAL',
  p_original_files jsonb default '[]'::jsonb
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_date date := public.business_date(now());
  v_number integer;
  v_order public.orders;
  v_file record;
  v_stored_size bigint;
  v_stored_mime text;
begin
  if not public.is_active_user() then raise exception 'Account is disabled or unauthorized' using errcode = '42501'; end if;
  if nullif(btrim(p_customer_name), '') is null then raise exception 'Customer / Store Name is required'; end if;
  if nullif(btrim(coalesce(p_original_text, '')), '') is null then p_original_text := null; end if;
  if p_original_text is null and jsonb_array_length(coalesce(p_original_files, '[]'::jsonb)) = 0 then
    raise exception 'Original order text or image is required';
  end if;
  if jsonb_array_length(coalesce(p_original_files, '[]'::jsonb)) > 8 then raise exception 'A maximum of 8 original images is allowed'; end if;

  insert into public.order_number_counters(order_date, last_number)
  values (v_date, 1)
  on conflict (order_date) do update
  set last_number = public.order_number_counters.last_number + 1
  returning last_number into v_number;

  insert into public.orders(order_date, daily_order_number, customer_name, original_text, notes, priority, created_by)
  values (v_date, v_number, btrim(p_customer_name), p_original_text, nullif(btrim(coalesce(p_notes, '')), ''), p_priority, auth.uid())
  returning * into v_order;

  perform public.add_order_activity(v_order.id, auth.uid(), 'ORDER_CREATED', jsonb_build_object('daily_order_number', v_number));

  for v_file in
    select * from jsonb_to_recordset(coalesce(p_original_files, '[]'::jsonb)) as x(
      original_filename text, storage_path text, mime_type text, file_size bigint
    )
  loop
    if v_file.storage_path not like ('pending-orders/' || auth.uid()::text || '/%') or v_file.storage_path like '%..%' then
      raise exception 'Invalid original file path';
    end if;
    if v_file.mime_type not in ('image/jpeg','image/png','image/webp') or v_file.file_size <= 0 or v_file.file_size > 10485760 then
      raise exception 'Invalid original image metadata';
    end if;
    select (metadata->>'size')::bigint, metadata->>'mimetype'
      into v_stored_size, v_stored_mime
      from storage.objects where bucket_id = 'order-files' and name = v_file.storage_path;
    if not found or v_stored_size is distinct from v_file.file_size or v_stored_mime is distinct from v_file.mime_type then
      raise exception 'Original image could not be verified';
    end if;
    insert into public.order_files(order_id, section_type, original_filename, storage_path, mime_type, file_size, uploaded_by)
    values (v_order.id, 'ORIGINAL', v_file.original_filename, v_file.storage_path, v_file.mime_type, v_file.file_size, auth.uid());
    perform public.add_order_activity(v_order.id, auth.uid(), 'ORIGINAL_UPLOADED', jsonb_build_object('filename', v_file.original_filename));
  end loop;
  return v_order;
end;
$$;

create or replace function public.accept_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_name text;
begin
  if not public.is_active_user() then raise exception 'Account is disabled or unauthorized' using errcode = '42501'; end if;
  if p_section_type = 'ORIGINAL' then raise exception 'Original files are read-only after order creation'; end if;

  update public.orders
  set accepted_by = auth.uid(), accepted_at = now(), workflow_status = 'IN_PROGRESS'
  where id = p_order_id and deleted_at is null and accepted_by is null and workflow_status = 'UNASSIGNED'
  returning * into v_order;

  if v_order.id is null then
    select coalesce(p.display_name, p.username, 'another employee') into v_name
    from public.orders o left join public.profiles p on p.id = o.accepted_by
    where o.id = p_order_id;
    if v_name is not null then raise exception 'This order has already been accepted by %.', v_name using errcode = 'P0001'; end if;
    raise exception 'Order not found or unavailable' using errcode = 'P0002';
  end if;

  perform public.add_order_activity(p_order_id, auth.uid(), 'ORDER_ACCEPTED', '{}'::jsonb);
  return v_order;
end;
$$;

create or replace function public.change_order_priority(p_order_id uuid, p_priority public.order_priority)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.order_priority;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and (role = 'ADMIN' or can_change_priority)) then
    raise exception 'You do not have permission to change priority' using errcode = '42501';
  end if;
  select priority into v_old from public.orders where id = p_order_id and deleted_at is null for update;
  if not found then raise exception 'Order not found'; end if;
  update public.orders set priority = p_priority where id = p_order_id;
  if v_old is distinct from p_priority then
    perform public.add_order_activity(p_order_id, auth.uid(), 'PRIORITY_CHANGED', jsonb_build_object('from', v_old, 'to', p_priority));
  end if;
end;
$$;

create or replace function public.change_auxiliary_status(p_order_id uuid, p_status public.auxiliary_status)
returns void language plpgsql security definer set search_path = public as $$
declare v_old public.auxiliary_status;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and active and (role = 'ADMIN' or can_change_aux_status)) then
    raise exception 'You do not have permission to change auxiliary status' using errcode = '42501';
  end if;
  select auxiliary_status into v_old from public.orders where id = p_order_id and deleted_at is null for update;
  if not found then raise exception 'Order not found'; end if;
  update public.orders set auxiliary_status = p_status where id = p_order_id;
  if v_old is distinct from p_status then
    perform public.add_order_activity(p_order_id, auth.uid(), 'AUXILIARY_STATUS_CHANGED', jsonb_build_object('from', v_old, 'to', p_status));
  end if;
end;
$$;

create or replace function public.recompute_order_status(p_order_id uuid, p_user_id uuid default auth.uid(), p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_picking boolean;
  v_invoice boolean;
  v_ticket boolean;
  v_complete boolean;
begin
  select * into v_order from public.orders where id = p_order_id and deleted_at is null for update;
  if not found or v_order.accepted_by is null then return; end if;

  select
    (nullif(btrim(coalesce(v_order.picking_text, '')), '') is not null) or exists(
      select 1 from public.order_files where order_id = p_order_id and section_type = 'PICKING' and deleted_at is null
    ),
    exists(select 1 from public.order_files where order_id = p_order_id and section_type = 'INVOICE' and deleted_at is null),
    exists(select 1 from public.order_files where order_id = p_order_id and section_type = 'TICKET' and deleted_at is null)
  into v_picking, v_invoice, v_ticket;

  v_complete := v_picking and v_invoice and v_ticket;
  if v_complete and v_order.workflow_status <> 'COMPLETED' then
    update public.orders set workflow_status = 'COMPLETED', completed_at = now() where id = p_order_id;
    perform public.add_order_activity(p_order_id, p_user_id, 'ORDER_COMPLETED_AUTOMATICALLY', '{}'::jsonb);
  elsif not v_complete and v_order.workflow_status = 'COMPLETED' then
    update public.orders set workflow_status = 'IN_PROGRESS', completed_at = null where id = p_order_id;
    perform public.add_order_activity(p_order_id, p_user_id, 'ORDER_REOPENED_AUTOMATICALLY', jsonb_build_object('reason', coalesce(p_reason, 'A required section was removed')));
  elsif not v_complete and v_order.workflow_status <> 'IN_PROGRESS' then
    update public.orders set workflow_status = 'IN_PROGRESS', completed_at = null where id = p_order_id;
  end if;
end;
$$;

create or replace function public.register_order_file(
  p_order_id uuid,
  p_section_type public.file_section,
  p_original_filename text,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint,
  p_replaced_file_id uuid default null
) returns public.order_files
language plpgsql security definer set search_path = public as $$
declare
  v_file public.order_files;
  v_old public.order_files;
  v_action text;
begin
  if not public.is_active_user() then raise exception 'Account is disabled or unauthorized' using errcode = '42501'; end if;
  if p_file_size <= 0 or p_file_size > 10485760 then raise exception 'Invalid file size'; end if;
  if p_section_type = 'INVOICE' and p_mime_type <> 'application/pdf' then raise exception 'Invoice must be a PDF'; end if;
  if p_section_type in ('ORIGINAL', 'PICKING') and p_mime_type not in ('image/jpeg','image/png','image/webp') then raise exception 'Unsupported image type'; end if;
  if p_section_type = 'TICKET' and p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'Unsupported ticket type'; end if;
  if not exists (select 1 from public.orders where id = p_order_id and deleted_at is null) then raise exception 'Order not found'; end if;
  if p_section_type <> 'ORIGINAL' and not exists (select 1 from public.orders where id = p_order_id and accepted_by is not null and deleted_at is null) then
    raise exception 'Accept the order before adding processing files';
  end if;

  if p_replaced_file_id is not null then
    select * into v_old from public.order_files
    where id = p_replaced_file_id and order_id = p_order_id and section_type = p_section_type and deleted_at is null for update;
    if not found then raise exception 'The file to replace is no longer available'; end if;
    update public.order_files set deleted_at = now(), deleted_by = auth.uid() where id = p_replaced_file_id;
    v_action := p_section_type::text || '_REPLACED';
  else
    v_action := p_section_type::text || '_UPLOADED';
  end if;

  insert into public.order_files(order_id, section_type, original_filename, storage_path, mime_type, file_size, uploaded_by)
  values (p_order_id, p_section_type, p_original_filename, p_storage_path, p_mime_type, p_file_size, auth.uid())
  returning * into v_file;

  if p_replaced_file_id is not null then
    update public.order_files set replaced_by_file_id = v_file.id where id = p_replaced_file_id;
  end if;
  perform public.add_order_activity(p_order_id, auth.uid(), v_action, jsonb_build_object('file_id', v_file.id, 'filename', p_original_filename));
  perform public.recompute_order_status(p_order_id, auth.uid(), initcap(lower(p_section_type::text)) || ' was replaced');
  return v_file;
end;
$$;

create or replace function public.delete_order_file(p_order_id uuid, p_file_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_file public.order_files;
begin
  if not public.is_active_user() then raise exception 'Account is disabled or unauthorized' using errcode = '42501'; end if;
  select * into v_file from public.order_files
  where id = p_file_id and order_id = p_order_id and deleted_at is null and section_type <> 'ORIGINAL' for update;
  if not found then raise exception 'File not found or original files cannot be deleted'; end if;
  update public.order_files set deleted_at = now(), deleted_by = auth.uid() where id = p_file_id;
  perform public.add_order_activity(p_order_id, auth.uid(), v_file.section_type::text || '_DELETED', jsonb_build_object('file_id', p_file_id, 'filename', v_file.original_filename));
  perform public.recompute_order_status(p_order_id, auth.uid(), initcap(lower(v_file.section_type::text)) || ' was removed');
  return v_file.storage_path;
end;
$$;

create or replace function public.set_picking_text(p_order_id uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_user() then raise exception 'Account is disabled or unauthorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.orders where id = p_order_id and accepted_by is not null and deleted_at is null) then
    raise exception 'Accept the order before updating Picking';
  end if;
  update public.orders set picking_text = nullif(btrim(coalesce(p_text, '')), '') where id = p_order_id;
  perform public.add_order_activity(p_order_id, auth.uid(), case when nullif(btrim(coalesce(p_text, '')), '') is null then 'PICKING_TEXT_CLEARED' else 'PICKING_TEXT_UPDATED' end, '{}'::jsonb);
  perform public.recompute_order_status(p_order_id, auth.uid(), 'Picking text was removed');
end;
$$;

create or replace function public.archive_order(p_order_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  update public.orders set deleted_at = now(), deleted_by = auth.uid(), deletion_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_order_id and deleted_at is null;
  if not found then raise exception 'Order not found'; end if;
  perform public.add_order_activity(p_order_id, auth.uid(), 'ORDER_ARCHIVED', jsonb_build_object('reason', p_reason));
end;
$$;

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_files enable row level security;
alter table public.order_activity_logs enable row level security;
alter table public.order_number_counters enable row level security;

create policy profiles_read_for_active_users on public.profiles for select to authenticated using (public.is_active_user());
create policy orders_read_for_active_users on public.orders for select to authenticated using (public.is_active_user() and deleted_at is null);
create policy files_read_for_active_users on public.order_files for select to authenticated using (public.is_active_user() and deleted_at is null);
create policy activity_read_for_active_users on public.order_activity_logs for select to authenticated using (public.is_active_user());

revoke all on public.order_number_counters from anon, authenticated;
revoke insert, update, delete on public.profiles, public.orders, public.order_files, public.order_activity_logs from anon, authenticated;
grant select on public.profiles, public.orders, public.order_files, public.order_activity_logs to authenticated;
grant usage, select on sequence public.order_activity_logs_id_seq to authenticated;

create or replace view public.orders_dashboard with (security_invoker = true) as
select
  o.*,
  accepted.username as accepted_by_username,
  accepted.display_name as accepted_by_display_name,
  creator.username as created_by_username,
  creator.display_name as created_by_display_name,
  ((nullif(btrim(coalesce(o.picking_text, '')), '') is not null) or exists(
    select 1 from public.order_files f where f.order_id = o.id and f.section_type = 'PICKING' and f.deleted_at is null
  )) as picking_ready,
  exists(select 1 from public.order_files f where f.order_id = o.id and f.section_type = 'INVOICE' and f.deleted_at is null) as invoice_ready,
  exists(select 1 from public.order_files f where f.order_id = o.id and f.section_type = 'TICKET' and f.deleted_at is null) as ticket_ready
from public.orders o
join public.profiles creator on creator.id = o.created_by
left join public.profiles accepted on accepted.id = o.accepted_by
where o.deleted_at is null;

create or replace view public.order_activity_with_actor with (security_invoker = true) as
select l.*, p.username as actor_username, p.display_name as actor_display_name
from public.order_activity_logs l
left join public.profiles p on p.id = l.user_id;

grant select on public.orders_dashboard, public.order_activity_with_actor to authenticated;

create or replace function public.search_orders(p_from date, p_to date, p_query text default null)
returns setof public.orders_dashboard
language sql stable security invoker set search_path = public as $$
  select d.*
  from public.orders_dashboard d
  where d.order_date between p_from and p_to
    and (
      nullif(btrim(coalesce(p_query, '')), '') is null
      or d.customer_name ilike '%' || p_query || '%'
      or d.original_text ilike '%' || p_query || '%'
      or d.accepted_by_username ilike '%' || p_query || '%'
      or d.created_by_username ilike '%' || p_query || '%'
      or d.daily_order_number = case when p_query ~ '^#?[0-9]+$' then regexp_replace(p_query, '[^0-9]', '', 'g')::integer else null end
    )
  order by d.order_date desc, d.daily_order_number desc
  limit 500;
$$;

create or replace function public.get_order_statistics(p_from date, p_to date, p_query text default null)
returns table(total bigint, completed bigint, unassigned bigint, in_progress bigint, pending_confirmation bigint, out_of_stock bigint)
language sql stable security definer set search_path = public as $$
  select
    count(*) as total,
    count(*) filter (where o.workflow_status = 'COMPLETED') as completed,
    count(*) filter (where o.workflow_status = 'UNASSIGNED') as unassigned,
    count(*) filter (where o.workflow_status = 'IN_PROGRESS') as in_progress,
    count(*) filter (where o.auxiliary_status = 'PENDING_CONFIRMATION') as pending_confirmation,
    count(*) filter (where o.auxiliary_status = 'OUT_OF_STOCK') as out_of_stock
  from public.orders o
  join public.profiles creator on creator.id = o.created_by
  left join public.profiles accepted on accepted.id = o.accepted_by
  where public.is_active_user()
    and o.deleted_at is null
    and o.order_date between p_from and p_to
    and (
      nullif(btrim(coalesce(p_query, '')), '') is null
      or o.customer_name ilike '%' || p_query || '%'
      or o.original_text ilike '%' || p_query || '%'
      or creator.username ilike '%' || p_query || '%'
      or accepted.username ilike '%' || p_query || '%'
      or o.daily_order_number = case when p_query ~ '^#?[0-9]+$' then regexp_replace(p_query, '[^0-9]', '', 'g')::integer else null end
    );
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.business_date(timestamptz) from public;
revoke all on function public.is_active_user(uuid) from public;
revoke all on function public.is_admin(uuid) from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.add_order_activity(uuid,uuid,text,jsonb) from public;
revoke all on function public.create_order(text,text,text,public.order_priority,jsonb) from public;
revoke all on function public.accept_order(uuid) from public;
revoke all on function public.change_order_priority(uuid,public.order_priority) from public;
revoke all on function public.change_auxiliary_status(uuid,public.auxiliary_status) from public;
revoke all on function public.recompute_order_status(uuid,uuid,text) from public;
revoke all on function public.register_order_file(uuid,public.file_section,text,text,text,bigint,uuid) from public;
revoke all on function public.delete_order_file(uuid,uuid) from public;
revoke all on function public.set_picking_text(uuid,text) from public;
revoke all on function public.archive_order(uuid,text) from public;
revoke all on function public.get_order_statistics(date,date,text) from public;
revoke all on function public.search_orders(date,date,text) from public;

grant execute on function public.business_date(timestamptz) to authenticated;
grant execute on function public.is_active_user(uuid) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.create_order(text,text,text,public.order_priority,jsonb) to authenticated;
grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.change_order_priority(uuid,public.order_priority) to authenticated;
grant execute on function public.change_auxiliary_status(uuid,public.auxiliary_status) to authenticated;
grant execute on function public.register_order_file(uuid,public.file_section,text,text,text,bigint,uuid) to authenticated;
grant execute on function public.delete_order_file(uuid,uuid) to authenticated;
grant execute on function public.set_picking_text(uuid,text) to authenticated;
grant execute on function public.archive_order(uuid,text) to authenticated;
grant execute on function public.get_order_statistics(date,date,text) to authenticated;
grant execute on function public.search_orders(date,date,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'order-files',
  'order-files',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_files') then
    alter publication supabase_realtime add table public.order_files;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_activity_logs') then
    alter publication supabase_realtime add table public.order_activity_logs;
  end if;
end $$;
