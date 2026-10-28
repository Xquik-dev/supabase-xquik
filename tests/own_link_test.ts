import { assertEquals, assertStringIncludes } from "@std/assert";

type Outcome = { success: boolean; stderr: string; points: string | null };

async function ownLink(prepare: (link: string) => Promise<void>): Promise<Outcome> {
  const dir = await Deno.makeTempDir();
  try {
    const link = `${dir}/store`;
    await prepare(link);
    const { success, stderr } = await new Deno.Command("bin/own-link", { args: [`${dir}/target`, link] }).output();
    const points = await Deno.readLink(link).then((target) => target, () => null);
    return { success, stderr: new TextDecoder().decode(stderr), points };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("own-link makes the link when nothing is at its path", async () => {
  const outcome = await ownLink(() => Promise.resolve());
  assertEquals(outcome.success, true);
  assertEquals(outcome.points?.endsWith("/target"), true);
});

Deno.test("own-link points a link this user owns at the target", async () => {
  const outcome = await ownLink((link) => Deno.symlink("/elsewhere", link));
  assertEquals(outcome.success, true);
  assertEquals(outcome.points?.endsWith("/target"), true);
});

Deno.test("own-link refuses a planted file or directory and leaves it in place", async () => {
  for (const plant of [(link: string) => Deno.writeTextFile(link, "planted"), (link: string) => Deno.mkdir(link)]) {
    const outcome = await ownLink(plant);
    assertEquals([outcome.success, outcome.points], [false, null]);
    assertStringIncludes(outcome.stderr, "is not a symbolic link that this user owns");
  }
});
