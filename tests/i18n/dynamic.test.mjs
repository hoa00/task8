import ts from 'typescript';
import { fileTypeCatalog } from '../../apps/web/src/features/files/file-types.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { createInstance } = createRequire(new URL('../../apps/web/package.json', import.meta.url))(
  'i18next',
);
import { catalogs } from '../../packages/contracts/src/api.ts';
import { dueBuckets } from '../../packages/domain/src/index.ts';
import { taskColumns } from '../../apps/web/src/features/tasks/task-view.ts';
import {
  authLoginError,
  authUnavailableMessage,
  validateAuth,
} from '../../apps/web/src/data/auth-demo.ts';
import { validateDemoPassword } from '../../apps/web/src/data/security-billing-demo.ts';
const en = JSON.parse(
  readFileSync(new URL('../../apps/web/src/i18n/locales/en.json', import.meta.url), 'utf8'),
);
const vi = JSON.parse(
  readFileSync(new URL('../../apps/web/src/i18n/locales/vi.json', import.meta.url), 'utf8'),
);
const requireKeys = (keys) => {
  for (const key of keys)
    for (const [locale, catalog] of Object.entries({ en, vi }))
      assert(Object.hasOwn(catalog, key), `${locale}: missing dynamic key ${key}`);
};
test('dynamic catalog enums, web column names and choice labels exist in both locales', () => {
  requireKeys(
    [
      ...catalogs.taskStatuses,
      ...catalogs.priorities,
      ...catalogs.projectStatuses,
      ...catalogs.labels,
      ...catalogs.recurrences,
      ...catalogs.templates,
      ...dueBuckets,
      ...taskColumns,
      ...Object.values(fileTypeCatalog),
    ].map((row) => row.name),
  );
  requireKeys([
    'Owner',
    'Admin',
    'Member',
    'Guest',
    'Light',
    'Dark',
    'System',
    'All',
    'Mentions',
    'Assignments',
    'Comments',
    'Updates',
    'Month',
    'Week',
    'No archived tasks',
    'No archived projects',
  ]);
});
test('finite auth and password validation paths are translated at the feature boundary', () => {
  const messages = [authLoginError, authUnavailableMessage];
  for (const screen of ['login', 'signup', 'forgot', 'reset'])
    for (const email of ['', 'bad', 'valid@example.com'])
      for (const password of ['', 'short', 'long-password-123'])
        messages.push(
          ...Object.values(validateAuth(screen, { email, name: '' }, password, 'mismatch')),
        );
  for (const current of ['', 'present'])
    for (const next of ['short', 'long-password-123'])
      messages.push(...Object.values(validateDemoPassword(current, next, 'mismatch')));
  requireKeys(new Set(messages));
});
test('both locales retain plural counts and interpolate user content without translating it', async () => {
  for (const language of ['vi', 'en']) {
    const translator = createInstance();
    await translator.init({
      lng: language,
      resources: { en: { translation: en }, vi: { translation: vi } },
      keySeparator: false,
      nsSeparator: false,
      interpolation: { escapeValue: false },
      initAsync: false,
    });
    for (const count of [0, 1, 2, 21]) {
      const message = translator.t('Deleted {{count}} tasks', { count });
      assert(message.includes(String(count)));
      assert(!message.includes('{{'));
    }
    const message = translator.t('Completed “{{name}}”', { name: 'Home' });
    assert(message.includes('Home'));
    assert(!message.includes('Trang chủ'));
    assert(!message.includes('{{'));
  }
});

function metadata(file, name) {
  const source = ts.createSourceFile(
    file,
    readFileSync(new URL('../../' + file, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const declarations = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations]);
  const declaration = declarations.find(
    (node) => ts.isIdentifier(node.name) && node.name.text === name,
  );
  assert(declaration?.initializer, `${file}: missing ${name}`);
  let value = declaration.initializer;
  while (ts.isAsExpression(value) || ts.isParenthesizedExpression(value)) value = value.expression;
  return { source, value };
}
test('settings headings and onboarding choice metadata have complete dynamic text keys', () => {
  for (const name of ['SettingsPage', 'SecurityBilling', 'WorkspaceNotifications']) {
    const { value } = metadata(`apps/web/src/features/settings/${name}.tsx`, 'headings');
    assert(ts.isObjectLiteralExpression(value));
    for (const row of value.properties) {
      assert(ts.isPropertyAssignment(row) && ts.isArrayLiteralExpression(row.initializer));
      for (const text of row.initializer.elements) {
        assert(ts.isStringLiteral(text));
        requireKeys([text.text]);
      }
    }
  }
  for (const name of ['useCases', 'workstyles']) {
    const { value } = metadata('apps/web/src/features/onboarding/OnboardingPage.tsx', name);
    assert(ts.isArrayLiteralExpression(value));
    for (const row of value.elements) {
      assert(ts.isArrayLiteralExpression(row));
      requireKeys(
        row.elements.slice(2).map((text) => {
          assert(ts.isStringLiteral(text));
          return text.text;
        }),
      );
    }
  }
});
test('notification category labels remain keys until render so live locale switches cannot freeze them', () => {
  const { value } = metadata('apps/web/src/features/notifications/InboxPage.tsx', 'categories');
  assert(ts.isArrayLiteralExpression(value));
  for (const row of value.elements) {
    assert(ts.isObjectLiteralExpression(row));
    const label = row.properties.find(
      (property) => ts.isPropertyAssignment(property) && property.name.getText() === 'label',
    );
    assert(
      label && ts.isStringLiteral(label.initializer),
      'Translate category labels during render',
    );
    requireKeys([label.initializer.text]);
  }
});
