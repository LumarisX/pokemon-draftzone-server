export function parseTime(time: string | number): Date | null {
  const timestamp =
    typeof time === "string" || typeof time === "number" ? +time : NaN;
  const date = new Date(timestamp);
  return isNaN(date.getTime()) ? null : date;
}
