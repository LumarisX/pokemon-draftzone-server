import { Types } from "mongoose";

export interface LabelableMatch {
  _id: Types.ObjectId | string;
  slug?: string;
  stage?: Types.ObjectId | string;
  round?: Types.ObjectId | string;
  position?: number;
  label?: string;
}

export interface MatchLabel {
  label: string;
  slug: string | null;
}

/**
 * Names every match the way the bracket does, so a slot reading "Winner of
 * Match 4" on the schedule points at the card the bracket also calls Match 4.
 *
 * Numbering runs per stage over rounds in axis order, then `position`. A match
 * carrying its own label keeps it *and does not consume a number* — that is
 * what the client's builder does, and the two have to agree.
 */
export function buildMatchLabels(
  matches: LabelableMatch[],
  roundIndexById: Map<string, number>,
): Map<string, MatchLabel> {
  const byStage = new Map<string, LabelableMatch[]>();
  for (const match of matches) {
    const key = match.stage?.toString() ?? "";
    byStage.set(key, [...(byStage.get(key) ?? []), match]);
  }

  const roundIndex = (match: LabelableMatch) =>
    roundIndexById.get(match.round?.toString() ?? "") ?? 0;

  const labels = new Map<string, MatchLabel>();
  for (const group of byStage.values()) {
    const ordered = [...group].sort(
      (a, b) => roundIndex(a) - roundIndex(b) || (a.position ?? 0) - (b.position ?? 0),
    );
    let n = 1;
    for (const match of ordered) {
      labels.set(match._id.toString(), {
        label: match.label ?? `Match ${n++}`,
        slug: match.slug ?? null,
      });
    }
  }
  return labels;
}
