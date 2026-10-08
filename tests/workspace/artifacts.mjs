import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dryRun = JSON.parse(execFileSync('pnpm', ['exec', 'turbo', 'run', 'build', '--dry=json'], { cwd: root, encoding: 'utf8' }));
const tasks = dryRun.tasks.map(task => ({ taskId: task.taskId, dependencies: task.dependencies, outputs: task.outputs, command: task.command }));
const expected = {
  '@studio/contracts#build': [],
  '@studio/ui#build': [],
  '@studio/domain#build': ['@studio/contracts#build'],
  '@studio/api#build': ['@studio/contracts#build', '@studio/domain#build'],
  '@studio/web#build': ['@studio/contracts#build', '@studio/domain#build', '@studio/ui#build'],
};
assert.equal(tasks.length, 5);
for (const task of tasks) assert.deepEqual(task.dependencies.sort(), expected[task.taskId].sort());
const modules = JSON.parse(readFileSync(`${root}apps/web/dist/module-graph.json`, 'utf8'));
const forbidden = modules.filter(id => /\.reference|apps\/api|\/hono(?:@|\/)|drizzle|cloudflare|workers-types|workerd|src\/core\/store|src\/shell\/render/.test(id));
assert.deepEqual(forbidden, [], 'Browser bundle contains forbidden source/server modules');
const indexHtml = readFileSync(`${root}apps/web/dist/index.html`, 'utf8');
assert(!indexHtml.includes('.reference'));
console.log(JSON.stringify({ status: 'passed', tasks, browserModuleCount: modules.length, forbiddenModules: forbidden, browserGraph: 'apps/web/dist/module-graph.json', apiArtifact: 'apps/api/dist/index.js' }, null, 2));
