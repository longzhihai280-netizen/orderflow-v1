-- Repair the accept-order RPC and keep original order images immutable after creation.

create or replace function public.accept_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_name text;
begin
  if not public.is_active_user() then raise exception 'Account is disabled or unauthorized' using errcode = '42501'; end if;

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

revoke all on function public.accept_order(uuid) from public;
grant execute on function public.accept_order(uuid) to authenticated;

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
  if p_section_type = 'ORIGINAL' then raise exception 'Original files are read-only after order creation'; end if;
  if p_file_size <= 0 or p_file_size > 10485760 then raise exception 'Invalid file size'; end if;
  if p_section_type = 'INVOICE' and p_mime_type <> 'application/pdf' then raise exception 'Invoice must be a PDF'; end if;
  if p_section_type = 'PICKING' and p_mime_type not in ('image/jpeg','image/png','image/webp') then raise exception 'Unsupported image type'; end if;
  if p_section_type = 'TICKET' and p_mime_type not in ('image/jpeg','image/png','image/webp','application/pdf') then raise exception 'Unsupported ticket type'; end if;
  if not exists (select 1 from public.orders where id = p_order_id and deleted_at is null) then raise exception 'Order not found'; end if;
  if not exists (select 1 from public.orders where id = p_order_id and accepted_by is not null and deleted_at is null) then
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

revoke all on function public.register_order_file(uuid, public.file_section, text, text, text, bigint, uuid) from public;
grant execute on function public.register_order_file(uuid, public.file_section, text, text, text, bigint, uuid) to authenticated;
