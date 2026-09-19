import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pattern } from "../domain/markets";
import { CalculationCheckpoint, CellValues, MarketConfig } from "../domain/types";
import type { CalculationMode } from "../domain/calculation";
import type { TraversalRecord } from "../domain/traversal";

export type ChartHighlightCache = {
  currentMainCell: string;
  referenceCells: string[];
  matchedReferenceCells: string[];
  commonCriteriaReferenceCells: string[];
};

const valuesKey = (marketId: string) => `market-calculator:values:${marketId}`;
const rowDatesKey = (marketId: string) => `market-calculator:row-dates:${marketId}`;
const globalRowDatesKey = "market-calculator:row-dates:global";
const configKey = (marketId: string) => `market-calculator:config:${marketId}`;
const checkpointKey = (marketId: string, mode: CalculationMode) => `market-calculator:checkpoint:${marketId}:${mode}`;
const patternConfigKey = (pattern: Pattern) => `market-calculator:pattern-config:${pattern}`;
const historyKey = (marketId: string) => `market-calculator:history:${marketId}`;

const chartHighlightCacheKey = (marketId: string) =>
  `market-calculator:chart-highlight-cache:${marketId}`;

export type CalculationHistoryEntry = {
  id: string;
  createdAt: string;
  status: "WAITING" | "COMPLETE" | "LIMIT_REACHED";
  records: TraversalRecord[];
};

export async function saveDailyValues(marketId: string, values: CellValues) {
  await AsyncStorage.setItem(valuesKey(marketId), JSON.stringify(values));
}

export async function loadDailyValues(marketId: string): Promise<CellValues> {
  const raw = await AsyncStorage.getItem(valuesKey(marketId));
  return raw ? JSON.parse(raw) : {};
}

export async function saveRowDates(
  marketId: string,
  dates: Record<number, string>
) {
  await AsyncStorage.setItem(globalRowDatesKey, JSON.stringify(dates));
}

export async function loadRowDates(
  marketId: string
): Promise<Record<number, string>> {
  const globalRaw = await AsyncStorage.getItem(globalRowDatesKey);

  if (globalRaw) {
    return JSON.parse(globalRaw);
  }

  const kalyanRaw = await AsyncStorage.getItem(rowDatesKey("kalyan"));

  if (kalyanRaw) {
    await AsyncStorage.setItem(globalRowDatesKey, kalyanRaw);
    return JSON.parse(kalyanRaw);
  }

  return {};
}

export async function saveChartHighlightCache(
  marketId: string,
  cache: ChartHighlightCache
) {
  await AsyncStorage.setItem(
    chartHighlightCacheKey(marketId),
    JSON.stringify(cache)
  );
}

export async function loadChartHighlightCache(
  marketId: string
): Promise<ChartHighlightCache | null> {
  const raw = await AsyncStorage.getItem(chartHighlightCacheKey(marketId));
  return raw ? JSON.parse(raw) : null;
}

export async function saveMarketConfig(marketId: string, config: MarketConfig) {
  await AsyncStorage.setItem(configKey(marketId), JSON.stringify(config));
}

export async function loadMarketConfig(marketId: string): Promise<MarketConfig | null> {
  const raw = await AsyncStorage.getItem(configKey(marketId));
  return raw ? JSON.parse(raw) : null;
}

/** The user confirmed all markets within a pattern share one sequence configuration. */
export async function savePatternConfig(pattern: Pattern, config: MarketConfig) {
  await AsyncStorage.setItem(patternConfigKey(pattern), JSON.stringify(config));
}

export async function loadPatternConfig(pattern: Pattern): Promise<MarketConfig | null> {
  const raw = await AsyncStorage.getItem(patternConfigKey(pattern));
  return raw ? JSON.parse(raw) : null;
}

export async function saveCheckpoint(marketId: string, mode: CalculationMode, checkpoint: CalculationCheckpoint) {
  await AsyncStorage.setItem(checkpointKey(marketId, mode), JSON.stringify(checkpoint));
}

export async function loadCheckpoint(marketId: string, mode: CalculationMode): Promise<CalculationCheckpoint | null> {
  const raw = await AsyncStorage.getItem(checkpointKey(marketId, mode));
  return raw ? JSON.parse(raw) : null;
}

export async function loadCalculationHistory(marketId: string): Promise<CalculationHistoryEntry[]> {
  const raw = await AsyncStorage.getItem(historyKey(marketId));
  return raw ? JSON.parse(raw) : [];
}

export async function saveCalculationHistory(marketId: string, entries: CalculationHistoryEntry[]) {
  await AsyncStorage.setItem(historyKey(marketId), JSON.stringify(entries));
}

export async function clearCalculationHistory(marketId: string) {
  await AsyncStorage.removeItem(historyKey(marketId));
}

export async function saveCalculationInputs(
  marketId: string,
  mainCell: string,
  mainValue: string
) {
  await AsyncStorage.setItem(
    `calculation-inputs:${marketId}`,
    JSON.stringify({
      mainCell,
      mainValue,
    })
  );
}

export async function loadCalculationInputs(
  marketId: string
): Promise<{ mainCell: string; mainValue: string } | null> {
  const raw = await AsyncStorage.getItem(
    `calculation-inputs:${marketId}`
  );

  return raw ? JSON.parse(raw) : null;
}