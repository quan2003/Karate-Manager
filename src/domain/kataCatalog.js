export const WKF_KATA_LIST = [
  "001 Anan", "002 Anan Dai", "003 Ananko", "004 Aoyagi", "005 Bassai",
  "006 Bassai Dai", "007 Bassai Sho", "008 Chatanyara Kusanku",
  "009 Chibana No Kushanku", "010 Chinte", "011 Chinto", "012 Enpi",
  "013 Fukyugata Ichi", "014 Fukyugata Ni", "015 Gankaku", "016 Garyu",
  "017 Gekisai (Geksai) 1", "018 Gekisai (Geksai) 2", "019 Gojushiho",
  "020 Gojushiho Dai", "021 Gojushiho Sho", "022 Hakucho", "023 Hangetsu",
  "024 Haufa (Haffa)", "025 Heian Shodan", "026 Heian Nidan",
  "027 Heian Sandan", "028 Heian Yondan", "029 Heian Godan", "030 Heiku",
  "031 Ishimine Bassai", "032 Itosu Rohai Shodan", "033 Itosu Rohai Nidan",
  "034 Itosu Rohai Sandan", "035 Jiin", "036 Jion", "037 Jitte",
  "038 Juroku", "039 Kanchin", "040 Kanku Dai", "041 Kanku Sho",
  "042 Kanshu", "043 Kishimoto No Kushanku", "044 Kousoukun",
  "045 Kousoukun Dai", "046 Kousoukun Sho", "047 Kururunfa", "048 Kusanku",
  "049 Kyan No Chinto", "050 Kyan No Wanshu", "051 Matsukaze",
  "052 Matsumura Bassai", "053 Matsumura Rohai", "054 Meikyo", "055 Myojo",
  "056 Naifanchin Shodan", "057 Naifanchin Nidan", "058 Naifanchin Sandan",
  "059 Naihanchi", "060 Nijushiho", "061 Nipaipo", "062 Niseishi",
  "063 Ohan", "064 Ohan Dai", "065 Oyadomari No Passai", "066 Pachu",
  "067 Paiku", "068 Papuren", "069 Passai", "070 Pinan Shodan",
  "071 Pinan Nidan", "072 Pinan Sandan", "073 Pinan Yondan",
  "074 Pinan Godan", "075 Rohai", "076 Saifa", "077 Sanchin", "078 Sansai",
  "079 Sanseiru", "080 Sanseru", "081 Seichin", "082 Seienchin (Seiyunchin)",
  "083 Seipai", "084 Seiryu", "085 Seishan", "086 Seisan (Sesan)",
  "087 Shiho Kousoukun", "088 Shinpa", "089 Shinsei", "090 Shisochin",
  "091 Sochin", "092 Suparinpei", "093 Tekki Shodan", "094 Tekki Nidan",
  "095 Tekki Sandan", "096 Tensho", "097 Tomari Bassai", "098 Unshu",
  "099 Unsu", "100 Useishi", "101 Wankan", "102 Wanshu",
];

export function normalizeKataList(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(/\r?\n|[,;]/);
  const seen = new Set();
  return source
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter((item) => {
      if (!item) return false;
      const key = item.normalize("NFC").toLocaleLowerCase("vi");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function resolveKataCatalog(settingsOrTournament = {}) {
  const settings = settingsOrTournament?.kataSettings || settingsOrTournament || {};
  const includeWkf = settings.includeWkf !== false;
  const additional = normalizeKataList(
    settings.additionalKatas || settings.customKatas || []
  );
  const wkf = includeWkf ? WKF_KATA_LIST : [];
  const wkfKeys = new Set(wkf.map((item) => item.normalize("NFC").toLocaleLowerCase("vi")));
  const custom = additional.filter(
    (item) => !wkfKeys.has(item.normalize("NFC").toLocaleLowerCase("vi"))
  );
  return {
    includeWkf,
    wkf,
    custom,
    all: [...wkf, ...custom],
  };
}

export function getKataOptions(settingsOrTournament = {}) {
  return resolveKataCatalog(settingsOrTournament).all;
}
