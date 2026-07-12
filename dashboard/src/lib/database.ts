import { createPostgresDataClient, type DataClient } from '@leon/platform-core';

let cachedDatabase: DataClient | null | undefined;

export function createPlatformDatabase(): DataClient | null {
  if (cachedDatabase === undefined) cachedDatabase = createPostgresDataClient(process.env.DATABASE_URL);
  return cachedDatabase;
}
