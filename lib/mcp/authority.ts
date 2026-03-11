export type PipesAuthority = "none" | "read" | "write";

export function authorityIncludes(
  current: PipesAuthority,
  required: Exclude<PipesAuthority, "none">,
): boolean {
  if (required === "read") {
    return current === "read" || current === "write";
  }

  return current === "write";
}
