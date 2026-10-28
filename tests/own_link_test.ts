import { assertEquals } from "@std/assert";

type Outcome = { success: boolean; points: string | null; planted: string[] | string | null };

function contents(path: string): string[] | string | null {
  const stat = Deno.lstatSync(path);
  if (stat.isDirectory) return [...Deno.readDirSync(path)].map((entry) => entry.name);
  return stat.isFile ? Deno.readTextFileSync(path) : null;
}

async function ownLink(prepare: (link: string) => Promise<void>): Promise<Outcome> {
  const dir = await Deno.makeTempDir();
  try {
    const link = `${dir}/store`;
    await prepare(link);
    const { success } = await new Deno.Command("bin/own-link", { args: [`${dir}/target`, link], stderr: "null" })
      .output();
    const points = await Deno.readLink(link).then((target) => target.replace(dir, "<dir>"), () => null);
    return { success, points, planted: contents(link) };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("own-link makes the link when nothing is at its path", async () => {
  assertEquals(await ownLink(async () => {
    await Promise.resolve();
  }), { success: true, points: "<dir>/target", planted: null });
});

Deno.test("own-link points a link this user owns at the target", async () => {
  assertEquals(await ownLink(async (link) => {
    await Deno.symlink("/elsewhere", link);
  }), {
    success: true,
    points: "<dir>/target",
    planted: null,
  });
});

Deno.test("own-link refuses a planted file and leaves it unchanged", async () => {
  assertEquals(await ownLink(async (link) => {
    await Deno.writeTextFile(link, "planted");
  }), {
    success: false,
    points: null,
    planted: "planted",
  });
});

Deno.test("own-link refuses a planted directory and leaves it empty", async () => {
  assertEquals(await ownLink(async (link) => {
    await Deno.mkdir(link);
  }), { success: false, points: null, planted: [] });
});
