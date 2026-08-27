type Field = 'name' | 'email' | 'phone' | 'desiredDate' | 'message' | 'instagram';
type InquiryErrors = Partial<Record<Field | 'message', string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const utcDate = (value: Date) => value.toISOString().slice(0, 10);

const normalizeInstagram = (value: string) => value.replace(/^@+/, '').replace(/\s+/g, '').slice(0, 40);

export const canAcceptInquiry = (workspaceStatus: string, siteStatus: string) =>
  (workspaceStatus === 'active' || workspaceStatus === 'lead') && siteStatus === 'active';

export function validateInquiry(input: unknown) {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const instagram = normalizeInstagram(text(source.instagram));
  const rawName = text(source.name);
  const payload = {
    name: rawName || instagram,
    email: text(source.email).toLowerCase(),
    phone: text(source.phone),
    desiredDate: text(source.desiredDate) || utcDate(new Date()),
    message: text(source.message),
    company: text(source.company),
    instagram,
  };
  const errors: InquiryErrors = {};

  if (payload.company) return { ok: false as const, errors: { message: 'Invalid request.' } };
  if (payload.name.length < 2 || payload.name.length > 120) errors.name = 'Enter your name.';
  if (payload.email && (payload.email.length > 254 || !emailPattern.test(payload.email))) errors.email = 'Enter a valid email address.';
  if (payload.phone && (payload.phone.length < 7 || payload.phone.length > 32)) errors.phone = 'Enter a valid phone number.';
  if (!payload.email && !payload.phone) {
    errors.email = 'Enter an email address or phone number.';
    errors.phone = 'Enter an email address or phone number.';
  }
  const date = new Date(`${payload.desiredDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.desiredDate) || Number.isNaN(date.valueOf())) errors.desiredDate = 'Choose a date.';
  if (payload.message.length < 10 || payload.message.length > 3000) errors.message = 'Enter a message between 10 and 3,000 characters.';
  if (Object.keys(errors).length) return { ok: false as const, errors };

  const instagramLine = payload.instagram ? `Instagram: @${payload.instagram}\n\n` : '';
  const message = `${instagramLine}${payload.message}`.slice(0, 3000);
  return { ok: true as const, payload: { ...payload, message } };
}

export const inquiryInstagramHandle = (message: string) => {
  const match = message.match(/^Instagram: @([A-Za-z0-9._]+)/);
  return match?.[1] ?? null;
};

export const inquiryPublicMessage = (message: string) =>
  message.replace(/^Instagram: @[A-Za-z0-9._]+\s*/, '').trim();
