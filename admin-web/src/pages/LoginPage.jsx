
import { useGoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/auth';
import { Shield, Lock, CheckCircle, XCircle } from 'lucide-react';
import { useState } from 'react';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setStatus('loading');
      setMessage('Đang xác thực...');
      
      const result = await login(tokenResponse.access_token);
      if (result.success) {
        setStatus('success');
        setMessage('Đăng nhập thành công! Đang chuyển hướng...');
        setTimeout(() => navigate('/dashboard'), 1000);
      } else {
        setStatus('error');
        setMessage(result.message || 'Đăng nhập thất bại');
        setTimeout(() => setStatus(null), 4000);
      }
    },
    onError: () => {
      setStatus('error');
      setMessage('Lỗi kết nối Google');
      setTimeout(() => setStatus(null), 4000);
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="glass-card max-w-md w-full text-center space-y-8 animate-fade-in">
        <div className="flex justify-center">
            <div className="bg-blue-600/20 p-4 rounded-full">
                <Shield className="w-12 h-12 text-blue-500" />
            </div>
        </div>
        
        <div>
            <h1 className="text-3xl font-bold text-white mb-2">Admin Portal</h1>
            <p className="text-slate-400">Karate Tournament Manager</p>
        </div>

        {/* Toast Notification */}
        {status && (
          <div className={`flex items-center gap-3 p-4 rounded-lg text-sm font-medium transition-all ${
            status === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
            status === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
            'bg-blue-500/20 text-blue-400 border border-blue-500/30'
          }`}>
            {status === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0" />}
            {status === 'error' && <XCircle className="w-5 h-5 flex-shrink-0" />}
            {status === 'loading' && (
              <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
            <span>{message}</span>
          </div>
        )}

        <div className="space-y-4">
            <button 
                onClick={() => handleGoogleLogin()}
                disabled={status === 'loading'}
                className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3 px-6 rounded-lg hover:bg-slate-100 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                {status === 'loading' ? 'Đang đăng nhập...' : 'Sign in with Google'}
            </button>
            
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <Lock className="w-4 h-4" />
                <span>Secure Access Restricted</span>
            </div>
        </div>
      </div>
    </div>
  );
}
