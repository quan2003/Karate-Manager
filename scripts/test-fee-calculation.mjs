import assert from "node:assert/strict";
import { calculateClubFeeSummary } from "../src/utils/feeCalculation.js";

const clubs = ["CLB NDK AN KHÊ", "CLB NDK AN KHÊ 2", "NDK AN KHÊ 3", "CLB NDK THANH KHÊ"];
const expected = {
  "CLB NDK AN KHÊ": { individual: 39, individualAthletes: 38, teams: 8, total: 5_760_000 },
  "CLB NDK AN KHÊ 2": { individual: 5, individualAthletes: 3, teams: 0, total: 360_000 },
  "NDK AN KHÊ 3": { individual: 3, individualAthletes: 2, teams: 0, total: 240_000 },
  "CLB NDK THANH KHÊ": { individual: 18, individualAthletes: 16, teams: 3, total: 2_370_000 },
};
const categories = [];
const addIndividual = (id, club, name) => categories.push({ id, name: `Cá nhân ${id}`, athletes: [{ name, club }] });
const addTeam = (id, club, names) => categories.push({ id, name: `Đồng đội ${id}`, isTeam: true, teamConfig: { main: names.length }, athletes: names.map((name) => ({ name, club })) });

for (let index = 0; index < 37; index += 1) addIndividual(`ak-${index}`, clubs[0], `VĐV AK ${index}`);
addIndividual("ak-37", clubs[0], "Nguyễn Ngọc Minh Châu");
addIndividual("ak-38", clubs[0], "Nguyễn Ngọc Minh Châu");
for (let index = 0; index < 8; index += 1) addTeam(`ak-${index}`, clubs[0], [`VĐV AK ${index}`, `VĐV AK ${index + 1}`]);

[["Lê Tú Bảo Hà", "1"], ["Lê Tú Minh Hưng", "2"], ["Lê Tú Bảo Hà", "3"], ["Nguyễn Văn Huy", "4"], ["Nguyễn Văn Huy", "5"]]
  .forEach(([name, id]) => addIndividual(`ak2-${id}`, clubs[1], name));
[["Trần Ngọc Hân", "1"], ["Nguyễn Mậu Hoàng Long", "2"], ["Trần Ngọc Hân", "3"]]
  .forEach(([name, id]) => addIndividual(`ak3-${id}`, clubs[2], name));

for (let index = 0; index < 14; index += 1) addIndividual(`tk-${index}`, clubs[3], `VĐV TK ${index}`);
addIndividual("tk-14", clubs[3], "Trần Nhân Kiệt");
addIndividual("tk-15", clubs[3], "Trần Nhân Kiệt");
addIndividual("tk-16", clubs[3], "Trần Ngọc Minh Tâm");
addIndividual("tk-17", clubs[3], "Trần Ngọc Minh Tâm");
for (let index = 0; index < 3; index += 1) addTeam(`tk-${index}`, clubs[3], [`VĐV TK ${index}`, `VĐV TK ${index + 1}`]);

const summary = calculateClubFeeSummary({ categories, clubs, feeSettings: { individualFee: 120_000, teamFee: 150_000 } });
for (const row of summary) {
  assert.equal(row.individualCount, expected[row.club].individual, `${row.club}: số lượt cá nhân`);
  assert.equal(row.individualAthleteCount, expected[row.club].individualAthletes, `${row.club}: số VĐV cá nhân`);
  assert.equal(row.teamEntries, expected[row.club].teams, `${row.club}: số đội`);
  assert.equal(row.totalFee, expected[row.club].total, `${row.club}: tổng lệ phí`);
}

const surcharge = calculateClubFeeSummary({
  categories: [1, 2, 3].map((id) => ({ id: `event-${id}`, name: `Cá nhân ${id}`, athletes: [{ name: "A", club: "CLB" }] })),
  clubs: ["CLB"],
  feeSettings: { individualFee: 120_000, teamFee: 150_000, enableSurcharge: true, surchargeFee: 50_000 },
})[0];
assert.equal(surcharge.individualCount, 3);
assert.equal(surcharge.individualAthleteCount, 1);
assert.equal(surcharge.extraEventsForSurcharge, 2);
assert.equal(surcharge.totalFee, 220_000);

const multipleTeams = calculateClubFeeSummary({
  categories: [{
    id: "kata-team-female-12-14",
    name: "Kata đồng đội Nữ lứa tuổi 12 - 14 tuổi",
    isTeam: true,
    teamConfig: { main: 3 },
    athletes: [
      ...["LTT 1", "LTT 2", "LTT 3"].map((name) => ({ name, club: "Lý Tự Trọng" })),
      ...["ND 1", "ND 2", "ND 3", "ND 4", "ND 5", "ND 6"].map((name) => ({ name, club: "Nam Dương" })),
    ],
  }],
  clubs: ["Lý Tự Trọng", "Nam Dương"],
  feeSettings: { teamFee: 200_000 },
});
assert.equal(multipleTeams[0].teamEntries, 1, "3 VĐV phải được tính là 1 đội");
assert.equal(multipleTeams[0].teamFeeTotal, 200_000);
assert.equal(multipleTeams[1].teamEntries, 2, "6 VĐV phải được tính là 2 đội");
assert.equal(multipleTeams[1].teamFeeTotal, 400_000);

console.log("Fee calculation regression tests passed.");
