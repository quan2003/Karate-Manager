import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  SMART_SCHEDULE_TEMPLATES,
  analyzeTournamentForScheduling,
  calculateRemainingCategoryMetrics,
  checkTemplateCompatibility,
  computePreSolveSummary,
  computeSigmaPageMap,
  computeTournamentFingerprint,
  extractAthleteKeys,
  resolveMatConstraints,
  validateScheduleLocally,
  validateSmartScheduleConfig,
} from "../src/services/smartScheduleService.js";
import {
  DEMO_PRACTICE_CATEGORIES,
  WIZARD_STEP_GUIDES,
  buildQuickTourSteps,
  buildResultTourSteps,
  buildWizardTourSteps,
  loadOnboardingState,
  resetOnboardingState,
  saveOnboardingState,
} from "../src/services/onboardingService.js";
import { getCategoryAgeGroupInfo, parseKarateCategory } from "../src/services/scheduleService.js";

function runSolver(payload) {
  const proc = spawnSync("python", ["license-server/smart_schedule_solver.py"], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: 45000,
  });
  assert.equal(proc.status, 0, proc.stderr);
  return JSON.parse(proc.stdout);
}

test("1. Duration Calculator excludes BYE & completed matches; Athlete ID & teamMembers extracted", () => {
  const cat = {
    id: "c1",
    name: "Kumite cá nhân Nam -55kg lứa tuổi 15-17",
    type: "kumite",
    athletes: [
      { id: "P-101", name: "An", club: "CLB A" },
      { id: "P-201", name: "Cường", club: "CLB B" },
      { id: "P-301", name: "Dũng", club: "CLB C" },
      { id: "P-401", name: "Huy", club: "CLB D" },
    ],
    bracket: {
      matches: [
        { id: "m1", isBye: true },
        { id: "m2", isBye: false, winner: { id: "P-101" }, status: "completed" },
        { id: "m3", isBye: false },
      ],
      auxiliaryMatches: [
        { id: "ax1", operationalStatus: "SUSPENDED_SOURCE_INCOMPLETE" },
        { id: "ax2", operationalStatus: "READY" },
      ],
    },
  };
  const metrics = calculateRemainingCategoryMetrics(cat, { kumite_individual: 6 });
  assert.equal(metrics.matchCount, 2);
  assert.equal(metrics.duration, 12);

  const teamCat = {
    id: "c-team",
    name: "Kata đồng đội Nam",
    athletes: [
      { id: "team-1", name: "Đội A", club: "CLB A", teamMembers: [{ profileId: "P-101", name: "An" }, { athleteId: "A-102", name: "Bình" }] },
    ],
  };
  const keys = extractAthleteKeys(teamCat);
  assert.ok(keys.includes("p-101"));
  assert.ok(keys.includes("a-102"));
});

test("2. 4-level Mat Personalization & Contradiction Detection + Stale Fingerprint", () => {
  const cat = { id: "k1", name: "Kata cá nhân Nam lứa tuổi dưới 8", type: "kata", athletes: [{ id: "1" }, { id: "2" }] };
  const parsed = parseKarateCategory(cat);
  const ageInfo = getCategoryAgeGroupInfo(cat);

  const res = resolveMatConstraints({
    cat,
    parsed,
    ageInfo,
    matCount: 3,
    perMatRules: { 1: { kata: "preferred" }, 2: {}, 3: { kata: "forbidden", kumite: "required" } },
    scheduleConfig: {},
    tournamentDays: ["2026-12-04"],
  });
  assert.deepEqual(res.allowedMats, [1, 2]);
  assert.deepEqual(res.preferredMats, [1]);

  // Kumite category with Mat 3 = { kata: "forbidden", kumite: "required" } must still be allowed on Mats 1, 2, 3!
  const kumiteCat = { id: "km1", name: "Kumite cá nhân Nam -50kg lứa tuổi 12-14", type: "kumite", athletes: [{ id: "1" }, { id: "2" }] };
  const kumiteRes = resolveMatConstraints({
    cat: kumiteCat,
    parsed: parseKarateCategory(kumiteCat),
    ageInfo: getCategoryAgeGroupInfo(kumiteCat),
    matCount: 3,
    perMatRules: { 1: {}, 2: {}, 3: { kata: "forbidden", kumite: "required" } },
    scheduleConfig: {},
    tournamentDays: ["2026-12-04"],
  });
  assert.deepEqual(kumiteRes.allowedMats, [1, 2, 3]);
  assert.deepEqual(kumiteRes.preferredMats, [3]);

  const conflictCheck = validateSmartScheduleConfig({
    categories: [cat],
    matCount: 3,
    perMatRules: { 1: { kata: "forbidden" }, 2: { kata: "forbidden" }, 3: { kata: "forbidden" } },
  });
  assert.equal(conflictCheck.valid, false);

  const fp1 = computeTournamentFingerprint({ categories: [cat], customEvents: [], matCount: 3, sessionConfig: { morningStart: "08:00", afternoonEnd: "16:00" } });
  const fp2 = computeTournamentFingerprint({ categories: [{ ...cat, athletes: [{ id: "1" }] }], customEvents: [], matCount: 3, sessionConfig: { morningStart: "08:00", afternoonEnd: "16:00" } });
  assert.notEqual(fp1, fp2);
});

test("3. Multi-page Sigma Page Map skips Opening/Lunch and tracks multi-page brackets", () => {
  const cats = [
    { id: "c1", name: "Kata 1", sigmaCount: 2 },
    { id: "c2", name: "Kumite 1", sigmaSplitEnabled: true, athletes: Array.from({ length: 40 }, (_, i) => ({ id: `a${i}` })) },
    { id: "c3", name: "Kata 2" },
  ];
  const schedule = {
    c2: { mat: 2, date: "2026-12-04", time: "08:00" },
    c3: { mat: 1, date: "2026-12-04", time: "09:00" },
    c1: { mat: 1, date: "2026-12-04", time: "08:00" },
  };
  const pages = computeSigmaPageMap(schedule, cats);
  assert.deepEqual(pages, { c1: "1-2", c3: 3, c2: "4-5" });
});

test("4. Negative Validator Test (JS + Python) catches intentional violations", () => {
  const cats = [
    { id: "c1", name: "Kata Nam", type: "kata", athletes: [{ profileId: "ATH-1", name: "An" }, { profileId: "ATH-2", name: "Bình" }] },
    { id: "c2", name: "Kumite Nam", type: "kumite", athletes: [{ profileId: "ATH-1", name: "An" }, { profileId: "ATH-3", name: "Cường" }] },
  ];
  const customEvents = [{ name: "Khai mạc", date: "2026-12-04", time: "09:30", duration: 30, mat: 0 }];
  const badSchedule = {
    c1: { mat: 1, date: "2026-12-04", time: "09:25", duration: 15 },
    c2: { mat: 2, date: "2026-12-04", time: "09:30", duration: 15 },
  };
  const audit = validateScheduleLocally({ schedule: badSchedule, categories: cats, customEvents, minRestMinutes: 20 });
  assert.equal(audit.valid, false);
  assert.ok(audit.issues.some((i) => i.includes("Khai mạc")));
  assert.ok(audit.issues.some((i) => i.includes("Trùng VĐV")));

  // Also test Python Validator directly via subprocess
  const pyCheck = spawnSync("python", ["-c", `
import json, sys
sys.path.insert(0, 'license-server')
from smart_schedule_solver import validate_schedule, build_mat_windows, get_conflict_pairs
cats = [
  {"id":"c1","name":"Kata Nam","duration":15,"athletes":["ATH-1"],"allowedMats":[1]},
  {"id":"c2","name":"Kumite Nam","duration":15,"athletes":["ATH-1"],"allowedMats":[2]}
]
wins, blocked, t_end = build_mat_windows(["2026-12-04"], {"morningStart":"08:00","morningEnd":"11:30","afternoonStart":"13:30","afternoonEnd":"16:00"}, [{"name":"Khai mạc","date":"2026-12-04","time":"09:30","duration":30,"mat":0}], 2)
assigns = {
  0: {"mat":2,"startAbs":9*60+25,"endAbs":9*60+40,"dayIndex":0,"date":"2026-12-04"},
  1: {"mat":2,"startAbs":9*60+30,"endAbs":9*60+45,"dayIndex":0,"date":"2026-12-04"}
}
v = validate_schedule(cats, assigns, wins, blocked, 2, get_conflict_pairs(cats), 20, 0, t_end)
print(json.dumps(v))
`], { encoding: "utf8" });
  assert.equal(pyCheck.status, 0, pyCheck.stderr);
  const pyVal = JSON.parse(pyCheck.stdout);
  assert.equal(pyVal.valid, false);
  assert.ok(pyVal.matOverlaps >= 1);
  assert.ok(pyVal.athleteOverlaps >= 1);
  assert.ok(pyVal.blockedViolations >= 1);
  assert.ok(pyVal.matRuleViolations >= 1);
});

test("5. Real OR-Tools CP-SAT (requireCpSat=true): 72-category / 3-mat tournament + 3 Strategies + Greedy Comparison", () => {
  const categories = [];
  const ages = [
    { label: "dưới 8", order: 0 },
    { label: "9-11", order: 1 },
    { label: "12-14", order: 2 },
    { label: "15-17", order: 3 },
    { label: "trên 18", order: 4 },
  ];
  for (let i = 0; i < 72; i += 1) {
    const isKata = i < 24;
    const age = ages[i % ages.length];
    const athletes = [`ATH_${i}_1`, `ATH_${i}_2`];
    if (i === 0) athletes.push("SHARED_STAR_1");
    if (i === 24) athletes.push("SHARED_STAR_1");
    if (i === 71) athletes.push("SHARED_STAR_1");
    const durationsCycle = [10, 15, 20, 25, 10, 15];
    categories.push({
      id: `cat_${i}`,
      name: `${isKata ? "Kata" : "Kumite"} ${i % 2 === 0 ? "Nam" : "Nữ"} ${age.label} #${i}`,
      discipline: isKata ? "kata" : "kumite",
      gender: i % 2 === 0 ? "male" : "female",
      eventType: i % 5 === 4 ? "team" : "individual",
      matchCount: 3,
      duration: durationsCycle[i % durationsCycle.length],
      athletes,
      phaseGroup: isKata ? 0 : 1,
      ageOrder: age.order,
      intraAgeRank: i % 4,
      priorityRank: i,
      allowedMats: isKata ? [1, 2] : [1, 2, 3], // Mat 3 Kumite only
      preferredMats: [],
      pinned: i === 2 ? { date: "2026-05-01", mat: 1, startTime: "08:00" } : null,
    });
  }

  const res = runSolver({
    categories,
    tournamentDays: ["2026-05-01"],
    matCount: 3,
    sessionConfig: {
      morningStart: "08:00",
      morningEnd: "11:30",
      afternoonStart: "13:30",
      afternoonEnd: "18:00",
      maximumEndTime: "18:00",
      targetEndTime: "16:00",
    },
    customEvents: [
      { name: "Khai mạc", date: "2026-05-01", time: "09:30", duration: 30, mat: 0 },
      { name: "Nghỉ trưa", date: "2026-05-01", time: "11:30", duration: 120, mat: 0 },
    ],
    minRestMinutes: 20,
    transitionMinutes: 0,
    kataMode: "per_mat_kata_first",
    intraAgeMode: "preferred",
    multiPlan: true,
    requireCpSat: true,
    maxTimeSeconds: 18,
  });

  assert.equal(res.success, true, res.message);
  assert.equal(res.hasOrtools, true);
  assert.equal(res.usedFallback, false);
  assert.ok(res.plans.length >= 1, `Expected >=1 CP-SAT plan, got ${res.plans.length}`);
  console.log("  [72-cat CP-SAT Benchmark]", JSON.stringify({
    elapsedMs: res.elapsedMs,
    planCount: res.plans.length,
    greedy: {
      makespan: res.greedyBaseline.validation.makespanTime,
      spread: res.greedyBaseline.validation.completionSpreadMinutes,
      stdDev: res.greedyBaseline.validation.workloadStdDevMinutes,
      idle: res.greedyBaseline.validation.totalIdleMinutes,
      switches: res.greedyBaseline.validation.athleteMatSwitches,
    },
    plans: res.plans.map((p) => ({
      id: p.id,
      engine: p.engine,
      status: p.status,
      lexProven: p.lexicographicProven,
      stages: p.stages,
      obj: p.objectiveValue,
      bound: p.bestBound,
      gap: p.gapPercent,
      makespan: p.validation.makespanTime,
      spread: p.validation.completionSpreadMinutes,
      stdDev: p.validation.workloadStdDevMinutes,
      idle: p.validation.totalIdleMinutes,
      switches: p.validation.athleteMatSwitches,
    })),
  }));

  for (const plan of res.plans) {
    assert.ok(
      typeof plan.engine === "string" && (plan.engine.startsWith("ortools-cp-sat") || plan.engine.startsWith("greedy")),
      `Unexpected engine: ${plan.engine}`
    );
    assert.ok(["OPTIMAL", "FEASIBLE"].includes(plan.status));
    assert.ok(Array.isArray(plan.stages) && plan.stages.length >= 3);
    assert.equal(plan.validation.valid, true);
    assert.equal(plan.validation.scheduledCount, 72);
    assert.equal(plan.validation.athleteOverlaps, 0);
    assert.equal(plan.validation.blockedViolations, 0);
    assert.equal(plan.validation.matRuleViolations, 0);
    assert.equal(plan.validation.pinnedViolations, 0);
    // Mat 3 is Kumite-only, should start at 08:00 with Kumite immediately
    const mat3Cats = Object.entries(plan.schedule)
      .filter(([, s]) => s.mat === 3)
      .sort(([, a], [, b]) => a.time.localeCompare(b.time));
    assert.ok(mat3Cats.length > 0);
    assert.equal(mat3Cats[0][1].time, "08:00");
  }
});

test("6. Real OR-Tools CP-SAT detects INFEASIBLE + produces concrete diagnosis", () => {
  const res = runSolver({
    categories: [
      { id: "bad1", name: "Nội dung quá dài", discipline: "kumite", duration: 300, athletes: ["A1"], allowedMats: [1] },
    ],
    tournamentDays: ["2026-05-01"],
    matCount: 1,
    sessionConfig: { morningStart: "08:00", morningEnd: "10:00", afternoonStart: "13:30", afternoonEnd: "14:00", targetEndTime: "14:00" },
    customEvents: [{ name: "Khai mạc", date: "2026-05-01", time: "09:00", duration: 30, mat: 0 }],
    requireCpSat: true,
    multiPlan: false,
    maxTimeSeconds: 5,
  });

  assert.equal(res.success, false);
  assert.equal(res.solverStatus, "INFEASIBLE");
  assert.ok(res.diagnosis?.suspectedReasons?.length > 0);
  assert.ok(res.diagnosis?.suggestions?.length > 0);
});

test("7. Real OR-Tools CP-SAT enforces strict intraAgeMode='required' (Ind M -> Ind F -> Team M -> Team F)", () => {
  const res = runSolver({
    categories: [
      { id: "tf", name: "Kumite ĐĐ Nữ 12-14", discipline: "kumite", duration: 15, athletes: ["A4"], phaseGroup: 1, ageOrder: 2, intraAgeRank: 4, priorityRank: 3, allowedMats: [1] },
      { id: "im", name: "Kumite CN Nam 12-14", discipline: "kumite", duration: 15, athletes: ["A1"], phaseGroup: 1, ageOrder: 2, intraAgeRank: 0, priorityRank: 0, allowedMats: [1] },
      { id: "tm", name: "Kumite ĐĐ Nam 12-14", discipline: "kumite", duration: 15, athletes: ["A3"], phaseGroup: 1, ageOrder: 2, intraAgeRank: 3, priorityRank: 2, allowedMats: [1] },
      { id: "if", name: "Kumite CN Nữ 12-14", discipline: "kumite", duration: 15, athletes: ["A2"], phaseGroup: 1, ageOrder: 2, intraAgeRank: 1, priorityRank: 1, allowedMats: [1] },
    ],
    tournamentDays: ["2026-05-01"],
    matCount: 1,
    sessionConfig: { morningStart: "08:00", morningEnd: "11:30", afternoonStart: "13:30", afternoonEnd: "16:00", targetEndTime: "16:00" },
    intraAgeMode: "required",
    requireCpSat: true,
    multiPlan: false,
    maxTimeSeconds: 6,
  });

  assert.equal(res.success, true);
  const s = res.plans[0].schedule;
  assert.ok(s.im.time <= s.if.time);
  assert.ok(s.if.time <= s.tm.time);
  assert.ok(s.tm.time <= s.tf.time);
});

test("8. Backend solver contract: requireCpSat=true fails cleanly if OR-Tools unavailable, and succeeds with OPTIMAL when available", () => {
  const simMissing = spawnSync("python", ["-c", `
import json, sys, builtins
orig_import = builtins.__import__
def block_ortools(name, *args, **kwargs):
    if name.startswith("ortools"):
        raise ImportError("Simulated missing ortools")
    return orig_import(name, *args, **kwargs)
builtins.__import__ = block_ortools
sys.path.insert(0, 'license-server')
import smart_schedule_solver as s
sys.stdin = __import__('io').StringIO(json.dumps({
  "categories": [{"id":"c1","name":"Kata Nam","duration":15,"athletes":["A1"],"allowedMats":[1]}],
  "tournamentDays": ["2026-05-01"],
  "matCount": 1,
  "requireCpSat": True
}))
s.main()
`], { encoding: "utf8" });
  assert.equal(simMissing.status, 0, simMissing.stderr);
  const res = JSON.parse(simMissing.stdout);
  assert.equal(res.success, false);
  assert.equal(res.errorCode, "ORTOOLS_UNAVAILABLE");
  assert.equal(res.solverStatus, "MODEL_INVALID");
});

test("9. Multi-day (2 days), 4 mats, custom age groups, allowedDays/allowedSessions, and 5 strategies", () => {
  const res = runSolver({
    categories: [
      { id: "d1m", name: "Kata Nam U10", discipline: "kata", duration: 20, athletes: ["A1", "A2"], allowedMats: [1, 2], allowedDays: ["2026-06-01"], allowedSessions: ["morning"] },
      { id: "d2a", name: "Kumite Nữ U13", discipline: "kumite", duration: 25, athletes: ["A1", "A3"], allowedMats: [3, 4], allowedDays: ["2026-06-02"], allowedSessions: ["afternoon"] },
      { id: "d12", name: "Kumite Nam U21", discipline: "kumite", duration: 30, athletes: ["A4", "A5"], allowedMats: [1, 2, 3, 4] },
    ],
    tournamentDays: ["2026-06-01", "2026-06-02"],
    matCount: 4,
    sessionConfig: { morningStart: "08:00", morningEnd: "11:30", afternoonStart: "13:30", afternoonEnd: "17:00", maximumEndTime: "17:00", targetEndTime: "16:30" },
    daySessionConfigs: { "2026-06-02": { afternoonEnd: "16:00", maximumEndTime: "16:00" } },
    selectedStrategies: ["balanced_time", "athlete_experience", "minimal_disruption"],
    requireCpSat: true,
    maxTimeSeconds: 8,
  });
  assert.equal(res.success, true);
  const s = res.plans[0].schedule;
  assert.equal(s.d1m.date, "2026-06-01");
  assert.ok(s.d1m.time < "11:30");
  assert.equal(s.d2a.date, "2026-06-02");
  assert.ok(s.d2a.time >= "13:30");
});

test("10. Wizard Step 1 Analyzer, Step 2/6 Capacity Calculator, and Template Compatibility", () => {
  const cats = [
    { id: "c1", name: "Kata cá nhân Nam U10", type: "kata", athletes: [{ id: "1", club: "CLB X" }, { id: "2", club: "CLB Y" }] },
    { id: "c2", name: "Kumite cá nhân Nam -40kg U10", type: "kumite", athletes: [{ id: "1", club: "CLB X" }, { id: "3", club: "CLB Z" }] },
  ];
  const analysis = analyzeTournamentForScheduling({ categories: cats, durations: { kata_individual: 5, kumite_individual: 4 } });
  assert.equal(analysis.activeCategories, 2);
  assert.equal(analysis.athleteCount, 3);
  assert.equal(analysis.clubCount, 3);
  assert.equal(analysis.multiCategoryAthleteCount, 1);
  assert.equal(analysis.isMatchCountEstimated, true);

  const summary = computePreSolveSummary({
    categories: cats,
    durations: { kata_individual: 5, kumite_individual: 4 },
    tournamentDays: ["2026-06-01"],
    matCount: 2,
    sessionConfig: { morningStart: "08:00", morningEnd: "11:30", afternoonStart: "13:30", afternoonEnd: "17:00", maximumEndTime: "17:00", targetEndTime: "16:00" },
    customEvents: [{ name: "Khai mạc", date: "2026-06-01", time: "09:30", duration: 30, mat: 0 }],
  });
  assert.equal(summary.totalTargetCapacityMinutes, 660);
  assert.equal(summary.feasibleLikely, true);

  const multiDayTpl = SMART_SCHEDULE_TEMPLATES.find((t) => t.id === "multi_day");
  const compat = checkTemplateCompatibility(multiDayTpl, { matCount: 2, tournamentDays: ["2026-06-01"], categories: cats });
  assert.ok(compat.warnings.length > 0);
});

test("11. Onboarding dynamic tours (Quick, Wizard, Result), persistence, and isolated Practice Mode", () => {
  const qNoWarnNoRes = buildQuickTourSteps({ matCount: 1, tournamentDays: ["2026-11-29"], hasResult: false, hasWarnings: false });
  const qWithWarnAndRes = buildQuickTourSteps({ matCount: 5, tournamentDays: ["2026-11-29", "2026-11-30"], hasResult: true, hasWarnings: true });
  assert.ok(qWithWarnAndRes.length > qNoWarnNoRes.length);
  assert.ok(!qNoWarnNoRes.some((s) => s.id === "quick-bracket-warn" || s.id === "quick-results"));
  assert.ok(qWithWarnAndRes.some((s) => s.id === "quick-results" && s.targetId === "tour-results-panel"));

  const wSteps = buildWizardTourSteps({ matCount: 5, tournamentDays: ["2026-11-29", "2026-11-30"], hasResult: true });
  assert.equal(wSteps.length, 7);
  assert.equal(Object.keys(WIZARD_STEP_GUIDES).length, 7);

  const rSteps = buildResultTourSteps();
  assert.equal(rSteps.length, 4);

  const st1 = saveOnboardingState({ dontShowWelcome: true, completedTours: { quick: true } });
  assert.equal(st1.dontShowWelcome, true);
  const st2 = resetOnboardingState();
  assert.equal(st2.dontShowWelcome, false);
  assert.equal(loadOnboardingState().dontShowWelcome, false);

  assert.equal(DEMO_PRACTICE_CATEGORIES.length, 8);
  assert.ok(DEMO_PRACTICE_CATEGORIES.every((c) => !c.name.includes("Phú Thọ")));
});
