import { useRef, useState } from 'react';
import {
  Alert,
  AvatarBase,
  AvatarStackBase,
  Badge,
  Button,
  Checkbox,
  ColorDot,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Input,
  KeyHint,
  Meter,
  Panel,
  PanelBody,
  PanelHeader,
  PasswordInput,
  Progress,
  SegmentedControl,
  Select,
  Skeleton,
  StackedBar,
  Tabs,
  Textarea,
  Toggle,
} from '@studio/ui';
import type { ButtonVariant, ControlSize, Tone } from '@studio/ui';
import { useTheme } from './theme/theme-context';
const groups = ['buttons', 'fields', 'choices', 'display', 'feedback', 'select'];
const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'dangerGhost'];
const sizes: ControlSize[] = ['xs', 'sm', 'md', 'lg'];
export function ControlsGallery() {
  const { setPreferences } = useTheme();
  const [group, setGroup] = useState('buttons');
  const [text, setText] = useState('Homepage wireframes');
  const [checked, setChecked] = useState(true);
  const [toggle, setToggle] = useState(true);
  const [choice, setChoice] = useState('board');
  const [selected, setSelected] = useState('progress');
  const [revealed, setRevealed] = useState(false);
  const [validation, setValidation] = useState(false);
  const [clicks, setClicks] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const select = useRef<HTMLButtonElement>(null);
  const checkbox = useRef<HTMLInputElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const items = [
    { value: 'overview', label: 'Overview' },
    { value: 'board', label: 'Board', count: 3 },
    { value: 'locked', label: 'Locked', disabled: true },
    { value: 'list', label: 'List' },
  ];
  return (
    <>
      <section
        id="controls-sample"
        className="flex w-[802px] flex-col gap-4 bg-canvas p-6 text-foreground"
        data-group={group}
      >
        {group === 'buttons' && (
          <>
            {variants.map((variant) => (
              <div key={variant} className="flex items-center gap-3">
                <Button
                  data-probe={`button-${variant}`}
                  variant={variant}
                  ref={variant === 'primary' ? button : undefined}
                  onClick={() => setClicks(clicks + 1)}
                >
                  {'Create item'}
                </Button>
                <Button variant={variant} disabled>
                  {'Disabled'}
                </Button>
                <Button variant={variant} loading>
                  {'Saving'}
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-3">
              {sizes.map((size) => (
                <Button key={size} data-size={size} size={size}>
                  {'Size '}
                  {size}
                </Button>
              ))}
              {sizes.map((size) => (
                <IconButton
                  key={size}
                  size={size}
                  data-probe={`icon-${size}`}
                  aria-label={`Add ${size}`}
                >
                  <Icon name="plus" />
                </IconButton>
              ))}
              <IconButton disabled aria-label="Disabled icon">
                <Icon name="trash-2" />
              </IconButton>
              <IconButton aria-pressed aria-label="Selected icon">
                <Icon name="star" />
              </IconButton>
            </div>
          </>
        )}
        {group === 'fields' && (
          <div className="grid grid-cols-3 gap-[14px]">
            <Field label="Text" hint="A helpful hint" controlId="text">
              {(props) => (
                <Input
                  {...props}
                  ref={input}
                  data-probe="input"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              )}
            </Field>
            <Field label="Error" error="Enter a valid email" controlId="email">
              {(props) => (
                <Input {...props} data-probe="input-error" type="email" value="alex@" readOnly />
              )}
            </Field>
            <Field label="Disabled" controlId="disabled">
              {(props) => <Input {...props} value="hello@example.com" disabled />}
            </Field>
            <Field label="Password" controlId="password">
              {(props) => (
                <PasswordInput
                  {...props}
                  value="secret123"
                  readOnly
                  size="lg"
                  revealed={revealed}
                  onRevealedChange={setRevealed}
                />
              )}
            </Field>
            <Field label="Textarea" controlId="description">
              {(props) => (
                <Textarea
                  {...props}
                  data-probe="textarea"
                  value="Add a description…"
                  readOnly
                  rows={2}
                />
              )}
            </Field>
            <Field label="Search" controlId="search">
              {(props) => (
                <div className="relative flex items-center">
                  <Icon
                    name="search"
                    size={13}
                    className="pointer-events-none absolute left-[9px] text-faint"
                  />
                  <Input
                    {...props}
                    value=""
                    readOnly
                    placeholder="Search items"
                    className="pl-[30px]"
                  />
                  <KeyHint className="absolute right-[7px]">{'/'}</KeyHint>
                </div>
              )}
            </Field>
            <div className="flex flex-col gap-2">
              {sizes.map((size) => (
                <Input key={size} aria-label={`Input ${size}`} value={size} readOnly size={size} />
              ))}
            </div>
            <Field
              label="Validation"
              error={validation ? 'This field is required' : undefined}
              hint="Required value"
              controlId="validation"
            >
              {(props) => (
                <Input
                  {...props}
                  required
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onBlur={() => setValidation(!text)}
                />
              )}
            </Field>
          </div>
        )}
        {group === 'choices' && (
          <>
            <div className="flex items-center gap-[14px]">
              <Checkbox
                data-probe="checkbox"
                ref={checkbox}
                aria-label="Checked"
                checked={checked}
                onCheckedChange={setChecked}
              />
              <Checkbox aria-label="Unchecked" checked={false} onCheckedChange={() => {}} />
              <Checkbox
                aria-label="Mixed"
                checked={false}
                indeterminate
                onCheckedChange={() => {}}
              />
              <Checkbox aria-label="Round" checked round onCheckedChange={() => {}} />
              <Checkbox aria-label="Disabled check" checked disabled onCheckedChange={() => {}} />
              <Toggle
                data-probe="toggle"
                aria-label="Enabled switch"
                checked={toggle}
                onCheckedChange={setToggle}
              />
              <Toggle aria-label="Off switch" checked={false} onCheckedChange={() => {}} />
              <Toggle aria-label="Disabled switch" checked disabled onCheckedChange={() => {}} />
            </div>
            <Tabs ref={tabs} label="Views" items={items} value={choice} onValueChange={setChoice} />
            <SegmentedControl
              label="Layout"
              items={items.map((item) => ({ ...item, count: undefined }))}
              value={choice}
              onValueChange={setChoice}
            />
          </>
        )}
        {group === 'display' && (
          <>
            <div className="flex items-center gap-3">
              {(['neutral', 'accent', 'green', 'amber', 'red', 'violet'] as Tone[]).map((tone) => (
                <Badge key={tone} tone={tone} dot>
                  {tone}
                </Badge>
              ))}
              <ColorDot color="var(--teal)" />
              <KeyHint>{'⌘ K'}</KeyHint>
            </div>
            <div className="flex items-center gap-3">
              {(['sm', 'base', 'md', 'lg', 'xl'] as const).map((size) => (
                <AvatarBase
                  key={size}
                  label="Alex Chen"
                  initials="AC"
                  color="#8662C9"
                  size={size}
                />
              ))}
              <AvatarBase label="Unassigned" empty />
              <AvatarBase label="Online" initials="JL" color="#23918A" presence />
              <AvatarStackBase
                avatars={[
                  { label: 'Alex', initials: 'AC', color: '#8662C9' },
                  { label: 'Jamie', initials: 'JL', color: '#23918A' },
                  { label: 'Sam', initials: 'SW', color: '#C4473A' },
                  { label: 'Taylor', initials: 'TB', color: '#A67835' },
                ]}
                max={3}
                size="md"
              />
            </div>
            <Panel>
              <PanelHeader heading="Overview" actions={<Button size="sm">{'Action'}</Button>} />
              <PanelBody>
                <div className="flex gap-3">
                  <Progress label="Completion" value={64} />
                  <Progress label="Done" value={100} tone="green" />
                  <Progress label="At risk" value={30} tone="red" />
                </div>
                <StackedBar
                  label="Distribution"
                  className="mt-3"
                  segments={[
                    { value: 30, color: 'var(--green)' },
                    { value: 40, color: 'var(--amber)' },
                    { value: 30, color: 'var(--red)' },
                  ]}
                />
                <Meter label="Usage" value={45} className="mt-3" />
              </PanelBody>
            </Panel>
          </>
        )}
        {group === 'feedback' && (
          <>
            <Alert tone="info" icon="info">
              <span>
                <b>{'Heads up.'}</b>
                {' Your draft is ready.'}
              </span>
            </Alert>
            <Alert tone="ok" icon="circle-check">
              {'Changes saved.'}
            </Alert>
            <Alert tone="warn" icon="triangle-alert">
              {'Check these values.'}
            </Alert>
            <Alert tone="danger" icon="circle-alert">
              {"Your changes couldn't be saved."}
            </Alert>
            <div className="grid grid-cols-2 gap-3">
              <Panel>
                <EmptyState
                  size="sm"
                  icon="search"
                  heading="No results found"
                  description="Try a broader term."
                  action={<Button size="sm">{'Clear search'}</Button>}
                />
              </Panel>
              <Panel>
                <EmptyState
                  size="sm"
                  error
                  icon="wifi-off"
                  heading="You're offline"
                  description="Check your connection."
                />
              </Panel>
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton width="60%" height={12} />
              <Skeleton width="90%" height={9} />
              <Skeleton width={28} height={28} style={{ borderRadius: '50%' }} />
            </div>
          </>
        )}
        {group === 'select' && (
          <div className="flex h-[180px] flex-col gap-3">
            <div className="w-[240px]">
              <Select
                ref={select}
                label="Status"
                value={selected}
                onValueChange={setSelected}
                options={[
                  { value: 'progress', label: 'In Progress' },
                  { value: 'review', label: 'Review' },
                  { value: 'done', label: 'Done' },
                ]}
              />
            </div>
            <div className="w-[240px]">
              <Select
                label="Disabled select"
                disabled
                value="progress"
                onValueChange={() => {}}
                options={[{ value: 'progress', label: 'In Progress' }]}
              />
            </div>
          </div>
        )}
      </section>
      <aside id="controls-qa" className="fixed left-[1000px] top-0 flex flex-col gap-2">
        <label>
          {'Group'}
          <select
            aria-label="Group"
            value={group}
            onChange={(event) => setGroup(event.target.value)}
          >
            {groups.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          {'Theme'}
          <select
            aria-label="Theme"
            onChange={(event) => setPreferences({ theme: event.target.value as 'light' | 'dark' })}
          >
            <option>{'light'}</option>
            <option>{'dark'}</option>
          </select>
        </label>
        <label>
          {'Accent'}
          <select
            aria-label="Accent"
            onChange={(event) => setPreferences({ accent: event.target.value as 'indigo' })}
          >
            {['indigo', 'blue', 'violet', 'teal', 'rose', 'graphite'].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            setText('Externally updated');
            setChecked(false);
            setToggle(false);
            setChoice('list');
            setSelected('done');
            setRevealed(false);
            setValidation(false);
          }}
        >
          {'Controlled rerender'}
        </button>
        <button
          onClick={() => {
            input.current?.focus();
            button.current?.focus();
            select.current?.focus();
            checkbox.current?.focus();
            tabs.current?.focus();
          }}
        >
          {'Focus via ref'}
        </button>
        <div className="w-[240px]">
          <Select
            label="Availability"
            value={selected}
            onValueChange={setSelected}
            options={[
              { value: 'progress', label: 'In Progress' },
              { value: 'blocked', label: 'Blocked', disabled: true },
              { value: 'review', label: 'Review' },
              { value: 'done', label: 'Done' },
            ]}
          />
        </div>
        <output aria-label="State">
          {JSON.stringify({ text, checked, toggle, choice, selected, revealed, clicks })}
        </output>
      </aside>
    </>
  );
}
