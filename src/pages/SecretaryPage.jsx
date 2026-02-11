import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRole, ROLES } from '../context/RoleContext';
import { openKmatchFile, exportResultsToJson, exportResultsToExcel } from '../services/matchService';
import { openScoreboard, listenForMatchResult } from '../services/scoreboardService';
import { updateMatchResult as updateBracketWithResult } from '../utils/drawEngine';
import Bracket from '../components/Bracket/Bracket';
import './SecretaryPage.css';

/**
 * SecretaryPage - Trang bấm điểm cho Thư ký
 */
function SecretaryPage() {
  const navigate = useNavigate();
  const {
    role,
    matchData,
    matchResults,
    scoringEnabled,
    canScore,
    loadMatchData,
    updateMatchResult,
    getMatchResult,
    getMatchExportData,
    resetRole
  } = useRole();

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState('');

  // Redirect if not Secretary
  useEffect(() => {
    if (role !== ROLES.SECRETARY) {
      navigate('/');
    }
  }, [role, navigate]);

  // Helper to find match by ID (for winner determination)
  const getMatchById = (matchId) => {
    if (!matchData?.categories) return null;
    for (const cat of matchData.categories) {
      const match = cat.matches?.find(m => m.id === matchId);
      if (match) return match;
    }
    return null;
  };

  // Listen for match results from scoreboard
  useEffect(() => {
    const handleMatchResult = (result) => {
      console.log('Received match result:', result);
      
      // Update result in context
      const updateStatus = updateMatchResult(result.matchId, {
        score1: result.score1,
        score2: result.score2,
        winner: result.winnerId ? (result.winnerId === (getMatchById(result.matchId)?.athlete1?.id || 'athlete1') ? 'athlete1' : 'athlete2') : null, 
        ...result
      });

      if (updateStatus.success) {
        setNotification(`✅ Đã cập nhật kết quả trận đấu!`);
        setTimeout(() => setNotification(''), 3000);
      } else {
        setError(`Lỗi cập nhật kết quả: ${updateStatus.error}`);
      }
    };

    // listenForMatchResult returns a cleanup function
    const cleanup = listenForMatchResult(handleMatchResult);

    return () => {
      cleanup();
    };
  }, [updateMatchResult]);

  // Open .kmatch file
  const handleOpenFile = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await openKmatchFile();
      if (result.success) {
        loadMatchData(result.data);
      } else {
        setError(result.error || 'Không thể đọc file');
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  // Prepare bracket with live scores
  const bracketWithScores = useMemo(() => {
    if (!selectedCategory?.bracket) return null;
    
    // Deep clone bracket to allow mutation by the engine helper
    const clonedBracket = JSON.parse(JSON.stringify(selectedCategory.bracket));
    
    // Apply all local results to the cloned bracket
    // This ensures winners are advanced to next rounds automatically
    matchResults.forEach(result => {
        updateBracketWithResult(
            clonedBracket, 
            result.matchId, 
            result.score1, 
            result.score2, 
            result.winnerId
        );
    });

    return clonedBracket;
  }, [selectedCategory, matchResults]);

  // Select a match to score - opens the external scoreboard
  const handleSelectMatch = (match) => {
    if (!canScore) {
      setError('Chức năng bấm điểm chưa được bật');
      return;
    }

    // Only allow if match has athletes (at least one for bye handling, or both for fight)
    if (!match.athlete1 && !match.athlete2) return;

    if (!selectedCategory) return;
    
    // Determine round name
    const roundName = selectedCategory.bracket?.roundNames?.[match.round - 1] || `Round ${match.round}`;

    try {
      openScoreboard(
        match,
        selectedCategory.type || 'kumite',
        selectedCategory.name,
        matchData.tournamentName,
        roundName
      );
      setNotification('📺 Đã mở bảng điểm. Vui lòng thao tác trên cửa sổ mới.');
      setTimeout(() => setNotification(''), 5000);
    } catch (err) {
      setError('Không thể mở bảng điểm: ' + err.message);
    }
  };

  // Export results
  const handleExport = async (format) => {
    const data = getMatchExportData();
    try {
      if (format === 'json') {
        await exportResultsToJson(data);
      } else {
        await exportResultsToExcel(data);
      }
    } catch (err) {
      setError('Lỗi khi xuất file: ' + err.message);
    }
  };

  // Back to role select
  const handleBack = () => {
    resetRole();
    navigate('/');
  };

  if (role !== ROLES.SECRETARY) return null;

  return (
    <div className="secretary-page">
      <div className="secretary-container">
        <header className="secretary-header">
          <div className="header-left">
            <button className="back-btn" onClick={handleBack}>
              ← Đổi vai trò
            </button>
            <h1>🎯 Thư Ký</h1>
          </div>
          <div className="header-right">
            {!matchData && (
              <button 
                className="open-file-btn" 
                onClick={handleOpenFile}
                disabled={loading}
              >
                {loading ? '⏳ Đang tải...' : '📂 Mở file .kmatch'}
              </button>
            )}
            {matchData && (
              <button 
                className="open-file-btn small" 
                onClick={handleOpenFile}
              >
                🔄 Đổi file
              </button>
            )}
          </div>
        </header>

        {error && <div className="error-message">{error}</div>}
        {notification && <div className="notification-toast">{notification}</div>}

        {!matchData ? (
          <div className="no-file-section">
            <div className="no-file-icon">📂</div>
            <h2>Chưa có file giải đấu</h2>
            <p>Mở file .kmatch từ Admin để bắt đầu bấm điểm</p>
            <button className="open-file-btn" onClick={handleOpenFile}>
              Mở file .kmatch
            </button>
          </div>
        ) : (
          <>
            {/* Status Banner */}
            <div className={`status-banner ${scoringEnabled ? 'enabled' : 'disabled'}`}>
              <div className="status-info">
                <span className="status-icon">{scoringEnabled ? '🟢' : '🔴'}</span>
                <span className="status-text">
                  {scoringEnabled ? 'Bấm điểm đang được bật' : 'Bấm điểm đang TẮT'}
                </span>
              </div>
              <div className="tournament-info">
                <strong>{matchData.tournamentName}</strong>
                <span>{matchData.location}</span>
              </div>
            </div>

            <div className="secretary-content">
              {/* Categories Sidebar */}
              <div className="categories-sidebar">
                <h3>Hạng mục thi đấu</h3>
                <div className="categories-list">
                  {matchData.categories?.map(cat => (
                    <button
                      key={cat.id}
                      className={`category-btn ${selectedCategory?.id === cat.id ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat.name}
                      <span className="match-count">
                        {cat.matches?.length || 0} trận
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Bracket View */}
              <div className="bracket-view-area">
                {selectedCategory ? (
                  <>
               <div className="bracket-header-info">
                        <h2>{selectedCategory.name}</h2>
                        <div className="bracket-stats">
                          <span>{selectedCategory.bracket?.matches?.filter(m => !m.isBye).length || 0} trận đấu</span>
                        </div>
                     </div>
                     
                     {/* Bracket + Medal Table */}
                     <div className="secretary-bracket-medal-wrapper">
                        {/* Bracket Component */}
                        <div className="secretary-bracket-wrapper">
                          <Bracket 
                            bracket={bracketWithScores} 
                            categoryType={selectedCategory.type} 
                            onMatchClick={handleSelectMatch}
                          />
                        </div>

                        {/* Medal Table */}
                        {bracketWithScores && (() => {
                          const finalMatch = bracketWithScores.matches?.find(
                            m => m.round === bracketWithScores.numRounds
                          );
                          const champion = finalMatch?.winner;
                          
                          const getLoser = (match) => {
                            if (!match?.winner) return null;
                            if (match.athlete1?.id === match.winner.id) return match.athlete2;
                            if (match.athlete2?.id === match.winner.id) return match.athlete1;
                            return null;
                          };
                          
                          const silverMedalist = getLoser(finalMatch);
                          const semiFinalRound = bracketWithScores.numRounds - 1;
                          const semiFinalMatches = bracketWithScores.matches?.filter(
                            m => m.round === semiFinalRound && !m.isBye
                          ) || [];
                          const bronzeMedalists = semiFinalMatches
                            .map(m => getLoser(m))
                            .filter(a => a !== null);

                          return (
                            <div className="secretary-medal-table-container">
                              <table className="secretary-medal-table">
                                <thead>
                                  <tr>
                                    <th>🏆 KẾT QUẢ</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="medal-row medal-gold">
                                    <td>
                                      <span className="medal-icon-sm">🥇</span>
                                      <span className="medal-info">
                                        {champion ? (
                                          <>
                                            <span className="medal-name">{champion.name}</span>
                                            {champion.club && (
                                              <span className="medal-club-sm">{champion.club}</span>
                                            )}
                                          </>
                                        ) : '-'}
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="medal-row medal-silver">
                                    <td>
                                      <span className="medal-icon-sm">🥈</span>
                                      <span className="medal-info">
                                        {silverMedalist ? (
                                          <>
                                            <span className="medal-name">{silverMedalist.name}</span>
                                            {silverMedalist.club && (
                                              <span className="medal-club-sm">{silverMedalist.club}</span>
                                            )}
                                          </>
                                        ) : '-'}
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="medal-row medal-bronze">
                                    <td>
                                      <span className="medal-icon-sm">🥉</span>
                                      <span className="medal-info">
                                        {bronzeMedalists[0] ? (
                                          <>
                                            <span className="medal-name">{bronzeMedalists[0].name}</span>
                                            {bronzeMedalists[0].club && (
                                              <span className="medal-club-sm">{bronzeMedalists[0].club}</span>
                                            )}
                                          </>
                                        ) : '-'}
                                      </span>
                                    </td>
                                  </tr>
                                  <tr className="medal-row medal-bronze">
                                    <td>
                                      <span className="medal-icon-sm">🥉</span>
                                      <span className="medal-info">
                                        {bronzeMedalists[1] ? (
                                          <>
                                            <span className="medal-name">{bronzeMedalists[1].name}</span>
                                            {bronzeMedalists[1].club && (
                                              <span className="medal-club-sm">{bronzeMedalists[1].club}</span>
                                            )}
                                          </>
                                        ) : '-'}
                                      </span>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                     </div>
                  </>
                ) : (
                  <div className="select-category-hint">
                    <p>⬅️ Chọn một hạng mục để xem sơ đồ và bấm điểm</p>
                  </div>
                )}
              </div>
            </div>

            {/* Export Footer */}
            <div className="export-section">
              <div className="export-info">
                Đã lưu kết quả: <strong>{matchResults.length}</strong> trận
              </div>
              <div className="export-buttons">
                <button 
                  className="export-btn json"
                  onClick={() => handleExport('json')}
                  disabled={matchResults.length === 0}
                >
                  📄 Xuất JSON
                </button>
                <button 
                  className="export-btn excel"
                  onClick={() => handleExport('excel')}
                  disabled={matchResults.length === 0}
                >
                  📊 Xuất Excel
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default SecretaryPage;
