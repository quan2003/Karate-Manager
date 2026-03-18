import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabaseConfig';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Submit athlete list to Supabase (Coach side)
 * @param {string} tournamentId 
 * @param {string} clubName 
 * @param {Object} data - { athletes, coachName, teamLeaderName, additionalCoaches, exportTime }
 * @returns {Promise<Object>} - { success: boolean, message: string }
 */
export async function submitAthletes(tournamentId, clubName, data) {
  if (SUPABASE_URL === "YOUR_SUPABASE_URL" || SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY") {
    return { 
      success: false, 
      message: "Chưa cấu hình Supabase (URL/Key). Vui lòng kiểm tra src/config/supabaseConfig.js" 
    };
  }

  try {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const localTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${pad(now.getDate())}/${pad(now.getMonth() + 1)}`;
    const { error } = await supabase
      .from('athlete_submissions')
      .upsert({
        tournament_id: tournamentId,
        club_name: clubName,
        data: {
          updated_at_local: localTime,
          last_updated: now.toISOString(),
          ...data
        },
        submitted_at: now.toISOString()
      }, {
        onConflict: 'tournament_id,club_name'
      });

    if (error) throw error;
    return { 
      success: true, 
      submitted_at_local: localTime 
    };
  } catch (error) {
    console.error('Supabase submit error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Fetch all submissions for a tournament (Admin side)
 * @param {string} tournamentId 
 * @returns {Promise<Object>} - { success: boolean, data: Array, message: string }
 */
export async function fetchSubmissions(tournamentId) {
  if (SUPABASE_URL === "YOUR_SUPABASE_URL" || SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY") {
    return { 
      success: false, 
      message: "Chưa cấu hình Supabase (URL/Key). Vui lòng kiểm tra src/config/supabaseConfig.js" 
    };
  }

  try {
    const { data, error } = await supabase
      .from('athlete_submissions')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('submitted_at', { ascending: false });

    if (error) throw error;

    // Although the UNIQUE constraint handles this, we can still filter 
    // to be safe if multiple versions were allowed in the past.
    const uniqueSubmissions = [];
    const seenClubs = new Set();

    for (const sub of data) {
      if (!seenClubs.has(sub.club_name)) {
        uniqueSubmissions.push(sub);
        seenClubs.add(sub.club_name);
      }
    }

    return { success: true, data: uniqueSubmissions };
  } catch (error) {
    console.error('Supabase fetch error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Delete all submissions for a tournament (Admin side)
 * @param {string} tournamentId 
 * @returns {Promise<Object>} - { success: boolean, message: string }
 */
export async function deleteSubmissions(tournamentId) {
  if (SUPABASE_URL === "YOUR_SUPABASE_URL" || SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY") {
    return { 
      success: false, 
      message: "Chưa cấu hình Supabase" 
    };
  }

  try {
    const { error } = await supabase
      .from('athlete_submissions')
      .delete()
      .eq('tournament_id', tournamentId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Supabase delete error:', error);
    return { success: false, message: error.message };
  }
}

export default {
  submitAthletes,
  fetchSubmissions,
  deleteSubmissions
};
