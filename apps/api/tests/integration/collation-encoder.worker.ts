import {
  instantLocaleKeySql,
  dueLocaleKeySql,
  dateUtf16KeySql,
} from '../../src/db/read-expressions.ts';
import { z } from 'zod';
import app from '../../src/index.ts';
import { RequestRepository } from '../../src/db/client.ts';
import { textKeyEncoder } from '../../src/shared/collation/encoder.ts';
import { utf16Key, textKeyVersion } from '../../src/shared/text-key-encoder.ts';
const CorpusSchema = z.array(z.string().max(500)).min(1).max(30000);
export default {
  async fetch(
    request: Request,
    env: CloudflareBindings,
    context: ExecutionContext,
  ): Promise<Response> {
    if (new URL(request.url).pathname !== '/__sql/collation')
      return app.fetch(request, env, context);
    const corpus = CorpusSchema.parse(await request.json());
    const foldingFailures = corpus.filter(
      (value) => textKeyEncoder.lower(value) !== value.toLowerCase(),
    );
    const rows = corpus.map((value, index) => ({
      index,
      value,
      key: textKeyEncoder.locale(value),
      utf16: utf16Key(value),
    }));
    const repository = new RequestRepository(env.DB);
    const sqlRows = await repository.all<{ index: number; key: string }>(
      "SELECT json_extract(value,'$.index') AS 'index',json_extract(value,'$.key') AS key FROM json_each(?) ORDER BY key,CAST(json_extract(value,'$.index') AS INTEGER)",
      [JSON.stringify(rows)],
    );
    const failures: { a: string; b: string; actual: number; expected: number }[] = [];
    for (let index = 1; index < sqlRows.length; index++) {
      const left = rows[sqlRows[index - 1]?.index ?? -1],
        right = rows[sqlRows[index]?.index ?? -1];
      if (!left || !right) throw new Error('Missing corpus row');
      const actual = Math.sign(left.value.localeCompare(right.value)),
        expected = left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
      if (actual !== expected) failures.push({ a: left.value, b: right.value, actual, expected });
    }
    const utf16Rows = await repository.all<{ index: number }>(
      "SELECT json_extract(value,'$.index') AS 'index' FROM json_each(?) ORDER BY json_extract(value,'$.utf16'),CAST(json_extract(value,'$.index') AS INTEGER)",
      [JSON.stringify(rows)],
    );
    let utf16FailureCount = 0;
    for (let index = 1; index < utf16Rows.length; index++) {
      const left = rows[utf16Rows[index - 1]?.index ?? -1],
        right = rows[utf16Rows[index]?.index ?? -1];
      if (!left || !right) throw new Error('Missing corpus row');
      if (left.value > right.value || (left.value === right.value) !== (left.utf16 === right.utf16))
        utf16FailureCount++;
    }
    const dates = Array.from({ length: 160 }, (_, index) => {
      const year = 1 + ((index * 7919) % 9999);
      const date = String(year).padStart(4, '0') + '-02-28';
      return { epoch: Date.parse(date + 'T23:59:59.999Z'), date };
    });
    dates.push({ epoch: -1, date: '1969-12-31' }, { epoch: 0, date: '1970-01-01' });
    const dateRows = await repository.all<{
      epoch: number;
      date: string;
      instantKey: string;
      dueKey: string;
      utf16: string;
    }>(
      `SELECT json_extract(value,'$.epoch') epoch,json_extract(value,'$.date') date,${instantLocaleKeySql("json_extract(value,'$.epoch')")} instantKey,${dueLocaleKeySql("json_extract(value,'$.date')")} dueKey,${dateUtf16KeySql("json_extract(value,'$.date')")} utf16 FROM json_each(?)`,
      [JSON.stringify(dates)],
    );
    const dateFailures = dateRows.filter(
      (row) =>
        row.instantKey !== textKeyEncoder.locale(new Date(row.epoch).toISOString()) ||
        row.dueKey !== textKeyEncoder.locale(row.date) ||
        row.utf16 !== utf16Key(row.date),
    );
    const storageEcho = [];
    for (const value of ['\ud800', '\udfff', '\ud800A', 'A\udfff']) {
      const [echo] = await repository.all<{
        jsonEcho: string;
        boundEcho: string;
        jsonHex: string;
        boundHex: string;
      }>(
        "SELECT json_extract(?,'$.value') jsonEcho,? boundEcho,hex(json_extract(?,'$.value')) jsonHex,hex(?) boundHex",
        [JSON.stringify({ value }), value, JSON.stringify({ value }), value],
      );
      storageEcho.push({ input: value, echo });
    }
    return Response.json({
      version: textKeyVersion,
      locale: new Intl.Collator().resolvedOptions(),
      count: rows.length,
      failures: failures.slice(0, 50),
      failureCount: failures.length,
      foldingFailureCount: foldingFailures.length,
      foldingFailures: foldingFailures.slice(0, 20),
      dateFailureCount: dateFailures.length,
      dateFailures: dateFailures.slice(0, 20),
      dateCases: dateRows.length,
      storageEcho,
      utf16FailureCount,
      statements: repository.statements,
      trace: repository.trace,
    });
  },
};
