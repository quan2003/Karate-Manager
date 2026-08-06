const DISPLAY_ROLE = "display";

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase();
}

function isDisplayRequest(req, requestUrl) {
  return normalizeRole(req.headers["x-k-sport-role"] || requestUrl.searchParams.get("role")) === DISPLAY_ROLE;
}

function isWriteMethod(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

function createLiveStatusStore() {
  const rows = new Map();
  const keyOf = (tournamentId, tatamiId) => `${String(tournamentId || "")}::${String(tatamiId || "1")}`;

  function upsert(data, now = new Date()) {
    const tournamentId = String(data.tournamentId || "");
    const tatamiId = String(data.matId || "1");
    const key = keyOf(tournamentId, tatamiId);
    const previous = rows.get(key);
    const row = {
      tournament_id: tournamentId,
      tournament_name: String(data.tournamentName || ""),
      mat_id: tatamiId,
      version: (previous?.version || 0) + 1,
      updated_at: now.toISOString(),
      data: {
        current: data.current || null,
        next: data.next || null,
        waitingMatches: Array.isArray(data.waitingMatches) ? data.waitingMatches : [],
        matchCode: data.matchCode || null,
        roundName: data.roundName || null,
      },
    };
    rows.set(key, row);
    return row;
  }

  function list(tournamentId = "") {
    const id = String(tournamentId || "");
    return Array.from(rows.values()).filter((row) => !id || row.tournament_id === id);
  }

  function snapshot(tournamentId = "", now = new Date()) {
    const selected = list(tournamentId);
    return {
      tournamentId: String(tournamentId || selected[0]?.tournament_id || ""),
      serverTime: now.toISOString(),
      tatamis: selected.map((row) => ({
        tatamiId: row.mat_id,
        tatamiName: `Thảm ${row.mat_id}`,
        currentMatch: row.data.current,
        nextMatch: row.data.next,
        waitingMatches: row.data.waitingMatches || [],
        status: row.data.current?.status || (row.data.current ? "IN_PROGRESS" : "WAITING"),
        version: row.version,
        updatedAt: row.updated_at,
        tournamentName: row.tournament_name,
        matchCode: row.data.matchCode,
        roundName: row.data.roundName,
      })),
    };
  }

  return { upsert, list, snapshot, clear: () => rows.clear() };
}

module.exports = { DISPLAY_ROLE, createLiveStatusStore, isDisplayRequest, isWriteMethod };
