const LIVE_TIMEOUT_MS = 3000;

function getLanBaseUrl(adminIp, defaultPort = 3000) {
  const value = String(adminIp || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!value) return "";
  return `http://${value.includes(":") ? value : `${value}:${defaultPort}`}`;
}

function requestWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeoutId));
}

export function getCategoryLiveQueue(matchData, currentCategory) {
  if (!matchData?.categories?.length || !currentCategory) return null;

  const schedule = matchData.schedule || {};
  const currentSchedule = schedule[currentCategory.id] || {};
  const matId = String(currentSchedule.mat || 1);
  const scheduledOnMat = matchData.categories
    .filter((category) => String(schedule[category.id]?.mat || 1) === matId)
    .sort((left, right) => {
      const a = schedule[left.id] || {};
      const b = schedule[right.id] || {};
      return String(a.date || "").localeCompare(String(b.date || "")) ||
        String(a.time || "").localeCompare(String(b.time || "")) ||
        Number(a.order || 0) - Number(b.order || 0) ||
        matchData.categories.indexOf(left) - matchData.categories.indexOf(right);
    });

  const currentIndex = scheduledOnMat.findIndex((category) => category.id === currentCategory.id);
  const nextCategory = currentIndex >= 0 ? scheduledOnMat[currentIndex + 1] || null : null;

  return {
    matId,
    current: {
      id: currentCategory.id,
      name: currentCategory.name,
      type: currentCategory.type || "kumite",
      scheduledTime: currentSchedule.time || null,
    },
    next: nextCategory ? {
      id: nextCategory.id,
      name: nextCategory.name,
      type: nextCategory.type || "kumite",
      scheduledTime: schedule[nextCategory.id]?.time || null,
    } : null,
  };
}

export async function publishLiveStatus(adminIp, matchData, currentCategory, extra = {}) {
  const queue = getCategoryLiveQueue(matchData, currentCategory);
  const baseUrl = getLanBaseUrl(adminIp);
  if (!baseUrl || !queue || !matchData?.tournamentId) {
    return { success: false, message: "Thiếu IP máy Admin hoặc dữ liệu nội dung" };
  }

  try {
    const response = await requestWithTimeout(`${baseUrl}/api/live-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: matchData.tournamentId,
        tournamentName: matchData.tournamentName || "",
        sourceId: matchData.exportId || "secretary",
        matId: queue.matId,
        current: queue.current,
        next: queue.next,
        ...extra,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `Máy Admin trả về ${response.status}`);
    return { success: true, matId: queue.matId, data: result.data };
  } catch (error) {
    return {
      success: false,
      error: error.name === "AbortError" ? "timeout" : "connection_error",
      message: error.name === "AbortError" ? "Máy Admin không phản hồi" : error.message,
    };
  }
}