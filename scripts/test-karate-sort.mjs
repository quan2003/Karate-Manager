import fs from "node:fs";
import {
  estimateCategoryDuration,
  parseKarateCategory,
  smartAutoAssign,
  sortCategoriesByKarateStandard,
} from "../src/services/scheduleService.js";

const tournament = JSON.parse(fs.readFileSync(0, "utf8"));
const sorted = sortCategoriesByKarateStandard(tournament.categories || []);

sorted.forEach((category, index) => {
  const key = parseKarateCategory(category);
  console.log([
    String(index + 1).padStart(2, "0"),
    `P${key.priority}`,
    `${key.ageMin}-${key.ageMax}`,
    `${key.weightType || "-"} ${key.weightValue ?? "-"}`,
    category.name,
  ].join(" | "));
});

const config = tournament.scheduleConfig || {};
const dates = config.dates?.length
  ? config.dates
  : [tournament.startDate || tournament.date].filter(Boolean);
const schedule = smartAutoAssign(
  tournament.categories || [],
  dates,
  3,
  {
    morningStart: config.morningStart || "07:00",
    morningEnd: config.morningEnd || "11:30",
    afternoonStart: config.afternoonStart || "13:00",
    afternoonEnd: config.afternoonEnd || "17:30",
  },
  config.durations,
  {},
  {
    customEvents: tournament.customEvents || [],
    priorityMode: "karate_standard",
    athleteRestMinutes: config.athleteRestMinutes ?? 15,
  }
);

const totalMinutes = sorted.reduce((sum, category) => sum + estimateCategoryDuration(category, config.durations), 0);
console.log(`DATES ${dates.join(", ")} | TOTAL ${totalMinutes} MAT-MINUTES`);
console.log(`SCHEDULED ${Object.keys(schedule).length}/${sorted.length} ON 3 MATS`);
