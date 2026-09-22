import { branchesFromGroup } from "./branching";
import { CalculationMode } from "./calculation";
import { nextMainCell } from "./mainCellCalendar";
import { Pattern } from "./markets";
import {
  runBranchValidGroup,
  runRootValidGroup,
  ValidGroupRun,
  FourthDayPrediction,
} from "./validGroupRunner";
import { CellValues, GroupAudit, SequenceTemplate } from "./types";

export type BranchTask = {
  criteria?: number;
  firstMainCell: string;
  firstStartCell: string;
  ancestry: number[];
};

export type TraversalRecord = {
  kind: "ROOT" | "BRANCH";
  branch?: BranchTask;
  audit: GroupAudit;
  skippedMainCells: string[];
  prediction?: FourthDayPrediction;
};
export type TraversalState = { rootMainCell: string; rootResolved: boolean; pendingBranches: BranchTask[] };
export type TraversalResult = {
  status: "COMPLETE" | "WAITING" | "LIMIT_REACHED";
  records: TraversalRecord[];
  waitingFor?: string;
  pendingBranches?: BranchTask[];
  state: TraversalState;
};

function buildTasks(
  pattern: Pattern,
  audit: GroupAudit,
  ancestry: number[]
): BranchTask[] {
  const nextMain = nextMainCell(pattern, audit.days[audit.days.length - 1].mainCell);

  return branchesFromGroup(audit)
    .filter((branch) => !ancestry.includes(branch.criteria))
    .flatMap((branch) =>
      branch.startCells.map((firstStartCell) => ({
        criteria: branch.criteria,
        firstMainCell: nextMain,
        firstStartCell,
        ancestry: [...ancestry, branch.criteria],
      }))
    );
}

/**
 * Final Pattern traversal policy:
 * root groups overlap until common Criteria appears; a branch closes when it has no common Criteria.
 * Branches are handled depth-first, with every common Criteria kept independent.
 */
export function runFinalPattern(
  pattern: Pattern, templates: SequenceTemplate[], values: CellValues, cellOrder: string[], firstRootMainCell: string,
  maxGroups = 2000, savedState?: TraversalState, mode: CalculationMode = "FOUR_DAYS_DIRECT"
): TraversalResult {
  const records: TraversalRecord[] = [];
  let rootMain = savedState?.rootMainCell ?? firstRootMainCell.toUpperCase();
  let groupsRun = 0;
  let branchQueue: BranchTask[] = savedState?.pendingBranches ?? [];
  let rootResolved = savedState?.rootResolved ?? false;
  const state = (): TraversalState => ({ rootMainCell: rootMain, rootResolved, pendingBranches: branchQueue });

  while (groupsRun < maxGroups) {
    if (!branchQueue.length) {
      if (rootResolved) {
        rootMain = nextMainCell(pattern, rootMain);
        rootResolved = false;
      }

      const run = runRootValidGroup(
        pattern,
        templates,
        values,
        cellOrder,
        rootMain,
        mode
      );
      if (run.status === "WAITING") return { status: "WAITING", records, waitingFor: run.waitingFor, state: state() };
      if (run.status === "STOPPED") {
        rootMain = nextMainCell(pattern, rootMain);
        continue;
      }
      records.push({ kind: "ROOT", audit: run.audit, skippedMainCells: run.skippedMainCells });
      groupsRun += 1;
      if (!run.audit.commonCriteria.length) { rootMain = nextMainCell(pattern, rootMain); continue; }
      branchQueue = buildTasks(pattern, run.audit, []);
      rootResolved = true;
      if (!branchQueue.length) return { status: "COMPLETE", records, state: state() };
    }

    const task = branchQueue.shift()!;
    const run: ValidGroupRun = runBranchValidGroup(pattern, templates, values, cellOrder, task.firstMainCell, task.firstStartCell, task.criteria, mode);

    if (run.status === "STOPPED") {
      continue;
    }

    if (run.status === "WAITING") {
      if (run.partialDays?.length) {
        records.push({
          kind: "BRANCH",
          branch: task,
          audit: {
            days: run.partialDays,
            commonCriteria: []
          },
          skippedMainCells: run.skippedMainCells,
          prediction: run.prediction,
        });
      }

      branchQueue = [task, ...branchQueue];

      return {
        status: "WAITING",
        records,
        waitingFor: run.waitingFor,
        pendingBranches: branchQueue,
        state: state()
      };
    }
    records.push({ kind: "BRANCH", branch: task, audit: run.audit, skippedMainCells: run.skippedMainCells });
    groupsRun += 1;
    if (run.audit.commonCriteria.length) branchQueue = [...buildTasks(pattern, run.audit, task.ancestry), ...branchQueue];
  }

console.log("LIMIT DEBUG", {
  groupsRun,
  totalRecords: records.length,
  rootRecords: records.filter((record) => record.kind === "ROOT").length,
  branchRecords: records.filter((record) => record.kind === "BRANCH").length,
  pendingBranches: branchQueue.length,
  rootMain,
  rootResolved,
});

  return { status: "LIMIT_REACHED", records, pendingBranches: branchQueue, state: state() };
}

/** Starts a new calculation from a user-specified known branch group. */
export function runFinalPatternFromBranch(
  pattern: Pattern, templates: SequenceTemplate[], values: CellValues, cellOrder: string[], firstMainCell: string, firstStartCell: string,
  maxGroups = 2000, mode: CalculationMode = "FOUR_DAYS_DIRECT"
): TraversalResult {
  return runFinalPattern(pattern, templates, values, cellOrder, firstMainCell, maxGroups, {
    rootMainCell: firstMainCell.toUpperCase(),
    rootResolved: true,
    pendingBranches: [{ firstMainCell: firstMainCell.toUpperCase(), firstStartCell: firstStartCell.toUpperCase(), ancestry: [] }]
  }, mode);
}
