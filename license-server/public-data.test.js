const test = require("node:test");
const assert = require("node:assert/strict");
const { createPublicTournamentData } = require("./public-data");

function buildPublicData(schedule, category = {}, summary = {}) {
  return createPublicTournamentData({
    tournamentId: "test-tournament",
    tournamentName: "Giải kiểm thử",
    startDate: "2026-10-31",
    backupData: {
      data: {
        tournaments: [{
          id: "test-tournament",
          categories: [{
            id: "kata-u14",
            name: "Kata cá nhân Nam Dưới 14 tuổi",
            ...category,
            bracket: {
              matches: [{
                id: "match-1",
                athlete1: { name: "Nguyễn Văn A" },
                athlete2: { name: "Trần Văn B" },
              }],
            },
          }],
          schedule: { "kata-u14": schedule },
        }],
      },
    },
    summary,
  });
}

test("public schedule keeps a numeric mat number and uses the Vietnamese label", () => {
  const data = buildPublicData({ date: "2026-10-31", time: "15:00", mat: 2 });
  assert.equal(data.schedule[0].tatami, "Thảm 2");
});

test("public schedule supports legacy category mat fields", () => {
  const data = buildPublicData({ date: "2026-10-31", time: "15:00" }, { matId: 3 });
  assert.equal(data.schedule[0].tatami, "Thảm 3");
});

test("confirmed category medals move matches from schedule to results", () => {
  const data = buildPublicData(
    { date: "2026-10-30", time: "15:00", mat: 1 },
    {},
    { medalists: [{ categoryName: "Kata cá nhân Nam Dưới 14 tuổi", confirmedAt: "2026-10-30T16:00:00Z" }] }
  );
  assert.equal(data.schedule.length, 0);
  assert.equal(data.results.length, 1);
  assert.equal(data.results[0].state, "Đã kết thúc");
});

test("confirmed team medals are published on every team member profile", () => {
  const categoryName = "Kata đồng đội Nam 15 tuổi trở lên";
  const members = [
    { id: "athlete-1", name: "Bùi Duy Mạnh", club: "Xã Lạc Sơn" },
    { id: "athlete-2", name: "Bùi Nguyễn Hoàng Vũ", club: "Xã Lạc Sơn" },
    { id: "athlete-3", name: "Bùi Phát Tài", club: "Xã Lạc Sơn" },
  ];
  const data = createPublicTournamentData({
    tournamentId: "team-tournament",
    tournamentName: "Giải kiểm thử đội",
    startDate: "2026-10-31",
    backupData: {
      data: {
        tournaments: [{
          id: "team-tournament",
          categories: [{
            id: "team-kata",
            name: categoryName,
            type: "kata",
            athletes: members,
            bracket: { matches: [{ athlete1: { isTeam: true, name: "Xã Lạc Sơn - Đội 1", club: "Xã Lạc Sơn", members } }] },
          }],
        }],
      },
    },
    summary: {
      medalists: [{
        categoryId: "team-kata",
        categoryName,
        confirmedAt: "2026-10-31T12:00:00Z",
        gold: "Xã Lạc Sơn - Đội 1",
        goldClub: "Xã Lạc Sơn",
      }],
    },
  });
  assert.equal(data.athletes.filter((athlete) => athlete.publicResult === "Huy chương vàng").length, 3);
  assert.equal(data.ranking.length, 3);
});

test("team medals use saved team codes when a bracket snapshot is unavailable", () => {
  const categoryName = "Kata đồng đội Nam 15 tuổi trở lên";
  const members = [
    { id: "athlete-1", name: "Bùi Duy Mạnh", club: "Xã Lạc Sơn", teamCode: "1" },
    { id: "athlete-2", name: "Bùi Nguyễn Hoàng Vũ", club: "Xã Lạc Sơn", teamCode: "1" },
    { id: "athlete-3", name: "Bùi Phát Tài", club: "Xã Lạc Sơn", teamCode: "1" },
  ];
  const data = createPublicTournamentData({
    tournamentId: "coded-team-tournament",
    tournamentName: "Giải kiểm thử đội có mã",
    startDate: "2026-10-31",
    backupData: { data: { tournaments: [{ id: "coded-team-tournament", categories: [{ id: "team-kata", name: categoryName, type: "kata", athletes: members }] }] } },
    summary: { medalists: [{ categoryId: "team-kata", categoryName, confirmedAt: "2026-10-31T12:00:00Z", silver: "Xã Lạc Sơn - Đội 1", silverClub: "Xã Lạc Sơn" }] },
  });
  assert.equal(data.athletes.filter((athlete) => athlete.publicResult === "Huy chương bạc").length, 3);
});

test("public athlete records keep one profile identity across categories in the same club and tournament", () => {
  const data = createPublicTournamentData({
    tournamentId: "lac-son-2026",
    tournamentName: "Giải vô địch CLB Karate tỉnh Phú Thọ 2026",
    startDate: "2026-10-31",
    backupData: { data: { tournaments: [{
      id: "lac-son-2026",
      categories: [
        { id: "kata-individual", name: "Kata cá nhân Nam 15 tuổi trở lên", athletes: [{ id: "registration-1", name: "Bùi Tuấn Cường", club: "Xã Lạc Sơn", birthYear: 2009, gender: "male" }] },
        { id: "kata-team", name: "Kata đồng đội Nam 15 tuổi trở lên", athletes: [{ id: "registration-2", name: "Bùi Tuấn Cường", club: "Lạc Sơn", birthYear: 2009, gender: "male" }] },
      ],
    }] } },
    summary: {},
  });

  assert.equal(data.athletes.length, 2);
  assert.equal(data.athletes[0].id, data.athletes[1].id);
  assert.equal(data.athletes[0].clubId, data.athletes[1].clubId);
  assert.equal(data.athletes[0].eventSlug, data.athletes[1].eventSlug);
});

test("public athlete profiles merge separate category registration IDs for the same person", () => {
  const data = createPublicTournamentData({
    tournamentId: "lac-son-2026-source-ids",
    tournamentName: "Giải kiểm thử",
    startDate: "2026-10-31",
    backupData: { data: { tournaments: [{
      id: "lac-son-2026-source-ids",
      categories: [
        { id: "kata-individual", name: "Kata cá nhân Nam Dưới 14 tuổi", athletes: [{ id: "entry-individual", athleteId: "source-individual", name: "Bùi Chính Hạo", club: "Xã Lạc Sơn", gender: "Nam" }] },
        { id: "kata-team", name: "Kata đồng đội Nam Dưới 14 tuổi", athletes: [{ id: "entry-team", athleteId: "source-team", name: "Bùi Chính Hạo", club: "Lạc Sơn" }] },
      ],
    }] } },
    summary: {},
  });

  assert.equal(data.athletes.length, 2);
  assert.equal(data.athletes[0].id, data.athletes[1].id);
});

test("a durable K-SPORT profile ID keeps the same public athlete ID across tournaments", () => {
  const create = (tournamentId) => createPublicTournamentData({
    tournamentId,
    tournamentName: "Giải kiểm thử",
    startDate: "2026-10-31",
    backupData: { data: { tournaments: [{
      id: tournamentId,
      categories: [{ id: "kata", name: "Kata cá nhân", athletes: [{ id: `entry-${tournamentId}`, athleteId: `entry-${tournamentId}`, profileId: "f5a73914-27f7-4e47-a310-2ca067d22d1e", name: "Bùi Chính Hạo", club: "Xã Lạc Sơn" }] }],
    }] } },
    summary: {},
  });
  assert.equal(create("event-1").athletes[0].id, create("event-2").athletes[0].id);
});
