begin;
select plan(17);

select has_table('public', 'orders', 'orders table exists');
select has_table('public', 'order_files', 'order files table exists');
select has_table('public', 'order_activity_logs', 'activity table exists');
select has_function('public', 'create_order', array['text','text','text','order_priority','jsonb'], 'atomic create order function exists');
select has_function('public', 'accept_order', array['uuid'], 'atomic accept function exists');
select has_function('public', 'recompute_order_status', array['uuid','uuid','text'], 'completion function exists');
select col_is_pk('public', 'orders', 'id', 'orders use an internal primary key');
select has_index('public', 'orders', 'daily_order_number_unique', 'daily number is unique within a business date');
select policies_are('public', 'orders', array['orders_read_for_active_users'], 'orders are protected by RLS');
select has_column('public', 'orders', 'deleted_at', 'orders retain soft deletion timestamp');
select has_column('public', 'orders', 'deleted_by', 'orders retain soft deletion actor');
select has_table('public', 'order_additions', 'order additions table exists');
select has_column('public', 'order_files', 'addition_id', 'order files can belong to an addition');
select has_function('public', 'create_order_addition', array['uuid','text','jsonb'], 'atomic addition function exists');
select has_table('public', 'chat_messages', 'chat messages table exists');
select has_table('public', 'chat_attachments', 'chat attachments table exists');
select has_function('public', 'share_order_to_chat', array['uuid'], 'structured order sharing function exists');

select * from finish();
rollback;
