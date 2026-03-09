import { useState, useEffect, useRef } from "react";
import { getMatchesByRound } from "../../utils/drawEngine";
import "./Bracket.css";

/**
 * Bracket Component - Simple Style
 * Đường nối đơn giản: chỉ có ─ và │
 * Hỗ trợ right-click context menu cho VĐV
 */

export default function Bracket({
  bracket,
  categoryType = "kumite",
  onMatchClick,
  onContextAction, // callback: (action, match, athleteSlot) => void
  printMode = false,
}) {
  const isTeamBracket = bracket?.isTeamBracket || false;
  const [contextMenu, setContextMenu] = useState(null); // { x, y, match, athleteSlot }
  const contextMenuRef = useRef(null);

  // Đóng context menu khi click bên ngoài hoặc scroll
  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    window.addEventListener("click", handleClose);
    window.addEventListener("scroll", handleClose, true);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, []);

  const handleContextMenu = (e, match, athleteSlot) => {
    e.preventDefault();
    e.stopPropagation();
    const athlete = athleteSlot === 1 ? match.athlete1 : match.athlete2;
    if (!athlete) return; // Không hiện menu cho ô trống
    if (match.isBye) return; // Không hiện menu cho BYE
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      match,
      athleteSlot,
      athlete,
    });
  };

  const handleAction = (action) => {
    if (contextMenu && onContextAction) {
      onContextAction(action, contextMenu.match, contextMenu.athleteSlot);
    }
    setContextMenu(null);
  };

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

          let topOffset = 0;
          if (roundIndex > 0) {
            let prevTopOffset = 0;
            let prevAthleteGap = GAP_BETWEEN_ATHLETES;

            for (let i = 1; i < roundIndex; i++) {
              const iGapMultiplier = Math.pow(2, i);
              const iLineSpacing = (BASE_LINE_SPACING * iGapMultiplier) / 2;
              const iAthleteGap = iLineSpacing - CELL_HEIGHT;

              const prevLineY =
                prevTopOffset + CELL_HEIGHT + prevAthleteGap / 2;

              prevTopOffset = prevLineY - CELL_CENTER;
              prevAthleteGap = iAthleteGap;
            }

            const prevLineY = prevTopOffset + CELL_HEIGHT + prevAthleteGap / 2;

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
                      } ${match.athlete1?.disqualified ? "disqualified" : ""}`}
                      onClick={() => onMatchClick && onMatchClick(match)}
                      onContextMenu={(e) => handleContextMenu(e, match, 1)}
                    >
                      <span className="belt-mark aka"></span>
                      {match.athlete1?.country && (
                        <span className="flag">
                          {getFlagEmoji(match.athlete1.country)}
                        </span>
                      )}
                      {isTeamBracket ? (
                        <>
                          <span
                            className={`name ${
                              match.athlete1?.disqualified
                                ? "name-disqualified"
                                : ""
                            }`}
                          >
                            {match.athlete1?.name || ""}
                          </span>
                          {match.athlete1?.members && (
                            <span
                              className="club"
                              style={{
                                fontSize: "10px",
                                color: "#475569",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "140px",
                              }}
                              title={match.athlete1.members
                                .map((m) => m.name)
                                .join(", ")}
                            >
                              (
                              {match.athlete1.members
                                .map((m) => m.name.trim().split(/\s+/).pop())
                                .join(", ")}
                              )
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span
                            className={`name ${
                              match.athlete1?.disqualified
                                ? "name-disqualified"
                                : ""
                            }`}
                          >
                            {match.athlete1?.name || ""}
                          </span>
                          {match.athlete1?.club && (
                            <span className="club">
                              ({match.athlete1.club})
                            </span>
                          )}
                        </>
                      )}
                      {match.athlete1?.disqualified && (
                        <span
                          className="dq-badge"
                          title={match.athlete1.disqualifiedReason || "Loại"}
                        >
                          ✕
                        </span>
                      )}
                    </div>{" "}
                    {/* VĐV 2 */}
                    <div
                      className={`athlete-slot athlete-slot-2 ${
                        match.winner?.id === match.athlete2?.id ? "winner" : ""
                      } ${match.athlete2?.disqualified ? "disqualified" : ""}`}
                      style={{ marginTop: athleteGap }}
                      onClick={() => onMatchClick && onMatchClick(match)}
                      onContextMenu={(e) => handleContextMenu(e, match, 2)}
                    >
                      <span className="belt-mark ao"></span>
                      {match.athlete2?.country && (
                        <span className="flag">
                          {getFlagEmoji(match.athlete2.country)}
                        </span>
                      )}
                      {isTeamBracket ? (
                        <>
                          <span
                            className={`name ${
                              match.athlete2?.disqualified
                                ? "name-disqualified"
                                : ""
                            }`}
                          >
                            {match.athlete2?.name || ""}
                          </span>
                          {match.athlete2?.members && (
                            <span
                              className="club"
                              style={{
                                fontSize: "10px",
                                color: "#475569",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "140px",
                              }}
                              title={match.athlete2.members
                                .map((m) => m.name)
                                .join(", ")}
                            >
                              (
                              {match.athlete2.members
                                .map((m) => m.name.trim().split(/\s+/).pop())
                                .join(", ")}
                              )
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <span
                            className={`name ${
                              match.athlete2?.disqualified
                                ? "name-disqualified"
                                : ""
                            }`}
                          >
                            {match.athlete2?.name || ""}
                          </span>
                          {match.athlete2?.club && (
                            <span className="club">
                              ({match.athlete2.club})
                            </span>
                          )}
                        </>
                      )}
                      {match.athlete2?.disqualified && (
                        <span
                          className="dq-badge"
                          title={match.athlete2.disqualifiedReason || "Loại"}
                        >
                          ✕
                        </span>
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
                          <span
                            className="champion-club"
                            style={{ fontSize: "10px", color: "#64748b" }}
                          >
                            (
                            {match.winner.members
                              .map((m) => m.name.trim().split(/\s+/).pop())
                              .join(", ")}
                            )
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

      {/* ===== RIGHT-CLICK CONTEXT MENU ===== */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="bracket-context-menu"
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-header">
            <span className="context-menu-athlete">
              {contextMenu.athlete?.name}
            </span>
            <small className="context-menu-club">
              {contextMenu.athlete?.club || ""}
            </small>
          </div>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item danger"
            onClick={() => handleAction("disqualify")}
          >
            <span className="context-menu-icon">🚫</span>
            <span>Loại (sức khỏe / vi phạm)</span>
          </button>
          <button
            className="context-menu-item success"
            onClick={() => handleAction("set_winner")}
          >
            <span className="context-menu-icon">🏆</span>
            <span>Chọn thắng (auto win)</span>
          </button>
          {contextMenu.match.winner && (
            <>
              <div className="context-menu-divider" />
              <button
                className="context-menu-item warning"
                onClick={() => handleAction("reset_match")}
              >
                <span className="context-menu-icon">↩️</span>
                <span>Reset trận đấu</span>
              </button>
            </>
          )}
        </div>
      )}
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
