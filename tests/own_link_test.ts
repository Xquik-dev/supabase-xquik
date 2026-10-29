import { assertEquals } from "@std/assert";
import readDir from "@/scripts/read_dir.ts";

interface Outcome {
  planted: string[] | string | null;
  points: string | null;
  success: boolean;
}

async function contents(path: string): Promise<string[] | string | null> {
  const stat = await Deno.lstat(path);
  if (stat.isDirectory) {
    const entries = await Array.fromAsync(readDir(path));
    return entries.map(({ name }) => name);
  }
  if (stat.isFile) {
    return await Deno.readTextFile(path);
  }
  return null;
}

async function ownLink(prepare: (link: string) => Promise<void>): Promise<Outcome> {
  const dir = await Deno.makeTempDir();
  try {
    const link = `${dir}/store`;
    await prepare(link);
    const { success } = await new Deno.Command("bin/own-link", { args: [`${dir}/target`, link], stderr: "null" })
      .output();
    const points = await Deno.readLink(link).then((target) => target.replace(dir, "<dir>"), () => null);
    return { planted: await contents(link), points, success };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("own-link makes the link when nothing is at its path", async () => {
  assertEquals(
    await ownLink(async () => {
      await Promise.resolve();
    }),
    { planted: null, points: "<dir>/target", success: true },
  );
});

Deno.test("own-link points a link this user owns at the target", async () => {
  assertEquals(
    await ownLink(async (link) => {
      await Deno.symlink("/elsewhere", link);
    }),
    { planted: null, points: "<dir>/target", success: true },
  );
});

Deno.test("own-link refuses a planted file and leaves it unchanged", async () => {
  assertEquals(
    await ownLink(async (link) => {
      await Deno.writeTextFile(link, "planted");
    }),
    { planted: "planted", points: null, success: false },
  );
});

Deno.test("own-link refuses a planted directory and leaves it empty", async () => {
  assertEquals(
    await ownLink(async (link) => {
      await Deno.mkdir(link);
    }),
    { planted: [], points: null, success: false },
  );
});
