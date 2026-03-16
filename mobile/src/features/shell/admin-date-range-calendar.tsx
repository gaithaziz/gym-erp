import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";

import { fontFamilies } from "@/src/core/theme/fonts";
import { getRowDirection, getTextAlign, isRtl } from "@/src/core/i18n/rtl";

type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AdminDateRangeCalendarProps = {
  visible: boolean;
  locale: "en" | "ar";
  direction: "ltr" | "rtl";
  anchor: AnchorRect | null;
  rangeStart: Date;
  rangeEnd: Date;
  onClose: () => void;
};

type MonthDay = {
  date: Date;
  inMonth: boolean;
};

function normalizeDate(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addMonths(value: Date, delta: number) {
  return new Date(value.getFullYear(), value.getMonth() + delta, 1);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0);
}

function startOfWeek(value: Date) {
  const next = new Date(value);
  next.setDate(next.getDate() - next.getDay());
  return normalizeDate(next);
}

function endOfWeek(value: Date) {
  const next = new Date(value);
  next.setDate(next.getDate() + (6 - next.getDay()));
  return normalizeDate(next);
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function isInRange(day: Date, from: Date, to: Date) {
  const current = normalizeDate(day).getTime();
  return current >= normalizeDate(from).getTime() && current <= normalizeDate(to).getTime();
}

function buildMonthWeeks(month: Date, direction: "ltr" | "rtl") {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const days: Date[] = [];

  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
    days.push(new Date(cursor));
  }

  const weeks: MonthDay[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    const slice = days.slice(index, index + 7).map((date) => ({
      date,
      inMonth: date.getMonth() === month.getMonth(),
    }));

    weeks.push(direction === "rtl" ? slice.reverse() : slice);
  }

  return weeks;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function AdminDateRangeCalendar({
  visible,
  locale,
  direction,
  anchor,
  rangeStart,
  rangeEnd,
  onClose,
}: AdminDateRangeCalendarProps) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [displayMonth, setDisplayMonth] = useState(startOfMonth(rangeStart));
  const monthTitleFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
    [locale],
  );
  const weekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale],
  );
  const today = normalizeDate(new Date());
  const calendarWidth = Math.min(320, viewportWidth - 24);
  const maxHeight = Math.min(620, viewportHeight - 96);
  const overlayPadding = 12;
  const rowDirection = getRowDirection(direction);
  const monthGap = 18;
  const months = [displayMonth, addMonths(displayMonth, 1)];

  useEffect(() => {
    if (visible) {
      setDisplayMonth(startOfMonth(rangeStart));
    }
  }, [rangeStart, visible]);

  const weekdayBase = useMemo(() => {
    const referenceSunday = new Date(2026, 0, 4);
    const labels = Array.from({ length: 7 }, (_, index) => {
      const value = new Date(referenceSunday);
      value.setDate(referenceSunday.getDate() + index);
      const raw = weekdayFormatter.format(value);
      return locale === "ar" ? raw : raw.slice(0, 2);
    });

    return direction === "rtl" ? labels.reverse() : labels;
  }, [direction, locale, weekdayFormatter]);

  const panelLeft = useMemo(() => {
    if (!anchor) {
      return clamp((viewportWidth - calendarWidth) / 2, overlayPadding, viewportWidth - calendarWidth - overlayPadding);
    }

    const preferred = isRtl(direction)
      ? anchor.x + anchor.width - calendarWidth
      : anchor.x;

    return clamp(preferred, overlayPadding, viewportWidth - calendarWidth - overlayPadding);
  }, [anchor, calendarWidth, direction, viewportWidth]);

  const panelTop = useMemo(() => {
    if (!anchor) return 108;

    const preferred = anchor.y + anchor.height + 10;
    return clamp(preferred, 88, viewportHeight - maxHeight - 16);
  }, [anchor, maxHeight, viewportHeight]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(2, 6, 23, 0.42)",
        }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            top: panelTop,
            left: panelLeft,
            width: calendarWidth,
            maxHeight,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "#111820",
            paddingHorizontal: 14,
            paddingVertical: 14,
            shadowColor: "#000000",
            shadowOpacity: 0.42,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 14 },
            elevation: 18,
          }}
        >
          <View
            style={{
              flexDirection: rowDirection,
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <View style={{ flexDirection: rowDirection, alignItems: "center", gap: 6 }}>
              <Pressable
                onPress={() => setDisplayMonth((current) => addMonths(current, -1))}
                style={{
                  height: 34,
                  width: 34,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                }}
              >
                <Feather name={isRtl(direction) ? "chevron-right" : "chevron-left"} size={18} color="#2563eb" />
              </Pressable>
              <Pressable
                onPress={() => setDisplayMonth((current) => addMonths(current, 1))}
                style={{
                  height: 34,
                  width: 34,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                }}
              >
                <Feather name={isRtl(direction) ? "chevron-left" : "chevron-right"} size={18} color="#2563eb" />
              </Pressable>
            </View>
            <Text
              style={{
                color: "#f4ece2",
                fontSize: 12,
                fontFamily: locale === "ar" ? fontFamilies.arabic.regular : fontFamilies.sans.regular,
                textAlign: getTextAlign(direction),
              }}
            >
              {`${monthTitleFormatter.format(months[0])} • ${monthTitleFormatter.format(months[1])}`}
            </Text>
          </View>

          {months.map((month, index) => {
            const weeks = buildMonthWeeks(month, direction);

            return (
              <View key={`${month.getFullYear()}-${month.getMonth()}`} style={{ marginTop: index === 0 ? 0 : monthGap }}>
                <Text
                  style={{
                    color: "#f4ece2",
                    fontSize: 18,
                    lineHeight: 24,
                    marginBottom: 12,
                    textAlign: getTextAlign(direction),
                    fontFamily: locale === "ar" ? fontFamilies.arabic.bold : fontFamilies.serif.bold,
                  }}
                >
                  {monthTitleFormatter.format(month)}
                </Text>

                <View style={{ flexDirection: rowDirection, marginBottom: 8 }}>
                  {weekdayBase.map((label, labelIndex) => (
                    <View key={`${label}-${labelIndex}`} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                      <Text
                        style={{
                          color: "#8fa0b2",
                          fontSize: 11,
                          fontFamily: locale === "ar" ? fontFamilies.arabic.bold : fontFamilies.mono.bold,
                          textAlign: "center",
                        }}
                      >
                        {label}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={{ gap: 0 }}>
                  {weeks.map((week, weekIndex) => (
                    <View key={`${month.getMonth()}-${weekIndex}`} style={{ flexDirection: rowDirection, gap: 0 }}>
                      {week.map(({ date, inMonth }) => {
                        const selected = sameDay(date, rangeStart) || sameDay(date, rangeEnd);
                        const inRange = isInRange(date, rangeStart, rangeEnd);
                        const isToday = sameDay(date, today);
                        const backgroundColor = !inMonth
                          ? "transparent"
                          : selected
                          ? "#ff6b00"
                          : inRange
                            ? "rgba(108, 66, 35, 0.86)"
                            : "transparent";
                        const textColor = selected
                          ? "#16110c"
                          : inRange
                            ? "#23150d"
                            : inMonth
                              ? "#f4ece2"
                              : "transparent";

                        return (
                          <View
                            key={date.toISOString()}
                            style={{
                              flex: 1,
                              height: 34,
                              borderRadius: selected ? 4 : 0,
                              borderWidth: inMonth && !selected && isToday ? 1 : 0,
                              borderColor: "rgba(255, 107, 0, 0.4)",
                              backgroundColor,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Text
                              style={{
                                color: textColor,
                                fontSize: 13,
                                fontFamily: locale === "ar" ? fontFamilies.arabic.bold : fontFamilies.sans.bold,
                                opacity: inMonth ? 1 : 0,
                              }}
                            >
                              {date.getDate()}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
