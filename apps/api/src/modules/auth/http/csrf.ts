import { ApiFailure } from '../../../shared/errors.ts';
import { requestSid } from './settings.ts';
export const preauthCookieName = (secure: boolean) =>
  secure ? '__Host-task8_preauth' : 'task8_local_preauth';
export function checkedCookie(request: Request, name: string): string | undefined {
  const sid = requestSid(request, { cookieName: name });
  if (
    !sid &&
    (request.headers.get('cookie') ?? '')
      .split(';')
      .some((part) => part.trim().startsWith(name + '='))
  )
    throw new ApiFailure('FORBIDDEN', 'Invalid browser session');
  return sid;
}
export async function csrfProof(sid: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode('task8:csrf:' + sid)),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}
export async function requireCookieCsrf(
  request: Request,
  cookieName: string,
  proof = request.headers.get('x-csrf-token'),
) {
  const sid = checkedCookie(request, cookieName);
  if (!sid || proof !== (await csrfProof(sid)))
    throw new ApiFailure('FORBIDDEN', 'Invalid browser request');
}
