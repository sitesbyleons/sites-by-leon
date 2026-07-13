export const validateStudioTicket = (input: { subject?: unknown; details?: unknown }) => {
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const details = typeof input.details === 'string' ? input.details.trim() : '';
  if (subject.length < 5 || subject.length > 120) {
    return { ok: false as const, message: 'Use a subject between 5 and 120 characters.' };
  }
  if (details.length < 20 || details.length > 2000) {
    return { ok: false as const, message: 'Add at least 20 characters of detail.' };
  }
  return { ok: true as const, value: { subject, details } };
};
