import { assertEquals } from "@std/assert";
import { withoutEmptyKinds } from "../scripts/types.ts";

const helper = (kind: string): string =>
  `export type ${kind}<\n  Name extends\n    | keyof DefaultSchema["${kind}"]\n    | { schema: keyof DatabaseWithoutInternals },\n> = Name;\n`;
const pruned = (kind: string): string =>
  `export type ${kind}<\n  Name extends\n    | { schema: keyof DatabaseWithoutInternals },\n> = Name;\n`;
const empty = (kind: string): string => `    ${kind}: {\n      [_ in never]: never;\n    };\n`;

Deno.test("withoutEmptyKinds drops the never member of each helper whose kind the public schema leaves empty", () => {
  assertEquals(
    withoutEmptyKinds(empty("Enums") + empty("CompositeTypes") + helper("Enums") + helper("CompositeTypes")),
    empty("Enums") + empty("CompositeTypes") + pruned("Enums") + pruned("CompositeTypes"),
  );
});

Deno.test("withoutEmptyKinds keeps each helper whose kind the public schema defines", () => {
  const defined = `    Enums: {\n      status: "sent" | "failed";\n    };\n` + helper("Enums");
  assertEquals(withoutEmptyKinds(defined), defined);
});

Deno.test("scripts/types.ts rewrites each file it names", async () => {
  const file = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(file, empty("Enums") + helper("Enums"));
  const output = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--config",
      new URL("../deno.json", import.meta.url).pathname,
      `--allow-read=${file}`,
      `--allow-write=${file}`,
      new URL("../scripts/types.ts", import.meta.url).pathname,
      file,
    ],
  }).output();
  assertEquals(output.code, 0);
  assertEquals(await Deno.readTextFile(file), empty("Enums") + pruned("Enums"));
});
