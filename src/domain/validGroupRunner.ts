import {
  CalculationMode,
  evaluateDay,
  evaluateThreeDayGroup,
  evaluateFourDayGroup,
  getThreeDayCommonCriteria,
} from "./calculation";
import { Pattern } from "./markets";
import {
  resolveSequenceForMain,
  resolveSequenceForStart,
  nextStartCells,
} from "./sequenceResolver";
import { selectThreeValidDays, selectFourBranchDays, selectFourValidDays } from "./validDays";
import { CellValues, GroupAudit, SequenceTemplate } from "./types";

export type FourthDayPredictionLine = {
  criteria: number;
  subCriteria: number;
  references: string[];
  values: CellValues[string][];
  total?: number;
  directLastDigit?: number;
  missingCells: string[];
};

export type FourthDayPrediction = {
  mainCell: string;
  commonCriteria: number[];
  lines: FourthDayPredictionLine[];
};

export type ValidGroupRun =
  | {
      status: "COMPLETE";
      audit: GroupAudit;
      skippedMainCells: string[];
    }
  | {
      status: "WAITING";
      waitingFor: string;
      skippedMainCells: string[];
      partialDays?: ReturnType<typeof evaluateDay>[];
      prediction?: FourthDayPrediction;
    }
  | {
      status: "STOPPED";
      skippedMainCells: string[];
    };
const asMainText = (value: CellValues[string] | undefined) => typeof value === "number" ? String(value) : value ?? "";

function buildFourthDayPrediction(
  pattern: Pattern,
  templates: SequenceTemplate[],
  values: CellValues,
  cellOrder: string[],
  partialDays: ReturnType<typeof evaluateDay>[],
  fourthMainCell: string,
  fourthStartCell: string
): FourthDayPrediction | undefined {
  if (partialDays.length !== 3) {
    return undefined;
  }

  const commonCriteria =
    getThreeDayCommonCriteria(partialDays);

  if (!commonCriteria.length) {
    return {
      mainCell: fourthMainCell,
      commonCriteria: [],
      lines: [],
    };
  }

  const sequence = resolveSequenceForStart(
    pattern,
    templates,
    fourthStartCell
  );

  const relevantLines = sequence.filter((item) =>
    commonCriteria.includes(item.criteria)
  );

  const lines: FourthDayPredictionLine[] =
    relevantLines.map((item) => {
      const rawValues = item.references.map(
        (reference) => values[reference] ?? ""
      );

      const missingCells = item.references.filter(
        (reference, index) => {
          const value = rawValues[index];

          return (
            value === "" ||
            value === "*" ||
            !Number.isInteger(Number(value)) ||
            Number(value) < 0 ||
            Number(value) > 9
          );
        }
      );

      if (missingCells.length > 0) {
        return {
          criteria: item.criteria,
          subCriteria: item.subCriteria,
          references: item.references,
          values: rawValues,
          missingCells,
        };
      }

      const numericValues = rawValues.map((value) =>
        Number(value)
      );

      const total = numericValues.reduce(
        (sum, value) => sum + value,
        0
      );

      const directLastDigit = total % 10;

      return {
        criteria: item.criteria,
        subCriteria: item.subCriteria,
        references: item.references,
        values: rawValues,
        total,
        directLastDigit,
        missingCells: [],
      };
    });

  return {
    mainCell: fourthMainCell,
    commonCriteria,
    lines,
  };
}

export function runRootValidGroup(pattern: Pattern, templates: SequenceTemplate[], values: CellValues, cellOrder: string[], firstMainCell: string, mode: CalculationMode = "FOUR_DAYS_DIRECT"): ValidGroupRun {
  const selection =
    mode === "THREE_DAYS"
      ? selectThreeValidDays(pattern, values, firstMainCell)
      : selectFourValidDays(pattern, values, firstMainCell);
  if (selection.waitingFor) {
    const partialDays = selection.days.map((day, index) =>
      evaluateDay(
        resolveSequenceForMain(templates, day.mainCell),
        values,
        day.mainCell,
        asMainText(values[day.mainCell]),
        cellOrder,
        index === 3,
        mode
      )
    );

    return {
      status: "WAITING",
      waitingFor: selection.waitingFor,
      skippedMainCells: selection.skippedMainCells,
      partialDays
    };
  }
  const days = selection.days.map((day, index) => evaluateDay(resolveSequenceForMain(templates, day.mainCell), values, day.mainCell, asMainText(values[day.mainCell]), cellOrder, index === 3, mode));
  return {
    status: "COMPLETE",
    audit:
      mode === "THREE_DAYS"
        ? evaluateThreeDayGroup(days)
        : evaluateFourDayGroup(days),
    skippedMainCells: selection.skippedMainCells,
  };
}

export function runBranchValidGroup(pattern: Pattern, templates: SequenceTemplate[], values: CellValues, cellOrder: string[], firstMainCell: string, firstStartCell: string, expectedCriteria?: number, mode: CalculationMode = "FOUR_DAYS_DIRECT"): ValidGroupRun {
  const selection =
    mode === "THREE_DAYS"
      ? selectThreeValidDays(pattern, values, firstMainCell, firstStartCell)
      : selectFourBranchDays(pattern, values, firstMainCell, firstStartCell);
  if (selection.stopped) {
    return {
      status: "STOPPED",
      skippedMainCells: selection.skippedMainCells,
    };
  }

  if (selection.waitingFor) {
    const partialDays = selection.days.map((day, index) =>
      evaluateDay(
        resolveSequenceForStart(
          pattern,
          templates,
          day.startCell!
        ),
        values,
        day.mainCell,
        asMainText(values[day.mainCell]),
        cellOrder,
        index === 3,
        mode
      )
    );

    if (
      expectedCriteria !== undefined &&
      partialDays.some((day) => !day.matchingCriteria.includes(expectedCriteria))
    ) {
      return {
        status: "STOPPED",
        skippedMainCells: selection.skippedMainCells,
      };
    }

    const prediction =
      mode !== "THREE_DAYS" && partialDays.length === 3
        ? buildFourthDayPrediction(
            pattern,
            templates,
            values,
            cellOrder,
            partialDays,
            selection.waitingFor,
            nextStartCells(
              pattern,
              firstStartCell,
              4
            )[3]
          )
        : undefined;

    return {
      status: "WAITING",
      waitingFor: selection.waitingFor,
      skippedMainCells: selection.skippedMainCells,
      partialDays,
      prediction,
    };
  }
  const days = selection.days.map((day, index) => evaluateDay(resolveSequenceForStart(pattern, templates, day.startCell!), values, day.mainCell, asMainText(values[day.mainCell]), cellOrder, index === 3, mode));

  if (
    expectedCriteria !== undefined &&
    days.some((day) => !day.matchingCriteria.includes(expectedCriteria))
  ) {
    return {
      status: "STOPPED",
      skippedMainCells: selection.skippedMainCells,
    };
  }

  return {
    status: "COMPLETE",
    audit:
      mode === "THREE_DAYS"
        ? evaluateThreeDayGroup(days)
        : evaluateFourDayGroup(days),
    skippedMainCells: selection.skippedMainCells,
  };
}
