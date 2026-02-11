import './MatchCard.css';

export default function MatchCard({ 
  match, 
  onScoreClick, 
  showRound = false,
  roundName = '',
  categoryType = 'kumite'
}) {
  const { athlete1, athlete2, score1, score2, winner, isBye } = match;
  
  const getAthleteClass = (athlete, isAka) => {
    let classes = ['match-athlete'];
    classes.push(isAka ? 'aka' : 'ao');
    
    if (winner && athlete?.id === winner.id) {
      classes.push('winner');
    }
    if (!athlete) {
      classes.push('bye');
    }
    
    return classes.join(' ');
  };
  
  const renderAthlete = (athlete, score, isAka) => (
    <div className={getAthleteClass(athlete, isAka)}>
      <span className="belt-indicator"></span>
      {athlete?.country && (
        <span className="athlete-flag" title={athlete.country}>
          {getFlagEmoji(athlete.country)}
        </span>
      )}
      <span className="athlete-name">
        {athlete ? athlete.name : 'BYE'}
        {athlete?.club && (
          <span className="athlete-club">({athlete.club})</span>
        )}
      </span>
      {athlete?.seed && (
        <span className="athlete-seed">[{athlete.seed}]</span>
      )}
      <span className="athlete-score">
        {score !== null ? score : '-'}
      </span>
    </div>
  );
  
  return (
    <div 
      className={`match-card ${isBye ? 'is-bye' : ''} ${winner ? 'has-winner' : ''}`}
      onClick={() => !isBye && onScoreClick && onScoreClick(match)}
    >
      {showRound && roundName && (
        <div className="match-round">{roundName}</div>
      )}
      <div className="match-athletes">
        {renderAthlete(athlete1, score1, true)}
        {renderAthlete(athlete2, score2, false)}
      </div>
      {!isBye && !winner && onScoreClick && (
        <div className="match-action-hint">Nhấn để nhập điểm</div>
      )}
    </div>
  );
}

// Convert country code to flag emoji
function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '🏳️';
  
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  
  return String.fromCodePoint(...codePoints);
}
