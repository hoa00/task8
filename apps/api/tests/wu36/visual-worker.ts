// Source fixture clock belongs only to this dedicated local visual entry.
import app from '../../src/index.ts';
Date.now = () => Date.parse('2026-10-08T09:00:00.000Z');
export default app;
