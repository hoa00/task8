import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@studio/ui';
import { useDataRuntime } from '../../data/context';
import { useStudioQuery } from '../../data/queries';
import { AuthHeading, AuthLayout, AuthMessage } from './AuthLayout';
import { useTranslation } from '../../i18n/useTranslation';
import { translate as t } from '../../i18n/i18n';

export function WaitingForWorkspace(){
  useTranslation();
  const runtime=useDataRuntime(),session=useStudioQuery('getSession',{}),navigate=useNavigate();
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  async function run(kind:'retry'|'logout'){
    if(pending||!runtime.auth)return;
    setPending(true);setError('');
    try{
      if(kind==='logout'){await runtime.auth.logout();await navigate({to:'/login',search:{},replace:true});}
      else {const latest=await runtime.auth.check();if(latest.data.currentWorkspaceId)await navigate({to:'/',replace:true});}
    }catch{setError(t('We could not complete this request. Please try again.'));}
    finally{setPending(false);}
  }
  return <AuthLayout><div data-waiting-for-workspace className="flex w-full max-w-[380px] flex-col gap-4"><AuthHeading title={t('Waiting for workspace access')} subtitle={t('Your account is ready. An administrator needs to grant workspace access.')} icon="clock"/><AuthMessage>{t('Your account is ready. An administrator needs to grant workspace access.')}</AuthMessage>{session.data&&<p className="text-center text-sm text-secondary">{session.data.data.user.name}<br/>{session.data.data.user.email}</p>}{error&&<AuthMessage error>{error}</AuthMessage>}<Button id="waiting-retry" variant="primary" size="lg" block loading={pending} disabled={pending} onClick={()=>void run('retry')}>{t('Check again')}</Button><Button id="waiting-logout" size="lg" block disabled={pending} onClick={()=>void run('logout')}>{t('Sign out')}</Button></div></AuthLayout>;
}
