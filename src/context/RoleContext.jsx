import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const RoleContext = createContext(null);

/**
 * Trạng thái thời gian nhập liệu
 * - 'before': Chưa đến thời gian nhập
 * - 'during': Đang trong thời gian nhập
 * - 'after': Đã hết thời gian nhập
 */
export const TIME_STATUS = {
  BEFORE: 'before',
  DURING: 'during',
  AFTER: 'after'
};

/**
 * Vai trò người dùng
 */
export const ROLES = {
  ADMIN: 'admin',
  COACH: 'coach',
  SECRETARY: 'secretary'
};


/**
 * RoleProvider - Quản lý vai trò và dữ liệu giải từ file .krt/.kmatch
 */
export function RoleProvider({ children }) {
  const [role, setRole] = useState(null);
  const [tournamentData, setTournamentData] = useState(null);
  const [timeStatus, setTimeStatus] = useState(null);
  const [coachAthletes, setCoachAthletes] = useState([]);
  const [coachName, setCoachName] = useState('');
  
  // Secretary state
  const [matchData, setMatchData] = useState(null);
  const [matchResults, setMatchResults] = useState([]);
  const [scoringEnabled, setScoringEnabled] = useState(false);

  // Owner/System state - Removed


  /**
   * Kiểm tra thời gian hiện tại so với StartTime và EndTime
   */
  const checkTimeStatus = useCallback((startTime, endTime) => {
    const now = new Date();
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (now < start) {
      return TIME_STATUS.BEFORE;
    } else if (now >= start && now <= end) {
      return TIME_STATUS.DURING;
    } else {
      return TIME_STATUS.AFTER;
    }
  }, []);

  /**
   * Load dữ liệu từ file .krt (Coach)
   */
  const loadKrtData = useCallback((data) => {
    setTournamentData(data);
    const status = checkTimeStatus(data.startTime, data.endTime);
    setTimeStatus(status);
    
    // Load danh sách VĐV từ localStorage nếu có
    const savedAthletes = localStorage.getItem(`coach_athletes_${data.tournamentId}`);
    if (savedAthletes) {
      setCoachAthletes(JSON.parse(savedAthletes));
    } else {
      setCoachAthletes([]);
    }
    
    const savedCoachName = localStorage.getItem(`coach_name_${data.tournamentId}`);
    if (savedCoachName) {
      setCoachName(savedCoachName);
    }
  }, [checkTimeStatus]);

  /**
   * Load dữ liệu từ file .kmatch (Secretary)
   */
  const loadMatchData = useCallback((data) => {
    setMatchData(data);
    setScoringEnabled(data.scoringEnabled || false);
    
    // Load kết quả từ localStorage nếu có
    const savedResults = localStorage.getItem(`match_results_${data.tournamentId}`);
    if (savedResults) {
      setMatchResults(JSON.parse(savedResults));
    } else {
      setMatchResults([]);
    }

    // Check scoring time
    if (data.startTime && data.endTime) {
      const status = checkTimeStatus(data.startTime, data.endTime);
      setTimeStatus(status);
    }
  }, [checkTimeStatus]);

  // Load system config on mount
  useEffect(() => {
    try {
      const savedLicense = localStorage.getItem('krt_license');
      if (savedLicense) setLicenseData(JSON.parse(savedLicense));
      
      const savedConfig = localStorage.getItem('krt_system_config');
      if (savedConfig) setSystemConfig(JSON.parse(savedConfig));
    } catch (e) {
      console.error('Error loading system config:', e);
    }
  }, []);

  /**
   * Owner actions removed
   */


  /**
   * Cập nhật trạng thái thời gian (gọi định kỳ)
   */
  const refreshTimeStatus = useCallback(() => {
    if (tournamentData) {
      const status = checkTimeStatus(tournamentData.startTime, tournamentData.endTime);
      setTimeStatus(status);
      return status;
    }
    if (matchData && matchData.startTime && matchData.endTime) {
      const status = checkTimeStatus(matchData.startTime, matchData.endTime);
      setTimeStatus(status);
      return status;
    }
    return null;
  }, [tournamentData, matchData, checkTimeStatus]);

  /**
   * Thêm VĐV mới (chỉ khi trong thời hạn)
   */
  const addAthlete = useCallback((athlete) => {
    if (timeStatus !== TIME_STATUS.DURING) {
      return { success: false, error: 'Không thể thêm VĐV ngoài thời gian cho phép' };
    }
    
    const newAthlete = {
      ...athlete,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    
    setCoachAthletes(prev => {
      const updated = [...prev, newAthlete];
      localStorage.setItem(`coach_athletes_${tournamentData.tournamentId}`, JSON.stringify(updated));
      return updated;
    });
    
    return { success: true, athlete: newAthlete };
  }, [timeStatus, tournamentData]);

  /**
   * Cập nhật VĐV (chỉ khi trong thời hạn)
   */
  const updateAthlete = useCallback((id, updates) => {
    if (timeStatus !== TIME_STATUS.DURING) {
      return { success: false, error: 'Không thể sửa VĐV ngoài thời gian cho phép' };
    }
    
    setCoachAthletes(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a);
      localStorage.setItem(`coach_athletes_${tournamentData.tournamentId}`, JSON.stringify(updated));
      return updated;
    });
    
    return { success: true };
  }, [timeStatus, tournamentData]);

  /**
   * Xóa VĐV (chỉ khi trong thời hạn)
   */
  const deleteAthlete = useCallback((id) => {
    if (timeStatus !== TIME_STATUS.DURING) {
      return { success: false, error: 'Không thể xóa VĐV ngoài thời gian cho phép' };
    }
    
    setCoachAthletes(prev => {
      const updated = prev.filter(a => a.id !== id);
      localStorage.setItem(`coach_athletes_${tournamentData.tournamentId}`, JSON.stringify(updated));
      return updated;
    });
    
    return { success: true };
  }, [timeStatus, tournamentData]);

  /**
   * Cập nhật tên HLV
   */
  const updateCoachName = useCallback((name) => {
    setCoachName(name);
    if (tournamentData) {
      localStorage.setItem(`coach_name_${tournamentData.tournamentId}`, name);
    }
  }, [tournamentData]);

  /**
   * Lấy dữ liệu để xuất file (Coach)
   */
  const getExportData = useCallback(() => {
    return {
      tournamentId: tournamentData?.tournamentId,
      tournamentName: tournamentData?.tournamentName,
      coachName,
      exportTime: new Date().toISOString(),
      athletes: coachAthletes
    };
  }, [tournamentData, coachName, coachAthletes]);

  // ============ SECRETARY FUNCTIONS ============

  /**
   * Cập nhật kết quả trận đấu (Secretary)
   */
  const updateMatchResult = useCallback((matchId, result) => {
    if (!scoringEnabled) {
      return { success: false, error: 'Chức năng bấm điểm chưa được Admin bật' };
    }
    
    setMatchResults(prev => {
      const existing = prev.findIndex(r => r.matchId === matchId);
      let updated;
      if (existing >= 0) {
        updated = prev.map((r, i) => i === existing ? { ...r, ...result, updatedAt: new Date().toISOString() } : r);
      } else {
        updated = [...prev, { matchId, ...result, createdAt: new Date().toISOString() }];
      }
      if (matchData) {
        localStorage.setItem(`match_results_${matchData.tournamentId}`, JSON.stringify(updated));
      }
      return updated;
    });
    
    return { success: true };
  }, [scoringEnabled, matchData]);

  /**
   * Lấy kết quả trận đấu
   */
  const getMatchResult = useCallback((matchId) => {
    return matchResults.find(r => r.matchId === matchId) || null;
  }, [matchResults]);

  /**
   * Lấy dữ liệu để xuất file (Secretary)
   */
  const getMatchExportData = useCallback(() => {
    return {
      tournamentId: matchData?.tournamentId,
      tournamentName: matchData?.tournamentName,
      exportTime: new Date().toISOString(),
      results: matchResults
    };
  }, [matchData, matchResults]);

  /**
   * Reset role và dữ liệu
   */
  const resetRole = useCallback(() => {
    setRole(null);
    setTournamentData(null);
    setTimeStatus(null);
    setCoachAthletes([]);
    setCoachName('');
    setMatchData(null);
    setMatchResults([]);
    setScoringEnabled(false);
  }, []);

  /**
   * Kiểm tra xem có thể chỉnh sửa không (Coach)
   */
  const canEdit = role === ROLES.COACH && timeStatus === TIME_STATUS.DURING;

  /**
   * Kiểm tra xem có thể bấm điểm không (Secretary)
   */
  const canScore = role === ROLES.SECRETARY && scoringEnabled;

  const value = {
    // State
    role,
    tournamentData,
    timeStatus,
    coachAthletes,
    coachName,
    canEdit,
    
    // Secretary State
    matchData,
    matchResults,
    scoringEnabled,
    canScore,
    
    // Actions
    setRole,
    loadKrtData,
    loadMatchData,
    refreshTimeStatus,
    addAthlete,
    updateAthlete,
    deleteAthlete,
    updateCoachName,
    getExportData,
    
    // Secretary Actions
    updateMatchResult,
    getMatchResult,
    getMatchExportData,
    
    // Owner Actions - Removed

    
    resetRole
  };

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  );
}

/**
 * Hook để sử dụng RoleContext
 */
export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}

export default RoleContext;
