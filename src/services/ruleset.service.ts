import { FormatId, Formats } from "../data/formats";
import { RulesetId, Rulesets } from "../data/rulesets";

function getRuleset(rulesetId: RulesetId) {
  return Rulesets[rulesetId];
}

function getFormat(formatId: FormatId) {
  return Formats[formatId];
}

export function getRulesets() {
  return Object.keys(Rulesets);
}

export function getFormats() {
  return Object.keys(Formats);
}
