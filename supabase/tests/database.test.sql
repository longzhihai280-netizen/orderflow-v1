begin;
select plan(9);

select has_table('public', 'orders', 'orders table exists');
select has_table('public', 'order_files', 'order files table exists');
select has_table('public', 'order_activity_logs', 'activity table exists');
select has_function('public', 'create_order', array['text','text','text','order_priority','jsonb'], 'atomic create order function exists');
select has_function('public', 'accept_order', array['uuid'], 'atomic accept function exists');
select has_function('public', 'recompute_order_status', array['uuid','uuid','text'], 'completion function exists');
select col_is_pk('public', 'orders', 'id', 'orders use an internal primary key');
select has_index('public', 'orders', 'daily_order_number_unique', 'daily number is unique within a business date');
select policies_are('public', 'orders', array['orders_read_for_active_users'], 'orders are protected by RLS');

select * from finish();
rollback;
