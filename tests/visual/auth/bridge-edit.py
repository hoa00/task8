"""One-time owned mechanical JSX extraction with exact replayable byte proof."""
import hashlib
import json

file = 'apps/web/src/features/auth/AuthPage.tsx'
archive = 'docs/poc/evidence/WU-26/archives/final-02/' + file
old = open(archive).read()
changes = [
    ('  async function go(next: AuthScreen) {\n', '  async function go(next: AuthScreen) {\n    const intent = ++sequence.current; setPending(undefined);\n'),
    ("    setTimeout(() => document.querySelector<HTMLInputElement>('[data-auth-card] input')?.focus(), 20);", '    setTimeout(() => { if (sequence.current === intent) document.querySelector<HTMLInputElement>(`[data-auth-card="${next}"] input`)?.focus(); }, 20);'),
]
current = old
for before, after in changes:
    assert before in current
    current = current.replace(before, after)
assert current == open(file).read()
components = '''interface AuthLinkProps { children: ReactNode; next: AuthScreen; onNavigate: (screen: AuthScreen) => Promise<void>; className?: string }
function AuthLink({ children, next, onNavigate, className = '' }: AuthLinkProps) { return <button type="button" className={`${authLinkClass} ${className}`} onClick={() => void onNavigate(next)}>{children}</button>; }
interface AuthActionProps { children: ReactNode; kind: string; enabled: boolean; pending: string | undefined; next?: AuthScreen; onNavigate: (screen: AuthScreen) => Promise<void> }
function AuthAction({ children, kind, enabled, pending, next, onNavigate }: AuthActionProps) { return <Button size="lg" variant="primary" block type={next ? 'button' : 'submit'} id={`${kind}-btn`} disabled={!enabled} loading={pending === kind} onClick={next ? () => void onNavigate(next) : undefined}>{children}</Button>; }

'''
changes.append(('export interface AuthPageProps', components + 'export interface AuthPageProps'))
changes.append(("  const link = (text: ReactNode, next: AuthScreen, className = '') => <button type=\"button\" className={`${authLinkClass} ${className}`} onClick={() => void go(next)}>{text}</button>;\n", ''))
changes.append(("  const action = (text: string, kind: string, callback?: () => void) => <Button size=\"lg\" variant=\"primary\" block type={callback ? 'button' : 'submit'} id={`${kind}-btn`} disabled={!enabled} loading={pending === kind} onClick={callback}>{text}</Button>;\n", ''))
for label, screen, classes in [('Forgot password?', 'forgot', 'text-[12.5px]'), ('Sign up', 'signup', ''), ('Sign in', 'login', ''), ('Change it', 'signup', '')]:
    before = "{link('" + label + "', '" + screen + "'" + (", '" + classes + "'" if classes else '') + ')}'
    after = '<AuthLink next="' + screen + '" onNavigate={go}' + (' className="' + classes + '"' if classes else '') + '>' + label + '</AuthLink>'
    changes.append((before, after))
arrow = '<><Icon name="arrow-left" size={14} />Back to sign in</>'
changes.append(("link(" + arrow + ", 'login', 'inline-flex items-center gap-[6px]')", '<AuthLink next="login" onNavigate={go} className="inline-flex items-center gap-[6px]">' + arrow + '</AuthLink>'))
for label, kind, next_screen in [('Sign in', 'login', None), ('Create account', 'signup', None), ('Send reset link', 'forgot', None), ('Reset password', 'reset', None), ('Open reset link', 'reset', 'reset'), ('Sign in', 'login', 'login')]:
    before = "{action('" + label + "', '" + kind + "'" + (", () => void go('" + next_screen + "')" if next_screen else '') + ')}'
    after = '<AuthAction kind="' + kind + '" enabled={enabled} pending={pending} onNavigate={go}' + (' next="' + next_screen + '"' if next_screen else '') + '>' + label + '</AuthAction>'
    changes.append((before, after))
result = old
records = []
for before, after in changes:
    assert before in result, before
    count = result.count(before)
    result = result.replace(before, after)
    records.append({'before': before, 'after': after, 'occurrences': count})
with open(file, 'w') as handle:
    handle.write(result)
with open('docs/poc/evidence/WU-26/mechanical-bridge.json', 'x') as handle:
    json.dump({'path': file, 'oldArchive': archive, 'beforeSha256': hashlib.sha256(old.encode()).hexdigest(), 'afterSha256': hashlib.sha256(result.encode()).hexdigest(), 'transformations': records, 'scope': 'Only synchronous navigation cancellation/scoped focus plus typed JSX event boundaries. Exact same button/Button markup, props and classes; no static styling, copy, fields, facade, fonts or Source changes.'}, handle, indent=2)
    handle.write('\n')
print(json.dumps({'transformations': len(records), 'before': hashlib.sha256(old.encode()).hexdigest(), 'after': hashlib.sha256(result.encode()).hexdigest()}))
