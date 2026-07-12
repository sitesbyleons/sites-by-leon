function safeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

export function readInternalIdentity(request: Request) {
  const expectedSecret = Deno.env.get('SITE_FUNCTION_SECRET') ?? '';
  const providedSecret = request.headers.get('x-site-api-secret') ?? '';
  const userId = request.headers.get('x-clerk-user-id') ?? '';

  if (!expectedSecret || !providedSecret || !safeEqual(providedSecret, expectedSecret)) return null;
  return /^user_[A-Za-z0-9_-]+$/.test(userId) ? { userId } : null;
}
