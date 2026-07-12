export type PublicStatus = 'active' | 'paused' | 'maintenance';

interface PublicStatusInput {
  configured: boolean;
  remoteStatus: PublicStatus | null;
  lastKnownStatus: PublicStatus | null;
}

export const decidePublicStatus = ({
  configured,
  remoteStatus,
  lastKnownStatus,
}: PublicStatusInput): PublicStatus => {
  if (!configured) {
    return 'active';
  }

  return remoteStatus ?? lastKnownStatus ?? 'active';
};
