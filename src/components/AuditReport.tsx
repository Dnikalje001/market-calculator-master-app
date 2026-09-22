import { Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { TraversalRecord } from "../domain/traversal";
import { Pattern } from "../domain/markets";
import { CalculationCheckpoint } from "../domain/types";
import { CalculationMode } from "../domain/calculation";

export function AuditReport({
  records,
  pattern,
  calculationMode,
  checkpoint,
  onGreyPress,
}: {
  records: TraversalRecord[];
  pattern: Pattern;
  calculationMode: CalculationMode;
  checkpoint: CalculationCheckpoint | null;
  onGreyPress?: () => void;
}) {
const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({});

const [openSameCellGroups, setOpenSameCellGroups] = useState<
  Record<string, boolean>
>({});

const [openBranchFamilies, setOpenBranchFamilies] = useState<
  Record<string, boolean>
>({});
const [openRootSections, setOpenRootSections] = useState<
  Record<number, boolean>
>({});
const [statusFilter, setStatusFilter] = useState<
  "ALL" | "GREEN" | "RED" | "GREY"
>("ALL");

const expectedDayCount = calculationMode === "THREE_DAYS" ? 3 : 4;
const hasPendingBranch = checkpoint?.status === "WAITING_FOR_VALUES" && (checkpoint.pendingBranches?.length ?? 0) > 0;
const activePendingBranch = hasPendingBranch ? checkpoint?.pendingBranches?.[0] : undefined;


const groupedRecords: {
  root: { record: TraversalRecord; originalIndex: number } | null;
  branches: { record: TraversalRecord; originalIndex: number }[];
}[] = [];

let currentGroup:
  | {
      root: { record: TraversalRecord; originalIndex: number } | null;
      branches: { record: TraversalRecord; originalIndex: number }[];
    }
  | null = null;

records.forEach((record, originalIndex) => {
  if (record.kind === "ROOT") {
    currentGroup = {
      root: { record, originalIndex },
      branches: [],
    };

    groupedRecords.push(currentGroup);
  } else {
    if (!currentGroup) {
      currentGroup = {
        root: null,
        branches: [],
      };

      groupedRecords.push(currentGroup);
    }

    currentGroup.branches.push({
      record,
      originalIndex,
    });
  }
});


  const matchesStatusFilter = (record: TraversalRecord) => {
    if (statusFilter === "ALL") return true;

    const isPartial = record.audit.days.length < expectedDayCount;
    const hasCommonCriteria = record.audit.commonCriteria.length > 0;

    if (statusFilter === "GREEN") {
      return record.audit.days.length === expectedDayCount && hasCommonCriteria;
    }

    if (statusFilter === "RED") {
      return record.audit.days.length === expectedDayCount && !hasCommonCriteria;
    }

    if (statusFilter === "GREY") {
      const branchCriteria = record.branch?.criteria;
      return record.kind === "BRANCH" && isPartial && record.audit.days.length > 0 && record.skippedMainCells.length === 0 && branchCriteria !== undefined && record.audit.days.every((day) => day.matchingCriteria.includes(branchCriteria));
    }

    return true;
  };

  const getProgressionResult = (
    day: TraversalRecord["audit"]["days"][number],
    line: TraversalRecord["audit"]["days"][number]["lines"][number]
  ) => {
    if (!/^\d{2}$/.test(day.mainValue)) return "";

    const openDigit = Number(day.mainValue[0]);
    const closeDigit = Number(day.mainValue[1]);

    const matchDigit =
      calculationMode === "FOUR_DAYS_OPPOSITE" && day.isFourthDay
        ? line.oppositeLastDigit
        : line.directLastDigit;

    if (matchDigit === openDigit && matchDigit === closeDigit) {
      return calculationMode === "FOUR_DAYS_OPPOSITE" && day.isFourthDay
        ? "Open + Close • Opposite"
        : "Open + Close";
    }

    if (matchDigit === openDigit) {
      return calculationMode === "FOUR_DAYS_OPPOSITE" && day.isFourthDay
        ? "Open • Opposite"
        : "Open";
    }

    if (matchDigit === closeDigit) {
      return calculationMode === "FOUR_DAYS_OPPOSITE" && day.isFourthDay
        ? "Close • Opposite"
        : "Close";
    }

    return "";
  };
  if (!records.length) return <Text style={styles.empty}>Calculation run केल्यानंतर पूर्ण audit येथे दिसेल.</Text>;
  return (
    <View style={styles.wrap}>
      <View style={styles.filterRow}>
        {(["ALL", "GREEN", "RED", "GREY"] as const).map((filter) => (
          <Pressable
            key={filter}
            onPress={() => { setStatusFilter(filter); if (filter === "GREY") onGreyPress?.(); }}
            style={[
              styles.filterButton,
              statusFilter === filter && styles.filterButtonActive,
            ]}
          >
            <Text
              style={[
                styles.filterText,
                statusFilter === filter && styles.filterTextActive,
              ]}
            >
              {filter === "ALL"
                ? "All"
                : filter === "GREEN"
                  ? "Green"
                  : filter === "RED"
                    ? "Red"
                    : "Grey"}
            </Text>
          </Pressable>
        ))}
      </View>



      {groupedRecords.map((group, groupIndex) => {
        const isPendingRootFamily = hasPendingBranch && groupIndex === groupedRecords.length - 1;
        const greenRootNumber =
          groupedRecords
            .slice(0, groupIndex + 1)
            .filter((item) =>
              item.root?.record.audit.days.length === expectedDayCount &&
              item.root.record.audit.commonCriteria.length > 0 &&
              !(hasPendingBranch && groupedRecords.indexOf(item) === groupedRecords.length - 1)
            ).length;

        const visibleBranches = group.branches.filter(({ record }) =>
          statusFilter === "GREY" && isPendingRootFamily
            ? !!record.branch && (record.branch.ancestry ?? []).every((criteria, index) => activePendingBranch?.ancestry?.[index] === criteria)
            : matchesStatusFilter(record)
        );

        const visibleRoot =
          group.root &&
          ((!(statusFilter === "GREEN" && isPendingRootFamily) && matchesStatusFilter(group.root.record)) ||
            (statusFilter === "GREY" && (visibleBranches.length > 0 || isPendingRootFamily)))
            ? group.root
            : null;

        if (!visibleRoot && visibleBranches.length === 0) {
          return null;
        }

        const isRootOpen = openRootSections[groupIndex] === true;
        const rootRecordIndex = visibleRoot?.originalIndex;
        const isRootGroupOpen = rootRecordIndex !== undefined && openGroups[rootRecordIndex] === true;

        const branchFamilies = new Map<
          number,
          { record: TraversalRecord; originalIndex: number }[]
        >();

        visibleBranches.forEach((item) => {
          const firstCriteria = item.record.branch?.ancestry?.[0];

          if (firstCriteria === undefined) return;

          const existing = branchFamilies.get(firstCriteria) ?? [];
          existing.push(item);
          branchFamilies.set(firstCriteria, existing);
        });

          const hasBranches = branchFamilies.size > 0;

        return (
          <View
            key={`root-section-${groupIndex}`}
            style={styles.rootSection}
          >
            <Pressable
              onPress={() =>
                setOpenRootSections((current) => ({
                  ...current,
                  [groupIndex]: !current[groupIndex],
                }))
              }
              style={styles.group}
            >
              <Text
                style={[
                  styles.heading,
                  !(statusFilter === "GREY" && isPendingRootFamily) &&
                  visibleRoot?.record.audit.days.length === expectedDayCount &&
                  visibleRoot.record.audit.commonCriteria.length > 0
                    ? styles.headingGreen
                    : !(statusFilter === "GREY" && isPendingRootFamily) && visibleRoot?.record.audit.days.length === expectedDayCount
                      ? styles.headingRed
                      : styles.headingNeutral,
                ]}
              >
                {isRootOpen ? "\u25BC " : "\u25B6 "}

                {statusFilter === "GREEN"
                  ? `${greenRootNumber}. Root Group`
                  : "Root Group"}

                {!hasBranches ? " • No Branch" : ""}
              </Text>
            </Pressable>

            {isRootOpen && (
              <View style={styles.branchList}>
                {visibleRoot && (
                  <View style={{ marginTop: 8, marginLeft: 12, borderLeftWidth: 2, borderLeftColor: "#d9e2ec", paddingLeft: 10, paddingVertical: 6 }}>
                    <Pressable onPress={() => rootRecordIndex !== undefined && setOpenGroups((current) => ({ ...current, [rootRecordIndex]: !current[rootRecordIndex] }))}>
                      <Text style={{ fontWeight: "700", color: "#6a1b9a", fontSize: 15 }}>
                        {isRootGroupOpen ? "\u25BC " : "\u25B6 "}Group 1 {"\u2022"} {visibleRoot.record.audit.days.map((day) => day.mainCell).join(" \u2192 ")}
                      </Text>
                    </Pressable>
                    {isRootGroupOpen && (
                      <View style={{ marginTop: 8 }}>
                    {visibleRoot.record.skippedMainCells.length > 0 && (
                      <Text style={styles.skip}>
                        Skipped main cells: {visibleRoot.record.skippedMainCells.join(", ")}
                      </Text>
                    )}

                    {visibleRoot.record.audit.days.map((day) => (
                      <View key={day.mainCell} style={styles.day}>
                        <Text style={styles.dayHeading}>
                          {day.mainCell} = {day.mainValue}{" "}
                          {day.isFourthDay ? "(fourth valid day)" : ""}
                        </Text>

                        {day.lines
                          .filter((line) => line.status === "MATCH")
                          .map((line) => (
                            <View key={`${line.criteria}-${line.subCriteria}`} style={styles.line}>
                              <Text style={styles.match}>
                                C{line.criteria}-SC{line.subCriteria}:{" "}
                                {line.references.join(" → ")}
                              </Text>

                              <Text style={styles.detail}>
                                Values: {line.values.join(" + ")}
                                {line.total !== undefined
                                  ? ` = ${line.total}; last digit ${line.directLastDigit}`
                                  : ""}
                              </Text>

                              <Text style={day.isFourthDay ? styles.resultDirect : line.directLastDigit === Number(day.mainValue[1]) && line.directLastDigit !== Number(day.mainValue[0]) ? styles.resultClose : styles.resultNormal}>
                                {(() => {
                                  if (!/^\d{2}$/.test(day.mainValue)) return "";
                                  const openDigit = Number(day.mainValue[0]);
                                  const closeDigit = Number(day.mainValue[1]);
                                  const matchDigit =
  calculationMode === "FOUR_DAYS_OPPOSITE" && day.isFourthDay
    ? line.oppositeLastDigit
    : line.directLastDigit;
const matchOpen = matchDigit === openDigit;
const matchClose = matchDigit === closeDigit;
const opposite =
  calculationMode === "FOUR_DAYS_OPPOSITE" && day.isFourthDay;
                                  if (matchOpen && matchClose) return opposite ? "Open + Close • Opposite" : "Open + Close";
if (matchOpen) return opposite ? "Open • Opposite" : "Open";
if (matchClose) return opposite ? "Close • Opposite" : "Close";
                                  return "";
                                })()}
                                {line.skipReason ? ` (${line.skipReason})` : ""}
                              </Text>
                            </View>
                          ))}

                        <Text style={styles.criteria}>
                          Matching Criteria:{" "}
                          {day.matchingCriteria.length
                            ? day.matchingCriteria.map((value) => `C${value}`).join(", ")
                            : "None"}
                        </Text>
                      </View>
                    ))}

                    <Text style={styles.common}>
                      Common Criteria:{" "}
                      {visibleRoot.record.audit.commonCriteria.length
                        ? visibleRoot.record.audit.commonCriteria.map((value) => `C${value}`).join(", ")
                        : "None"}
                    </Text>
                  </View>
                    )}
                  </View>
                )}
                {Array.from(branchFamilies.entries()).map(
                  ([criteria, familyRecords]) => {
                    const displayGroups =
                      statusFilter === "GREY" && isPendingRootFamily
                        ? familyRecords
                        : statusFilter === "GREY"
                          ? familyRecords.filter(
                              ({ record }) => record.audit.days.length < expectedDayCount
                            )
                          : familyRecords.filter(
                              ({ record }) => record.audit.days.length === expectedDayCount
                            );

                    const groupCount = displayGroups.length;

                    const groupedByMainCells = new Map<
                      string,
                      {
                        mainCells: string[];
                        items: {
                          record: TraversalRecord;
                          originalIndex: number;
                          originalGroupNumber: number;
                        }[];
                        firstPosition: number;
                      }
                    >();

                    displayGroups.forEach((item, index) => {
                      const mainCells = item.record.audit.days.map(
                        (day) => day.mainCell
                      );

                      const cellKey = mainCells.join("|");

                      const existing = groupedByMainCells.get(cellKey);

                      if (existing) {
                        existing.items.push({
                          ...item,
                          originalGroupNumber: index + 1,
                        });
                      } else {
                        groupedByMainCells.set(cellKey, {
                          mainCells,
                          items: [
                            {
                              ...item,
                              originalGroupNumber: index + 1,
                            },
                          ],
                          firstPosition: index,
                        });
                      }
                    });

                    const displayCellGroups = Array.from(
                      groupedByMainCells.values()
                    ).sort((a, b) => a.firstPosition - b.firstPosition);

                    const isIncompleteBranch =
                      statusFilter === "GREY";

                    const branchKey = `${groupIndex}-${criteria}`;
                    const isBranchOpen = openBranchFamilies[branchKey] === true;

                    return (
                      <View
                        key={`branch-family-${groupIndex}-${criteria}`}
                        style={styles.branchGroup}
                      >
                        <Pressable
                          onPress={() =>
                            setOpenBranchFamilies((current) => ({
                              ...current,
                              [branchKey]: !current[branchKey],
                            }))
                          }
                        >
                          <Text
                            style={[
                              styles.heading,
                              {
                                color: isIncompleteBranch
                                  ? "#52616b"
                                  : "#1565c0",
                              },
                            ]}
                          >
                            {isBranchOpen ? "▼ " : "▶ "}
                            C{criteria} Branch •{" "}
                            {isIncompleteBranch
                              ? `${groupCount} Incomplete ${
                                  groupCount === 1 ? "Group" : "Groups"
                                }`
                              : `${groupCount} ${
                                  groupCount === 1 ? "Group" : "Groups"
                                }`}
                          </Text>
                        </Pressable>
                        {isBranchOpen && (
                          <View style={{ marginTop: 10, gap: 8 }}>
                            {displayCellGroups.map((cellGroup, cellGroupIndex) => {
                                const { mainCells, items } = cellGroup;
                                const firstItem = items[0];

                                const record = firstItem.record;
                                const originalIndex = firstItem.originalIndex;
                                const groupNumber = firstItem.originalGroupNumber - 1;

                                const sameCellKey = `${groupIndex}-${criteria}-${cellGroup.firstPosition}`;

                                const isSameCellGroup =
                                  items.length > 1;

                                const isSameCellOpen =
                                  openSameCellGroups[sameCellKey] === true;

                              const isGroupOpen = openGroups[originalIndex] === true;

                              const groupMainCells = record.audit.days.map(
                                (day) => day.mainCell
                              );

                              const hasCommonCriteria =
                                record.audit.commonCriteria.length > 0;



                              return (
                                <View
                                  key={`group-${originalIndex}`}
                                  style={{
                                    marginLeft: 12,
                                    borderLeftWidth: 2,
                                    borderLeftColor: "#d9e2ec",
                                    paddingLeft: 10,
                                    paddingVertical: 6,
                                  }}
                                >
                                  <Pressable
                                    onPress={() => {
                                      if (isSameCellGroup) {
                                        setOpenSameCellGroups((current) => ({
                                          ...current,
                                          [sameCellKey]: !current[sameCellKey],
                                        }));
                                      } else {
                                        setOpenGroups((current) => ({
                                          ...current,
                                          [originalIndex]: !current[originalIndex],
                                        }));
                                      }
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontWeight: "700",
                                        color: isIncompleteBranch
                                          ? "#52616b"
                                          : hasCommonCriteria
                                            ? "#6a1b9a"
                                            : "#c62828",
                                        fontSize: 15,
                                      }}
                                    >
                                      {isSameCellGroup
                                        ? isSameCellOpen
                                          ? "▼ "
                                          : "▶ "
                                        : isGroupOpen
                                          ? "▼ "
                                          : "▶ "}

                                      {items.length > 1
                                        ? `Same Cells ×${items.length}`
                                        : isIncompleteBranch
                                          ? "Pending Group"
                                          : `Group ${groupNumber + 1}`}{" "}
                                      • {mainCells.join(" → ")}
                                    </Text>

                                    {isIncompleteBranch ? (
                                      <Text
                                        style={{
                                          color: "#52616b",
                                          fontWeight: "800",
                                          fontSize: 12,
                                          marginTop: 3,
                                        }}
                                      >
                                        ⏳ Calculation Incomplete
                                      </Text>
                                    ) : !hasCommonCriteria ? (
                                      <Text
                                        style={{
                                          color: "#c62828",
                                          fontWeight: "800",
                                          fontSize: 12,
                                          marginTop: 3,
                                        }}
                                      >
                                        ⚠ No Common Criteria
                                      </Text>
                                    ) : null}
                                    {isIncompleteBranch && record.branch && record.audit.days.length > 0 && (
  <View
    style={{
      marginTop: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: "#d9e2ec",
      borderRadius: 8,
      backgroundColor: "#ffffff",
    }}
  >
    <Text
      style={{
        fontWeight: "800",
        fontSize: 13,
        color: "#334e68",
        marginBottom: 8,
      }}
    >
      Progression • C{record.branch.criteria}
    </Text>

    {record.audit.days.map((day, dayIndex) => {
      const branchCriteria = record.branch?.criteria;

      const matchingLines = day.lines.filter(
        (line) =>
          line.status === "MATCH" &&
          branchCriteria !== undefined &&
          line.criteria === branchCriteria
      );

      return (
        <View
          key={`progression-${day.mainCell}-${dayIndex}`}
          style={{
            borderTopWidth: dayIndex === 0 ? 0 : 1,
            borderTopColor: "#edf2f7",
            paddingVertical: 6,
          }}
        >
          <Text style={{ fontWeight: "700", fontSize: 12 }}>
            Day {dayIndex + 1}: {day.mainCell} = {day.mainValue}
          </Text>

          {matchingLines.length > 0 ? (
            matchingLines.map((line, lineIndex) => (
              <View
                key={`progression-line-${day.mainCell}-${line.criteria}-${line.subCriteria}-${lineIndex}`}
                style={{
                  marginTop: 4,
                  paddingLeft: 8,
                }}
              >
                <Text style={styles.detail}>
                  C{line.criteria}-SC{line.subCriteria}
                  {" • "}
                  Digit:{" "}
                  {calculationMode === "FOUR_DAYS_OPPOSITE" &&
                  day.isFourthDay
                    ? line.oppositeLastDigit ?? "-"
                    : line.directLastDigit ?? "-"}
                </Text>

                <Text style={styles.detail}>
                  Result: {getProgressionResult(day, line) || "-"}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.detail}>
              No matching C{branchCriteria} line
            </Text>
          )}
        </View>
      );
    })}
  </View>
)}

{isIncompleteBranch && record.prediction && (
                                      <View
                                        style={{
                                          marginTop: 10,
                                          padding: 10,
                                          borderWidth: 1,
                                          borderColor: "#d9e2ec",
                                          borderRadius: 8,
                                          backgroundColor: "#f8fafc",
                                        }}
                                      >
                                        <Text
                                          style={{
                                            fontWeight: "700",
                                            fontSize: 13,
                                            color: "#52616b",
                                          }}
                                        >
                                          Common Criteria:{" "}
                                          {record.prediction.commonCriteria.length
                                            ? record.prediction.commonCriteria
                                                .map((criteria) => `C${criteria}`)
                                                .join(", ")
                                            : "None"}
                                        </Text>

                                        {(record.prediction.targets ?? [
                                          {
                                            mainCell: record.prediction.mainCell,
                                            lines: record.prediction.lines,
                                          },
                                        ]).map((target, targetIndex) => (
                                          <View
                                            key={`prediction-target-${target.mainCell}-${targetIndex}`}
                                            style={{
                                              marginTop: 10,
                                              paddingTop: targetIndex === 0 ? 0 : 10,
                                              borderTopWidth: targetIndex === 0 ? 0 : 1,
                                              borderTopColor: "#cbd5e1",
                                            }}
                                          >
                                            <Text
                                              style={{
                                                fontWeight: "800",
                                                fontSize: 14,
                                                color: "#334155",
                                              }}
                                            >
                                              Prediction â€¢ {target.mainCell}
                                            </Text>

                                            {target.lines.map((line, index) => (
                                              <View
                                                key={`prediction-${target.mainCell}-${line.criteria}-${line.subCriteria}-${index}`}
                                                style={{
                                                  marginTop: 10,
                                                  paddingTop: 8,
                                                  borderTopWidth: 1,
                                                  borderTopColor: "#e2e8f0",
                                                }}
                                              >
                                                <Text
                                                  style={{
                                                    fontWeight: "800",
                                                    fontSize: 13,
                                                  }}
                                                >
                                                  C{line.criteria}-SC{line.subCriteria}
                                                </Text>

                                                <Text style={styles.detail}>
                                                  Cells: {line.references.join(" â†’ ")}
                                                </Text>

                                                <Text style={styles.detail}>
                                                  Values:{" "}
                                                  {line.references
                                                    .map((reference, valueIndex) => {
                                                      const value = line.values[valueIndex];

                                                      return `${reference}=${
                                                        value === "" || value === undefined
                                                          ? "?"
                                                          : value
                                                      }`;
                                                    })
                                                    .join(" â€¢ ")}
                                                </Text>

                                                {line.missingCells.length > 0 ? (
                                                  <Text
                                                    style={{
                                                      marginTop: 3,
                                                      fontWeight: "700",
                                                      color: "#52616b",
                                                    }}
                                                  >
                                                    Waiting for: {line.missingCells.join(", ")}
                                                  </Text>
                                                ) : (
                                                  <>
                                                    <Text style={styles.detail}>
                                                      Total: {line.total}
                                                    </Text>

                                                    <Text
                                                      style={{
                                                        marginTop: 3,
                                                        fontWeight: "800",
                                                        fontSize: 13,
                                                      }}
                                                    >
                                                      Possible Digit: {calculationMode === "FOUR_DAYS_OPPOSITE" && record.audit.days.length + targetIndex === 3 ? line.oppositeLastDigit : line.directLastDigit}
                                                    </Text>
                                                  </>
                                                )}
                                              </View>
                                            ))}
                                          </View>
                                        ))}
                                      </View>
                                    )}
                                  </Pressable>

                                  {isSameCellGroup && isSameCellOpen && (
                                    <View
                                      style={{
                                        marginTop: 8,
                                        marginLeft: 12,
                                        gap: 8,
                                      }}
                                    >
                                      {items.map((item) => {
                                        const childRecord = item.record;
                                        const childIndex = item.originalIndex;
                                        const childGroupNumber = item.originalGroupNumber;
                                        const isChildOpen = openGroups[childIndex] === true;

                                        const childHasCommonCriteria =
                                          childRecord.audit.commonCriteria.length > 0;

                                        return (
                                          <View
                                            key={`same-cell-child-${childIndex}`}
                                            style={{
                                              paddingVertical: 6,
                                              paddingLeft: 10,
                                              borderLeftWidth: 2,
                                              borderLeftColor: "#b39ddb",
                                            }}
                                          >
                                            <Pressable
                                              onPress={() =>
                                                setOpenGroups((current) => ({
                                                  ...current,
                                                  [childIndex]: !current[childIndex],
                                                }))
                                              }
                                            >
                                              <Text
                                                style={{
                                                  fontWeight: "700",
                                                  fontSize: 14,
                                                  color: childHasCommonCriteria
                                                    ? "#6a1b9a"
                                                    : "#c62828",
                                                }}
                                              >
                                                {isChildOpen ? "▼ " : "▶ "}
                                                Group {childGroupNumber}
                                              </Text>

                                              {!childHasCommonCriteria && (
                                                <Text
                                                  style={{
                                                    color: "#c62828",
                                                    fontWeight: "800",
                                                    fontSize: 12,
                                                    marginTop: 3,
                                                  }}
                                                >
                                                  ⚠ No Common Criteria
                                                </Text>
                                              )}
                                            </Pressable>

                                            {isChildOpen && (
                                              <View style={{ marginTop: 8 }}>
                                                {childRecord.skippedMainCells.length > 0 && (
                                                  <Text style={styles.skip}>
                                                    Skipped main cells:{" "}
                                                    {childRecord.skippedMainCells.join(", ")}
                                                  </Text>
                                                )}

                                                {childRecord.audit.days.map((day) => (
                                                  <View key={day.mainCell} style={styles.day}>
                                                    <Text style={styles.dayHeading}>
                                                      {day.mainCell} = {day.mainValue}{" "}
                                                      {day.isFourthDay
                                                        ? "(fourth valid day)"
                                                        : ""}
                                                    </Text>

                                                    {day.lines
                                                      .filter((line) => line.status === "MATCH")
                                                      .map((line) => (
                                                        <View
                                                          key={`${line.criteria}-${line.subCriteria}`}
                                                          style={styles.line}
                                                        >
                                                          <Text style={styles.match}>
                                                            C{line.criteria}-SC{line.subCriteria}:{" "}
                                                            {line.references.join(" → ")}
                                                          </Text>

                                                          <Text style={styles.detail}>
                                                            Values: {line.values.join(" + ")}
                                                            {line.total !== undefined
                                                              ? ` = ${line.total}; last digit ${line.directLastDigit}`
                                                              : ""}
                                                          </Text>

                                                          <Text
                                                            style={
                                                              !day.isFourthDay
                                                                ? line.directLastDigit === Number(day.mainValue[1]) &&
                                                                  line.directLastDigit !== Number(day.mainValue[0])
                                                                  ? styles.resultClose
                                                                  : styles.resultNormal
                                                                : styles.resultDirect
                                                            }
                                                          >
                                                            {(() => {
                                                              if (!/^\d{2}$/.test(day.mainValue)) {
                                                                return "";
                                                              }

                                                              const openDigit = Number(day.mainValue[0]);
                                                              const closeDigit = Number(day.mainValue[1]);

                                                              const matchDigit =
  calculationMode === "FOUR_DAYS_OPPOSITE" && day.isFourthDay
    ? line.oppositeLastDigit
    : line.directLastDigit;

const matchOpen = matchDigit === openDigit;
const matchClose = matchDigit === closeDigit;

const opposite =
  calculationMode === "FOUR_DAYS_OPPOSITE" && day.isFourthDay;

                                                              // First 3 valid days
                                                              if (!day.isFourthDay || calculationMode !== "FOUR_DAYS_OPPOSITE") {
  if (matchOpen && matchClose) {
    return "Open + Close";
  }

  if (matchOpen) {
    return "Open";
  }

  if (matchClose) {
    return "Close";
  }

  return "";
}

                                                              // Fourth valid day
                                                              if (matchOpen && matchClose) {
  return opposite ? "Open + Close • Opposite" : "Open + Close";
}

if (matchOpen) {
  return opposite ? "Open • Opposite" : "Open";
}

if (matchClose) {
  return opposite ? "Close • Opposite" : "Close";
}

return "";
                                                            })()}

                                                            {line.skipReason
                                                              ? ` (${line.skipReason})`
                                                              : ""}
                                                          </Text>
                                                        </View>
                                                      ))}

                                                    <Text style={styles.criteria}>
                                                      Matching Criteria:{" "}
                                                      {day.matchingCriteria.length
                                                        ? day.matchingCriteria
                                                            .map((value) => `C${value}`)
                                                            .join(", ")
                                                        : "None"}
                                                    </Text>
                                                  </View>
                                                ))}

                                                <Text style={styles.common}>
                                                  Common Criteria:{" "}
                                                  {childRecord.audit.commonCriteria.length
                                                    ? childRecord.audit.commonCriteria
                                                        .map((value) => `C${value}`)
                                                        .join(", ")
                                                    : "None"}
                                                </Text>
                                              </View>
                                            )}
                                          </View>
                                        );
                                      })}
                                    </View>
                                  )}

                                  {!isSameCellGroup && isGroupOpen && (
                                    <View style={{ marginTop: 8 }}>
                                      {record.skippedMainCells.length > 0 && (
                                        <Text style={styles.skip}>
                                          Skipped main cells: {record.skippedMainCells.join(", ")}
                                        </Text>
                                      )}

                                      {record.audit.days.map((day) => (
                                        <View key={day.mainCell} style={styles.day}>
                                          <Text style={styles.dayHeading}>
                                            {day.mainCell} = {day.mainValue}{" "}
                                            {day.isFourthDay ? "(fourth valid day)" : ""}
                                          </Text>

                                          {day.lines
                                            .filter((line) => line.status === "MATCH")
                                            .map((line) => (
                                              <View
                                                key={`${line.criteria}-${line.subCriteria}`}
                                                style={styles.line}
                                              >
                                                <Text style={styles.match}>
                                                  C{line.criteria}-SC{line.subCriteria}:{" "}
                                                  {line.references.join(" → ")}
                                                </Text>

                                                <Text style={styles.detail}>
                                                  Values: {line.values.join(" + ")}
                                                  {line.total !== undefined
                                                    ? ` = ${line.total}; last digit ${line.directLastDigit}`
                                                    : ""}
                                                </Text>

                                                <Text
                                                  style={
                                                    !day.isFourthDay
                                                      ? line.directLastDigit === Number(day.mainValue[1]) &&
                                                        line.directLastDigit !== Number(day.mainValue[0])
                                                        ? styles.resultClose
                                                        : styles.resultNormal
                                                      : styles.resultDirect
                                                  }
                                                >
                                                  {(() => {
                                                    if (!/^\d{2}$/.test(day.mainValue)) {
                                                      return "";
                                                    }

                                                    const openDigit = Number(day.mainValue[0]);
                                                    const closeDigit = Number(day.mainValue[1]);

                                                    const matchDigit =
  calculationMode === "FOUR_DAYS_OPPOSITE" && day.isFourthDay
    ? line.oppositeLastDigit
    : line.directLastDigit;

const matchOpen = matchDigit === openDigit;
const matchClose = matchDigit === closeDigit;

const opposite =
  calculationMode === "FOUR_DAYS_OPPOSITE" && day.isFourthDay;

                                                    // First 3 valid days:
                                                    // Show only Open / Close
                                                    if (!day.isFourthDay) {
                                                      if (matchOpen && matchClose) {
                                                        return "Open + Close";
                                                      }

                                                      if (matchOpen) {
                                                        return "Open";
                                                      }

                                                      if (matchClose) {
                                                        return "Close";
                                                      }

                                                      return "";
                                                    }

                                                    // Fourth valid day:
                                                    // Show Open/Close + Direct
                                                    if (matchOpen && matchClose) {
  return opposite ? "Open + Close • Opposite" : "Open + Close";
}

if (matchOpen) {
  return opposite ? "Open • Opposite" : "Open";
}

if (matchClose) {
  return opposite ? "Close • Opposite" : "Close";
}

return "";
                                                  })()}

                                                  {line.skipReason ? ` (${line.skipReason})` : ""}
                                                </Text>
                                              </View>
                                            ))}

                                          <Text style={styles.criteria}>
                                            Matching Criteria:{" "}
                                            {day.matchingCriteria.length
                                              ? day.matchingCriteria
                                                  .map((value) => `C${value}`)
                                                  .join(", ")
                                              : "None"}
                                          </Text>
                                        </View>
                                      ))}

                                      <Text style={styles.common}>
                                        Common Criteria:{" "}
                                        {record.audit.commonCriteria.length
                                          ? record.audit.commonCriteria
                                              .map((value) => `C${value}`)
                                              .join(", ")
                                          : "None"}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  }
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
  }

const styles = StyleSheet.create({
  wrap: { gap: 12 }, empty: { color: "#52616b" }, group: { gap: 10, borderWidth: 1, borderColor: "#d9e2ec", borderRadius: 10, padding: 12 },

rootSection: {
  gap: 8,
  marginBottom: 16,
},

branchList: {
  gap: 8,
},

  branchGroup: {
    marginLeft: 18,
    borderLeftWidth: 3,
    borderLeftColor: "#d9e2ec",
  },

  heading: {
    color: "#102a43",
    fontWeight: "800",
    fontSize: 17,
  },

  headingGreen: {
    color: "#137333",
  },

  headingRed: {
    color: "#c62828",
  },

  headingNeutral: {
    color: "#52616b",
  },

  day: {
    gap: 5,
    borderTopWidth: 1,
    borderTopColor: "#edf2f7",
    paddingTop: 8,
  },

  dayHeading: {
    color: "#243b53",
    fontWeight: "800",
  },
  line: { backgroundColor: "#f8fafc", borderRadius: 7, padding: 8, gap: 2 }, detail: { color: "#52616b", fontSize: 12 }, match: { color: "#137333", fontWeight: "800" }, skip: { color: "#a15c00", fontWeight: "700" },
  criteria: {
    color: "#334e68",
    fontWeight: "700",
    fontSize: 12,
  },

  common: {
    color: "#0d47a1",
    fontWeight: "800",
  },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },

  filterButton: {
    borderWidth: 1,
    borderColor: "#d9e2ec",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
  },

  filterButtonActive: {
    backgroundColor: "#243b53",
    borderColor: "#243b53",
  },

  filterText: {
    color: "#52616b",
    fontWeight: "700",
  },

  filterTextActive: {
    color: "#ffffff",
  },

resultNormal: {
  color: "#137333",
  fontSize: 15,
  fontWeight: "800",
},

resultClose: {
  color: "#d32f2f",
  fontSize: 15,
  fontWeight: "800",
},

resultDirect: {
  color: "#5b21b6",
  fontSize: 15,
  fontWeight: "800",
},
});
