export const siteTemplateOptions = [
  { key: 'sports', label: 'Sports editorial', description: 'High-impact grids for games, athletes, and teams.' },
  { key: 'editorial', label: 'Wedding editorial', description: 'Quiet, image-led layouts for weddings and couples.' },
  { key: 'commercial', label: 'Commercial portfolio', description: 'A disciplined grid for campaigns, products, and commissions.' },
] as const;

export const planOptions = [
  { key: 'essential', label: 'Essential', monthlyUsd: 25, storageGb: 50 },
  { key: 'studio', label: 'Studio', monthlyUsd: 35, storageGb: 100 },
] as const;

export type SiteTemplateKey = (typeof siteTemplateOptions)[number]['key'];
export type SitePlanKey = (typeof planOptions)[number]['key'];

export type SiteProvisioningInput = {
  ownerUserId: string;
  studioName: string;
  slug: string;
  primaryDomain: string;
  adminDomain: string;
  templateKey: SiteTemplateKey;
  planKey: SitePlanKey;
  quotaBytes: number;
  githubRepository: string | null;
  idempotencyKey: string;
};

export type SiteProvisioningValidation =
  | { ok: true; value: SiteProvisioningInput }
  | { ok: false; errors: Record<string, string> };

const templateKeys = new Set<string>(siteTemplateOptions.map((option) => option.key));
const planKeys = new Set<string>(planOptions.map((option) => option.key));
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const domainPattern = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const repositoryPattern = /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i;
const idempotencyPattern = /^[a-zA-Z0-9:_-]{16,128}$/;
const reservedLeonDomains = new Set([
  'leonsites.org',
  'www.leonsites.org',
  'test.leonsites.org',
  'demo.leonsites.org',
  'api.leonsites.org',
  'accounts.leonsites.org',
  'clerk.leonsites.org',
]);

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeSiteSlug(value: unknown) {
  return text(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function normalizeSiteDomain(value: unknown) {
  const raw = text(value).toLowerCase();
  const withoutProtocol = raw.replace(/^https?:\/\//, '');
  return withoutProtocol.replace(/\/$/, '').replace(/\.$/, '');
}

export function validateSiteProvisioningInput(
  input: unknown,
  options: { adminDomainSuffix?: string } = {},
): SiteProvisioningValidation {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const ownerUserId = text(source.owner_user_id ?? source.ownerUserId);
  const studioName = text(source.studio_name ?? source.studioName);
  const slug = normalizeSiteSlug(source.slug);
  const primaryDomain = normalizeSiteDomain(source.primary_domain ?? source.primaryDomain);
  const adminDomain = normalizeSiteDomain(source.admin_domain ?? source.adminDomain);
  const templateKey = text(source.template_key ?? source.templateKey);
  const planKey = text(source.plan_key ?? source.planKey);
  const githubRepositoryValue = text(source.github_repository ?? source.githubRepository);
  const idempotencyKey = text(source.idempotency_key ?? source.idempotencyKey);
  const errors: Record<string, string> = {};

  if (!/^user_[a-zA-Z0-9_-]{4,}$/.test(ownerUserId)) errors.owner_user_id = 'Choose a valid Clerk user.';
  if (studioName.length < 2 || studioName.length > 80) errors.studio_name = 'Use a studio name between 2 and 80 characters.';
  if (slug.length < 3 || !slugPattern.test(slug)) errors.slug = 'Use at least 3 letters or numbers, separated with hyphens.';
  if (!domainPattern.test(primaryDomain)) errors.primary_domain = 'Enter a full domain such as studio.leonsites.org.';
  if (!domainPattern.test(adminDomain)) errors.admin_domain = 'Enter a full admin domain such as studio.leonsites.org.';
  if (reservedLeonDomains.has(primaryDomain)) errors.primary_domain = 'That Leon Sites address is reserved.';
  if (reservedLeonDomains.has(adminDomain)) errors.admin_domain = 'That Leon Sites address is reserved.';
  const adminDomainSuffix = options.adminDomainSuffix ?? 'leonsites.org';
  if (adminDomain !== adminDomainSuffix && !adminDomain.endsWith(`.${adminDomainSuffix}`)) {
    errors.admin_domain = `Private site administration must use a ${adminDomainSuffix} address.`;
  }
  if (!templateKeys.has(templateKey)) errors.template_key = 'Choose a supported starter design.';
  if (!planKeys.has(planKey)) errors.plan_key = 'Choose a supported monthly plan.';
  if (githubRepositoryValue && !repositoryPattern.test(githubRepositoryValue)) {
    errors.github_repository = 'Use the GitHub owner/repository format.';
  }
  if (!idempotencyPattern.test(idempotencyKey)) errors.idempotency_key = 'Refresh the page and try again.';

  if (Object.keys(errors).length) return { ok: false, errors };
  const selectedPlan = planOptions.find((option) => option.key === planKey)!;
  return {
    ok: true,
    value: {
      ownerUserId,
      studioName,
      slug,
      primaryDomain,
      adminDomain,
      templateKey: templateKey as SiteTemplateKey,
      planKey: planKey as SitePlanKey,
      quotaBytes: selectedPlan.storageGb * 1024 * 1024 * 1024,
      githubRepository: githubRepositoryValue || null,
      idempotencyKey,
    },
  };
}
