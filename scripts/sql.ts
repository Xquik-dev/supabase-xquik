export function literal(value: string | null): string {
  return value === null ? "null" : `'${value.replaceAll("'", "''")}'`;
}

export function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
