import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';

type Field = 'name' | 'email' | 'focus' | 'message';
type Errors = Partial<Record<Field, string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const allowedOrigins = (Deno.env.get('SITE_ORIGIN') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsHeaders = (origin: string | null) => ({
  ...(origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

const respond = (origin: string | null, body: object, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const validate = (input: unknown) => {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const payload = {
    name: text(source.name),
    email: text(source.email).toLowerCase(),
    focus: text(source.focus),
    message: text(source.message),
    company: text(source.company),
  };
  const errors: Errors = {};

  if (payload.name.length < 2 || payload.name.length > 80) errors.name = 'Enter a name between 2 and 80 characters.';
  if (payload.email.length > 254 || !emailPattern.test(payload.email)) errors.email = 'Enter a valid email address.';
  if (payload.focus.length < 2 || payload.focus.length > 80) errors.focus = 'Enter a photography focus between 2 and 80 characters.';
  if (payload.message.length < 20 || payload.message.length > 2000) errors.message = 'Enter a message between 20 and 2,000 characters.';

  return Object.keys(errors).length ? { ok: false as const, errors } : { ok: true as const, payload };
};

async function digestIp(ip: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${ip}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  const originAllowed = Boolean(origin && allowedOrigins.includes(origin));

  if (request.method === 'OPTIONS') {
    return originAllowed
      ? new Response(null, { status: 204, headers: corsHeaders(origin) })
      : respond(origin, { ok: false }, 403);
  }

  if (request.method !== 'POST') return respond(origin, { ok: false }, 405);
  if (!originAllowed) return respond(origin, { ok: false }, 403);

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 24_000) return respond(origin, { ok: false }, 413);

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return respond(origin, { ok: false }, 400);
  }

  const validation = validate(input);
  if (!validation.ok) return respond(origin, { ok: false, errors: validation.errors }, 422);
  if (validation.payload.company) return respond(origin, { ok: false }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const hashSalt = Deno.env.get('CONTACT_HASH_SALT');
  if (!supabaseUrl || !serviceRoleKey || !hashSalt) return respond(origin, { ok: false }, 503);

  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const sourceIp = forwardedIp || request.headers.get('cf-connecting-ip') || 'unknown';
  const ipHash = await digestIp(sourceIp, hashSalt);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from('contact_inquiries')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since);

  if (countError) return respond(origin, { ok: false }, 503);
  if ((count ?? 0) >= 5) return respond(origin, { ok: false }, 429);

  const { error } = await supabase.from('contact_inquiries').insert({
    name: validation.payload.name,
    email: validation.payload.email,
    focus: validation.payload.focus,
    message: validation.payload.message,
    ip_hash: ipHash,
  });

  return error ? respond(origin, { ok: false }, 503) : respond(origin, { ok: true }, 200);
});
