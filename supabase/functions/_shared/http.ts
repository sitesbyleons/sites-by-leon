export const dashboardOrigin = () => Deno.env.get('DASHBOARD_ORIGIN') ?? '';

export const corsHeaders = (origin: string | null) => ({
  ...(origin && origin === dashboardOrigin() ? { 'Access-Control-Allow-Origin': origin } : {}),
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

export const json = (origin: string | null, body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });

export function allowedDashboardRequest(request: Request) {
  const origin = request.headers.get('origin');
  return Boolean(dashboardOrigin() && origin === dashboardOrigin());
}

export function bearerToken(request: Request) {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
}
