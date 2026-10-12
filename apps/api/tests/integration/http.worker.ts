// Test-only response corruption exercises the production onError boundary in workerd.
import app from '../../src/index.ts';
import { operations } from '@studio/contracts/api';
import core from './core.worker.ts';
app.get('/__http/invalid-response', (context) =>
  context.json(operations.getProfile.response.parse({ data: { name: 123 } })),
);
export default core;
