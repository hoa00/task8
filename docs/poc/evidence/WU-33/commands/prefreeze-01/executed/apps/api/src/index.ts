import { Hono } from 'hono';
import { ApiErrorSchema, operations } from '@studio/contracts/api';
import { mapError } from './errors.ts';
import { principalMiddleware } from './middleware.ts';
import { routes } from './modules/routes.ts';
import type { ApiEnvironment } from './runtime.ts';
const app=new Hono<ApiEnvironment>();
app.onError(mapError);
app.use('/api/v1/*',principalMiddleware);
app.route('/api/v1',routes);
app.notFound(c=>{
  const known=Object.values(operations).some(op=>op.method===c.req.method && new RegExp('^'+op.path.replace(/\{[^}]+\}/gu,'[^/]+')+'$','u').test(c.req.path));
  return c.json(ApiErrorSchema.parse({error:{code:known?'CAPABILITY_UNAVAILABLE':'NOT_FOUND',message:known?'Operation is not implemented':'Not found'}}),known?501:404);
});
export default app;
