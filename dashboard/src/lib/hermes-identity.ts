export const HERMES_TEST_EMAIL = 'testagentleonsites@agentmail.to';
export const HERMES_TEST_WORKSPACE = 'Leon Tech FAN';

export type HermesIdentityInput = {
  deploymentEnvironment: string | undefined;
  hostname: string;
  email: string | null;
  workspaceName: string | null;
  role: string | null;
};

export function isHermesIdentityRouteEnabled(input: Pick<HermesIdentityInput, 'deploymentEnvironment' | 'hostname'>) {
  return input.deploymentEnvironment === 'staging' && input.hostname === 'test.leonsites.org';
}

export function isAuthorizedHermesIdentity(input: HermesIdentityInput) {
  return isHermesIdentityRouteEnabled(input)
    && input.email?.toLowerCase() === HERMES_TEST_EMAIL
    && input.workspaceName === HERMES_TEST_WORKSPACE
    && input.role === 'owner';
}
