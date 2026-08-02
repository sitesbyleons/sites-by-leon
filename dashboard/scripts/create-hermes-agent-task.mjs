#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

import { createClerkClient } from '@clerk/backend';
import postgres from 'postgres';

export const HERMES_TEST_EMAIL = 'testagentleonsites@agentmail.to';
export const HERMES_TEST_ADMIN_DOMAIN = 'leon-tech-fan-test.leonsites.org';
export const HERMES_REDIRECT_URL = 'https://test.leonsites.org/dashboard';
export const HERMES_SESSION_SECONDS = 15 * 60;

export class HermesLauncherError extends Error {}

const required = (environment, name) => {
  const value = environment[name]?.trim();
  if (!value) throw new HermesLauncherError(`${name} is required.`);
  return value;
};

export const validateHermesEnvironment = (environment = process.env) => {
  if (environment.DEPLOYMENT_ENVIRONMENT?.trim() !== 'staging') {
    throw new HermesLauncherError('Hermes sessions can only be created by the isolated staging dashboard.');
  }

  const secretKey = required(environment, 'CLERK_SECRET_KEY');
  if (!/^sk_(?:live|test)_[A-Za-z0-9_-]+$/.test(secretKey)) {
    throw new HermesLauncherError('CLERK_SECRET_KEY is invalid.');
  }

  const databaseUrl = required(environment, 'DATABASE_URL');
  let database;
  try {
    database = new URL(databaseUrl);
  } catch {
    throw new HermesLauncherError('DATABASE_URL is invalid.');
  }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) {
    throw new HermesLauncherError('DATABASE_URL must use PostgreSQL.');
  }

  return { databaseUrl, secretKey };
};

export const hermesAgentTaskInput = (userId) => {
  if (!/^user_[A-Za-z0-9_-]{4,}$/.test(userId)) {
    throw new HermesLauncherError('The Hermes Clerk user id is invalid.');
  }
  return {
    onBehalfOf: { userId },
    permissions: '*',
    agentName: 'hermes-customer-simulator',
    taskDescription: 'Authorized Sites By Leon test-tenant customer experience run',
    redirectUrl: HERMES_REDIRECT_URL,
    sessionMaxDurationInSeconds: HERMES_SESSION_SECONDS,
  };
};

const findOrCreateHermesUser = async (clerk) => {
  const users = await clerk.users.getUserList({ emailAddress: [HERMES_TEST_EMAIL], limit: 2 });
  if (users.totalCount > 1 || users.data.length > 1) {
    throw new HermesLauncherError('Multiple Clerk users use the reserved Hermes test email.');
  }
  if (users.data[0]) return users.data[0];

  return clerk.users.createUser({
    emailAddress: [HERMES_TEST_EMAIL],
    firstName: 'Maya',
    lastName: 'Carter',
    skipPasswordRequirement: true,
    privateMetadata: {
      sitesByLeonSyntheticTester: true,
      authorizedTenant: HERMES_TEST_ADMIN_DOMAIN,
    },
  });
};

const ensureTestWorkspaceAccess = async (databaseUrl, clerkUserId) => {
  const sql = postgres(databaseUrl, {
    connect_timeout: 5,
    idle_timeout: 5,
    max: 1,
    prepare: false,
  });

  try {
    await sql.begin(async (transaction) => {
      const workspaces = await transaction`
        select workspace.id
        from client_workspaces as workspace
        join site_connections as connection on connection.workspace_id = workspace.id
        where lower(connection.admin_domain) = ${HERMES_TEST_ADMIN_DOMAIN}
          and connection.status = 'active'
      `;
      if (workspaces.length !== 1) {
        throw new HermesLauncherError('The authorized Hermes test workspace is not uniquely active.');
      }

      const memberships = await transaction`
        select workspace_id
        from workspace_members
        where clerk_user_id = ${clerkUserId}
      `;
      if (memberships.some((membership) => membership.workspace_id !== workspaces[0].id)) {
        throw new HermesLauncherError('The Hermes test user already belongs to another staging workspace.');
      }

      await transaction`
        insert into workspace_members (workspace_id, clerk_user_id, role)
        values (${workspaces[0].id}, ${clerkUserId}, 'owner')
        on conflict (workspace_id, clerk_user_id)
        do update set role = 'owner'
      `;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
};

const safeError = (error) => {
  const message = error instanceof Error ? error.message : 'Unknown launcher failure.';
  return message
    .replace(/sk_(?:live|test)_[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/https:\/\/[^\s]+[?&][^\s]+/g, '[redacted-url]')
    .slice(0, 400);
};

export const createHermesAgentTask = async (environment = process.env) => {
  const { databaseUrl, secretKey } = validateHermesEnvironment(environment);
  const clerk = createClerkClient({ secretKey });
  const user = await findOrCreateHermesUser(clerk);
  await ensureTestWorkspaceAccess(databaseUrl, user.id);
  const task = await clerk.agentTasks.create(hermesAgentTaskInput(user.id));
  const taskUrl = new URL(task.url);
  if (taskUrl.protocol !== 'https:' || taskUrl.username || taskUrl.password) {
    throw new HermesLauncherError('Clerk returned an invalid Agent Task URL.');
  }
  return taskUrl.href;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const taskUrl = await createHermesAgentTask();
    process.stdout.write(`${taskUrl}\n`);
  } catch (error) {
    process.stderr.write(`Hermes session launcher failed: ${safeError(error)}\n`);
    process.exitCode = 1;
  }
}
