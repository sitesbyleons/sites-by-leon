import { clerkClient } from '@clerk/astro/server';
import type { APIRoute } from 'astro';

import { checkAppAdmin } from '../../../lib/admin';
import { createPlatformDatabase } from '../../../lib/database';
import { isTrustedOrigin } from '../../../lib/request-security';
import { normalizeSiteSlug, validateSiteProvisioningInput } from '../../../lib/site-provisioning';

const DEFAULT_CAPACITY_BYTES = 20 * 1024 * 1024 * 1024;
const MAX_BODY_BYTES = 16 * 1024;

function platformCapacityBytes() {
  const configured = Number(process.env.PLATFORM_PROVISIONABLE_STORAGE_BYTES ?? DEFAULT_CAPACITY_BYTES);
  return Number.isSafeInteger(configured) && configured >= 1024 * 1024 * 1024
    ? configured
    : DEFAULT_CAPACITY_BYTES;
}

export const POST: APIRoute = async (context) => {
  const { request, locals, url } = context;
  if (!isTrustedOrigin(request.headers.get('origin'), url.origin)) {
    return Response.json({ message: 'This request could not be verified.' }, { status: 403 });
  }
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ message: 'The request is too large.' }, { status: 413 });
  }

  const auth = locals.auth();
  if (!auth.userId) return Response.json({ message: 'Sign in again.' }, { status: 401 });
  const database = createPlatformDatabase();
  const admin = await checkAppAdmin(database, auth.userId);
  if (!admin.isAdmin || !database) return Response.json({ message: 'Admin access required.' }, { status: 403 });

  const submittedBody = await request.json().catch(() => null);
  const isTestHost = url.hostname === 'test.leonsites.org';
  const body = isTestHost && submittedBody && typeof submittedBody === 'object'
    ? {
        ...submittedBody,
        primary_domain: `${normalizeSiteSlug((submittedBody as Record<string, unknown>).slug)}.staging.invalid`,
        admin_domain: `${normalizeSiteSlug((submittedBody as Record<string, unknown>).slug)}.staging.invalid`,
      }
    : submittedBody;
  const validation = validateSiteProvisioningInput(body, {
    adminDomainSuffix: isTestHost ? 'staging.invalid' : 'leonsites.org',
  });
  if (!validation.ok) {
    return Response.json({ message: 'Check the highlighted details.', errors: validation.errors }, { status: 400 });
  }

  let owner: Awaited<ReturnType<ReturnType<typeof clerkClient>['users']['getUser']>>;
  try {
    owner = await clerkClient(context).users.getUser(validation.value.ownerUserId);
  } catch {
    return Response.json({ message: 'That Clerk user no longer exists.', errors: { owner_user_id: 'Choose another user.' } }, { status: 400 });
  }
  const primaryEmail = owner.emailAddresses.find((email) => email.id === owner.primaryEmailAddressId)
    ?? owner.emailAddresses[0];
  if (!primaryEmail?.emailAddress) {
    return Response.json({ message: 'The owner needs a verified email address first.', errors: { owner_user_id: 'No email address is available.' } }, { status: 400 });
  }

  const value = validation.value;
  const provisioned = await database.provisionClientSite({
    idempotency_key: value.idempotencyKey,
    requested_by_clerk_user_id: auth.userId,
    owner_clerk_user_id: value.ownerUserId,
    contact_email: primaryEmail.emailAddress,
    clerk_org_id: null,
    workspace_name: value.studioName,
    workspace_slug: value.slug,
    project_name: `${value.studioName} Website`,
    plan_key: value.planKey,
    template_key: value.templateKey,
    primary_domain: value.primaryDomain,
    admin_domain: value.adminDomain,
    site_key: `${value.slug}-site`,
    deployment_target: isTestHost ? 'staging:leon-platform-dashboard' : 'ovh:leon-platform-photographer',
    github_repository: value.githubRepository,
    quota_bytes: value.quotaBytes,
    capacity_limit_bytes: platformCapacityBytes(),
  });

  if (provisioned.error || !provisioned.data) {
    const message = provisioned.error?.message ?? 'The customer site was not created.';
    const status = /conflict|already|domain|storage|capacity/i.test(message) ? 409 : 500;
    return Response.json({
      message: status === 409 ? message : 'The customer site was not created. No partial customer was saved.',
    }, { status });
  }

  return Response.json({
    ok: true,
    workspaceId: provisioned.data.workspace_id,
    studioName: value.studioName,
    primaryDomain: provisioned.data.primary_domain,
    adminDomain: provisioned.data.admin_domain,
    status: provisioned.data.site_status,
  }, { status: 201 });
};
