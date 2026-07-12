export type ContactPayload = {
  name: string;
  email: string;
  focus: string;
  message: string;
  company?: string;
};

export type ContactField = 'name' | 'email' | 'focus' | 'message';
export type ContactErrors = Partial<Record<ContactField, string>>;

export type ContactResult =
  | { ok: true; payload: ContactPayload }
  | { ok: false; errors: ContactErrors };

export type SubmitResult =
  | { ok: true }
  | {
      ok: false;
      kind: 'configuration' | 'validation' | 'network' | 'server';
      message: string;
      errors?: ContactErrors;
    };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function validateContact(input: unknown): ContactResult {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const payload: ContactPayload = {
    name: asString(source.name),
    email: asString(source.email).toLowerCase(),
    focus: asString(source.focus),
    message: asString(source.message),
    company: asString(source.company),
  };

  const errors: ContactErrors = {};

  if (payload.name.length < 2 || payload.name.length > 80) {
    errors.name = 'Please enter your name (2–80 characters).';
  }
  if (payload.email.length > 254 || !emailPattern.test(payload.email)) {
    errors.email = 'Please enter a valid email address.';
  }
  if (payload.focus.length < 2 || payload.focus.length > 80) {
    errors.focus = 'Tell me what kind of photography you focus on.';
  }
  if (payload.message.length < 20 || payload.message.length > 2000) {
    errors.message = 'Please share at least 20 characters and no more than 2,000.';
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, payload };
}

export async function submitContact(payload: ContactPayload, endpoint?: string): Promise<SubmitResult> {
  const validation = validateContact(payload);
  if (!validation.ok) {
    return {
      ok: false,
      kind: 'validation',
      message: 'Please check the highlighted fields.',
      errors: validation.errors,
    };
  }

  if (!endpoint) {
    return {
      ok: false,
      kind: 'configuration',
      message: 'Online sending is not connected yet. Please use the direct email link instead.',
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validation.payload),
    });

    if (response.ok) return { ok: true };

    if (response.status === 422) {
      const data = (await response.json().catch(() => null)) as { errors?: ContactErrors } | null;
      return {
        ok: false,
        kind: 'validation',
        message: 'Please check the highlighted fields.',
        errors: data?.errors,
      };
    }

    return {
      ok: false,
      kind: 'server',
      message: 'The message could not be sent right now. Please email Leon directly.',
    };
  } catch {
    return {
      ok: false,
      kind: 'network',
      message: 'The connection was interrupted. Your details are still here—please try again or email Leon.',
    };
  }
}
