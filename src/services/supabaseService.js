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

/**
 * Publish tournament configuration to Supabase
 * @param {Object} tournament - The full tournament object
 * @param {string} startTime - Optional ISO string for registration start
 * @param {string} endTime - Optional ISO string for registration end
 * @returns {Promise<Object>} - { success: boolean, message: string }
 */
export async function publishTournament(tournament, startTime = null, endTime = null) {
  if (SUPABASE_URL === "YOUR_SUPABASE_URL" || SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY") {
    return { 
      success: false, 
      message: "Chưa cấu hình Supabase" 
    };
  }

  try {
    const slug = tournament.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    const publishData = {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      location: tournament.location,
      date: tournament.date,
      startTime: startTime,
      endTime: endTime,
      events: (tournament.categories || []).map(cat => ({
        id: cat.id,
        name: cat.name,
        gender: cat.gender || "any",
        type: cat.type || "kumite",
        weightMin: cat.weightMin,
        weightMax: cat.weightMax
      })),
      publishedAt: new Date().toISOString()
    };

    const { error } = await supabase
      .from('tournaments_config')
      .upsert({
        id: tournament.id,
        slug: slug,
        data: publishData,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });

    if (error) throw error;
    return { success: true, slug: slug };
  } catch (error) {
    console.error('Supabase publish error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Delete published tournament configuration from Supabase
 * @param {string} tournamentId 
 * @returns {Promise<Object>} - { success: boolean, message: string }
 */
export async function unpublishTournament(tournamentId) {
  if (SUPABASE_URL === "YOUR_SUPABASE_URL" || SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY") {
    return { 
      success: false, 
      message: "Chưa cấu hình Supabase" 
    };
  }

  try {
    const { error } = await supabase
      .from('tournaments_config')
      .delete()
      .eq('id', tournamentId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Supabase unpublish error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Fetch tournament configuration by slug
 * @param {string} slug 
 * @returns {Promise<Object>} - { success: boolean, data: Object, message: string }
 */
export async function fetchTournamentBySlug(slug) {
    try {
        const { data, error } = await supabase
            .from('tournaments_config')
            .select('data')
            .eq('slug', slug)
            .single();

        if (error) throw error;
        return { success: true, data: data.data };
    } catch (error) {
        console.error('Supabase fetch by slug error:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Fetch tournament configuration by id
 * @param {string} id 
 * @returns {Promise<Object>} - { success: boolean, data: Object, slug: string, message: string }
 */
export async function fetchTournamentById(id) {
    try {
        const { data, error } = await supabase
            .from('tournaments_config')
            .select('data, slug')
            .eq('id', id)
            .single();

        if (error) throw error;
        return { success: true, data: data.data, slug: data.slug };
    } catch (error) {
        // Not an error if not found, just return success: false
        return { success: false, message: error.message };
    }
}

export default {
  submitAthletes,
  fetchSubmissions,
  deleteSubmissions,
  publishTournament,
  unpublishTournament,
  fetchTournamentBySlug,
  fetchTournamentById
};
