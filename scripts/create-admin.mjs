import { createClient } from "@supabase/supabase-js";

const [email, password, username, displayName] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key || !email || !password || !username || !displayName) {
  console.error('Usage: pnpm admin:create -- email@example.com "Strong password" username "Display Name"');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { username, display_name: displayName }
});
if (error) throw error;

const { error: profileError } = await supabase
  .from("profiles")
  .update({ username: username.toLowerCase(), display_name: displayName, role: "ADMIN", active: true })
  .eq("id", data.user.id);
if (profileError) throw profileError;

console.log(`Admin created: ${email} (${data.user.id})`);
