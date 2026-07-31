const normalizeKata = (value = "") =>
  String(value).normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

export function getKataAgeRule(ageGroup = "") {
  const text = String(ageGroup).replace(/[–—]/g, "-");
  const numbers = [...text.matchAll(/\d+/g)].map((match) => Number(match[0]));
  const minAge = numbers[0];
  const maxAge = numbers[1] ?? minAge;

  if (minAge === 8 && maxAge === 9) return { key: "8-9", maxKatas: 2 };
  if (minAge === 10 && maxAge === 11) return { key: "10-11", maxKatas: 3 };
  if (minAge === 12 && maxAge === 14) return { key: "12-14", maxKatas: 4 };
  if (minAge >= 15) return { key: "15+", maxKatas: 5 };
  return null;
}

export function validateKataRegistration({
  ageGroup,
  kataName,
  previousKatas = [],
  round = 1,
  isFinal = false,
}) {
  const rule = getKataAgeRule(ageGroup);
  const kata = normalizeKata(kataName);
  const history = previousKatas.map(normalizeKata).filter(Boolean);
  if (!kata) return { valid: false, message: "Chưa nhập tên bài quyền." };
  if (!rule) return { valid: true, warning: "Không nhận diện được lứa tuổi để kiểm tra luật bài quyền." };

  const lastKata = history.at(-1);
  if (lastKata === kata) {
    return { valid: false, message: "Không được lặp lại bài vừa trình diễn ở vòng trước." };
  }

  if (rule.key === "8-9") {
    if (round === 2 && history[0] === kata) {
      return { valid: false, message: "Lứa tuổi 8–9: vòng 2 phải dùng bài B, khác bài A ở vòng 1." };
    }
    if (round >= 3 && history.length >= 2) {
      const expectedKata = round % 2 === 1 ? history[0] : history[1];
      if (expectedKata !== kata) {
        return {
          valid: false,
          message: `Lứa tuổi 8–9: vòng ${round} phải dùng lại bài ${round % 2 === 1 ? "A" : "B"}.`,
        };
      }
    }
  }

  if (rule.key === "10-11" && round <= 3 && history.includes(kata)) {
    return { valid: false, message: `Lứa tuổi 10–11: ${round === 2 ? "vòng 2 phải dùng bài B" : "vòng 3 phải dùng bài C"}, khác các vòng trước.` };
  }

  const historyForLimit = isFinal && (rule.key === "12-14" || rule.key === "15+") ? [] : history;
  const repertoire = new Set([...historyForLimit, kata]);
  if (repertoire.size > rule.maxKatas) {
    return { valid: false, message: `Lứa tuổi ${rule.key}: chỉ được đăng ký tối đa ${rule.maxKatas} bài quyền.` };
  }

  if (!isFinal && (rule.key === "12-14" || rule.key === "15+") && history.includes(kata)) {
    return { valid: false, message: `Trước vòng chung kết, lứa tuổi ${rule.key} phải dùng bài chưa trình diễn.` };
  }

  return { valid: true };
}

