export function tierId(label: string): string {
  return label
    .padEnd(12, "_")
    .slice(0, 12)
    .split("")
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}
