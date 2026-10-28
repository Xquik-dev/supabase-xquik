import { assertRejects } from "@std/assert";
import type { Client } from "pg";
import { DatabaseError } from "pg";

type Row = Record<string, unknown>;
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Row[]>;
type Reply = readonly [status: number, type: string | null, content: string | null];

interface Failure {
  readonly hint?: string;
  readonly message: string;
}

interface Database {
  readonly enqueueAnswered: (reply: Reply) => Promise<void>;
  readonly failure: (statement: () => Promise<unknown>) => Promise<Failure>;
  readonly query: (text: string, values?: unknown[]) => Promise<Row[]>;
  readonly sql: Sql;
}

interface SqlStep {
  readonly name: string;
  readonly run: (db: Database) => Promise<void>;
}

const xquik = "https://xquik.com";
const key = { "x-api-key": "xq_test_key" };
const http = {
  badGateway: 502,
  created: 201,
  lastSuccess: 299,
  multipleChoices: 300,
  noContent: 204,
  notFound: 404,
  ok: 200,
  serverError: 500,
  tooManyRequests: 429,
  unauthorized: 401,
};
const AFTER_PLACEHOLDER_ZERO = 1;

async function query(client: Client, text: string, values: unknown[] = []): Promise<Row[]> {
  const result = await client.query<Row, unknown[]>(text, values);
  return result.rows;
}

function tagged(client: Client): Sql {
  return async (strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> => {
    const parts = strings.flatMap((part, index) => [`$${String(index)}`, part]);
    return await query(client, parts.slice(AFTER_PLACEHOLDER_ZERO).join(""), values);
  };
}

function described({ hint, message }: DatabaseError): Failure {
  if (typeof hint === "string") {
    return { hint, message };
  }
  return { message };
}

async function sequence<Item, Result>(
  items: Iterator<Item, unknown>,
  each: (item: Item) => Promise<Result>,
  results: Result[],
): Promise<Result[]> {
  const next = items.next();
  if (next.done === true) {
    return results;
  }
  results.push(await each(next.value));
  return await sequence(items, each, results);
}

async function inSequence<Item, Result>(
  items: readonly Item[],
  each: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  return await sequence(items.values(), each, []);
}

function database(client: Client): Database {
  const sql = tagged(client);
  return {
    enqueueAnswered: async ([status, type, content]) => {
      const [action] = await sql`select xquik.enqueue('getAccount') as id`;
      await sql`insert into net._http_response (id, status_code, content_type, content)
        select request_id, ${status}, ${type}, ${content} from public.xquik_actions where id = ${action?.["id"]}`;
    },
    failure: async (statement) => {
      await sql`savepoint failure`;
      const error = await assertRejects(statement, DatabaseError);
      await sql`rollback to savepoint failure`;
      return described(error);
    },
    query: async (text, values) => await query(client, text, values),
    sql,
  };
}

export { database, http, inSequence, key, tagged, xquik };
export type { Database, Reply, Row, Sql, SqlStep };
