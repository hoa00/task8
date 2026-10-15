import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { Badge, ColorDot } from '@studio/ui';
import type { DirectoryMember } from '../../data/people-demo';
export interface MemberStatusProps {
  status: DirectoryMember['status'];
  profile?: boolean;
}
export function MemberStatus({ status, profile = false }: MemberStatusProps) {
  useTranslation();
  if (profile && status !== 'invited') return null;
  return (
    <Badge tone={status === 'invited' ? 'amber' : status === 'deactivated' ? 'neutral' : 'green'}>
      {!profile && status !== 'deactivated' && <ColorDot color="currentColor" />}
      {profile
        ? t('Invite pending')
        : status === 'invited'
          ? t('Invited')
          : status === 'deactivated'
            ? t('Deactivated')
            : t('Active')}
    </Badge>
  );
}
