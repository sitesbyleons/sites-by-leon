declare module '../scripts/create-hermes-agent-task.mjs' {
  export const HERMES_TEST_EMAIL: string;
  export const HERMES_TEST_ADMIN_DOMAIN: string;
  export const HERMES_REDIRECT_URL: string;
  export const HERMES_SESSION_SECONDS: number;
  export function validateHermesEnvironment(environment?: Record<string, string | undefined>): {
    databaseUrl: string;
    secretKey: string;
  };
  export function hermesAgentTaskInput(userId: string): {
    onBehalfOf: { userId: string };
    permissions: string;
    agentName: string;
    taskDescription: string;
    redirectUrl: string;
    sessionMaxDurationInSeconds: number;
  };
}
