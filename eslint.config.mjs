import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['.reference/**', 'docs/**', '**/dist/**', '**/dist-http/**', '**/node_modules/**', '**/.turbo/**', '**/.wrangler/**', 'test-results/**', '**/routeTree.gen.ts', '**/worker-configuration.d.ts'] },
  js.configs.recommended,
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  { files: ['tests/contracts/**/*.ts'], languageOptions: { globals: globals.node } },
  { files: ['tests/visual/reference/**/*.mjs', 'tests/visual/foundation/**/*.mjs', 'tests/visual/controls/**/*.mjs', 'tests/visual/overlays/**/*.mjs', 'tests/visual/shell/**/*.mjs', 'tests/visual/tasks/**/*.mjs', 'tests/visual/task-list/**/*.mjs', 'tests/visual/task-detail/**/*.mjs', 'tests/visual/task-collaboration/**/*.mjs', 'tests/visual/task-board/**/*.mjs', 'tests/visual/calendar/**/*.mjs', 'tests/visual/timeline/**/*.mjs', 'tests/visual/task-table/**/*.mjs', 'tests/visual/projects/**/*.mjs', 'tests/visual/dashboards/**/*.mjs', 'tests/visual/search/**/*.mjs', 'tests/visual/notifications/**/*.mjs', 'tests/visual/people/**/*.mjs', 'tests/visual/teams/**/*.mjs', 'tests/visual/files/**/*.mjs', 'tests/visual/settings/**/*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  ...tseslint.configs.recommended.map(config => ({ ...config, files: ['apps/**/*.ts', 'apps/**/*.tsx', 'packages/**/*.ts', 'packages/**/*.tsx', 'tests/contracts/**/*.ts'] })),
  { files: ['apps/**/*.ts', 'apps/**/*.tsx', 'packages/**/*.ts', 'packages/**/*.tsx', 'tests/contracts/**/*.ts'], rules: { '@typescript-eslint/consistent-type-imports': 'error' } },
  { files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx', 'packages/ui/src/**/*.ts', 'packages/ui/src/**/*.tsx'], languageOptions: { globals: globals.browser }, plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh }, rules: { ...reactHooks.configs.recommended.rules, ...reactRefresh.configs.vite.rules } },
  { files: ['apps/web/src/routes/**/*.tsx'], rules: { 'react-refresh/only-export-components': ['error', { extraHOCs: ['createFileRoute', 'createRootRoute', 'createRootRouteWithContext'] }] } },
);
