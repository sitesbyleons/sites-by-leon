type Field = 'name' | 'email' | 'phone' | 'desiredDate' | 'message';
type InquiryErrors = Partial<Record<Field | 'message', string>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function validateInquiry(input: unknown) {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const payload = {
    name: text(source.name),
    email: text(source.email).toLowerCase(),
    phone: text(source.phone),
    desiredDate: text(source.desiredDate),
    message: text(source.message),
    company: text(source.company),
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
  return Object.keys(errors).length
    ? { ok: false as const, errors }
    : { ok: true as const, payload };
}
