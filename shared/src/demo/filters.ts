// Frappe list filters evaluated in the browser, so overlay rows land only in the views they match.
export type Doc = Record<string, any>;
export type Filters = Record<string, unknown> | unknown[] | null | undefined;
type Condition = [string, string, unknown];

// `unknown` answers for an operator not handled here. Excluding is the safe side for a new row
// in a view we cannot evaluate; a row the server already matched keeps its place.
export function matches(doc: Doc, filters: Filters, user: string, unknown = false): boolean {
  return conditions(filters).every(([field, op, value]) => {
    const result = test(doc[field], String(op).toLowerCase(), atMe(value, user));
    return result ?? unknown;
  });
}

export function conditions(filters: Filters): Condition[] {
  if (!filters) return [];
  if (!Array.isArray(filters)) {
    return Object.entries(filters).map(([field, value]) =>
      Array.isArray(value) ? [field, value[0], value[1]] : [field, "=", value]
    );
  }
  return filters.filter(Array.isArray).map((c) => {
    if (c.length >= 4) return [c[1], c[2], c[3]];
    if (c.length === 2) return [c[0], "=", c[1]];
    return [c[0], c[1], c[2]];
  });
}

function test(actual: unknown, op: string, expected: unknown): boolean | undefined {
  switch (op) {
    case "=":
      return text(actual) === text(expected);
    case "!=":
      return text(actual) !== text(expected);
    case "in":
      return list(expected).includes(text(actual));
    case "not in":
      return !list(expected).includes(text(actual));
    case "like":
      return like(text(expected)).test(text(actual));
    case "is":
      return expected === "set" ? text(actual) !== "" : text(actual) === "";
    default:
      return undefined;
  }
}

function atMe(value: unknown, user: string): unknown {
  if (Array.isArray(value)) return value.map((v) => atMe(v, user));
  return typeof value === "string" ? value.replace("@me", user) : value;
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function list(value: unknown): string[] {
  const values = Array.isArray(value) ? value : text(value).split(",");
  return values.map((v) => text(v).trim());
}

// MariaDB's default collation compares case-insensitively.
function like(pattern: string): RegExp {
  const source = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${source}$`, "is");
}
