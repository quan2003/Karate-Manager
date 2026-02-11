import { generateBracket } from './src/utils/drawEngine.js';

// Mock 20 athletes
const athletes = Array.from({ length: 20 }, (_, i) => ({
  id: `ath-${i}`,
  name: `Athlete ${i + 1}`,
  seed: i < 2 ? i + 1 : null, // Seed 1 and 2
  club: 'Club A'
}));

try {
  const bracket = generateBracket(athletes);
  
  console.log('Bracket Size:', bracket.size);
  console.log('Total Matches:', bracket.matches.length);
  
  // Check Round 1 Matches
  const round1 = bracket.matches.filter(m => m.round === 1).sort((a,b) => a.position - b.position);
  console.log('Round 1 Matches:', round1.length);
  
  round1.forEach((m, i) => {
    const p1 = m.athlete1 ? 'Yes' : 'No';
    const p2 = m.athlete2 ? 'Yes' : 'No';
    console.log(`Match R1-P${m.position}: ${p1} vs ${p2} | isBye: ${m.isBye} | No: ${m.matchNumber} | Code: ${m.matchCode}`);
  });
  
  // Check Round 2 first match
  const round2 = bracket.matches.filter(m => m.round === 2).sort((a,b) => a.position - b.position);
  console.log(`Match R2-P0: No: ${round2[0].matchNumber} | Code: ${round2[0].matchCode}`);

} catch (e) {
  console.error(e);
}
