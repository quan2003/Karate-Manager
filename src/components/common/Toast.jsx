import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import './Toast.css';

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, duration }]);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback({
    success: (msg, dur) => addToast(msg, 'success', dur),
    error: (msg, dur) => addToast(msg, 'error', dur || 6000),
    warning: (msg, dur) => addToast(msg, 'warning', dur || 5000),
    info: (msg, dur) => addToast(msg, 'info', dur),
  }, [addToast]);

  // Wrap toast object for stable reference
  const value = { toast: { ...toast }, addToast, removeToast };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, onRemove }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onRemove(t.id), 300);
    }, t.duration);
    return () => clearTimeout(timer);
  }, [t.id, t.duration, onRemove]);

  const handleClose = () => {
    setExiting(true);
    setTimeout(() => onRemove(t.id), 300);
  };

  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
  };

  return (
    <div className={`toast-item toast-${t.type} ${exiting ? 'toast-exit' : 'toast-enter'}`}>
      <span className="toast-icon">{icons[t.type]}</span>
      <span className="toast-message">{t.message}</span>
      <button className="toast-close" onClick={handleClose}>×</button>
    </div>
  );
}

export default ToastProvider;
