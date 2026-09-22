import { AuditLine, CellValues, DayAudit, GroupAudit, ReferenceTriplet } from "./types";


export type CalculationMode =
  | "THREE_DAYS"
  | "FOUR_DAYS_DIRECT"
  | "FOUR_DAYS_OPPOSITE";
const mainDigits = (value: string): number[] =>
  [...value].filter((character) => /\d/.test(character)).map(Number);

const splitCell = (cell: string) => {
  const match = /^([A-Z]+)(\d+)$/i.exec(cell);
  if (!match) return null;
  const column = [...match[1].toUpperCase()].reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0);
  return { column, row: Number(match[2]) };
};

/** Uses the stored Cell Number order when present; otherwise follows the confirmed row-then-column cell order. */
const afterMainCell = (reference: string, mainCell: string, cellOrder: string[]) => {
  const mainPosition = cellOrder.indexOf(mainCell);
  const referencePosition = cellOrder.indexOf(reference);
  if (mainPosition >= 0 && referencePosition >= 0) return referencePosition > mainPosition;
  const main = splitCell(mainCell);
  const candidate = splitCell(reference);
  if (!main || !candidate) return true;
  return candidate.row > main.row || (candidate.row === main.row && candidate.column > main.column);
};

export function evaluateTriplet(
  item: ReferenceTriplet,
  values: CellValues,
  mainCell: string,
  mainValue: string,
  cellOrder: string[],
  isFourthDay: boolean,
  mode: CalculationMode = "FOUR_DAYS_DIRECT"
): AuditLine {
  const [first, second, third] = item.references;
  const valueList = item.references.map((reference) => values[reference] ?? "");
  const invalidOrder = item.references.some((reference) => afterMainCell(reference, mainCell, cellOrder));

  if (invalidOrder) {
    return { ...item, values: valueList, status: "SKIP", skipReason: "AFTER_MAIN_CELL" };
  }
  if (valueList.some((value) => value === "*")) {
    return { ...item, values: valueList, status: "SKIP", skipReason: "ASTERISK" };
  }
  if (valueList.some((value) => value === "")) {
    return { ...item, values: valueList, status: "SKIP", skipReason: "MISSING_VALUE" };
  }

  const numericValues = valueList.map((value) => Number(value));
  if (numericValues.some((value) => !Number.isInteger(value) || value < 0 || value > 9)) {
    return { ...item, values: valueList, status: "SKIP", skipReason: "MISSING_VALUE" };
  }
  const total = numericValues.reduce((sum, value) => sum + value, 0);
  const directLastDigit = total % 10;
  const oppositeLastDigit = (directLastDigit + 5) % 10;
  const digits = mainDigits(mainValue);
  const matches =
    mode === "FOUR_DAYS_OPPOSITE" && isFourthDay
      ? digits.includes(oppositeLastDigit)
      : digits.includes(directLastDigit);

  return {
    criteria: item.criteria,
    subCriteria: item.subCriteria,
    references: [first, second, third],
    values: numericValues,
    total,
    directLastDigit,
    oppositeLastDigit,
    status: matches ? "MATCH" : "NO_MATCH"
  };
}

export function evaluateDay(
  sequence: ReferenceTriplet[], values: CellValues, mainCell: string, mainValue: string,
  cellOrder: string[], isFourthDay: boolean,
  mode: CalculationMode = "FOUR_DAYS_DIRECT"
): DayAudit {
  const lines = sequence.map((item) =>
    evaluateTriplet(item, values, mainCell, mainValue, cellOrder, isFourthDay, mode)
  );
  const matchingCriteria = [...new Set(lines.filter((line) => line.status === "MATCH").map((line) => line.criteria))].sort((a, b) => a - b);
  return { mainCell, mainValue, isFourthDay, lines, matchingCriteria };
}

export function evaluateThreeDayGroup(days: DayAudit[]): GroupAudit {
  if (days.length !== 3) throw new Error("A valid group must contain exactly three days.");
  const commonCriteria = days[0].matchingCriteria.filter((criteria) =>
    days.every((day) => day.matchingCriteria.includes(criteria))
  );
  return { days, commonCriteria };
}
export function evaluateFourDayGroup(days: DayAudit[]): GroupAudit {
  if (days.length !== 4) throw new Error("A valid group must contain exactly four days.");
  const commonCriteria = days[0].matchingCriteria.filter((criteria) => days.every((day) => day.matchingCriteria.includes(criteria)));
  return { days, commonCriteria };
}

export function getCommonCriteria(days: DayAudit[]): number[] {
  if (days.length === 0) return [];
  return days[0].matchingCriteria
    .filter((criteria) => days.every((day) => day.matchingCriteria.includes(criteria)))
    .sort((a, b) => a - b);
}

export function getThreeDayCommonCriteria(
  days: DayAudit[]
): number[] {
  if (days.length !== 3) {
    return [];
  }

  return days[0].matchingCriteria
    .filter((criteria) =>
      days.every((day) =>
        day.matchingCriteria.includes(criteria)
      )
    )
    .sort((a, b) => a - b);
}