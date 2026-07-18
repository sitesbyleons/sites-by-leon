import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const helper = new URL(
  '../infra/ovh/scripts/supabase-storage-session-token.sh',
  import.meta.url,
).pathname;
const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) fs.rmSync(fixture, { recursive: true, force: true });
});

const createFixture = () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'leon-supabase-token-'));
  fixtures.push(fixture);

  fs.writeFileSync(
    path.join(fixture, 'jq'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\0' "\$@" >>"\${JQ_ARGS_LOG}"
if [[ \${1:-} == -cn ]]; then
  printf '{"email":"%s","password":"%s"}' "\${SUPABASE_BACKUP_EMAIL}" "\${SUPABASE_BACKUP_PASSWORD}"
  exit
fi
case \${2:-} in
  *expires_at*) printf '%s\\n' "\${FAKE_EXPIRES_AT:-4102444800}" ;;
  *access_token*) printf '%s\\n' header.payload.signature ;;
  *) exit 1 ;;
esac
`,
    { mode: 0o755 },
  );

  fs.writeFileSync(
    path.join(fixture, 'curl'),
    `#!/usr/bin/env bash
set -euo pipefail
output=
body=
while (( \$# > 0 )); do
  case \$1 in
    --output) output=\$2; shift 2 ;;
    --data-binary) body=\$(cat); shift 2 ;;
    --write-out|--request|--header|--connect-timeout|--max-time|--proto)
      shift 2
      ;;
    --tlsv1.2|--silent|--show-error) shift ;;
    *) shift ;;
  esac
done
test "\${body}" = "{\\"email\\":\\"\${EXPECTED_EMAIL}\\",\\"password\\":\\"\${EXPECTED_PASSWORD}\\"}"
printf '%s' '{"expires_at":4102444800,"access_token":"header.payload.signature"}' >"\${output}"
printf '%s' 200
`,
    { mode: 0o755 },
  );

  return fixture;
};

describe('Supabase Storage session token helper', () => {
  it('emits only the fresh token while sending credentials through stdin', () => {
    const fixture = createFixture();
    const email = 'restic-backup@leonsites.org';
    const password = 'test-password-never-log';
    const jqArgs = path.join(fixture, 'jq-args');
    const result = spawnSync('bash', [helper], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env.PATH}`,
        AWS_SECRET_ACCESS_KEY: 'public-anon-key',
        AWS_ACCESS_KEY_ID: 'project-ref',
        AWS_DEFAULT_REGION: 'us-east-2',
        EXPECTED_EMAIL: email,
        EXPECTED_PASSWORD: password,
        JQ_ARGS_LOG: jqArgs,
        RCLONE_CONFIG_SUPABASE_ENDPOINT:
          'https://project-ref.storage.supabase.co/storage/v1/s3',
        RCLONE_CONFIG_SUPABASE_ENV_AUTH: 'true',
        RCLONE_CONFIG_SUPABASE_FORCE_PATH_STYLE: 'true',
        RCLONE_CONFIG_SUPABASE_PROVIDER: 'Other',
        RCLONE_CONFIG_SUPABASE_REGION: 'us-east-2',
        RCLONE_CONFIG_SUPABASE_TYPE: 's3',
        RESTIC_REPOSITORY: 'rclone:supabase:leon-sites-backups/restic',
        SUPABASE_BACKUP_AUTH_URL:
          'https://project-ref.supabase.co/auth/v1/token?grant_type=password',
        SUPABASE_BACKUP_EMAIL: email,
        SUPABASE_BACKUP_PASSWORD: password,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('header.payload.signature');
    expect(result.stderr).toBe('');
    expect(`${result.stdout}${result.stderr}`).not.toContain(password);
    expect(fs.readFileSync(jqArgs, 'utf8')).not.toContain(password);
  });

  it('rejects a non-Supabase token endpoint before invoking curl', () => {
    const fixture = createFixture();
    const marker = path.join(fixture, 'curl-invoked');
    fs.writeFileSync(
      path.join(fixture, 'curl'),
      `#!/usr/bin/env bash\ntouch "${marker}"\nexit 1\n`,
      { mode: 0o755 },
    );

    const result = spawnSync('bash', [helper], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env.PATH}`,
        AWS_SECRET_ACCESS_KEY: 'public-anon-key',
        AWS_ACCESS_KEY_ID: 'project-ref',
        AWS_DEFAULT_REGION: 'us-east-2',
        JQ_ARGS_LOG: path.join(fixture, 'jq-args'),
        RCLONE_CONFIG_SUPABASE_ENDPOINT:
          'https://project-ref.storage.supabase.co/storage/v1/s3',
        RCLONE_CONFIG_SUPABASE_ENV_AUTH: 'true',
        RCLONE_CONFIG_SUPABASE_FORCE_PATH_STYLE: 'true',
        RCLONE_CONFIG_SUPABASE_PROVIDER: 'Other',
        RCLONE_CONFIG_SUPABASE_REGION: 'us-east-2',
        RCLONE_CONFIG_SUPABASE_TYPE: 's3',
        RESTIC_REPOSITORY: 'rclone:supabase:leon-sites-backups/restic',
        SUPABASE_BACKUP_AUTH_URL:
          'https://evil.example/project-ref.supabase.co/auth/v1/token?grant_type=password',
        SUPABASE_BACKUP_EMAIL: 'restic-backup@leonsites.org',
        SUPABASE_BACKUP_PASSWORD: 'test-password-never-log',
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('must be an HTTPS Supabase password-token endpoint');
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('rejects a storage endpoint that does not match the authenticated project', () => {
    const fixture = createFixture();
    const marker = path.join(fixture, 'curl-invoked');
    fs.writeFileSync(
      path.join(fixture, 'curl'),
      `#!/usr/bin/env bash\ntouch "${marker}"\nexit 1\n`,
      { mode: 0o755 },
    );

    const result = spawnSync('bash', [helper], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env.PATH}`,
        AWS_ACCESS_KEY_ID: 'project-ref',
        AWS_SECRET_ACCESS_KEY: 'public-anon-key',
        AWS_DEFAULT_REGION: 'us-east-2',
        JQ_ARGS_LOG: path.join(fixture, 'jq-args'),
        RCLONE_CONFIG_SUPABASE_ENDPOINT:
          'https://attacker.storage.supabase.co/storage/v1/s3',
        RCLONE_CONFIG_SUPABASE_ENV_AUTH: 'true',
        RCLONE_CONFIG_SUPABASE_FORCE_PATH_STYLE: 'true',
        RCLONE_CONFIG_SUPABASE_PROVIDER: 'Other',
        RCLONE_CONFIG_SUPABASE_REGION: 'us-east-2',
        RCLONE_CONFIG_SUPABASE_TYPE: 's3',
        RESTIC_REPOSITORY: 'rclone:supabase:leon-sites-backups/restic',
        SUPABASE_BACKUP_AUTH_URL:
          'https://project-ref.supabase.co/auth/v1/token?grant_type=password',
        SUPABASE_BACKUP_EMAIL: 'restic-backup@leonsites.org',
        SUPABASE_BACKUP_PASSWORD: 'test-password-never-log',
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('must match the authenticated Supabase project');
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('rejects a different active rclone remote before issuing a token', () => {
    const fixture = createFixture();
    const marker = path.join(fixture, 'curl-invoked');
    fs.writeFileSync(
      path.join(fixture, 'curl'),
      `#!/usr/bin/env bash\ntouch "${marker}"\nexit 1\n`,
      { mode: 0o755 },
    );

    const result = spawnSync('bash', [helper], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env.PATH}`,
        AWS_ACCESS_KEY_ID: 'project-ref',
        AWS_DEFAULT_REGION: 'us-east-2',
        AWS_SECRET_ACCESS_KEY: 'public-anon-key',
        JQ_ARGS_LOG: path.join(fixture, 'jq-args'),
        RCLONE_CONFIG_SUPABASE_ENDPOINT:
          'https://project-ref.storage.supabase.co/storage/v1/s3',
        RCLONE_CONFIG_SUPABASE_ENV_AUTH: 'true',
        RCLONE_CONFIG_SUPABASE_FORCE_PATH_STYLE: 'true',
        RCLONE_CONFIG_SUPABASE_PROVIDER: 'Other',
        RCLONE_CONFIG_SUPABASE_REGION: 'us-east-2',
        RCLONE_CONFIG_SUPABASE_TYPE: 's3',
        RESTIC_REPOSITORY: 'rclone:unexpected:leon-sites-backups/restic',
        SUPABASE_BACKUP_AUTH_URL:
          'https://project-ref.supabase.co/auth/v1/token?grant_type=password',
        SUPABASE_BACKUP_EMAIL: 'restic-backup@leonsites.org',
        SUPABASE_BACKUP_PASSWORD: 'test-password-never-log',
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('must use the scoped Supabase rclone remote');
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('rejects a token that cannot outlive the configured command timeout', () => {
    const fixture = createFixture();
    const email = 'restic-backup@leonsites.org';
    const password = 'test-password-never-log';
    const result = spawnSync('bash', [helper], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env.PATH}`,
        AWS_ACCESS_KEY_ID: 'project-ref',
        AWS_DEFAULT_REGION: 'us-east-2',
        AWS_SECRET_ACCESS_KEY: 'public-anon-key',
        EXPECTED_EMAIL: email,
        EXPECTED_PASSWORD: password,
        FAKE_EXPIRES_AT: String(Math.floor(Date.now() / 1000) + 600),
        JQ_ARGS_LOG: path.join(fixture, 'jq-args'),
        RCLONE_CONFIG_SUPABASE_ENDPOINT:
          'https://project-ref.storage.supabase.co/storage/v1/s3',
        RCLONE_CONFIG_SUPABASE_ENV_AUTH: 'true',
        RCLONE_CONFIG_SUPABASE_FORCE_PATH_STYLE: 'true',
        RCLONE_CONFIG_SUPABASE_PROVIDER: 'Other',
        RCLONE_CONFIG_SUPABASE_REGION: 'us-east-2',
        RCLONE_CONFIG_SUPABASE_TYPE: 's3',
        RESTIC_REPOSITORY: 'rclone:supabase:leon-sites-backups/restic',
        SUPABASE_BACKUP_AUTH_URL:
          'https://project-ref.supabase.co/auth/v1/token?grant_type=password',
        SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS: '3000',
        SUPABASE_BACKUP_EMAIL: email,
        SUPABASE_BACKUP_PASSWORD: password,
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('insufficient lifetime');
  });

  it('rejects a command timeout that consumes the full one-hour session window', () => {
    const fixture = createFixture();
    const marker = path.join(fixture, 'curl-invoked');
    fs.writeFileSync(
      path.join(fixture, 'curl'),
      `#!/usr/bin/env bash\ntouch "${marker}"\nexit 1\n`,
      { mode: 0o755 },
    );

    const result = spawnSync('bash', [helper], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env.PATH}`,
        AWS_ACCESS_KEY_ID: 'project-ref',
        AWS_DEFAULT_REGION: 'us-east-2',
        AWS_SECRET_ACCESS_KEY: 'public-anon-key',
        JQ_ARGS_LOG: path.join(fixture, 'jq-args'),
        RCLONE_CONFIG_SUPABASE_ENDPOINT:
          'https://project-ref.storage.supabase.co/storage/v1/s3',
        RCLONE_CONFIG_SUPABASE_ENV_AUTH: 'true',
        RCLONE_CONFIG_SUPABASE_FORCE_PATH_STYLE: 'true',
        RCLONE_CONFIG_SUPABASE_PROVIDER: 'Other',
        RCLONE_CONFIG_SUPABASE_REGION: 'us-east-2',
        RCLONE_CONFIG_SUPABASE_TYPE: 's3',
        RESTIC_REPOSITORY: 'rclone:supabase:leon-sites-backups/restic',
        SUPABASE_BACKUP_AUTH_URL:
          'https://project-ref.supabase.co/auth/v1/token?grant_type=password',
        SUPABASE_BACKUP_COMMAND_TIMEOUT_SECONDS: '3300',
        SUPABASE_BACKUP_EMAIL: 'restic-backup@leonsites.org',
        SUPABASE_BACKUP_PASSWORD: 'test-password-never-log',
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('must be between 1 and 3000');
    expect(fs.existsSync(marker)).toBe(false);
  });
});
