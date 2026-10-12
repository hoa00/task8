import { NameSchema, EntityIdSchema } from '@studio/contracts/api';
import { compareTaskTuple } from '@studio/domain';
import app from '../../src/index.ts';
import { RequestRepository } from '../../src/db/client.ts';
export default {
  async fetch(
    request: Request,
    env: CloudflareBindings,
    context: ExecutionContext,
  ): Promise<Response> {
    if (new URL(request.url).pathname !== '/__sql/compatibility')
      return app.fetch(request, env, context);
    const repository = new RequestRepository(env.DB);
    const corpus = ['a', 'B', 'ä', 'z', 'é', 'e\u0301', '\ue000', '\u{10000}'].map(
      (value, index) => ({
        id: EntityIdSchema.parse('019a7bc0-0000-7000-8000-' + String(index + 1).padStart(12, '0')),
        value: NameSchema.parse(value),
      }),
    );
    const json = JSON.stringify(corpus);
    let version: { version: string } | undefined,
      versionError: string | null = null;
    try {
      [version] = await repository.all<{ version: string }>('SELECT sqlite_version() version');
    } catch (error) {
      versionError = error instanceof Error ? error.message : String(error);
    }
    let collations: { seq: number; name: string }[] | null = null,
      collationError: string | null = null;
    try {
      collations = await repository.all<{ seq: number; name: string }>('PRAGMA collation_list');
    } catch (error) {
      collationError = error instanceof Error ? error.message : String(error);
    }
    const binary = await repository.all<{ id: string; value: string }>(
      "SELECT json_extract(value,'$.id') id,json_extract(value,'$.value') value FROM json_each(?) ORDER BY value COLLATE BINARY,id",
      [json],
    );
    const nocase = await repository.all<{ id: string; value: string }>(
      "SELECT json_extract(value,'$.id') id,json_extract(value,'$.value') value FROM json_each(?) ORDER BY value COLLATE NOCASE,id",
      [json],
    );
    const locale = [...corpus].sort(
      (a, b) => a.value.localeCompare(b.value) || a.id.localeCompare(b.id),
    );
    const utf16 = [
      { id: EntityIdSchema.parse('019a7bc0-0000-7000-8000-000000000001'), value: '\u{10000}' },
      { id: EntityIdSchema.parse('019a7bc0-0000-7000-8000-000000000002'), value: '\ue000' },
    ];
    const taskOrder = [...utf16].sort((a, b) => compareTaskTuple(a, b, 'asc'));
    const taskBinary = await repository.all<{ id: string; value: string }>(
      "SELECT json_extract(value,'$.id') id,json_extract(value,'$.value') value FROM json_each(?) ORDER BY value COLLATE BINARY,id",
      [JSON.stringify(utf16)],
    );
    const normalization = [];
    for (const [text, needle] of [
      ['Änne', 'ä'],
      ['Kelvin', 'k'],
      ['İSTANBUL', 'i\u0307'],
      ['AXB', '%_'],
      ['A%_B', '%_'],
    ] as const) {
      const [sql] = await repository.all<{ folded: string; literal: number; likeMatch: number }>(
        "SELECT lower(?) folded,instr(lower(?),lower(?))>0 literal,lower(?) LIKE '%'||lower(?)||'%' likeMatch",
        [text, text, needle, text, needle],
      );
      normalization.push({
        text,
        needle,
        js: {
          folded: text.toLowerCase(),
          literal: text.toLowerCase().includes(needle.toLowerCase()),
        },
        sql,
      });
    }
    let icu: { available: true } | { available: false; error: string };
    try {
      await repository.all("SELECT icu_load_collation('en_US','js_icu')");
      icu = { available: true };
    } catch (error) {
      icu = { available: false, error: error instanceof Error ? error.message : String(error) };
    }
    const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id).join(',');
    const blockers = {
      localeBinary: ids(locale) !== ids(binary),
      localeNoCase: ids(locale) !== ids(nocase),
      taskUtf16: ids(taskOrder) !== ids(taskBinary),
      unicodeLower: normalization.some((row) => row.js.folded !== row.sql?.folded),
      literalLike: normalization.some((row) => row.js.literal !== !!row.sql?.likeMatch),
    };
    return Response.json({
      sqlite: version?.version ?? null,
      versionError,
      collations,
      collationError,
      locale: new Intl.Collator().resolvedOptions(),
      corpus,
      orders: { locale, binary, nocase, taskOrder, taskBinary },
      normalization,
      icu,
      blockers,
      statements: repository.statements,
      trace: repository.trace,
    });
  },
};
