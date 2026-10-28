import { assert, assertEquals } from "@std/assert";
import normalizeTypes from "@/scripts/types.ts";

const keyed = (kind: string): string => `    | keyof DefaultSchema["${kind}"]\n`;
const helper = (kind: string, members = ""): string =>
  `type ${kind}<\n  Name extends\n${members}    | { schema: keyof DatabaseWithoutInternals },\n> = Name;\n`;
const empty = (kind: string): string => `    ${kind}: {\n      [_ in never]: never;\n    };\n`;
const emptied = (kind: string): string => `    ${kind}: Record<symbol, never>;\n`;
const constants = "const Constants = {} as const;\n";

Deno.test("normalizeTypes drops the keyof member only from helpers of kinds the public schema leaves empty", () => {
  const defined = `    Enums: {\n      status: "sent" | "failed";\n    };\n`;
  const generated = [
    empty("Views"),
    defined,
    empty("CompositeTypes"),
    `export ${helper("Enums", keyed("Enums"))}`,
    `export ${helper("CompositeTypes", keyed("CompositeTypes"))}`,
    `export ${constants}`,
  ];
  const normalized = [
    emptied("Views"),
    defined,
    emptied("CompositeTypes"),
    helper("Enums", keyed("Enums")),
    helper("CompositeTypes"),
    constants,
    "\nexport type { Enums, CompositeTypes };\nexport { Constants };\n",
  ];
  assertEquals(normalizeTypes(generated.join("")), normalized.join(""));
});

Deno.test("normalizeTypes turns object aliases into interfaces, names inferred types & exports last", () => {
  const generated = [
    "export type Json = string | { [key: string]: Json | undefined };",
    "",
    "export type Database = {",
    '  "public": {',
    "    Tables: {",
    "      Row: string;",
    "    };",
    "  };",
    "};",
    "",
    "export type Tables<Name> = Database[Name] extends {",
    "    Row: infer R;",
    "  } ? R",
    "  : never;",
    "",
    "export const Constants = {} as const;",
    'export const Version = "1";',
    "",
  ];
  const normalized = [
    "type Json = string | { [key: string]: Json | undefined };",
    "",
    "interface Database {",
    '  "public": {',
    "    Tables: {",
    "      Row: string;",
    "    };",
    "  };",
    "}",
    "",
    "type Tables<Name> = Database[Name] extends {",
    "    Row: infer Row;",
    "  } ? Row",
    "  : never;",
    "",
    "const Constants = {} as const;",
    'const Version = "1";',
    "",
    "export type { Json, Database, Tables };",
    "export { Constants, Version };",
    "",
  ];
  assertEquals(normalizeTypes(generated.join("\n")), normalized.join("\n"));
});

Deno.test("scripts/types.ts rewrites each file it names", async () => {
  const files = await Promise.all([Deno.makeTempFile({ suffix: ".ts" }), Deno.makeTempFile({ suffix: ".ts" })]);
  const generated = [empty("Enums"), `export ${helper("Enums", keyed("Enums"))}`, `export ${constants}`].join("");
  await Promise.all(files.map(async (file) => {
    await Deno.writeTextFile(file, generated);
  }));
  const output = await new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--config",
      new URL("../deno.json", import.meta.url).pathname,
      `--allow-read=${files.join(",")}`,
      `--allow-write=${files.join(",")}`,
      new URL("../scripts/types.ts", import.meta.url).pathname,
      ...files,
    ],
  }).output();
  assert(output.success, new TextDecoder().decode(output.stderr));
  const normalized = [
    emptied("Enums"),
    helper("Enums"),
    constants,
    "\nexport type { Enums };\nexport { Constants };\n",
  ];
  const contents = await Promise.all(files.map(async (file) => await Deno.readTextFile(file)));
  assertEquals(contents, [normalized.join(""), normalized.join("")]);
});
