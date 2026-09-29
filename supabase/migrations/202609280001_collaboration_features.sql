-- OrderFlow V1.1: multi-file progress, immutable order additions and shared chat.
-- This migration is additive and safe to apply to an existing V1 database.

drop index if exists public.one_active_processing_file_per_section;

create table public.order_additions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  addition_text text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  constraint order_addition_text_length check (addition_text is null or char_length(addition_text) <= 20000)
);

alter table public.order_files
  add column addition_id uuid references public.order_additions(id) on delete restrict;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  message_text text,
  order_id uuid references public.orders(id) on delete restrict,
  sender_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  constraint chat_message_text_length check (message_text is null or char_length(message_text) <= 10000)
);

create table public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id) on delete restrict,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  uploaded_by uuid not null references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id)
);

create index order_additions_order_time_idx on public.order_additions(order_id, created_at) where deleted_at is null;
create index order_additions_text_trgm_idx on public.order_additions using gin (addition_text gin_trgm_ops);
create index order_files_addition_idx on public.order_files(addition_id) where deleted_at is null and addition_id is not null;
create index chat_messages_time_idx on public.chat_messages(created_at desc) where deleted_at is null;
create index chat_attachments_message_idx on public.chat_attachments(message_id) where deleted_at is null;

alter table public.order_additions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_attachments enable row level security;

create policy order_additions_read_for_active_users on public.order_additions
  for select to authenticated using (
    public.is_active_user()
    and deleted_at is null
    and exists (select 1 from public.orders o where o.id = order_id and o.deleted_at is null)
  );
create policy chat_messages_read_for_active_users on public.chat_messages
  for select to authenticated using (public.is_active_user() and deleted_at is null);
create policy chat_attachments_read_for_active_users on public.chat_attachments
  for select to authenticated using (
    public.is_active_user()
    and deleted_at is null
    and exists (
      select 1 from public.chat_messages m
      where m.id = message_id and m.deleted_at is null
    )
  );

revoke insert, update, delete on public.order_additions, public.chat_messages, public.chat_attachments from anon, authenticated;
grant select on public.order_additions, public.chat_messages, public.chat_attachments to authenticated;

create or replace view public.order_additions_with_creator with (security_invoker = true) as
select
  a.*,
  p.username as creator_username,
  p.display_name as creator_display_name
from public.order_additions a
join public.profiles p on p.id = a.created_by
where a.deleted_at is null;

create or replace view public.chat_messages_with_sender with (security_invoker = true) as
select
  m.id,
  m.message_text,
  m.order_id,
  m.sender_id,
  m.created_at,
  p.username as sender_username,
  p.display_name as sender_display_name,
  o.daily_order_number,
  o.customer_name as order_customer_name,
  o.priority as order_priority,
  o.workflow_status as order_workflow_status,
  accepted.display_name as order_accepted_by_display_name
from public.chat_messages m
join public.profiles p on p.id = m.sender_id
left join public.orders o on o.id = m.order_id and o.deleted_at is null
left join public.profiles accepted on accepted.id = o.accepted_by
where m.deleted_at is null;

grant select on public.order_additions_with_creator, public.chat_messages_with_sender to authenticated;

create or replace function public.create_order_addition(
  p_order_id uuid,
  p_text text default null,
  p_files jsonb default '[]'::jsonb
) returns public.order_additions
language plpgsql security definer set search_path = public as $$
declare
  v_addition public.order_additions;
  v_file record;
  v_stored_size bigint;
  v_stored_mime text;
begin
  if not public.is_active_user() then raise exception 'Account is disabled or unauthorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.orders where id = p_order_id and deleted_at is null) then
    raise exception 'Order not found';
  end if;
  p_text := nullif(btrim(coalesce(p_text, '')), '');
  if p_text is null and jsonb_array_length(coalesce(p_files, '[]'::jsonb)) = 0 then
    raise exception 'Add text or at least one image';
  end if;
  if char_length(coalesce(p_text, '')) > 20000 then raise exception 'Addition text is too long'; end if;
  if jsonb_array_length(coalesce(p_files, '[]'::jsonb)) > 8 then raise exception 'A maximum of 8 images is allowed per addition'; end if;

  insert into public.order_additions(order_id, addition_text, created_by)
  values (p_order_id, p_text, auth.uid())
  returning * into v_addition;

  for v_file in
    select * from jsonb_to_recordset(coalesce(p_files, '[]'::jsonb)) as x(
      original_filename text, storage_path text, mime_type text, file_size bigint
    )
  loop
    if v_file.storage_path not like ('orders/' || p_order_id::text || '/additions/' || auth.uid()::text || '/%')
       or v_file.storage_path like '%..%' then
      raise exception 'Invalid addition image path';
    end if;
    if v_file.mime_type not in ('image/jpeg','image/png','image/webp')
       or v_file.file_size <= 0 or v_file.file_size > 10485760 then
      raise exception 'Invalid addition image metadata';
    end if;
    select (metadata->>'size')::bigint, metadata->>'mimetype'
      into v_stored_size, v_stored_mime
      from storage.objects where bucket_id = 'order-files' and name = v_file.storage_path;
    if not found or v_stored_size is distinct from v_file.file_size or v_stored_mime is distinct from v_file.mime_type then
      raise exception 'Addition image could not be verified';
    end if;
    insert into public.order_files(
      order_id, section_type, addition_id, original_filename, storage_path, mime_type, file_size, uploaded_by
    ) values (
      p_order_id, 'ORIGINAL', v_addition.id, v_file.original_filename, v_file.storage_path,
      v_file.mime_type, v_file.file_size, auth.uid()
    );
  end loop;

  perform public.add_order_activity(
    p_order_id,
    auth.uid(),
    'ORDER_ADDITION_ADDED',
    jsonb_build_object('addition_id', v_addition.id, 'image_count', jsonb_array_length(coalesce(p_files, '[]'::jsonb)))
  );
  return v_addition;
end;
$$;

create or replace function public.create_chat_message(
  p_text text default null,
  p_order_id uuid default null,
  p_attachments jsonb default '[]'::jsonb
) returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare
  v_message public.chat_messages;
  v_file record;
  v_stored_size bigint;
  v_stored_mime text;
begin
  if not public.is_active_user() then raise exception 'Account is disabled or unauthorized' using errcode = '42501'; end if;
  p_text := nullif(btrim(coalesce(p_text, '')), '');
  if p_text is null and p_order_id is null and jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) = 0 then
    raise exception 'Add a message, image or order';
  end if;
  if char_length(coalesce(p_text, '')) > 10000 then raise exception 'Message is too long'; end if;
  if jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 8 then raise exception 'A maximum of 8 images is allowed per message'; end if;
  if p_order_id is not null and not exists (select 1 from public.orders where id = p_order_id and deleted_at is null) then
    raise exception 'Order not found';
  end if;

  insert into public.chat_messages(message_text, order_id, sender_id)
  values (p_text, p_order_id, auth.uid())
  returning * into v_message;

  for v_file in
    select * from jsonb_to_recordset(coalesce(p_attachments, '[]'::jsonb)) as x(
      original_filename text, storage_path text, mime_type text, file_size bigint
    )
  loop
    if v_file.storage_path not like ('chat/' || auth.uid()::text || '/%') or v_file.storage_path like '%..%' then
      raise exception 'Invalid chat image path';
    end if;
    if v_file.mime_type not in ('image/jpeg','image/png','image/webp')
       or v_file.file_size <= 0 or v_file.file_size > 10485760 then
      raise exception 'Invalid chat image metadata';
    end if;
    select (metadata->>'size')::bigint, metadata->>'mimetype'
      into v_stored_size, v_stored_mime
      from storage.objects where bucket_id = 'order-files' and name = v_file.storage_path;
    if not found or v_stored_size is distinct from v_file.file_size or v_stored_mime is distinct from v_file.mime_type then
      raise exception 'Chat image could not be verified';
    end if;
    insert into public.chat_attachments(
      message_id, original_filename, storage_path, mime_type, file_size, uploaded_by
    ) values (
      v_message.id, v_file.original_filename, v_file.storage_path, v_file.mime_type, v_file.file_size, auth.uid()
    );
  end loop;
  return v_message;
end;
$$;

create or replace function public.share_order_to_chat(p_order_id uuid)
returns public.chat_messages
language plpgsql security definer set search_path = public as $$
declare v_message public.chat_messages;
begin
  if not public.is_active_user() then raise exception 'Account is disabled or unauthorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.orders where id = p_order_id and deleted_at is null) then
    raise exception 'Order not found';
  end if;
  insert into public.chat_messages(order_id, sender_id)
  values (p_order_id, auth.uid())
  returning * into v_message;
  perform public.add_order_activity(p_order_id, auth.uid(), 'ORDER_SHARED_TO_CHAT', jsonb_build_object('message_id', v_message.id));
  return v_message;
end;
$$;

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
      or exists (
        select 1 from public.order_additions a
        where a.order_id = d.id and a.deleted_at is null and a.addition_text ilike '%' || p_query || '%'
      )
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
      or exists (
        select 1 from public.order_additions a
        where a.order_id = o.id and a.deleted_at is null and a.addition_text ilike '%' || p_query || '%'
      )
      or creator.username ilike '%' || p_query || '%'
      or accepted.username ilike '%' || p_query || '%'
      or o.daily_order_number = case when p_query ~ '^#?[0-9]+$' then regexp_replace(p_query, '[^0-9]', '', 'g')::integer else null end
    );
$$;

revoke all on function public.create_order_addition(uuid,text,jsonb) from public;
revoke all on function public.create_chat_message(text,uuid,jsonb) from public;
revoke all on function public.share_order_to_chat(uuid) from public;
grant execute on function public.create_order_addition(uuid,text,jsonb) to authenticated;
grant execute on function public.create_chat_message(text,uuid,jsonb) to authenticated;
grant execute on function public.share_order_to_chat(uuid) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_additions') then
    alter publication supabase_realtime add table public.order_additions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_attachments') then
    alter publication supabase_realtime add table public.chat_attachments;
  end if;
end $$;
