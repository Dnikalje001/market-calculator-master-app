import { GroupAudit } from "./types";
import { groupStartForCell } from "./sequenceResolver";

export type CriterionBranch = {
  criteria: number;
  /** One branch per distinct four-cell group in the fourth valid day. */
  startCells: string[];
  matchedThirdCells: string[];
};

/**
 * Branches always come from the fourth valid day's matching third references.
 * Different matching sub-criteria in the same four-cell group are intentionally merged.
 */
export function branchesFromGroup(group: GroupAudit): CriterionBranch[] {
  const lastDay = group.days[group.days.length - 1];
  return group.commonCriteria.map((criteria) => {
    const matchedThirdCells = lastDay.lines
      .filter((line) => line.criteria === criteria && line.status === "MATCH")
      .map((line) => line.references[2]);
    const uniqueStarts = [...new Set(matchedThirdCells.map(groupStartForCell))];
    return { criteria, startCells: uniqueStarts, matchedThirdCells };
  }).filter((branch) => branch.startCells.length > 0);
}
