import { Button, Skeleton } from '@studio/ui';
import { translate as t } from '../../i18n/i18n';
import { useTranslation } from '../../i18n/useTranslation';
import { AuthHeading, AuthLayout, AuthMessage } from './AuthLayout';
export interface AuthModeViewProps {
  loading: boolean;
  unavailable: boolean;
  oidc: boolean;
  error: 'transaction' | 'unlinked' | 'unavailable' | undefined;
  canLogout: boolean;
  logoutPending: boolean;
  onLogout: () => void;
  onRetry: () => void;
  onLogin: () => void;
}
export function AuthModeView({
  loading,
  unavailable,
  oidc,
  error,
  onRetry,
  onLogin,
  canLogout,
  logoutPending,
  onLogout,
}: AuthModeViewProps) {
  useTranslation();
  const message =
    error === 'unlinked'
      ? t('Your account is not linked to this application. Contact your administrator.')
      : error === 'unavailable' || unavailable
        ? t('Sign-in is temporarily unavailable. Please try again.')
        : error === 'transaction'
          ? t('Sign-in did not complete. Please start again.')
          : t('You need to sign in to continue.');
  return (
    <AuthLayout>
      <div
        data-auth-mode={loading ? 'loading' : oidc ? 'oidc' : 'disabled'}
        className="flex w-full max-w-[380px] flex-col gap-4"
      >
        <AuthHeading title={t('Welcome back')} subtitle={t('Sign in to DataMaker Task')} />
        {loading ? (
          <div
            role="status"
            aria-label={t('Loading sign-in options')}
            className="flex flex-col gap-4"
          >
            <Skeleton />
            <Skeleton />
          </div>
        ) : (
          <>
            <AuthMessage error={!!error || unavailable}>{message}</AuthMessage>
            {oidc && !unavailable && (
              <Button id="identity-login" size="lg" variant="primary" block onClick={onLogin}>
                {error === 'unavailable' ? t('Try again') : t('Sign in with Identity')}
              </Button>
            )}
            {(unavailable || !oidc) && (
              <Button size="lg" block onClick={onRetry}>
                {t('Try again')}
              </Button>
            )}
            {canLogout && (
              <Button
                id="identity-local-logout"
                size="lg"
                block
                loading={logoutPending}
                onClick={onLogout}
              >
                {t('Sign out of application')}
              </Button>
            )}
            {oidc && (
              <p className="text-center text-sm text-secondary">
                {t('Your application session lasts up to 8 hours.')}
              </p>
            )}
          </>
        )}
      </div>
    </AuthLayout>
  );
}
