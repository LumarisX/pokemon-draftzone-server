const DELIMITERS = ["\t", ",", ";"] as const;

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function splitRecords(text: string): string[] {
  const records: string[] = [];
  let record = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') quoted = !quoted;
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      records.push(record);
      record = "";
      continue;
    }
    record += char;
  }
  records.push(record);
  return records;
}

export function detectDelimiter(lines: string[]): string {
  const sample = lines.filter((line) => line.trim()).slice(0, 40);
  if (!sample.length) return ",";
  let best: string = ",";
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    const counts = sample.map((line) => splitLine(line, delimiter).length - 1);
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (!total) continue;
    const consistent = counts.filter((count) => count === counts[0]).length;
    const score = total + consistent * 2 + (delimiter === "\t" ? 1 : 0);
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

export function parseSheet(text: string): string[][] {
  const lines = splitRecords(text.replace(/^﻿/, ""));
  const delimiter = detectDelimiter(lines);
  const rows = lines.map((line) =>
    splitLine(line, delimiter).map((cell) => cell.replace(/\s+/g, " ").trim()),
  );

  while (rows.length && rows[rows.length - 1].every((cell) => !cell)) rows.pop();
  const width = rows.reduce(
    (max, row) => {
      let last = row.length - 1;
      while (last >= 0 && !row[last]) last--;
      return Math.max(max, last + 1);
    },
    0,
  );
  return rows.map((row) =>
    Array.from({ length: width }, (_, index) => row[index] ?? ""),
  );
}
