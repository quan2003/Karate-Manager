import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PDF_MANUAL_SLOTS = [
  // Mat 1 (20)
  { mat: 1, time: "08:00", dur: 15, name: "Kata cá nhân Nam lứa tuổi dưới 8" },
  { mat: 1, time: "08:15", dur: 10, name: "Kata cá nhân Nữ lứa tuổi dưới 8" },
  { mat: 1, time: "08:25", dur: 25, name: "Kata cá nhân Nữ lứa tuổi 9–11" },
  { mat: 1, time: "08:50", dur: 10, name: "Kata cá nhân Nam lứa tuổi 12–14" },
  { mat: 1, time: "09:00", dur: 10, name: "Kata đồng đội Nữ lứa tuổi 12–14" },
  { mat: 1, time: "09:10", dur: 7, name: "Kumite cá nhân Nam hạng -30kg lứa tuổi 12–14" },
  { mat: 1, time: "09:20", dur: 7, name: "Kumite cá nhân Nam hạng -35kg lứa tuổi 12–14" },
  { mat: 1, time: "10:00", dur: 14, name: "Kumite cá nhân Nam hạng -40kg lứa tuổi 12–14" },
  { mat: 1, time: "10:15", dur: 25, name: "Kumite cá nhân Nam hạng -45kg lứa tuổi 12–14" },
  { mat: 1, time: "10:40", dur: 28, name: "Kumite cá nhân Nam hạng -50kg lứa tuổi 12–14" },
  { mat: 1, time: "13:30", dur: 21, name: "Kumite cá nhân Nam hạng -55kg lứa tuổi 12–14" },
  { mat: 1, time: "13:55", dur: 28, name: "Kumite cá nhân Nam hạng trên 55kg lứa tuổi 12–14" },
  { mat: 1, time: "14:25", dur: 7, name: "Kumite cá nhân Nữ hạng -36kg lứa tuổi 12–14" },
  { mat: 1, time: "14:35", dur: 18, name: "Kumite cá nhân Nữ hạng -40kg lứa tuổi 12–14" },
  { mat: 1, time: "14:55", dur: 14, name: "Kumite cá nhân Nữ hạng -44kg lứa tuổi 12–14" },
  { mat: 1, time: "15:10", dur: 7, name: "Kumite cá nhân Nữ hạng -48kg lứa tuổi 12–14" },
  { mat: 1, time: "15:20", dur: 7, name: "Kumite cá nhân Nữ hạng -52kg lứa tuổi 12–14" },
  { mat: 1, time: "15:30", dur: 11, name: "Kumite cá nhân Nữ hạng trên 52kg lứa tuổi 12–14" },
  { mat: 1, time: "15:45", dur: 30, name: "Kumite đồng đội Nam lứa tuổi 12–14" },
  { mat: 1, time: "16:15", dur: 18, name: "Kumite đồng đội Nữ lứa tuổi 12–14" },

  // Mat 2 (27)
  { mat: 2, time: "08:00", dur: 10, name: "Kata cá nhân Nam lứa tuổi 15–17" },
  { mat: 2, time: "08:10", dur: 10, name: "Kata cá nhân Nữ lứa tuổi 15–17" },
  { mat: 2, time: "08:20", dur: 10, name: "Kata cá nhân Nam lứa tuổi trên 18" },
  { mat: 2, time: "08:30", dur: 10, name: "Kata cá nhân Nữ lứa tuổi trên 18" },
  { mat: 2, time: "08:40", dur: 12, name: "Kumite cá nhân Nam hạng -20kg lứa tuổi dưới 8" },
  { mat: 2, time: "08:55", dur: 9, name: "Kumite cá nhân Nam hạng -23kg lứa tuổi dưới 8" },
  { mat: 2, time: "09:05", dur: 18, name: "Kumite cá nhân Nam hạng -26kg lứa tuổi dưới 8" },
  { mat: 2, time: "10:00", dur: 9, name: "Kumite cá nhân Nam hạng -29kg lứa tuổi dưới 8" },
  { mat: 2, time: "10:10", dur: 6, name: "Kumite cá nhân Nam hạng -32kg lứa tuổi dưới 8" },
  { mat: 2, time: "10:20", dur: 9, name: "Kumite cá nhân Nam hạng trên 36kg lứa tuổi dưới 8" },
  { mat: 2, time: "10:30", dur: 6, name: "Kumite cá nhân Nữ hạng -23kg lứa tuổi dưới 8" },
  { mat: 2, time: "10:40", dur: 6, name: "Kumite cá nhân Nữ hạng -26kg lứa tuổi dưới 8" },
  { mat: 2, time: "10:50", dur: 6, name: "Kumite cá nhân Nữ hạng -29kg lứa tuổi dưới 8" },
  { mat: 2, time: "11:00", dur: 9, name: "Kumite cá nhân Nữ hạng -32kg lứa tuổi dưới 8" },
  { mat: 2, time: "11:10", dur: 10, name: "Kumite đồng đội Nam lứa tuổi dưới 8" },
  { mat: 2, time: "11:20", dur: 10, name: "Kumite đồng đội Nữ lứa tuổi dưới 8" },
  { mat: 2, time: "13:30", dur: 10, name: "Kumite cá nhân Nam hạng -50kg lứa tuổi trên 18" },
  { mat: 2, time: "13:40", dur: 15, name: "Kumite cá nhân Nam hạng -55kg lứa tuổi trên 18" },
  { mat: 2, time: "13:55", dur: 15, name: "Kumite cá nhân Nam hạng -65kg lứa tuổi trên 18" },
  { mat: 2, time: "14:10", dur: 20, name: "Kumite cá nhân Nam hạng -70kg lứa tuổi trên 18" },
  { mat: 2, time: "14:30", dur: 10, name: "Kumite cá nhân Nam hạng 75kg lứa tuổi trên 18" },
  { mat: 2, time: "14:40", dur: 15, name: "Kumite cá nhân Nam hạng trên 75kg lứa tuổi trên 18" },
  { mat: 2, time: "14:55", dur: 15, name: "Kumite cá nhân Nữ hạng -48kg lứa tuổi trên 18" },
  { mat: 2, time: "15:10", dur: 10, name: "Kumite cá nhân Nữ hạng -52kg lứa tuổi trên 18" },
  { mat: 2, time: "15:20", dur: 10, name: "Kumite cá nhân Nữ hạng -56kg lứa tuổi trên 18" },
  { mat: 2, time: "15:30", dur: 30, name: "Vô địch tuyệt đối Nam" },
  { mat: 2, time: "16:00", dur: 40, name: "Kumite đồng đội Nam lứa tuổi trên 18" },

  // Mat 3 (25)
  { mat: 3, time: "08:00", dur: 6, name: "Kumite cá nhân Nam hạng -28kg lứa tuổi 9–11" },
  { mat: 3, time: "08:10", dur: 18, name: "Kumite cá nhân Nam hạng -32kg lứa tuổi 9–11" },
  { mat: 3, time: "08:30", dur: 27, name: "Kumite cá nhân Nam hạng -36kg lứa tuổi 9–11" },
  { mat: 3, time: "09:00", dur: 18, name: "Kumite cá nhân Nam hạng -40kg lứa tuổi 9–11" },
  { mat: 3, time: "09:20", dur: 9, name: "Kumite cá nhân Nam hạng -44kg lứa tuổi 9–11" },
  { mat: 3, time: "10:00", dur: 21, name: "Kumite cá nhân Nam hạng trên 44kg lứa tuổi 9–11" },
  { mat: 3, time: "10:25", dur: 6, name: "Kumite cá nhân Nữ hạng -28kg lứa tuổi 9–11" },
  { mat: 3, time: "10:35", dur: 12, name: "Kumite cá nhân Nữ hạng -32kg lứa tuổi 9–11" },
  { mat: 3, time: "10:50", dur: 12, name: "Kumite cá nhân Nữ hạng -40kg lứa tuổi 9–11" },
  { mat: 3, time: "11:05", dur: 6, name: "Kumite cá nhân Nữ hạng trên 44kg lứa tuổi 9–11" },
  { mat: 3, time: "11:15", dur: 10, name: "Kumite đồng đội Nam lứa tuổi 9–11" },
  { mat: 3, time: "13:30", dur: 10, name: "Kumite đồng đội Nữ lứa tuổi 9–11" },
  { mat: 3, time: "13:40", dur: 12, name: "Kumite cá nhân Nam hạng -45kg lứa tuổi 15–17" },
  { mat: 3, time: "13:55", dur: 8, name: "Kumite cá nhân Nam hạng -50kg lứa tuổi 15–17" },
  { mat: 3, time: "14:05", dur: 12, name: "Kumite cá nhân Nam hạng -60kg lứa tuổi 15–17" },
  { mat: 3, time: "14:20", dur: 8, name: "Kumite cá nhân Nam hạng -65kg lứa tuổi 15–17" },
  { mat: 3, time: "14:30", dur: 8, name: "Kumite cá nhân Nam hạng trên 65kg lứa tuổi 15–17" },
  { mat: 3, time: "14:40", dur: 12, name: "Kumite cá nhân Nữ hạng -48kg lứa tuổi 15–17" },
  { mat: 3, time: "14:55", dur: 8, name: "Kumite cá nhân Nữ hạng -52kg lứa tuổi 15–17" },
  { mat: 3, time: "15:05", dur: 8, name: "Kumite cá nhân Nữ hạng -56kg lứa tuổi 15–17" },
  { mat: 3, time: "15:15", dur: 8, name: "Kumite cá nhân Nữ hạng trên 56kg lứa tuổi 15–17" },
  { mat: 3, time: "15:25", dur: 16, name: "Kumite đồng đội Nam lứa tuổi 15–17" },
  { mat: 3, time: "15:45", dur: 16, name: "Kumite đồng đội Nữ lứa tuổi 15–17" },
  { mat: 3, time: "16:05", dur: 20, name: "Vô địch tuyệt đối Nữ" },
  { mat: 3, time: "16:25", dur: 20, name: "Kumite đồng đội Nữ lứa tuổi trên 18" },
];

function normName(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function runSolver(payload, timeoutMs) {
  const proc = spawnSync("python", ["license-server/smart_schedule_solver.py"], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (proc.error) throw proc.error;
  if (proc.status !== 0) throw new Error(`Solver exited with ${proc.status}: ${proc.stderr}`);
  return JSON.parse(proc.stdout);
}

function main() {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "phutho-benchmark.json"), "utf8"));
  const catByName = new Map(raw.categories.map((c) => [normName(c.name), c]));

  const manualSchedule = {};
  const pdfCategories = [];
  const matSums = { 1: 0, 2: 0, 3: 0 };

  for (const slot of PDF_MANUAL_SLOTS) {
    const cat = catByName.get(normName(slot.name));
    if (!cat) throw new Error(`Unmatched PDF category: ${slot.name}`);
    matSums[slot.mat] += slot.dur;
    manualSchedule[cat.id] = {
      date: "2026-11-29",
      mat: slot.mat,
      time: slot.time,
      pinned: false,
    };
    pdfCategories.push({
      ...cat,
      duration: slot.dur,
    });
  }

  console.log("=== PHÚ THỌ REAL DATA VERIFICATION ===");
  console.log(`Matched categories: ${pdfCategories.length}/72 | Mat durations: T1=${matSums[1]}m, T2=${matSums[2]}m, T3=${matSums[3]}m, Total=${matSums[1] + matSums[2] + matSums[3]}m`);

  const pdfPayloadBase = {
    categories: pdfCategories,
    tournamentDays: ["2026-11-29"],
    matCount: 3,
    sessionConfig: {
      morningStart: "08:00",
      morningEnd: "11:30",
      afternoonStart: "13:30",
      afternoonEnd: "18:00",
      targetEndTime: "16:00",
    },
    customEvents: [
      { name: "Khai mạc", date: "2026-11-29", time: "09:30", duration: 30, mat: 0 },
      { name: "Nghỉ trưa", date: "2026-11-29", time: "11:30", duration: 120, mat: 0 },
    ],
    manualSchedule,
    minRestMinutes: 15,
    transitionMinutes: 0,
    kataMode: "per_mat_kata_first",
    intraAgeMode: "preferred",
    strictTargetEndTime: false,
    workers: 2,
    multiPlan: true,
    requireCpSat: true,
  };

  console.log("\n=== SUITE A: PDF REAL CONFIG (963m workload, Khai mạc 09:30-10:00, Nghỉ trưa 11:30-13:30, target 16:00) ===");
  const suiteAResults = [];
  for (const sec of [10, 30, 120, 300]) {
    console.log(`\n--- Running ${sec}s ---`);
    const res = runSolver({ ...pdfPayloadBase, maxTimeSeconds: sec }, (sec + 45) * 1000);
    if (sec === 10) {
      console.log("LowerBounds:", JSON.stringify(res.lowerBounds));
      console.log("ManualBaseline:", JSON.stringify(res.manualBaseline?.validation));
      console.log("GreedyBaseline:", JSON.stringify(res.greedyBaseline?.validation));
    }
    for (const p of res.plans || []) {
      const v = p.validation;
      console.log(`  [${p.id}] ${p.status} (${p.engine}) | makespan=${v.makespanTime}, spread=${v.completionSpreadMinutes}m, overtime=${v.overtimeMinutes}m, idle=${v.totalIdleMinutes}m, stdDev=${v.workloadStdDevMinutes}, switches=${v.athleteMatSwitches}, conflicts=${v.athleteOverlaps}, hardViol=${v.hardViolations}`);
    }
    suiteAResults.push({
      budgetSeconds: sec,
      elapsedMs: res.elapsedMs,
      lowerBounds: res.lowerBounds,
      manualBaseline: res.manualBaseline,
      greedyBaseline: res.greedyBaseline,
      plans: res.plans,
    });
  }

  console.log("\n--- Suite A Strict Target 16:00 (strictTargetEndTime=true) ---");
  const strict1600 = runSolver({ ...pdfPayloadBase, strictTargetEndTime: true, maxTimeSeconds: 30 }, 75000);
  console.log(`Strict 16:00: success=${strict1600.success}, status=${strict1600.solverStatus}, plans=${(strict1600.plans || []).map((p) => `${p.id}:${p.validation.makespanTime}`).join(", ")}`);

  console.log("\n=== SUITE B: EXPORTED JSON EXACT CONFIG (1165m workload, 08:00-11:30 / 13:00-17:30) ===");
  const suiteBResults = [];
  for (const sec of [10, 30, 120]) {
    console.log(`\n--- Running ${sec}s ---`);
    const res = runSolver({ ...raw, workers: 2, multiPlan: true, requireCpSat: true, maxTimeSeconds: sec }, (sec + 45) * 1000);
    if (sec === 10) {
      console.log("LowerBounds:", JSON.stringify(res.lowerBounds));
      console.log("GreedyBaseline:", JSON.stringify(res.greedyBaseline?.validation));
    }
    for (const p of res.plans || []) {
      const v = p.validation;
      console.log(`  [${p.id}] ${p.status} (${p.engine}) | makespan=${v.makespanTime}, spread=${v.completionSpreadMinutes}m, overtime=${v.overtimeMinutes}m, idle=${v.totalIdleMinutes}m, stdDev=${v.workloadStdDevMinutes}, switches=${v.athleteMatSwitches}`);
    }
    suiteBResults.push({
      budgetSeconds: sec,
      elapsedMs: res.elapsedMs,
      lowerBounds: res.lowerBounds,
      greedyBaseline: res.greedyBaseline,
      plans: res.plans,
    });
  }

  const outPath = path.join(process.cwd(), "scripts", "benchmark-phutho-results.json");
  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    suiteA_pdfRealConfig: suiteAResults,
    suiteA_strict1600: {
      success: strict1600.success,
      solverStatus: strict1600.solverStatus,
      elapsedMs: strict1600.elapsedMs,
      lowerBounds: strict1600.lowerBounds,
      diagnosis: strict1600.diagnosis || null,
      plans: strict1600.plans || [],
    },
    suiteB_exportedConfig: suiteBResults,
  }, null, 2), "utf8");
  console.log(`\nSaved full Phu Tho benchmark JSON to ${outPath}`);
}

main();

