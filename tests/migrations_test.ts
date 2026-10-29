import { assertEquals } from "@std/assert";

const NAME = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/v;
const STAMP = /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})(?<hour>\d{2})(?<minute>\d{2})(?<second>\d{2}).+$/v;
const ISO = "$<year>-$<month>-$<day>T$<hour>:$<minute>:$<second>.000Z";

function isMigrationName(name: string): boolean {
  if (!NAME.test(name)) {
    return false;
  }
  const iso = name.replace(STAMP, ISO);
  return !Number.isNaN(Date.parse(iso)) && new Date(iso).toISOString() === iso;
}

const MIGRATION_NAMES = [...Deno.readDirSync("supabase/migrations")].map((entry) => entry.name);

Deno.test("each migration is named <UTC timestamp>_<snake_case>.sql", () => {
  const misnamed = MIGRATION_NAMES.filter((name) => !isMigrationName(name)).toSorted();
  assertEquals(misnamed, []);
});
