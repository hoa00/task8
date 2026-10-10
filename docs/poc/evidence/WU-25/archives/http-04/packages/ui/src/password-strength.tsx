export interface PasswordStrengthProps { value: string }
export function PasswordStrength({ value }: PasswordStrengthProps) {
  if (!value) return null;
  const score = Number(value.length >= 8) + Number(value.length >= 12) + Number(/[0-9]/.test(value) && /[a-zA-Z]/.test(value)) + Number(/[^a-zA-Z0-9]/.test(value));
  const color = ['var(--red)', 'var(--red)', 'var(--amber)', 'var(--green)', 'var(--green)'][score];
  return <div data-password-strength className="flex items-center gap-2"><div aria-hidden="true" className="flex min-w-0 flex-1 gap-1">{[0, 1, 2, 3].map(index => <i key={index} className="h-[3px] flex-1 rounded-[2px]" style={{ background: index < score ? color : 'var(--surface-3)' }} />)}</div><span className="w-[60px] text-right text-[11.5px]" style={{ color }}>{['Too short', 'Weak', 'Fair', 'Good', 'Strong'][score]}</span></div>;
}
