import React, { useState, useEffect } from 'react';
import { pushTournamentToCloud, getTournamentSyncStatus, checkVPSOnlineSyncList } from '../../services/cloudSyncService';
import './CloudSyncButton.css';

export default function CloudSyncButton({ tournamentId, tournamentObj, variant = 'icon' }) {
  const [syncState, setSyncState] = useState({ status: 'idle', lastSyncedAt: null, error: null });
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState(null);

  const refreshStatus = () => {
    if (tournamentId) {
      setSyncState(getTournamentSyncStatus(tournamentId));
    }
  };

  useEffect(() => {
    checkVPSOnlineSyncList().then(() => refreshStatus());
    const interval = setInterval(() => {
      checkVPSOnlineSyncList().then(() => refreshStatus());
    }, 10000);
    return () => clearInterval(interval);
  }, [tournamentId]);

  const handlePushSync = async (e) => {
    if (e) e.stopPropagation();
    if (isSyncing || !tournamentId) return;

    setIsSyncing(true);
    setToast(null);

    try {
      const result = await pushTournamentToCloud(tournamentId, tournamentObj);
      if (result.success) {
        setToast({ type: 'success', message: '☁️ Đã đồng bộ giải đấu lên VPS thành công!' });
      } else {
        setToast({ type: 'error', message: `❌ ${result.message}` });
      }
    } catch (err) {
      console.error('Push sync error:', err);
      setToast({ type: 'error', message: `❌ ${err.message || 'Lỗi không xác định khi đồng bộ'}` });
    } finally {
      setIsSyncing(false);
      refreshStatus();
    }

    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const formatTime = (isoString) => {
    if (!isoString) return 'Chưa đồng bộ';
    try {
      const d = new Date(isoString);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.getDate()}/${d.getMonth() + 1}`;
    } catch (e) {
      return 'N/A';
    }
  };

  // Toast Component Floating
  const renderToast = () => {
    if (!toast) return null;
    return (
      <div className={`cloud-sync-toast-float ${toast.type}`}>
        <span>{toast.message}</span>
      </div>
    );
  };

  // 1. ICON VARIANT (Card Action Bar - Tối giản & Tinh tế)
  if (variant === 'icon') {
    return (
      <div className="cloud-sync-wrapper">
        <button
          className={`action-btn cloud-sync-btn ${syncState.status} ${isSyncing ? 'syncing' : ''}`}
          onClick={handlePushSync}
          disabled={isSyncing}
          title={
            isSyncing
              ? 'Đang gửi dữ liệu giải lên VPS...'
              : syncState.status === 'synced'
              ? `Đã đồng bộ VPS lúc ${formatTime(syncState.lastSyncedAt)} (Bấm để đồng bộ lại)`
              : syncState.status === 'error'
              ? `Lỗi: ${syncState.error} (Bấm để thử lại)`
              : 'Đồng bộ giải đấu này lên VPS Super Admin'
          }
        >
          {isSyncing ? (
            <svg className="spinner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            </svg>
          )}

          {/* Trạng thái chấm tròn nhỏ (Status Dot) */}
          <span className={`status-dot ${syncState.status}`} />
        </button>
        {renderToast()}
      </div>
    );
  }

  // 2. HEADER VARIANT (Top Header Bar)
  return (
    <div className="cloud-sync-wrapper">
      <button
        onClick={handlePushSync}
        disabled={isSyncing}
        className={`btn btn-secondary btn-lg btn-cloud-header ${syncState.status}`}
        title="Đẩy toàn bộ dữ liệu giải đấu lên VPS cho Super Admin"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        </svg>
        <span>{isSyncing ? 'Đang đẩy VPS...' : '☁️ Đồng bộ VPS'}</span>
        {syncState.status === 'synced' && <span className="header-sync-time">{formatTime(syncState.lastSyncedAt)}</span>}
      </button>
      {renderToast()}
    </div>
  );
}
