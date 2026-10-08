import { Hono } from 'hono';

const app = new Hono<{ Bindings: CloudflareBindings }>();

// No business endpoint is implemented by the workspace foundation.
app.notFound(context => context.text('Not found', 404));

export default app;
