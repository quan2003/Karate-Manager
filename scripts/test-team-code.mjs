import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { getTeamsFromAthletes } from "../src/utils/teamDraw.js";
import { buildAthleteTemplateWorkbook } from "../src/services/athleteTemplateService.js";

const category = {
  name: "Kumite đồng đội Nữ 18+",
  type: "kumite",
  gender: "female",
  isTeam: true,
  teamConfig: { main: 3, reserve: 1 },
};

function athlete(id, name, teamCode = "") {
  return {
    id,
    name,
    club: "CLB A",
    gender: "female",
    isTeam: true,
    teamCode,
  };
}

test("groups athletes by explicit team code instead of registration order", () => {
  const athletes = [
    athlete("a1", "A1", "2"),
    athlete("a2", "A2", "1"),
    athlete("a3", "A3", "2"),
    athlete("a4", "A4", "1"),
    athlete("a5", "A5", "2"),
    athlete("a6", "A6", "1"),
    athlete("a7", "A7", "1"),
  ];

  const teams = getTeamsFromAthletes(athletes, category, {});

  assert.equal(teams.length, 2);
  assert.equal(teams[0].name, "CLB A - Đội 2");
  assert.deepEqual(teams[0].mainMembers.map((member) => member.name), ["A1", "A3", "A5"]);
  assert.equal(teams[1].name, "CLB A - Đội 1");
  assert.deepEqual(teams[1].mainMembers.map((member) => member.name), ["A2", "A4", "A6"]);
  assert.deepEqual(teams[1].reserveMembers.map((member) => member.name), ["A7"]);
});

test("matches team codes without case or surrounding-space differences", () => {
  const athletes = [
    athlete("a1", "A1", " A "),
    athlete("a2", "A2", "a"),
    athlete("a3", "A3", "A"),
  ];

  const [team] = getTeamsFromAthletes(athletes, category, {});

  assert.equal(team.teamCode, "A");
  assert.equal(team.name, "CLB A - Đội A");
  assert.equal(team.members.length, 3);
});

test("keeps the legacy order-based split when team codes are absent", () => {
  const athletes = Array.from({ length: 7 }, (_, index) =>
    athlete(`a${index + 1}`, `A${index + 1}`)
  );

  const teams = getTeamsFromAthletes(athletes, category, {});

  assert.equal(teams.length, 2);
  assert.deepEqual(teams[0].members.map((member) => member.name), ["A1", "A2", "A3"]);
  assert.deepEqual(teams[1].mainMembers.map((member) => member.name), ["A4", "A5", "A6"]);
  assert.deepEqual(teams[1].reserveMembers.map((member) => member.name), ["A7"]);
});

test("generated registration workbook contains the team-code column and guidance", () => {
  const bytes = buildAthleteTemplateWorkbook({
    events: [category],
    clubName: "CLB A",
  });
  const workbook = XLSX.read(bytes, { type: "array" });
  const inputRows = XLSX.utils.sheet_to_json(workbook.Sheets["Mẫu nhập VĐV"], {
    header: 1,
  });
  const guideRows = XLSX.utils.sheet_to_json(workbook.Sheets["Hướng dẫn"], {
    header: 1,
  });

  assert.deepEqual(inputRows[0].slice(7, 10), ["Đồng đội", "Mã đội", "Hạt giống"]);
  assert.equal(inputRows[1][8], "1");
  assert.ok(guideRows.some((row) => String(row[0] || "").includes("Mã đội")));
});
