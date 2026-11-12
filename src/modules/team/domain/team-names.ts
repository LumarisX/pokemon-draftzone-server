export interface NamedTeam {
  id: string;
  baseName: string;
  variant?: number;
}

export interface TeamNameAssignment {
  id: string;
  baseName: string;
  variant: number;
  teamName: string;
}

const LETTERS = "XYZABCDEFGHIJKLMNOPQRSTUVW";

export function normalizeTeamName(name: string): string {
  const plain = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const compact = plain.replace(/[^a-z0-9]/g, "");
  return compact || plain.replace(/\s+/g, " ").trim();
}

export function variantLetter(variant: number): string {
  const letter = LETTERS[variant % LETTERS.length];
  const lap = Math.floor(variant / LETTERS.length);
  return lap === 0 ? letter : `${letter}${lap + 1}`;
}

export function displayTeamName(baseName: string, variant?: number): string {
  return variant === undefined
    ? baseName
    : `${baseName} ${variantLetter(variant)}`;
}

export function letterCollisions(
  teams: readonly NamedTeam[],
  changedId: string,
): TeamNameAssignment[] {
  const changed = teams.find((team) => team.id === changedId);
  if (!changed) return [];

  const key = normalizeTeamName(changed.baseName);
  const group = teams.filter(
    (team) => normalizeTeamName(team.baseName) === key,
  );
  if (group.length < 2) return [];

  const used = new Set(
    group.flatMap((team) => (team.variant === undefined ? [] : [team.variant])),
  );
  const unlettered = group
    .filter((team) => team.variant === undefined)
    .sort(
      (a, b) => Number(a.id === changedId) - Number(b.id === changedId),
    );

  let next = 0;
  return unlettered.map((team) => {
    while (used.has(next)) next++;
    used.add(next);
    return {
      id: team.id,
      baseName: team.baseName,
      variant: next,
      teamName: displayTeamName(team.baseName, next),
    };
  });
}
