type ContentRequestInput = {
  subject: string;
  details: string;
};

type ContentRequestResult =
  | { ok: true; value: ContentRequestInput }
  | { ok: false; errors: Partial<Record<keyof ContentRequestInput, string>> };

export function validateContentRequest(input: ContentRequestInput): ContentRequestResult {
  const value = {
    subject: input.subject.trim(),
    details: input.details.trim(),
  };
  const errors: Partial<Record<keyof ContentRequestInput, string>> = {};

  if (value.subject.length < 5) errors.subject = 'Use at least 5 characters.';
  if (value.details.length < 20) {
    errors.details = 'Add at least 20 characters so Leon knows what to change.';
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
