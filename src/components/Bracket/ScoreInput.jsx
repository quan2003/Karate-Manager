import { useState } from 'react';
import Modal from '../common/Modal';
import './ScoreInput.css';

export default function ScoreInput({ 
  match, 
  isOpen, 
  onClose, 
  onSave,
  categoryType = 'kumite'
}) {
  const [score1, setScore1] = useState(match?.score1 || 0);
  const [score2, setScore2] = useState(match?.score2 || 0);
  const [winner, setWinner] = useState(match?.winner?.id || null);
  
  if (!match) return null;
  
  const handleSave = () => {
    onSave({
      matchId: match.id,
      score1,
      score2,
      winnerId: winner || (score1 > score2 ? match.athlete1?.id : match.athlete2?.id)
    });
    onClose();
  };
  
  const incrementScore = (which) => {
    if (which === 1) setScore1(prev => prev + 1);
    else setScore2(prev => prev + 1);
  };
  
  const decrementScore = (which) => {
    if (which === 1) setScore1(prev => Math.max(0, prev - 1));
    else setScore2(prev => Math.max(0, prev - 1));
  };
  
  const selectWinner = (athleteId) => {
    setWinner(athleteId);
    // Auto-set scores if not already set
    if (athleteId === match.athlete1?.id && score1 === 0 && score2 === 0) {
      setScore1(1);
    } else if (athleteId === match.athlete2?.id && score1 === 0 && score2 === 0) {
      setScore2(1);
    }
  };
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nhập kết quả trận đấu" size="medium">
      <div className="score-input-container">
        {/* Athlete 1 - Aka */}
        <div className={`score-athlete aka ${winner === match.athlete1?.id ? 'selected' : ''}`}>
          <div className="athlete-info">
            <span className="belt-label">AKA</span>
            <span className="athlete-name">{match.athlete1?.name || 'TBD'}</span>
            {match.athlete1?.club && (
              <span className="athlete-club">{match.athlete1.club}</span>
            )}
          </div>
          
          <div className="score-controls">
            <button 
              className="score-btn minus"
              onClick={() => decrementScore(1)}
              disabled={score1 === 0}
            >
              −
            </button>
            <span className="score-value">{score1}</span>
            <button 
              className="score-btn plus"
              onClick={() => incrementScore(1)}
            >
              +
            </button>
          </div>
          
          <button 
            className={`winner-btn ${winner === match.athlete1?.id ? 'active' : ''}`}
            onClick={() => selectWinner(match.athlete1?.id)}
          >
            {winner === match.athlete1?.id ? '✓ Thắng' : 'Chọn thắng'}
          </button>
        </div>
        
        <div className="vs-divider">VS</div>
        
        {/* Athlete 2 - Ao */}
        <div className={`score-athlete ao ${winner === match.athlete2?.id ? 'selected' : ''}`}>
          <div className="athlete-info">
            <span className="belt-label">AO</span>
            <span className="athlete-name">{match.athlete2?.name || 'TBD'}</span>
            {match.athlete2?.club && (
              <span className="athlete-club">{match.athlete2.club}</span>
            )}
          </div>
          
          <div className="score-controls">
            <button 
              className="score-btn minus"
              onClick={() => decrementScore(2)}
              disabled={score2 === 0}
            >
              −
            </button>
            <span className="score-value">{score2}</span>
            <button 
              className="score-btn plus"
              onClick={() => incrementScore(2)}
            >
              +
            </button>
          </div>
          
          <button 
            className={`winner-btn ${winner === match.athlete2?.id ? 'active' : ''}`}
            onClick={() => selectWinner(match.athlete2?.id)}
          >
            {winner === match.athlete2?.id ? '✓ Thắng' : 'Chọn thắng'}
          </button>
        </div>
        
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Hủy
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!winner && score1 === score2}
          >
            Lưu kết quả
          </button>
        </div>
      </div>
    </Modal>
  );
}
