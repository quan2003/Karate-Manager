import { getMatchesByRound } from "../../utils/drawEngine";
import "./Bracket.css";

/**
 * Bracket Component - Simple Style
 * Đường nối đơn giản: chỉ có ─ và │
 */

export default function Bracket({
  bracket,
  categoryType = "kumite",
  onMatchClick,
  printMode = false,
}) {
  const isTeamBracket = bracket?.isTeamBracket || false;
  if (!bracket || !bracket.matches) {
    return (
      <div className="bracket-empty">
        <p>Chưa có sơ đồ thi đấu. Vui lòng bốc thăm trước.</p>
      </div>
    );
  }

  const matchesByRound = getMatchesByRound(bracket);
  const rounds = Object.keys(matchesByRound)
    .map(Number)
    .sort((a, b) => a - b);
  // Kích thước cố định
  const CELL_HEIGHT = 24;
  const GAP_BETWEEN_ATHLETES = 50; // Gap giữa 2 VĐV trong 1 trận (từ CSS)
  const MATCH_HEIGHT = CELL_HEIGHT + GAP_BETWEEN_ATHLETES + CELL_HEIGHT; // = 98px
  const BASE_MATCH_GAP = 16; // Khoảng cách giữa các trận ở vòng 1

  return (
    <div
      className={`bracket-container ${printMode ? "print-mode" : ""}`}
      id="bracket-export"
    >
      <div className="bracket-rounds">
        {" "}
        {rounds.map((round, roundIndex) => {
          const matches = matchesByRound[round];
          const isLastRound = roundIndex === rounds.length - 1;

          // Tính toán vị trí để VĐV1 và VĐV2 căn với đường ngang từ vòng trước
          //
          // Cách tính: Mỗi vòng, VĐV căn với đường ngang của vòng liền trước
          //
          // Vòng 1: athleteGap = 50px, topOffset = 0
          //         Line ở y = 49px
          //
          // Tứ kết: căn với line vòng 1
          //         topOffset = 49 - 12 = 37px
          //         athleteGap = 114 - 24 = 90px
          //         Line ở y = 37 + 12 + 90/2 = 37 + 57 = 94px
          //
          // Bán kết: căn với line Tứ kết (y = 94)
          //         topOffset = 94 - 12 = 82px
          //         athleteGap = 228 - 24 = 204px
          //         Line ở y = 82 + 12 + 204/2 = 82 + 114 = 196px
          //
          // Chung kết: căn với line Bán kết (y = 196)
          //         topOffset = 196 - 12 = 184px

          const gapMultiplier = Math.pow(2, roundIndex);
          const CELL_CENTER = CELL_HEIGHT / 2; // = 12px

          // Khoảng cách giữa 2 đường ngang ở vòng 1
          const BASE_LINE_SPACING = MATCH_HEIGHT + BASE_MATCH_GAP; // = 114px

          // lineSpacing cho vòng này
          const lineSpacing = (BASE_LINE_SPACING * gapMultiplier) / 2;

          // athleteGap = lineSpacing - CELL_HEIGHT
          const athleteGap =
            roundIndex === 0 ? GAP_BETWEEN_ATHLETES : lineSpacing - CELL_HEIGHT;

          // Chiều cao thực của match ở vòng này
          const currentMatchHeight = CELL_HEIGHT + athleteGap + CELL_HEIGHT;

          // Khoảng cách giữa các trận trong cùng 1 vòng
          const matchGap =
            BASE_LINE_SPACING * gapMultiplier - currentMatchHeight;

          // TopOffset: tính vị trí đường ngang của vòng trước rồi căn VĐV1 với nó
          // Vòng 1: topOffset = 0
          // Các vòng sau: topOffset = lineY_vòng_trước - 12
          //
          // lineY tích lũy qua các vòng:
          // Vòng 1: lineY = 49
          // Tứ kết: lineY = 37 + 12 + 90/2 = 94 (nhưng thực ra = 49 + 45 = 94)
          // Bán kết: lineY = 82 + 12 + 204/2 = 196
          //
          // Công thức: lineY(n) = lineY(n-1) + (athleteGap(n) - athleteGap(n-1)) / 2
          // Hoặc đơn giản: mỗi vòng, topOffset tăng thêm (lineSpacing_hiện_tại - lineSpacing_trước) / 2          // TopOffset: căn VĐV1 với đường ngang từ vòng trước
          //
          // Cách tính đơn giản hơn:
          // Vị trí đường ngang vòng 1 = 49px
          // Mỗi vòng tiếp theo, đường ngang dịch xuống thêm (athleteGap_mới - athleteGap_cũ) / 2
          //
          // Vòng 1: lineY = 49
          // Tứ kết: athleteGap tăng từ 50 lên 90 (+40), lineY = 49 + 40/2 = 49 + 20 = ... sai
          //
          // Thử cách khác: lineY = topOffset + CELL_CENTER + athleteGap/2
          // Vòng 1: lineY = 0 + 12 + 25 = 37... sai, phải là 49
          //
          // Đúng rồi: lineY = topOffset + CELL_HEIGHT + athleteGap/2
          // Vòng 1: lineY = 0 + 24 + 25 = 49 ✓
          // Tứ kết: topOffset = 37, lineY = 37 + 24 + 45 = 106... không đúng với 94
          //
          // Sai! lineY = topOffset + CELL_CENTER + athleteGap/2
          // Vòng 1: 0 + 12 + 25 = 37...
          // Thực tế lineY vòng 1 = giữa 2 VĐV = 24 + 25 = 49
          //
          // OK: lineY = CELL_HEIGHT + athleteGap/2 (tính từ top của match, không phải topOffset)
          // Nhưng topOffset làm dịch cả match xuống
          // Vậy lineY tuyệt đối = topOffset + CELL_HEIGHT + athleteGap/2

          let topOffset = 0;
          if (roundIndex > 0) {
            // Tính lineY tuyệt đối của vòng trước
            let prevTopOffset = 0;
            let prevAthleteGap = GAP_BETWEEN_ATHLETES;

            for (let i = 1; i < roundIndex; i++) {
              const iGapMultiplier = Math.pow(2, i);
              const iLineSpacing = (BASE_LINE_SPACING * iGapMultiplier) / 2;
              const iAthleteGap = iLineSpacing - CELL_HEIGHT;

              // lineY của vòng (i-1)
              const prevLineY =
                prevTopOffset + CELL_HEIGHT + prevAthleteGap / 2;

              // topOffset của vòng i = prevLineY - CELL_CENTER
              prevTopOffset = prevLineY - CELL_CENTER;
              prevAthleteGap = iAthleteGap;
            }

            // lineY của vòng trước (roundIndex - 1)
            const prevLineY = prevTopOffset + CELL_HEIGHT + prevAthleteGap / 2;

            // topOffset của vòng hiện tại = prevLineY - CELL_CENTER
            topOffset = prevLineY - CELL_CENTER;
          }
          return (
            <div key={round} className="bracket-round">
              {/* Header vòng đấu */}
              <div className="round-header">
                <div className="round-name">
                  {bracket.roundNames[roundIndex] || `Vòng ${round}`}
                </div>
                <div className="round-count">{matches.length} trận</div>
              </div>

              {/* Các trận trong vòng */}
              <div className="round-matches">
                {matches.map((match, matchIndex) => (
                  <div
                    key={match.id}
                    className="match-box"
                    style={{
                      marginTop: matchIndex === 0 ? topOffset : 0,
                      marginBottom: matchGap,
                    }}
                  >
                    {/* VĐV 1 */}
                    <div
                      className={`athlete-slot ${
                        match.winner?.id === match.athlete1?.id ? "winner" : ""
                      }`}
                      onClick={() => onMatchClick && onMatchClick(match)}
                    >
                      <span className="belt-mark aka"></span>
                      {match.athlete1?.country && (
                        <span className="flag">
                          {getFlagEmoji(match.athlete1.country)}
                        </span>
                      )}
                      {isTeamBracket ? (
                        <>
                          <span className="name">
                            {match.athlete1?.name || ""}
                          </span>
                          {match.athlete1?.members && (
                            <span className="club" style={{fontSize: '10px', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px'}} title={match.athlete1.members.map(m => m.name).join(', ')}>
                              ({match.athlete1.members.map(m => m.name.trim().split(/\s+/).pop()).join(', ')})
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="name">{match.athlete1?.name || ""}</span>
                          {match.athlete1?.club && (
                            <span className="club">({match.athlete1.club})</span>
                          )}
                        </>
                      )}
                    </div>{" "}
                    {/* VĐV 2 */}
                    <div
                      className={`athlete-slot athlete-slot-2 ${
                        match.winner?.id === match.athlete2?.id ? "winner" : ""
                      }`}
                      style={{ marginTop: athleteGap }}
                      onClick={() => onMatchClick && onMatchClick(match)}
                    >
                      <span className="belt-mark ao"></span>
                      {match.athlete2?.country && (
                        <span className="flag">
                          {getFlagEmoji(match.athlete2.country)}
                        </span>
                      )}
                      {isTeamBracket ? (
                        <>
                          <span className="name">
                            {match.athlete2?.name || ""}
                          </span>
                          {match.athlete2?.members && (
                            <span className="club" style={{fontSize: '10px', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px'}} title={match.athlete2.members.map(m => m.name).join(', ')}>
                              ({match.athlete2.members.map(m => m.name.trim().split(/\s+/).pop()).join(', ')})
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span className="name">{match.athlete2?.name || ""}</span>
                          {match.athlete2?.club && (
                            <span className="club">({match.athlete2.club})</span>
                          )}
                        </>
                      )}
                    </div>
                    {/* Đường nối: dọc + ngang */}
                    {!isLastRound && (
                      <div
                        className="connector"
                        style={{
                          height: currentMatchHeight,
                          "--line-top": `${CELL_HEIGHT}px`,
                          "--line-height": `${athleteGap}px`,
                          "--line-center": `${CELL_HEIGHT + athleteGap / 2}px`,
                        }}
                      ></div>
                    )}
                    {/* Đường nối đến ô vô địch cho trận chung kết */}
                    {isLastRound && (
                      <div
                        className="connector champion-connector"
                        style={{
                          height: currentMatchHeight,
                          "--line-top": `${CELL_HEIGHT}px`,
                          "--line-height": `${athleteGap}px`,
                          "--line-center": `${CELL_HEIGHT + athleteGap / 2}px`,
                        }}
                      ></div>
                    )}
                    {/* Số trận - hiển thị cho tất cả các trận (bao gồm chung kết) */}
                    {match.matchNumber && (
                      <div
                        className={`match-number ${
                          match.winner ? "completed" : ""
                        } ${isLastRound ? "final-match" : ""}`}
                        style={{
                          "--line-center": `${CELL_HEIGHT + athleteGap / 2}px`,
                        }}
                      >
                        {match.matchNumber}
                      </div>
                    )}
                    {/* Ô VÔ ĐỊCH (HCV) cho trận chung kết */}
                    {isLastRound && (
                      <div
                        className="champion-slot"
                        style={{
                          top: `${
                            CELL_HEIGHT + athleteGap / 2 - CELL_HEIGHT / 2
                          }px`,
                        }}
                      >
                        <span className="champion-icon">🥇</span>
                        <span className="champion-name">
                          {match.winner?.name || ""}
                        </span>
                        {!isTeamBracket && match.winner?.club && (
                          <span className="champion-club">
                            ({match.winner.club})
                          </span>
                        )}
                        {isTeamBracket && match.winner?.members && (
                          <span className="champion-club" style={{fontSize: '10px', color: '#64748b'}}>
                            ({match.winner.members.map(m => m.name.trim().split(/\s+/).pop()).join(', ')})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return "";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
