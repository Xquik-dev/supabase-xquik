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

Deno.test("each migration is named <UTC timestamp>_<snake_case>.sql", async () => {
  const names = await Array.fromAsync(Deno.readDir("supabase/migrations"), (entry) => entry.name);
  const misnamed = names.filter((name) => !isMigrationName(name)).toSorted();
  assertEquals(misnamed, []);
});
