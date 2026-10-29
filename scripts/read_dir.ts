const readDir: (path: string) => AsyncIterable<Deno.DirEntry, undefined, undefined> = Deno.readDir;

export default readDir;
