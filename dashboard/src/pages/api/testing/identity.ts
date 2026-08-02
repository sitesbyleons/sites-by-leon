import { clerkClient } from '@clerk/astro/server';
import type { APIRoute } from 'astro';

import { createPlatformDatabase } from '../../../lib/database';
import {
  HERMES_TEST_EMAIL,
  HERMES_TEST_WORKSPACE,
  isAuthorizedHermesIdentity,
  isHermesIdentityRouteEnabled,
} from '../../../lib/hermes-identity';
import { resolveClientWorkspace } from '../../../lib/workspaces';

const noStoreHeaders = { 'Cache-Control': 'no-store, private' };

export const GET: APIRoute = async (context) => {
  const environment = process.env.DEPLOYMENT_ENVIRONMENT;
  if (!isHermesIdentityRouteEnabled({ deploymentEnvironment: environment, hostname: context.url.hostname })) {
    return Response.json({ message: 'Not found.' }, { status: 404, headers: noStoreHeaders });
  }

  const auth = context.locals.auth();
  if (!auth.userId) {
    return Response.json({ message: 'Authentication required.' }, { status: 401, headers: noStoreHeaders });
  }

  const database = createPlatformDatabase();
  const resolution = await resolveClientWorkspace(database, {
    userId: auth.userId,
    orgId: auth.orgId ?? null,
  });
  if (!resolution.workspace || resolution.reason) {
    return Response.json({ verified: false }, { status: 403, headers: noStoreHeaders });
  }

  let email: string | null = null;
  try {
    const user = await clerkClient(context).users.getUser(auth.userId);
    email = (user.emailAddresses.find((entry) => entry.id === user.primaryEmailAddressId)
      ?? user.emailAddresses[0])?.emailAddress ?? null;
  } catch {
    return Response.json({ message: 'Identity verification is temporarily unavailable.' }, {
      status: 503,
      headers: noStoreHeaders,
    });
  }

  const verified = isAuthorizedHermesIdentity({
    deploymentEnvironment: environment,
    hostname: context.url.hostname,
    email,
    workspaceName: resolution.workspace.name,
    role: resolution.role,
  });
  if (!verified) {
    return Response.json({ verified: false }, { status: 403, headers: noStoreHeaders });
  }

  return Response.json({
    verified: true,
    email: HERMES_TEST_EMAIL,
    tenant: HERMES_TEST_WORKSPACE,
    role: 'owner',
    environment: 'staging',
  }, { headers: noStoreHeaders });
};
