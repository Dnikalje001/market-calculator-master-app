import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MARKETS, patternLabel } from "../src/domain/markets";
import { CalculationCheckpoint, CellValues } from "../src/domain/types";
import { CalculationMode } from "../src/domain/calculation";
import { CalculationHistoryEntry, clearCalculationHistory, loadCalculationHistory, loadCheckpoint, loadDailyValues, loadRowDates, saveCalculationHistory, saveCheckpoint, saveDailyValues, saveRowDates, loadChartHighlightCache, saveChartHighlightCache, loadCalculationInputs, saveCalculationInputs} from "../src/storage/marketStore";
import { AuditReport } from "../src/components/AuditReport";
import { BUNDLED_PATTERN_CONFIGS } from "../src/config/bundledSequences";
import { runFinalPattern, runFinalPatternFromBranch, TraversalRecord } from "../src/domain/traversal";

type Tab = "calculate" | "values" | "chart" | "history" | "settings" | null;

type ChartHighlightCache = {
  currentMainCell: string;
  referenceCells: string[];
  matchedReferenceCells: string[];
  commonCriteriaReferenceCells: string[];
};

const CHART_COLUMNS_6 = [
  "A",
  "B", "C", "D", "E", "F",
  "G", "H", "I", "J", "K",
  "L", "M", "N", "O", "P",
  "Q", "R", "S", "T", "U",
  "V", "W", "X", "Y", "Z",
  "AA", "AB", "AC", "AD", "AE",
];

const CHART_COLUMNS_5 = [
  "A",
  "B", "C", "D", "E", "F",
  "G", "H", "I", "J", "K",
  "L", "M", "N", "O", "P",
  "Q", "R", "S", "T", "U",
  "V", "W", "X", "Y", "Z",
];

const MAIN_COLUMNS_6 = ["B", "G", "L", "Q", "V", "AA"];
const MAIN_COLUMNS_5 = ["B", "G", "L", "Q", "V"];

const CHART_LABELS_6 = [
  "Date",
  "Main", "L", "R", "To", "Di",
  "Main", "L", "R", "To", "Di",
  "Main", "L", "R", "To", "Di",
  "Main", "L", "R", "To", "Di",
  "Main", "L", "R", "To", "Di",
  "Main", "L", "R", "To", "Di",
];

const CHART_LABELS_5 = [
  "Date",
  "Main", "L", "R", "To", "Di",
  "Main", "L", "R", "To", "Di",
  "Main", "L", "R", "To", "Di",
  "Main", "L", "R", "To", "Di",
  "Main", "L", "R", "To", "Di",
];

function deriveMainDigits(value: string) {
  if (!/^\d{2}$/.test(value)) return null;

  const first = Number(value[0]);
  const second = Number(value[1]);

  return {
    left: first,
    right: second,
    total: (first + second) % 10,
    difference: (second - first + 10) % 10,
  };
}

export default function Home() {
  const [marketId, setMarketId] = useState(MARKETS[0].id);
  const [tab, setTab] = useState<Tab>(null);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Loading...");
  const [loadingColor, setLoadingColor] = useState("#7656A8");
  const [mainCell, setMainCell] = useState("G87");
  const [mainValue, setMainValue] = useState("05");
  const [calculationMode, setCalculationMode] = useState<CalculationMode>("FOUR_DAYS_DIRECT");
  const [startMode, setStartMode] = useState<"root" | "branch">("root");
  const [branchStartCell, setBranchStartCell] = useState("");
  const [entryCell, setEntryCell] = useState("");
  const [entryValue, setEntryValue] = useState("");
  const [batchValues, setBatchValues] = useState("");
  const [savedValues, setSavedValues] = useState<CellValues>({});
  const [rowDates, setRowDates] = useState<Record<number, string>>({});
  const mainScrollRef = useRef<ScrollView>(null);
  const rowNumberScrollRef = useRef<ScrollView>(null);
  const chartDataScrollRef = useRef<ScrollView>(null);

  const syncChartVerticalScroll = (y: number) => {
    rowNumberScrollRef.current?.scrollTo({
      y,
      animated: false,
    });
  };
  const [dateRow, setDateRow] = useState("");
  const [dateValue, setDateValue] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [calculationMessage, setCalculationMessage] = useState("");
  const [records, setRecords] = useState<TraversalRecord[]>([]);
  const [chartHighlightCache, setChartHighlightCache] = useState<ChartHighlightCache | null>(null);
  const [checkpoint, setCheckpoint] = useState<CalculationCheckpoint | null>(null);
  const [history, setHistory] = useState<CalculationHistoryEntry[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const market = useMemo(() => MARKETS.find((item) => item.id === marketId)!, [marketId]);

  useEffect(() => {
    const backAction = () => {
      // Specific page -> Market Dashboard
      if (tab !== null) {
        setTab(null);
        return true;
      }

      // Market Dashboard -> Home Page
      if (selectedMarketId !== null) {
        setSelectedMarketId(null);
        return true;
      }

      // Home Page -> allow Android to exit app
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction
    );

    return () => backHandler.remove();
  }, [tab, selectedMarketId]);

  useEffect(() => {
    loadDailyValues(marketId).then(setSavedValues);
    loadRowDates(marketId).then(setRowDates);
    loadCheckpoint(marketId, calculationMode).then(setCheckpoint);
    loadChartHighlightCache(marketId).then(setChartHighlightCache);
    loadCalculationInputs(marketId).then((savedInputs) => {
      if (savedInputs) {
        setMainCell(savedInputs.mainCell);
        setMainValue(savedInputs.mainValue);
      }
    });
    //clearCalculationHistory(marketId);
    loadCalculationHistory(marketId, calculationMode).then(setHistory);
    setEntryCell("");
    setEntryValue("");
    setSaveMessage("");
    setCalculationMessage("");
    setRecords([]);
    setActiveHistoryId(null);
  }, [marketId, calculationMode]);

  const performCalculation = async (values: CellValues, firstMainCell: string, savedCheckpoint?: CalculationCheckpoint | null, append = false, manualBranchStart?: string) => {
    const config = BUNDLED_PATTERN_CONFIGS[market.pattern];
    const restoredState = savedCheckpoint?.status === "WAITING_FOR_VALUES" && savedCheckpoint.rootMainCell ? {
      rootMainCell: savedCheckpoint.rootMainCell,
      rootResolved: savedCheckpoint.rootResolved ?? false,
      pendingBranches: savedCheckpoint.pendingBranches ?? []
    } : undefined;
    const result = restoredState
      ? runFinalPattern(market.pattern, config.templates, values, config.cellOrder, firstMainCell, 2000, restoredState, calculationMode)
      : manualBranchStart
        ? runFinalPatternFromBranch(market.pattern, config.templates, values, config.cellOrder, firstMainCell, manualBranchStart, 2000, calculationMode)
        : runFinalPattern(market.pattern, config.templates, values, config.cellOrder, firstMainCell, 2000, undefined, calculationMode);
    const previousRecords =
      append && records.length > 0
        ? records[records.length - 1].audit.days.length < (calculationMode === "THREE_DAYS" ? 3 : 4)
          ? records.slice(0, -1)
          : records
        : [];

    const combinedRecords = append
      ? [...previousRecords, ...result.records]
      : result.records;
    setRecords(combinedRecords);

    const referenceCells = new Set<string>();
    const matchedReferenceCells = new Set<string>();
    const commonCriteriaReferenceCells = new Set<string>();

    combinedRecords.forEach((record) => {
      record.audit.days.forEach((day) => {
        day.lines.forEach((line) => {
          line.references.forEach((reference) => {
            referenceCells.add(reference.toUpperCase());

            if (line.status === "MATCH") {
              matchedReferenceCells.add(reference.toUpperCase());

              if (record.audit.commonCriteria.includes(line.criteria)) {
                commonCriteriaReferenceCells.add(reference.toUpperCase());
              }
            }
          });
        });
      });
    });

    const newChartHighlightCache: ChartHighlightCache = {
      currentMainCell: result.waitingFor ?? mainCell.trim().toUpperCase(),
      referenceCells: [...referenceCells],
      matchedReferenceCells: [...matchedReferenceCells],
      commonCriteriaReferenceCells: [...commonCriteriaReferenceCells],
    };

    setChartHighlightCache(newChartHighlightCache);
    await saveChartHighlightCache(marketId, newChartHighlightCache);

    const nextCheckpoint: CalculationCheckpoint = {
      status: result.status === "WAITING" ? "WAITING_FOR_VALUES" : "COMPLETE",
      nextMainCell: result.waitingFor,
      activeCriteria: result.state.pendingBranches.flatMap((branch) => branch.criteria === undefined ? [] : [branch.criteria]),
      activeBranchStarts: result.state.pendingBranches.map((branch) => branch.firstStartCell),
      reason: result.status === "WAITING" ? "MISSING_MAIN_CELL" : undefined,
      rootMainCell: result.state.rootMainCell,
      rootResolved: result.state.rootResolved,
      pendingBranches: result.state.pendingBranches,
      updatedAt: new Date().toISOString()
    };
    await saveCheckpoint(marketId, calculationMode, nextCheckpoint);
    setCheckpoint(nextCheckpoint);
    const historyId =
      append && activeHistoryId ? activeHistoryId : `${Date.now()}`;

    const entry: CalculationHistoryEntry = {
      id: historyId,
      createdAt: new Date().toISOString(),
      status: result.status === "WAITING" ? "WAITING" : result.status,
      records: combinedRecords,
    };

    const updatedHistory = [entry];

    await saveCalculationHistory(marketId, calculationMode, updatedHistory);
    setHistory(updatedHistory);
    setActiveHistoryId(historyId);
    if (result.status === "WAITING") setCalculationMessage(`Calculation ${result.waitingFor} येथे थांबली आहे. त्या main cellची two-digit value save केली की ती आपोआप पुढे चालू होईल.`);
    else if (result.status === "LIMIT_REACHED") setCalculationMessage("Safety limit गाठली. Audit तपासा.");
    else setCalculationMessage("Calculation पूर्ण झाली.");
  };

  const saveValue = async () => {
    const cell = entryCell.trim().toUpperCase();
    const value = entryValue.trim();
    if (!/^[A-Z]+\d+$/.test(cell) || !/^(\d{1,2}|\*)$/.test(value)) {
      setSaveMessage("Cell number (उदा. G87) आणि 1–2 digits किंवा * भरा.");
      return;
    }
    const updated: CellValues = {
      ...savedValues,
      [cell]: value === "*" ? "*" : value.length === 2 ? value : Number(value),
    };

    const derived = deriveMainDigits(value);
    const mainColumn = cell.match(/^[A-Z]+/)?.[0];
    const rowNumber = cell.match(/\d+$/)?.[0];

    const derivedColumns: Record<string, [string, string, string, string]> = {
      B: ["C", "D", "E", "F"],
      G: ["H", "I", "J", "K"],
      L: ["M", "N", "O", "P"],
      Q: ["R", "S", "T", "U"],
      V: ["W", "X", "Y", "Z"],
      AA: ["AB", "AC", "AD", "AE"],
    };

    if (mainColumn && rowNumber && derivedColumns[mainColumn]) {
      const [leftCol, rightCol, totalCol, differenceCol] =
        derivedColumns[mainColumn];

      if (value === "*") {
        updated[`${leftCol}${rowNumber}`] = "*";
        updated[`${rightCol}${rowNumber}`] = "*";
        updated[`${totalCol}${rowNumber}`] = "*";
        updated[`${differenceCol}${rowNumber}`] = "*";
      } else if (derived) {
        updated[`${leftCol}${rowNumber}`] = derived.left;
        updated[`${rightCol}${rowNumber}`] = derived.right;
        updated[`${totalCol}${rowNumber}`] = derived.total;
        updated[`${differenceCol}${rowNumber}`] = derived.difference;
      }
    }
    await saveDailyValues(marketId, updated);
    setSavedValues(updated);
    setSaveMessage(`${cell} = ${value} offline save झाले.`);
    const paused = checkpoint ?? await loadCheckpoint(marketId, calculationMode);
    if (paused?.status === "WAITING_FOR_VALUES" && paused.nextMainCell === cell && value !== "*") {
      setSaveMessage(`${cell} = ${value} save झाले. Calculation आपोआप पुढे सुरू झाली.`);
      await performCalculation(updated, paused.rootMainCell ?? cell, paused, true);
    }
    setEntryCell("");
    setEntryValue("");
  };

  const runCalculation = async () => {
    const cell = mainCell.trim().toUpperCase();
    const value = mainValue.trim();

    if (!/^[A-Z]+\d+$/.test(cell) || !/^\d{2}$/.test(value)) {
      setCalculationMessage("Main cell number आणि two-digit value भरा.");
      return;
    }

    setCalculationMessage(`Validation passed: ${cell} = ${value}`);

    await saveCalculationInputs(
      marketId,
      cell,
      value
    );

    const values: CellValues = { ...savedValues, [cell]: value };

    const derived = deriveMainDigits(value);
    const mainColumn = cell.match(/^[A-Z]+/)?.[0];
    const rowNumber = cell.match(/\d+$/)?.[0];

    const derivedColumns: Record<string, [string, string, string, string]> = {
      B: ["C", "D", "E", "F"],
      G: ["H", "I", "J", "K"],
      L: ["M", "N", "O", "P"],
      Q: ["R", "S", "T", "U"],
      V: ["W", "X", "Y", "Z"],
      AA: ["AB", "AC", "AD", "AE"],
    };

    if (derived && mainColumn && rowNumber && derivedColumns[mainColumn]) {
      const [leftCol, rightCol, totalCol, differenceCol] =
        derivedColumns[mainColumn];

      values[`${leftCol}${rowNumber}`] = derived.left;
      values[`${rightCol}${rowNumber}`] = derived.right;
      values[`${totalCol}${rowNumber}`] = derived.total;
      values[`${differenceCol}${rowNumber}`] = derived.difference;
    }

    await saveDailyValues(marketId, values);
    setSavedValues(values);

    const branchStart = branchStartCell.trim().toUpperCase();

    if (startMode === "branch" && !/^[A-Z]+\d+$/.test(branchStart)) {
      setCalculationMessage("Branch start cell भरा, उदा. M82.");
      return;
    }

    await performCalculation(
      values,
      cell,
      null,
      false,
      startMode === "branch" ? branchStart : undefined
    );
  };

  const saveBatchValues = async () => {
    const updates: CellValues = {};
    const invalid: string[] = [];
    for (const rawLine of batchValues.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = /^([A-Z]+\d+)\s*(?:=|:)\s*(\d{1,2}|\*)$/i.exec(line);
      if (!match) { invalid.push(line); continue; }
      const cell = match[1].toUpperCase();
      updates[cell] = match[2] === "*" ? "*" : match[2].length === 2 ? match[2] : Number(match[2]);
    }
    if (!Object.keys(updates).length || invalid.length) {
      setSaveMessage(invalid.length ? `या line योग्य नाहीत: ${invalid.slice(0, 2).join(", ")}` : "Paste करण्यासाठी किमान एक value भरा.");
      return;
    }
    const updated: CellValues = { ...savedValues, ...updates };

    const derivedColumns: Record<string, [string, string, string, string]> = {
      B: ["C", "D", "E", "F"],
      G: ["H", "I", "J", "K"],
      L: ["M", "N", "O", "P"],
      Q: ["R", "S", "T", "U"],
      V: ["W", "X", "Y", "Z"],
      AA: ["AB", "AC", "AD", "AE"],
    };

    Object.entries(updates).forEach(([cell, rawValue]) => {
      if (typeof rawValue !== "string" || !/^\d{2}$/.test(rawValue)) {
        return;
      }

      const derived = deriveMainDigits(rawValue);
      const mainColumn = cell.match(/^[A-Z]+/)?.[0];
      const rowNumber = cell.match(/\d+$/)?.[0];

      if (!derived || !mainColumn || !rowNumber || !derivedColumns[mainColumn]) {
        return;
      }

      const [leftCol, rightCol, totalCol, differenceCol] =
        derivedColumns[mainColumn];

      updated[`${leftCol}${rowNumber}`] = derived.left;
      updated[`${rightCol}${rowNumber}`] = derived.right;
      updated[`${totalCol}${rowNumber}`] = derived.total;
      updated[`${differenceCol}${rowNumber}`] = derived.difference;
    });
    await saveDailyValues(marketId, updated);
    setSavedValues(updated);
    setBatchValues("");
    setSaveMessage(`${Object.keys(updates).length} values offline save झाल्या.`);
    const paused = checkpoint ?? await loadCheckpoint(marketId, calculationMode);
    if (paused?.status === "WAITING_FOR_VALUES" && paused.nextMainCell && updates[paused.nextMainCell] !== undefined && updates[paused.nextMainCell] !== "*") {
      setSaveMessage(`${Object.keys(updates).length} values save झाल्या. Pending calculation आपोआप पुढे सुरू झाली.`);
      await performCalculation(updated, paused.rootMainCell ?? paused.nextMainCell, paused, true);
    }
  };

const deleteValue = async () => {
  const cell = entryCell.trim().toUpperCase();

  if (!/^[A-Z]+\d+$/.test(cell)) {
    setSaveMessage("Delete करण्यासाठी योग्य Cell number भरा.");
    return;
  }

  if (savedValues[cell] === undefined) {
    setSaveMessage(`${cell} मध्ये कोणतीही saved value नाही.`);
    return;
  }

  const updated = { ...savedValues };
  delete updated[cell];

  const mainColumn = cell.match(/^[A-Z]+/)?.[0];
  const rowNumber = cell.match(/\d+$/)?.[0];

  const derivedColumns: Record<string, [string, string, string, string]> = {
    B: ["C", "D", "E", "F"],
    G: ["H", "I", "J", "K"],
    L: ["M", "N", "O", "P"],
    Q: ["R", "S", "T", "U"],
    V: ["W", "X", "Y", "Z"],
    AA: ["AB", "AC", "AD", "AE"],
  };

  if (mainColumn && rowNumber && derivedColumns[mainColumn]) {
    derivedColumns[mainColumn].forEach((column) => {
      delete updated[`${column}${rowNumber}`];
    });
  }

await saveDailyValues(marketId, updated);

  setSavedValues(updated);
  setEntryValue("");
  setSaveMessage(`${cell} ची value delete झाली.`);
};

const saveRowDate = async () => {
  const row = Number(dateRow.trim());
  const date = dateValue.trim();

  if (!Number.isInteger(row) || row <= 0) {
    setSaveMessage("योग्य Row number भरा.");
    return;
  }

  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    setSaveMessage("Date DD/MM/YYYY format मध्ये भरा.");
    return;
  }

  const updatedDates = {
    ...rowDates,
    [row]: date,
  };

  await saveRowDates(marketId, updatedDates);
  setRowDates(updatedDates);

  setSaveMessage(`Row ${row} साठी ${date} save झाली.`);
};

const deleteRowDate = async () => {
  const row = Number(dateRow.trim());

  if (!Number.isInteger(row) || row <= 0) {
    setSaveMessage("Delete करण्यासाठी योग्य Row number भरा.");
    return;
  }

  if (!rowDates[row]) {
    setSaveMessage(`Row ${row} साठी saved date नाही.`);
    return;
  }

  const updatedDates = { ...rowDates };
  delete updatedDates[row];

  await saveRowDates(marketId, updatedDates);
  setRowDates(updatedDates);
  setDateValue("");
  setSaveMessage(`Row ${row} ची date delete झाली.`);
};

if (selectedMarketId === null) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        ref={mainScrollRef}
        stickyHeaderIndices={[0]}
        contentContainerStyle={[
          styles.page,
          {
            flexGrow: 1,
            justifyContent: "center",
          },
        ]}
      >
        <View style={{ alignItems: "center", marginBottom: 12 }}>
          <Text
            style={{
              fontSize: 32,
              fontWeight: "800",
              color: "#102a43",
              textAlign: "center",
            }}
          >
            Market Calculator
          </Text>
        </View>

        <View style={{ width: "100%", gap: 20 }}>

          <View
            style={{
              backgroundColor: "#FFFDF7",
              borderRadius: 18,
              padding: 16,
              borderWidth: 1,
              borderColor: "#F3E4C3",
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 6,
              elevation: 2,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: "#B7791F",
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              Day Markets
            </Text>

            <View style={styles.marketGrid}>
              {MARKETS.slice(0, 4).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setMarketId(item.id);
                    setTab(null);
                    setSelectedMarketId(item.id);
                  }}
                  style={[
                    styles.market,
                    {
                      backgroundColor: "#FFF8E7",
                      borderColor: "#F2D49B",
                    },
                  ]}
                >
                  <Text style={styles.marketText}>{item.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View
            style={{
              backgroundColor: "#F7FAFF",
              borderRadius: 18,
              padding: 16,
              borderWidth: 1,
              borderColor: "#D5E4F5",
              shadowColor: "#000",
              shadowOpacity: 0.05,
              shadowRadius: 6,
              elevation: 2,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: "#315B8A",
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              Night Markets
            </Text>

            <View style={styles.marketGrid}>
              {MARKETS.slice(4).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setMarketId(item.id);
                    setTab(null);
                    setSelectedMarketId(item.id);
                  }}
                  style={[
                    styles.market,
                    {
                      backgroundColor: "#EEF5FF",
                      borderColor: "#B9D2F0",
                    },
                  ]}
                >
                  <Text style={styles.marketText}>{item.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        ref={mainScrollRef}
        stickyHeaderIndices={[0]}
        contentContainerStyle={[
          styles.page,
          tab === null && {
            flexGrow: 1,
            justifyContent: "center",
          },
        ]}
      >

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 16,
            padding: 16,
            borderRadius: 18,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#D9E2EC",
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 6,
            elevation: 2,
          }}
        >
          <Pressable
            onPress={() => setSelectedMarketId(null)}
            style={{
              marginRight: 16,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 10,
              backgroundColor: "#EEF5FF",
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: "700",
                color: "#315B8A",
              }}
            >
              ← Back
            </Text>
          </Pressable>

          <View>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: "#102A43",
              }}
            >
              {market.name}
            </Text>

            <Text
              style={{
                fontSize: 12,
                marginTop: 3,
                color: "#66788A",
              }}
            >
              {patternLabel(market.pattern)}
            </Text>
          </View>
        </View>

        {isLoadingPage && (
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 30,
              gap: 10,
            }}
          >
            <ActivityIndicator size="large" color={loadingColor} />

            <Text
              style={{
                color: loadingColor,
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              {loadingLabel}
            </Text>
          </View>
        )}

        {tab === null && !isLoadingPage && (
          <View style={styles.tabs}>

            {/* Calculation */}
            <Pressable
              onPress={() => {
                setLoadingLabel("Loading Calculation...");
                setLoadingColor("#315B8A");
                setIsLoadingPage(true);

                setTimeout(() => {
                  setTab("calculate");
                  setIsLoadingPage(false);
                }, 250);
              }}
              style={[
                styles.tab,
                {
                  backgroundColor: "#EEF5FF",
                  borderWidth: 1,
                  borderColor: "#B9D2F0",
                },
              ]}
            >
              <Text
                style={{
                  color: "#315B8A",
                  fontWeight: "800",
                  fontSize: 16,
                  textAlign: "center",
                }}
              >
                Calculation
              </Text>
            </Pressable>

            {/* Daily Values */}
            <Pressable
              onPress={() => {
                setLoadingLabel("Loading Daily Values...");
                setLoadingColor("#3F7D58");
                setIsLoadingPage(true);

                setTimeout(() => {
                  setTab("values");
                  setIsLoadingPage(false);
                }, 250);
              }}
              style={[
                styles.tab,
                {
                  backgroundColor: "#F0FAF2",
                  borderWidth: 1,
                  borderColor: "#BFDCC6",
                },
              ]}
            >
              <Text
                style={{
                  color: "#3F7D58",
                  fontWeight: "800",
                  fontSize: 16,
                  textAlign: "center",
                }}
              >
                Daily Values
              </Text>
            </Pressable>

            {/* Chart */}
            <Pressable
              onPress={() => {
                setLoadingLabel("Loading Chart...");
                setLoadingColor("#7656A8");
                setIsLoadingPage(true);

                setTimeout(() => {
                  setTab("chart");
                  setIsLoadingPage(false);
                }, 300);
              }}
              style={[
                styles.tab,
                {
                  backgroundColor: "#F5F0FF",
                  borderWidth: 1,
                  borderColor: "#D5C4EE",
                },
              ]}
            >
              <Text
                style={{
                  color: "#7656A8",
                  fontWeight: "800",
                  fontSize: 16,
                  textAlign: "center",
                }}
              >
                Chart
              </Text>
            </Pressable>

            {/* History */}
            <Pressable
              onPress={() => {
                setLoadingLabel("Loading History...");
                setLoadingColor("#A66A18");
                setIsLoadingPage(true);

                setTimeout(() => {
                  setTab("history");
                  setIsLoadingPage(false);
                }, 250);
              }}
              style={[
                styles.tab,
                {
                  backgroundColor: "#FFF8E7",
                  borderWidth: 1,
                  borderColor: "#F2D49B",
                },
              ]}
            >
              <Text
                style={{
                  color: "#A66A18",
                  fontWeight: "800",
                  fontSize: 16,
                  textAlign: "center",
                }}
              >
                History
              </Text>
            </Pressable>

            {/* Setup */}
            <Pressable
              onPress={() => setTab("settings")}
              style={[
                styles.tab,
                {
                  marginLeft: "26%",
                  backgroundColor: "#F4F6F8",
                  borderWidth: 1,
                  borderColor: "#CBD5E1",
                },
              ]}
            >
              <Text
                style={{
                  color: "#52616B",
                  fontWeight: "800",
                  fontSize: 16,
                  textAlign: "center",
                }}
              >
                Setup
              </Text>
            </Pressable>

          </View>
        )}

        {tab === "calculate" && (
          <View style={{ width: "100%", gap: 20 }}>

            <View style={{ alignItems: "center", marginBottom: 4 }}>
              <Text
                style={{
                  fontSize: 30,
                  fontWeight: "800",
                  color: "#315B8A",
                  textAlign: "center",
                }}
              >
                Calculation
              </Text>
            </View>

            <View
              style={{
                backgroundColor: "#F7FAFF",
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: "#C9DCF2",
                shadowColor: "#000",
                shadowOpacity: 0.05,
                shadowRadius: 6,
                elevation: 2,
                gap: 14,
              }}
            >
              <Pressable
                onPress={() => setTab(null)}
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: "#EEF5FF",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: "#315B8A",
                  }}
                >
                  ← Back
                </Text>
              </Pressable>

              <Text style={[styles.cardTitle, { color: "#315B8A" }]}>
                Calculation सुरू करा
              </Text>

              <Field
                label="Main cell number"
                value={mainCell}
                onChangeText={setMainCell}
                placeholder="उदा. G87"
              />

              <Field
                label="Main cell value"
                value={mainValue}
                onChangeText={setMainValue}
                placeholder="उदा. 05"
                keyboardType="number-pad"
              />

              <View style={styles.startModes}>
                <Pressable onPress={() => setCalculationMode("THREE_DAYS")} style={[styles.mode, calculationMode === "THREE_DAYS" && styles.modeActive]}>
                  <Text style={[styles.modeText, calculationMode === "THREE_DAYS" && styles.modeTextActive]}>3 Days</Text>
                </Pressable>
                <Pressable onPress={() => setCalculationMode("FOUR_DAYS_DIRECT")} style={[styles.mode, calculationMode === "FOUR_DAYS_DIRECT" && styles.modeActive]}>
                  <Text style={[styles.modeText, calculationMode === "FOUR_DAYS_DIRECT" && styles.modeTextActive]}>4 Days Direct</Text>
                </Pressable>
                <Pressable onPress={() => setCalculationMode("FOUR_DAYS_OPPOSITE")} style={[styles.mode, calculationMode === "FOUR_DAYS_OPPOSITE" && styles.modeActive]}>
                  <Text style={[styles.modeText, calculationMode === "FOUR_DAYS_OPPOSITE" && styles.modeTextActive]}>4 Days Opposite</Text>
                </Pressable>
              </View>

              <View style={styles.startModes}>
                <Pressable
                  onPress={() => setStartMode("root")}
                  style={[
                    styles.mode,
                    startMode === "root" && styles.modeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      startMode === "root" && styles.modeTextActive,
                    ]}
                  >
                    Root start
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setStartMode("branch")}
                  style={[
                    styles.mode,
                    startMode === "branch" && styles.modeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.modeText,
                      startMode === "branch" && styles.modeTextActive,
                    ]}
                  >
                    Branch start
                  </Text>
                </Pressable>
              </View>

              {startMode === "branch" && (
                <Field
                  label="First branch group"
                  value={branchStartCell}
                  onChangeText={setBranchStartCell}
                  placeholder="उदा. M82"
                />
              )}

              <Text style={styles.note}>
                Run केल्यानंतर प्रत्येक Criteria, Sub-Criteria, तीन cell numbers,
                values, total, last digit, {calculationMode === "FOUR_DAYS_OPPOSITE" ? "+5 check, " : ""}Match/Skip आणि common Criteria
                दिसतील.
              </Text>

              <Pressable onPress={runCalculation} style={styles.primary}>
                <Text style={styles.primaryText}>Calculation Run करा</Text>
              </Pressable>

              {!!calculationMessage && (
                <Text style={styles.success}>{calculationMessage}</Text>
              )}

              <AuditReport
  records={records}
  pattern={market.pattern}
  calculationMode={calculationMode}
  checkpoint={checkpoint}
  onGreyPress={() => {
                  setTimeout(() => {
                    mainScrollRef.current?.scrollTo({
                      y: 520,
                      animated: true,
                    });
                  }, 100);
                }}
              />
            </View>
          </View>
        )}

    {tab === "chart" && (
      <View style={{ width: "100%", gap: 20 }}>

        <View style={{ alignItems: "center", marginBottom: 4 }}>
          <Text
            style={{
              fontSize: 30,
              fontWeight: "800",
              color: "#7656A8",
              textAlign: "center",
            }}
          >
            Market Chart
          </Text>
        </View>

        <View
          style={{
            backgroundColor: "#FAF8FF",
            borderRadius: 18,
            padding: 16,
            borderWidth: 1,
            borderColor: "#DCCFF2",
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 6,
            elevation: 2,
            gap: 14,
          }}
        >
      <Pressable
        onPress={() => setTab(null)}
        style={{
          alignSelf: "flex-start",
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 10,
          backgroundColor: "#EEF5FF",
        }}
      >
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: "#315B8A",
          }}
        >
          ← Back
        </Text>
      </Pressable>
        <Text style={[styles.cardTitle, { color: "#7656A8" }]}>
          Market Chart
        </Text>

        <Text style={styles.note}>
          {market.pattern === "FINAL_DAYS_6"
            ? "6 Days chart · Monday to Saturday"
            : "5 Days chart · Monday to Friday"}
        </Text>
<Field
  label="Row number"
  value={dateRow}
  onChangeText={setDateRow}
  placeholder="उदा. 90"
/>

<Field
  label="Date"
  value={dateValue}
  onChangeText={setDateValue}
  placeholder="उदा. 07/09/2026"
/>

<Pressable onPress={saveRowDate} style={styles.primary}>
  <Text style={styles.primaryText}>Date Save करा</Text>
</Pressable>

<Pressable onPress={deleteRowDate} style={styles.secondary}>
  <Text style={styles.secondaryText}>Date Delete करा</Text>
</Pressable>

        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>

          {/* Fixed Row column */}
          <View style={{ width: 48, marginTop: 12 }}>
            <View
              style={{
                width: 48,
                height: 38,
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "#d9e2ec",
                alignItems: "center",
                backgroundColor: "#eef2f6",
              }}
            >
              <Text style={{ fontWeight: "800" }}>Row</Text>
            </View>

            <View
              style={{
                width: 48,
                height: 38,
                justifyContent: "center",
                borderWidth: 1,
                borderTopWidth: 0,
                borderColor: "#d9e2ec",
                alignItems: "center",
                backgroundColor: "#eef2f6",
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "800" }}></Text>
            </View>

            <ScrollView
              ref={rowNumberScrollRef}
              style={{ maxHeight: 500 }}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            >
              {Array.from(
                {
                  length: Math.max(
                    ...Object.keys(savedValues)
                      .map((cell) => Number(cell.match(/\d+/)?.[0]))
                      .filter((row) => Number.isFinite(row)),
                    ...Object.keys(rowDates)
                      .map((row) => Number(row))
                      .filter((row) => Number.isFinite(row)),
                    1
                  ),
                },
                (_, index) => index + 1
              ).map((row) => (
                <View
                  key={row}
                  style={{
                    width: 48,
                    height: 38,
                    borderWidth: 1,
                    borderTopWidth: 0,
                    borderColor: "#d9e2ec",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#eef2f6",
                  }}
                >
                  <Text style={{ fontWeight: "800" }}>{row}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>

            {/* Column letters */}
            <View style={{ flexDirection: "row", marginTop: 12 }}>
                          {(market.pattern === "FINAL_DAYS_6" ? CHART_COLUMNS_6 : CHART_COLUMNS_5).map((column) => {
                const isMain = (
                  market.pattern === "FINAL_DAYS_6"
                    ? MAIN_COLUMNS_6
                    : MAIN_COLUMNS_5
                ).includes(column);

                return (
                  <View
                    key={column}
                    style={{
                      width: column === "A" ? 90 : isMain ? 64 : 48,
                      height: 38,
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: "#d9e2ec",
                      alignItems: "center",
                      backgroundColor: isMain ? "#eaf2ff" : "#f8fafc",
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: isMain ? "800" : "600",
                        fontSize: 11,
                        textAlign: "center",
                      }}
                    >
                      {column === "B"
                        ? "B\nMON"
                        : column === "G"
                          ? "G\nTUE"
                          : column === "L"
                            ? "L\nWED"
                            : column === "Q"
                              ? "Q\nTHU"
                              : column === "V"
                                ? "V\nFRI"
                                : column === "AA"
                                  ? "AA\nSAT"
                                  : column}
                    </Text>
                  </View>
                );
              })}
          </View>


            {/* Labels */}
            <View style={{ flexDirection: "row" }}>

              {(market.pattern === "FINAL_DAYS_6" ? CHART_LABELS_6 : CHART_LABELS_5).map((label, index) => {
                const column = (
                  market.pattern === "FINAL_DAYS_6"
                    ? CHART_COLUMNS_6
                    : CHART_COLUMNS_5
                )[index];

                const isMain = (
                  market.pattern === "FINAL_DAYS_6"
                    ? MAIN_COLUMNS_6
                    : MAIN_COLUMNS_5
                ).includes(column);

                return (
                  <View
                    key={`${column}-${label}`}
                    style={{
                      width: column === "A" ? 90 : isMain ? 64 : 48,
                      height: 38,
                      justifyContent: "center",
                      borderWidth: 1,
                      borderTopWidth: 0,
                      borderColor: "#d9e2ec",
                      alignItems: "center",
                      backgroundColor: isMain ? "#eaf2ff" : "#ffffff",
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: isMain ? "800" : "600" }}>
                      {label}
                    </Text>
                  </View>
                );
              })}
            </View>

            <ScrollView
              ref={chartDataScrollRef}
              style={{ maxHeight: 500 }}
              nestedScrollEnabled
              scrollEventThrottle={16}
              onScroll={(event) => {
                syncChartVerticalScroll(event.nativeEvent.contentOffset.y);
              }}
            >

            {/* Saved value rows */}
            {Array.from(
              {
                length: Math.max(
                  ...Object.keys(savedValues)
                    .map((cell) => Number(cell.match(/\d+/)?.[0]))
                    .filter((row) => Number.isFinite(row)),

                  ...Object.keys(rowDates)
                    .map((row) => Number(row))
                    .filter((row) => Number.isFinite(row)),

                  1
                ),
              },
              (_, index) => index + 1
            ).map((row) => {
                const columns =
                  market.pattern === "FINAL_DAYS_6"
                    ? CHART_COLUMNS_6
                    : CHART_COLUMNS_5;

                const mainColumns =
                  market.pattern === "FINAL_DAYS_6"
                    ? MAIN_COLUMNS_6
                    : MAIN_COLUMNS_5;

                return (
                  <View key={row} style={{ flexDirection: "row" }}>



                    {columns.map((column) => {
                      const isMain = mainColumns.includes(column);
                      const cellAddress = `${column}${row}`;
                      const value = column === "A"
                        ? rowDates[row] ?? ""
                        : savedValues[cellAddress] ?? "";

                      const isCurrentMainCell =
                        cellAddress.toUpperCase() ===
                        (chartHighlightCache?.currentMainCell ?? mainCell.trim()).toUpperCase();

                      const isReferenceCell =
                        records.some((record) =>
                          record.audit.days.some((day) =>
                            day.lines.some((line) =>
                              line.references.some(
                                (reference) =>
                                  reference.toUpperCase() === cellAddress.toUpperCase()
                              )
                            )
                          )
                        ) ||
                        chartHighlightCache?.referenceCells.includes(
                          cellAddress.toUpperCase()
                        ) === true;

                  const isMatchedReferenceCell =
                    records.some((record) =>
                      record.audit.days.some((day) =>
                        day.lines.some(
                          (line) =>
                            line.status === "MATCH" &&
                            line.references.some(
                              (reference) =>
                                reference.toUpperCase() === cellAddress.toUpperCase()
                            )
                        )
                      )
                    ) ||
                    chartHighlightCache?.matchedReferenceCells.includes(
                      cellAddress.toUpperCase()
                    ) === true;

              const isCommonCriteriaReferenceCell =
                records.some((record) =>
                  record.audit.commonCriteria.length > 0 &&
                  record.audit.days.some((day) =>
                    day.lines.some(
                      (line) =>
                        line.status === "MATCH" &&
                        record.audit.commonCriteria.includes(line.criteria) &&
                        line.references.some(
                          (reference) =>
                            reference.toUpperCase() === cellAddress.toUpperCase()
                        )
                    )
                  )
                ) ||
                chartHighlightCache?.commonCriteriaReferenceCells.includes(
                  cellAddress.toUpperCase()
                ) === true;

                      return (
                        <View
                          key={cellAddress}
                          style={{
                            width: column === "A" ? 90 : isMain ? 64 : 48,
                            height: 38,
                            borderWidth: 1,
                            borderTopWidth: 0,
                            borderColor: "#d9e2ec",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: isCurrentMainCell
                              ? "#fff3b0"
                              : isMain && isCommonCriteriaReferenceCell
                                ? "#66d17a"
                                : isMain && isMatchedReferenceCell
                                  ? "#9be7a7"
                                  : isMain && isReferenceCell
                                    ? "#dff7e3"
                                    : isMain
                                      ? "#f3f7ff"
                                      : "#ffffff",
                          }}
                        >
                          <Text style={{ fontWeight: isMain ? "800" : "500" }}>
                            {value}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })}

          </ScrollView>
          </View>
          </ScrollView>

          {/* Fixed Row + Chart Data wrapper */}

          </View>
          </View>
          </View>
          )}

        {tab === "values" && (
          <View style={{ width: "100%", gap: 20 }}>

            <View style={{ alignItems: "center", marginBottom: 4 }}>
              <Text
                style={{
                  fontSize: 30,
                  fontWeight: "800",
                  color: "#3F7D58",
                  textAlign: "center",
                }}
              >
                Daily Values
              </Text>
            </View>

            <View
              style={{
                backgroundColor: "#F7FCF8",
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: "#C9E6D0",
                shadowColor: "#000",
                shadowOpacity: 0.05,
                shadowRadius: 6,
                elevation: 2,
                gap: 14,
              }}
            >
              <Pressable
                onPress={() => setTab(null)}
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: "#EEF5FF",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: "#315B8A",
                  }}
                >
                  ← Back
                </Text>
              </Pressable>

              <Text style={[styles.cardTitle, { color: "#3F7D58" }]}>
                Daily values
              </Text>

              <Text style={styles.note}>
                Cell number आणि 1–2 digits (किंवा `*`) भरा. माहिती या marketसाठी
                deviceमध्ये offline save होईल.
              </Text>

              <Field
                label="Cell number"
                value={entryCell}
                onChangeText={setEntryCell}
                placeholder="उदा. G87"
              />

              <Field
                label="Value"
                value={entryValue}
                onChangeText={setEntryValue}
                placeholder="0 ते 99 किंवा *"
              />

              <Pressable onPress={saveValue} style={styles.primary}>
                <Text style={styles.primaryText}>Value Save करा</Text>
              </Pressable>

              <Pressable onPress={deleteValue} style={styles.secondary}>
                <Text style={styles.secondaryText}>Value Delete करा</Text>
              </Pressable>

              <Text style={styles.fieldLabel}>
                एकदम अनेक values paste करा
              </Text>

              <TextInput
                value={batchValues}
                onChangeText={setBatchValues}
                placeholder={"उदा.\nB86=07\nJ80=1\nE81=4\nAD82=5"}
                multiline
                style={[styles.input, styles.batchInput]}
              />

              <Pressable onPress={saveBatchValues} style={styles.secondary}>
                <Text style={styles.secondaryText}>Pasted Values Save करा</Text>
              </Pressable>

              {!!saveMessage && (
                <Text style={styles.success}>{saveMessage}</Text>
              )}

              <Text style={styles.savedLabel}>
                या marketमध्ये save केलेल्या values: {Object.keys(savedValues).length}
              </Text>

              {Object.entries(savedValues)
                .slice(-8)
                .reverse()
                .map(([cell, value]) => (
                  <Text key={cell} style={styles.savedValue}>
                    {cell} = {value}
                  </Text>
                ))}
            </View>
          </View>
        )}



        {tab === "history" && (
          <View style={{ width: "100%", gap: 20 }}>

            <View style={{ alignItems: "center", marginBottom: 4 }}>
              <Text
                style={{
                  fontSize: 30,
                  fontWeight: "800",
                  color: "#A66A18",
                  textAlign: "center",
                }}
              >
                Calculation History
              </Text>
            </View>

            <View
              style={{
                backgroundColor: "#FFFDF7",
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: "#F0DFC0",
                shadowColor: "#000",
                shadowOpacity: 0.05,
                shadowRadius: 6,
                elevation: 2,
                gap: 14,
              }}
            >
              <Pressable
                onPress={() => setTab(null)}
                style={{
                  alignSelf: "flex-start",
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  backgroundColor: "#EEF5FF",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: "#315B8A",
                  }}
                >
                  ← Back
                </Text>
              </Pressable>

              <Text style={[styles.cardTitle, { color: "#A66A18" }]}>
                Calculation history
              </Text>

              {!history.length && (
                <Text style={styles.note}>
                  अजून कोणतीही calculation save झालेली नाही.
                </Text>
              )}

              {history.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setRecords(item.records);
                    setTab("calculate");
                    setCalculationMessage(`${item.status} audit उघडला आहे.`);
                  }}
                  style={styles.historyItem}
                >
                  <Text style={styles.historyTitle}>
                    {new Date(item.createdAt).toLocaleString()}
                  </Text>

                  <Text style={styles.note}>
                    {item.status} · {item.records.length} group records
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {tab === "settings" && (
          <View style={styles.card}>
          <Pressable
            onPress={() => setTab(null)}
            style={{
              alignSelf: "flex-start",
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 10,
              backgroundColor: "#EEF5FF",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: "#315B8A",
              }}
            >
              ← Back
            </Text>
          </Pressable>
            <Text style={styles.cardTitle}>Shared sequence setup</Text>
            <Text style={styles.note}>Final Pattern – Days 6 आणि Final Pattern – Days 5चे approved Calculation Sequences appमध्ये आधीच saved आहेत. त्यामुळे रोज Excel import करण्याची गरज नाही.</Text>
            <Text style={styles.success}>Pattern बदलल्याशिवाय येथे काही update करावे लागणार नाही.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: "default" | "number-pad" }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{props.label}</Text><TextInput value={props.value} onChangeText={props.onChangeText} placeholder={props.placeholder} keyboardType={props.keyboardType} style={styles.input} /></View>;
}

function TabButton({
  active,
  label,
  onPress,
  centered = false,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  centered?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tab,
        centered && { marginLeft: "26%" },
        active && styles.tabActive,
      ]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f6f8fb" }, page: { padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: "800", color: "#102a43" }, subtitle: { color: "#52616b", marginTop: -12 },
  label: { fontWeight: "700", color: "#334e68" }, marketGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  market: {
    width: "48%",
    minHeight: 58,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: "white",
    alignItems: "center",
    justifyContent: "center",
  },
  marketSelected: { backgroundColor: "#1565c0", borderColor: "#1565c0" }, marketText: {
                                                                            color: "#243b53",
                                                                            fontWeight: "800",
                                                                            fontSize: 17,
                                                                            textAlign: "center",
                                                                          }, marketTextSelected: { color: "white" },
  patternCard: { backgroundColor: "#e8f1fb", borderRadius: 12, padding: 14 }, patternLabel: { color: "#52616b", fontSize: 12 }, patternValue: { color: "#0d47a1", fontWeight: "800", fontSize: 17, marginTop: 3 },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  tab: {
    width: "48%",
    minHeight: 54,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF5FF",
  },

  tabActive: {
    backgroundColor: "#315B8A",
  },

  tabText: {
    color: "#334e68",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },

  tabTextActive: {
    color: "white",
  },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "#D9E2EC",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  }, cardTitle: { fontSize: 18, fontWeight: "800", color: "#102a43" },
  note: { color: "#52616b", lineHeight: 21 }, field: { gap: 6 }, fieldLabel: { fontWeight: "700", color: "#334e68" }, input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 11, fontSize: 16, backgroundColor: "#fff" },
  primary: { backgroundColor: "#1565c0", borderRadius: 9, padding: 13, alignItems: "center" }, primaryText: { color: "white", fontWeight: "800" }, secondary: { borderWidth: 1, borderColor: "#1565c0", borderRadius: 9, padding: 13, alignItems: "center" }, secondaryText: { color: "#1565c0", fontWeight: "800" },
  success: { color: "#137333", fontWeight: "700" }, savedLabel: { color: "#52616b", fontWeight: "700" }, savedValue: { color: "#334e68" }, batchInput: { minHeight: 110, textAlignVertical: "top" },
  startModes: { flexDirection: "row", gap: 8 }, mode: { flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 10, alignItems: "center" }, modeActive: { backgroundColor: "#102a43", borderColor: "#102a43" }, modeText: { color: "#334e68", fontWeight: "700" }, modeTextActive: { color: "white" },
  historyItem: { borderWidth: 1, borderColor: "#d9e2ec", borderRadius: 9, padding: 11, gap: 4 }, historyTitle: { color: "#243b53", fontWeight: "800" }
});
