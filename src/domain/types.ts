/** One-digit references are numbers; main cells may be preserved as two-digit text such as `05`. */
export type CellValue = number | string | "*" | "";

export type CellValues = Record<string, CellValue>;

export type ReferenceTriplet = {
  criteria: number;
  subCriteria: number;
  references: [string, string, string];
};

export type SequenceTemplate = {
  templateMainCell: string;
  sequence: ReferenceTriplet[];
};

export type MarketConfig = {
  templates: SequenceTemplate[];
  cellOrder: string[];
};

export type AuditLine = {
  criteria: number;
  subCriteria: number;
  references: [string, string, string];
  values: CellValue[];
  total?: number;
  directLastDigit?: number;
  oppositeLastDigit?: number;
  status: "MATCH" | "NO_MATCH" | "SKIP";
  skipReason?: "MISSING_VALUE" | "ASTERISK" | "AFTER_MAIN_CELL";
};

export type DayAudit = {
  mainCell: string;
  mainValue: string;
  isFourthDay: boolean;
  lines: AuditLine[];
  matchingCriteria: number[];
};

export type GroupAudit = {
  days: DayAudit[];
  commonCriteria: number[];
};

/** Stored per market so a later value update can continue exactly where it stopped. */
export type CalculationCheckpoint = {
  status: "RUNNING" | "WAITING_FOR_VALUES" | "COMPLETE";
  nextMainCell?: string;
  activeCriteria: number[];
  activeBranchStarts: string[];
  reason?: "MISSING_MAIN_CELL" | "MISSING_REFERENCE_VALUE" | "ASTERISK" | "NO_COMMON_CRITERIA";
  rootMainCell?: string;
  rootResolved?: boolean;
  pendingBranches?: Array<{ criteria: number; firstMainCell: string; firstStartCell: string; ancestry: number[] }>;
  updatedAt: string;
};
