import { MemberSchema } from '@studio/contracts/api';
export function validateInvite(raw: string): string[] {
  const emails = [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (!emails.length) throw Error('Enter at least one email address');
  const bad = emails.find((email) => !MemberSchema.shape.email.safeParse(email).success);
  if (bad) throw Error(`${bad} isn't a valid email address`);
  if (emails.length > 100) throw Error('Invite at most 100 people at a time');
  return emails;
}
