export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  console.error("[Soldo Error Log]", error, context);
}
