function literal(value: string | null): string {
  if (value === null) {
    return "null";
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function identifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

export { identifier, literal };
