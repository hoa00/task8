import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogBody,
  EmptyState,
  Field,
  Input,
  OverlayProvider,
  Popover,
  SegmentedControl,
  Select,
  Tabs,
  ToastViewport,
  UiTranslationContext,
} from '@studio/ui';
const items = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'disabled', label: 'Disabled', disabled: true },
  { value: 'c', label: 'Gamma' },
];
function FocusMatrix() {
  const [open, setOpen] = useState(false),
    [popup, setPopup] = useState(false),
    [opener, setOpener] = useState(true),
    [tab, setTab] = useState('b'),
    [radio, setRadio] = useState('a'),
    [value, setValue] = useState('');
  const initial = useRef<HTMLButtonElement>(null),
    anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <div data-focus-launcher>
        {opener && (
          <Button
            onClick={() => {
              setOpen(true);
            }}
          >
            {'Open focus matrix'}
          </Button>
        )}
        <Button>{'After dialog'}</Button>
      </div>
      <Dialog open={open} initialFocus={initial} aria-label="Focus matrix" onOpenChange={setOpen}>
        <DialogBody>
          <button ref={initial} tabIndex={-1}>
            {'Programmatic only'}
          </button>
          <a href="#" tabIndex={-1}>
            {'Negative anchor'}
          </a>
          <input aria-label="Negative input" tabIndex={-1} />
          <button hidden>{'Hidden button'}</button>
          <span style={{ visibility: 'hidden' }}>
            <button>{'Invisible button'}</button>
          </span>
          <div inert>
            <button>{'Inert button'}</button>
          </div>
          <fieldset disabled>
            <button>{'Disabled fieldset'}</button>
          </fieldset>
          <Tabs label="Matrix tabs" items={items} value={tab} onValueChange={setTab} />
          <SegmentedControl
            label="Matrix radio"
            items={items}
            value={radio}
            onValueChange={setRadio}
          />
          <Field label="Matrix text" hint="Matrix hint">
            {(control) => (
              <Input
                {...control}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </Field>
          <Button onClick={() => setOpener(false)}>{'Remove opener'}</Button>
          <Button ref={anchor} onClick={() => setPopup(true)}>
            {'Nested popup'}
          </Button>
          <Button onClick={() => setOpen(false)}>{'Close matrix'}</Button>
        </DialogBody>
        <Popover open={popup} anchor={anchor} onOpenChange={setPopup} aria-label="Matrix popup">
          <Button onClick={() => setPopup(false)}>{'Popup action'}</Button>
        </Popover>
      </Dialog>
    </>
  );
}
export function AccessibilityGallery() {
  const [value, setValue] = useState(''),
    [error, setError] = useState(false),
    [choice, setChoice] = useState('a'),
    [toast, setToast] = useState(true),
    [selected, setSelected] = useState('a');
  return (
    <UiTranslationContext
      value={(message) =>
        message === 'Home'
          ? 'UNEXPECTED TRANSLATION'
          : message === 'Dismiss'
            ? 'Internal dismiss'
            : message
      }
    >
      <OverlayProvider>
        <section data-accessibility-gallery className="flex max-w-[620px] flex-col gap-4 p-6">
          <Field label="Home" hint="Home" error={error ? 'Home' : undefined}>
            {(control) => (
              <Input
                {...control}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </Field>
          <Field label="Select binding" hint="Select hint">
            {(control) => (
              <Select
                {...control}
                label="Select binding"
                value={selected}
                options={items}
                onValueChange={setSelected}
              />
            )}
          </Field>
          <Button onClick={() => setError((current) => !current)}>{'Toggle binding error'}</Button>
          <Alert>{'Home'}</Alert>
          <EmptyState icon="home" heading="Home" description="Home" />
          <Tabs
            label="Literal tabs"
            value={choice}
            onValueChange={setChoice}
            items={[
              { value: 'a', label: 'Home' },
              { value: 'b', label: 'Other' },
            ]}
          />
          <ToastViewport
            items={
              toast
                ? [
                    {
                      id: 'literal',
                      message: 'Home',
                      duration: 0,
                      action: { label: 'Home', onAction: () => {} },
                    },
                  ]
                : []
            }
            onDismiss={() => setToast(false)}
          />
          <FocusMatrix />
        </section>
      </OverlayProvider>
    </UiTranslationContext>
  );
}
