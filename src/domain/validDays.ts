import { nextMainCell } from "./mainCellCalendar";
import { Pattern } from "./markets";
import { nextStartCells } from "./sequenceResolver";
import { CellValues } from "./types";

export type ValidDay = { mainCell: string; startCell?: string };
export type ValidDaySelection = { days: ValidDay[]; skippedMainCells: string[]; waitingFor?: string; stopped?: boolean };

const twoDigits = (value: CellValues[string] | undefined) => {
  const text = typeof value === "number" ? String(value) : value ?? "";
  return /^\d{2}$/.test(text);
};

/**
 * Three-day mode skips asterisk main cells and advances through the market calendar
 * until three valid two-digit main cells are available. A blank/one-digit cell pauses the run.
 */
export function selectThreeValidDays(
  pattern: Pattern,
  values: CellValues,
  firstMainCell: string,
  firstStartCell?: string
): ValidDaySelection {
  let mainCell = firstMainCell.toUpperCase();
  let startCell = firstStartCell?.toUpperCase();
  const days: ValidDay[] = [];
  const skippedMainCells: string[] = [];

  for (let scanned = 0; scanned < 32 && days.length < 3; scanned += 1) {
    const value = values[mainCell];

    if (value === "*") {
      skippedMainCells.push(mainCell);
    } else if (twoDigits(value)) {
      days.push({ mainCell, ...(startCell ? { startCell } : {}) });
    } else {
      return { days, skippedMainCells, waitingFor: mainCell };
    }

    mainCell = nextMainCell(pattern, mainCell);
    if (startCell) startCell = nextStartCells(pattern, startCell, 2)[1];
  }

  return {
    days,
    skippedMainCells,
    ...(days.length < 3 ? { waitingFor: mainCell } : {}),
  };
}
/**
 * Asterisk main cells do not end the calculation. They are skipped and the calendar advances
 * until four valid two-digit main cells are available. A blank/one-digit cell pauses the run.
 */
export function selectFourValidDays(pattern: Pattern, values: CellValues, firstMainCell: string, firstStartCell?: string): ValidDaySelection {
  let mainCell = firstMainCell.toUpperCase();
  let startCell = firstStartCell?.toUpperCase();
  const days: ValidDay[] = [];
  const skippedMainCells: string[] = [];
  for (let scanned = 0; scanned < 32 && days.length < 4; scanned += 1) {
    const value = values[mainCell];
    if (value === "*") {
      skippedMainCells.push(mainCell);
    } else if (twoDigits(value)) {
      days.push({ mainCell, ...(startCell ? { startCell } : {}) });
    } else {
      return { days, skippedMainCells, waitingFor: mainCell };
    }
    mainCell = nextMainCell(pattern, mainCell);
    if (startCell) startCell = nextStartCells(pattern, startCell, 2)[1];
  }
  return { days, skippedMainCells, ...(days.length < 4 ? { waitingFor: mainCell } : {}) };
}

/**
 * Branch groups use the exact market calendar sequence.
 * Unlike root groups, a branch does not skip an invalid/asterisk main cell
 * to search for a later valid day.
 */
export function selectFourBranchDays(
  pattern: Pattern,
  values: CellValues,
  firstMainCell: string,
  firstStartCell: string
): ValidDaySelection {
  let mainCell = firstMainCell.toUpperCase()
  let startCell = firstStartCell.toUpperCase()
  const days: ValidDay[] = []
  const skippedMainCells: string[] = []

  for (let scanned = 0; scanned < 32 && days.length < 4; scanned += 1) {
    const value = values[mainCell]

    if (value === "*") {
      return {
        days,
        skippedMainCells: [...skippedMainCells, mainCell],
        stopped: true,
      }
    } else if (twoDigits(value)) {
      days.push({
        mainCell,
        startCell,
      })
    } else {
      return {
        days,
        skippedMainCells,
        waitingFor: mainCell,
      }
    }

    mainCell = nextMainCell(pattern, mainCell)
    startCell = nextStartCells(pattern, startCell, 2)[1]
  }

  return {
    days,
    skippedMainCells,
    ...(days.length < 4 ? { waitingFor: mainCell } : {}),
  }
}