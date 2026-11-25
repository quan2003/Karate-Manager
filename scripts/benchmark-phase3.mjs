import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Phase 3 Benchmark Suite for K-SPORT Smart Schedule Pro
 * Tests realistic 72-category / 3-mat Karate tournament across 10s, 30s, 120s, 300s, 600s budgets,
 * multi-seed stability, and strictTargetEndTime feasibility vs infeasibility diagnosis.
 *
 * Usage:
 *   node scripts/benchmark-phase3.mjs --budgets=10,30
 *   node scripts/benchmark-phase3.mjs --budgets=10,30,120,300,600
 */

function buildRealistic72Categories(seed = 1) {
  const categories = [];
  const ages = [
    { label: "lứa tuổi dưới 8", order: 0 },
    { label: "lứa tuổi 9-11", order: 1 },
    { label: "lứa tuổi 12-14", order: 2 },
    { label: "lứa tuổi 15-17", order: 3 },
    { label: "lứa tuổi trên 18", order: 4 },
  ];

  // Deterministic PRNG for reproducible athlete overlaps
  let s = seed * 1337 + 42;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };

  // Pool of 60 multi-event athletes per age group
  let idCounter = 1;
  for (const age of ages) {
    // 4 Kata categories per age group (20 total)
    const kataSpecs = [
      { name: `Kata cá nhân Nam ${age.label}`, gender: "male", eventType: "individual", dur: 15, matches: 5 },
      { name: `Kata cá nhân Nữ ${age.label}`, gender: "female", eventType: "individual", dur: 15, matches: 5 },
      { name: `Kata đồng đội Nam ${age.label}`, gender: "male", eventType: "team", dur: 10, matches: 2 },
      { name: `Kata đồng đội Nữ ${age.label}`, gender: "female", eventType: "team", dur: 10, matches: 2 },
    ];
    for (let k = 0; k < kataSpecs.length; k += 1) {
      const sp = kataSpecs[k];
      const athPoolBase = age.order * 100 + (sp.gender === "male" ? 1 : 50);
      const athletes = [];
      for (let a = 0; a < 4; a += 1) {
        athletes.push(`ATH_${athPoolBase + ((a + Math.floor(rand() * 3)) % 10)}`);
      }
      categories.push({
        id: `cat-${idCounter++}`,
        name: sp.name,
        discipline: "kata",
        gender: sp.gender,
        eventType: sp.eventType,
        matchCount: sp.matches,
        duration: sp.dur,
        athletes,
        phaseGroup: 0,
        ageOrder: age.order,
        intraAgeRank: sp.eventType === "individual" ? 0 : 1,
        priorityRank: categories.length,
        allowedMats: [1, 2, 3],
        preferredMats: [],
        pinned: null,
      });
    }

    // ~10-11 Kumite categories per age group (52 total -> 20 + 52 = 72)
    const kumiteCount = age.order < 2 ? 10 : 11;
    for (let w = 0; w < kumiteCount; w += 1) {
      const gender = w % 2 === 0 ? "male" : "female";
      const isTeam = w >= kumiteCount - 2;
      const dur = isTeam ? 20 : (w % 3 === 0 ? 15 : 10);
      const matches = isTeam ? 3 : (dur === 15 ? 5 : 3);
      const athPoolBase = age.order * 100 + (gender === "male" ? 1 : 50);
      const athletes = [];
      for (let a = 0; a < 4; a += 1) {
        athletes.push(`ATH_${athPoolBase + ((w * 2 + a + Math.floor(rand() * 2)) % 12)}`);
      }
      categories.push({
        id: `cat-${idCounter++}`,
        name: `Kumite ${isTeam ? "đồng đội" : "cá nhân"} ${gender === "male" ? "Nam" : "Nữ"} -${30 + w * 4}kg ${age.label}`,
        discipline: "kumite",
        gender,
        eventType: isTeam ? "team" : "individual",
        matchCount: matches,
        duration: dur,
        athletes,
        phaseGroup: 1,
        ageOrder: age.order,
        intraAgeRank: isTeam ? 1 : 0,
        priorityRank: categories.length,
        allowedMats: [1, 2, 3],
        preferredMats: [],
        pinned: null,
      });
    }
  }

  return categories;
}

function runSolver(payload, timeoutMs) {
  const proc = spawnSync("python", ["license-server/smart_schedule_solver.py"], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (proc.error) {
    throw proc.error;
  }
  if (proc.status !== 0) {
    throw new Error(`Solver exited with ${proc.status}: ${proc.stderr}`);
  }
  return JSON.parse(proc.stdout);
}

function summarizePlan(plan) {
  const v = plan.validation || {};
  return {
    id: plan.id,
    engine: plan.engine || "unknown",
    status: plan.status,
    selectedByBestSelector: Boolean(plan.selectedByBestSelector),
    lexicographicProven: Boolean(plan.lexicographicProven),
    makespanTime: v.makespanTime,
    overtimeMinutes: v.overtimeMinutes,
    completionSpreadMinutes: v.completionSpreadMinutes,
    workloadStdDevMinutes: v.workloadStdDevMinutes,
    totalIdleMinutes: v.totalIdleMinutes,
    athleteMatSwitches: v.athleteMatSwitches,
    athleteOverlaps: v.athleteOverlaps,
    hardViolations: v.hardViolations,
    objectiveValue: plan.objectiveValue,
    bestBound: plan.bestBound,
    gapPercent: plan.gapPercent,
    stages: plan.stages || [],
  };
}

function main() {
  const argBudgets = process.argv.find((a) => a.startsWith("--budgets="));
  const budgets = argBudgets
    ? argBudgets.replace("--budgets=", "").split(",").map((x) => Number(x.trim())).filter((n) => n > 0)
    : [10, 30];

  const categories = buildRealistic72Categories(1);
  const basePayload = {
    categories,
    tournamentDays: ["2026-12-05"],
    matCount: 3,
    sessionConfig: {
      morningStart: "08:00",
      morningEnd: "11:30",
      afternoonStart: "13:30",
      afternoonEnd: "18:00",
      targetEndTime: "16:00",
    },
    customEvents: [],
    minRestMinutes: 20,
    transitionMinutes: 0,
    kataMode: "per_mat_kata_first",
    intraAgeMode: "preferred",
    strictTargetEndTime: false,
    workers: 2,
    multiPlan: true,
    requireCpSat: true,
  };

  console.log("=== K-SPORT SMART SCHEDULE PRO — PHASE 3 BENCHMARK ===");
  console.log(`Dataset: ${categories.length} categories, 3 mats, 1 day (08:00-11:30 / 13:30-18:00, target 16:00)`);

  const budgetResults = [];
  for (const sec of budgets) {
    console.log(`\n--- Running budget: ${sec}s ---`);
    const t0 = Date.now();
    const res = runSolver({ ...basePayload, maxTimeSeconds: sec }, (sec + 45) * 1000);
    const wallMs = Date.now() - t0;
    const greedy = res.greedyBaseline?.validation || {};
    console.log(`Elapsed: ${res.elapsedMs}ms (wall ${wallMs}ms) | Status: ${res.solverStatus} | LowerBound: ${res.lowerBounds?.makespanLowerBoundTime} (total ${res.lowerBounds?.totalDurationMinutes}m / cap ${res.lowerBounds?.totalCapacityToTargetMinutes}m)`);
    console.log(`Greedy: makespan=${greedy.makespanTime}, spread=${greedy.completionSpreadMinutes}m, idle=${greedy.totalIdleMinutes}m, switches=${greedy.athleteMatSwitches}, overlaps=${greedy.athleteOverlaps}`);
    const plans = (res.plans || []).map(summarizePlan);
    for (const p of plans) {
      console.log(`  [${p.id}] ${p.status} (${p.engine}) | makespan=${p.makespanTime}, overtime=${p.overtimeMinutes}m, spread=${p.completionSpreadMinutes}m, idle=${p.totalIdleMinutes}m, switches=${p.athleteMatSwitches}, gap=${p.gapPercent}%`);
    }
    budgetResults.push({
      budgetSeconds: sec,
      elapsedMs: res.elapsedMs,
      wallMs,
      lowerBounds: res.lowerBounds,
      greedy,
      plans,
    });
  }

  console.log("\n--- Multi-Seed Stability (3 seeds @ 10s) ---");
  const seedResults = [];
  for (const seed of [1, 2, 3]) {
    const cats = buildRealistic72Categories(seed);
    const res = runSolver({ ...basePayload, categories: cats, maxTimeSeconds: 10 }, 40000);
    const bal = (res.plans || []).find((p) => p.id === "balanced") || res.plans?.[0];
    const g = res.greedyBaseline?.validation || {};
    console.log(`  Seed ${seed}: Greedy(${g.makespanTime}, sw=${g.athleteMatSwitches}, idle=${g.totalIdleMinutes}m) -> ${bal?.engine} (${bal?.validation?.makespanTime}, sw=${bal?.validation?.athleteMatSwitches}, idle=${bal?.validation?.totalIdleMinutes}m, status=${bal?.status})`);
    seedResults.push({ seed, greedy: g, balanced: bal ? summarizePlan(bal) : null });
  }

  console.log("\n--- Strict Target End Time Tests ---");
  const impossibleRes = runSolver({
    ...basePayload,
    maxTimeSeconds: 10,
    strictTargetEndTime: true,
    sessionConfig: { ...basePayload.sessionConfig, targetEndTime: "10:00" },
  }, 30000);
  console.log(`  Impossible target (10:00): success=${impossibleRes.success}, status=${impossibleRes.solverStatus}, diagnosis=${impossibleRes.diagnosis?.suspectedReasons?.[0] || "N/A"}`);

  const achievableRes = runSolver({
    ...basePayload,
    maxTimeSeconds: 10,
    strictTargetEndTime: true,
    sessionConfig: { ...basePayload.sessionConfig, targetEndTime: "17:30" },
  }, 30000);
  console.log(`  Achievable target (17:30): success=${achievableRes.success}, status=${achievableRes.solverStatus}, balanced makespan=${achievableRes.plans?.[0]?.validation?.makespanTime}`);

  const outDir = path.join(process.cwd(), "scripts");
  const outPath = path.join(outDir, "benchmark-phase3-results.json");
  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    budgetResults,
    seedResults,
    strictTargetTests: {
      impossible1000: { success: impossibleRes.success, solverStatus: impossibleRes.solverStatus, lowerBounds: impossibleRes.lowerBounds, diagnosis: impossibleRes.diagnosis },
      achievable1730: { success: achievableRes.success, solverStatus: achievableRes.solverStatus, balancedMakespan: achievableRes.plans?.[0]?.validation?.makespanTime },
    },
  }, null, 2), "utf8");
  console.log(`\nSaved JSON results to ${outPath}`);
}

main();
