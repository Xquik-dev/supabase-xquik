import { assertEquals } from "@std/assert";

const NAME = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

function isMigrationName(name: string): boolean {
  const parts = NAME.exec(name)?.slice(1);
  if (parts === undefined) return false;
  const [year, month, day, hour, minute, second] = parts;
  const iso = `${String(year)}-${String(month)}-${String(day)}T${String(hour)}:${String(minute)}:${
    String(second)
  }.000Z`;
  return !Number.isNaN(Date.parse(iso)) && new Date(iso).toISOString() === iso;
}

Deno.test("each migration is named <UTC timestamp>_<snake_case>.sql", () => {
  const misnamed = [...Deno.readDirSync("supabase/migrations")]
    .map((entry) => entry.name)
    .filter((name) => !isMigrationName(name))
    .toSorted();
  assertEquals(misnamed, []);
});
