import { discoverTests } from './discover.mjs';
import { root } from './output.mjs';
const packages = ['@studio/web', '@studio/ui', '@studio/contracts', '@studio/domain'];
const scoped = (task) => [...packages.flatMap((name) => ['--filter', name]), task];
const nodeTests = (dirs, pattern) => [
  '--experimental-strip-types',
  '--test',
  '--test-isolation=none',
  '--test-reporter=tap',
  ...discoverTests(root, dirs, pattern),
];
export function frontendChecks() {
  return [
    {
      id: 'typecheck',
      owner: 'web/ui/contracts/domain',
      mode: 'types',
      command: 'pnpm',
      args: scoped('typecheck'),
    },
    {
      id: 'consumers',
      owner: 'contracts/web',
      mode: 'types',
      command: 'pnpm',
      args: ['contracts:consumers:web'],
    },
    {
      id: 'lint',
      owner: 'non-API source and active harness',
      mode: 'static',
      command: 'pnpm',
      args: [
        'exec',
        'eslint',
        'apps/web',
        'packages',
        'tests/workspace',
        'tests/frontend',
        'tests/data',
        'tests/i18n',
        'tests/contracts',
        'tests/visual',
        'eslint.config.mjs',
      ],
    },
    {
      id: 'boundaries',
      owner: 'shared packages and web',
      mode: 'static',
      command: 'pnpm',
      args: ['frontend:boundaries'],
    },
    {
      id: 'web-tests',
      owner: 'web/env/adapter and feature tests',
      mode: 'unit',
      test: true,
      command: process.execPath,
      args: nodeTests(['apps/web/src', 'apps/web/tests']),
    },
    {
      id: 'domain-tests',
      owner: 'domain/pure semantics',
      mode: 'unit',
      test: true,
      command: process.execPath,
      args: nodeTests(['packages/domain/tests']),
    },
    {
      id: 'contract-tests',
      owner: 'contracts',
      mode: 'unit',
      test: true,
      command: process.execPath,
      args: nodeTests(['tests/contracts']),
    },
    {
      id: 'identities',
      owner: 'contracts/fixture',
      mode: 'static',
      command: process.execPath,
      args: ['tests/contracts/generate-source-identities.mjs', '--check'],
    },
    {
      id: 'workspace-tests',
      owner: 'workspace/tooling',
      mode: 'unit',
      test: true,
      command: process.execPath,
      args: nodeTests(['tests/workspace'], /\.test\.mjs$/),
    },
    {
      id: 'tooling-tests',
      owner: 'frontend/tooling',
      mode: 'unit',
      test: true,
      command: process.execPath,
      args: nodeTests(['tests/frontend'], /\.test\.mjs$/),
    },
    {
      id: 'i18n-tests',
      owner: 'i18n',
      mode: 'unit',
      test: true,
      command: process.execPath,
      args: nodeTests(['tests/i18n'], /\.test\.mjs$/),
    },
    {
      id: 'build',
      owner: 'web/ui/contracts/domain',
      mode: 'mock',
      command: 'pnpm',
      args: scoped('build'),
    },
    {
      id: 'http-build',
      owner: 'web',
      mode: 'http',
      command: 'pnpm',
      args: ['--filter', '@studio/web', 'build:http'],
    },
    {
      id: 'http-bundle',
      owner: 'web/adapter graph',
      mode: 'http',
      command: process.execPath,
      args: (output) => ['tests/data/http-bundle.mjs', `--output=${output}/bundle`],
    },
    {
      id: 'browser-smoke',
      browserReport: 'browser/report.json',
      owner: 'web/shell/tasks/calendar',
      mode: 'mock-browser',
      optional: true,
      command: process.execPath,
      args: (output) => ['tests/frontend/smoke.mjs', `--output=${output}/browser`],
    },
    {
      id: 'browser-url',
      owner: 'web/URL/transient',
      mode: 'mock-browser',
      optional: true,
      browserReport: 'browser-url/report.json',
      command: process.execPath,
      args: (output) => ['tests/frontend/url-scope.mjs', `--output=${output}/browser-url`],
    },
    {
      id: 'browser-controllers',
      owner: 'web/controllers/dates/notifications',
      mode: 'mock-browser',
      optional: true,
      browserReport: 'browser-controllers/report.json',
      command: process.execPath,
      args: (output) => [
        'tests/frontend/controllers.mjs',
        `--output=${output}/browser-controllers`,
      ],
    },
    {
      id: 'browser-accessibility',
      owner: 'ui/forms/keyboard/i18n',
      mode: 'mock-browser',
      optional: true,
      browserReport: 'browser-accessibility/report.json',
      command: process.execPath,
      args: (output) => [
        'tests/frontend/accessibility.mjs',
        `--output=${output}/browser-accessibility`,
      ],
    },
    {
      id: 'people-http',
      owner: 'people/HTTP recovery',
      mode: 'intercepted-http-browser',
      optional: true,
      browserReport: 'people-http/report.json',
      command: process.execPath,
      args: (output) => ['tests/visual/people/http.mjs', `--output=${output}/people-http`],
    },
    {
      id: 'teams-http',
      owner: 'teams/CAS/Undo/HTTP recovery',
      mode: 'intercepted-http-browser',
      optional: true,
      browserReport: 'teams-http/report.json',
      command: process.execPath,
      args: (output) => ['tests/visual/teams/http.mjs', `--output=${output}/teams-http`],
    },
    {
      id: 'reference',
      owner: 'pinned source',
      mode: 'reference',
      optional: true,
      command: 'pnpm',
      args: ['reference:check'],
    },
  ];
}
export function selectChecks(checks, { ids, affected = false, skipTests = false } = {}) {
  const requested = ids ?? checks.filter((check) => !check.optional).map((check) => check.id);
  if (new Set(requested).size !== requested.length) throw Error('Duplicate check ID');
  for (const id of requested)
    if (!checks.some((check) => check.id === id)) throw Error(`Unknown check ID: ${id}`);
  return checks.map((check) => ({
    ...check,
    skip: !requested.includes(check.id)
      ? 'not-selected'
      : affected &&
          [
            'typecheck',
            'web-tests',
            'domain-tests',
            'contract-tests',
            'workspace-tests',
            'i18n-tests',
            'tooling-tests',
          ].includes(check.id)
        ? 'affected-selection'
        : skipTests && (check.test || check.browserReport)
          ? 'skip-tests'
          : null,
  }));
}
