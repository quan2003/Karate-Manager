
import { useGoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../services/auth';
import { Shield, Lock, CheckCircle, XCircle, User, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

export default function LoginPage() {
  const { loginWithGoogle, loginWithAccount } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null); // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [loginMode, setLoginMode] = useState('account'); // 'account' | 'google'
  
  // Account login form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setStatus('loading');
      setMessage('Đang xác thực...');
      
      const result = await loginWithGoogle(tokenResponse.access_token);
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

  const handleAccountLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setStatus('error');
      setMessage('Vui lòng nhập tên đăng nhập và mật khẩu');
      setTimeout(() => setStatus(null), 4000);
      return;
    }

    setStatus('loading');
    setMessage('Đang xác thực...');

    const result = await loginWithAccount(username.trim(), password);
    if (result.success) {
      setStatus('success');
      setMessage('Đăng nhập thành công! Đang chuyển hướng...');
      setTimeout(() => navigate('/dashboard'), 1000);
    } else {
      setStatus('error');
      setMessage(result.message || 'Đăng nhập thất bại');
      setTimeout(() => setStatus(null), 4000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="glass-card max-w-md w-full text-center space-y-6 animate-fade-in">
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

        {/* Login Mode Tabs */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          <button
            onClick={() => setLoginMode('account')}
            className={`flex-1 py-2.5 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              loginMode === 'account'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <User className="w-4 h-4" />
            Tài khoản
          </button>
          <button
            onClick={() => setLoginMode('google')}
            className={`flex-1 py-2.5 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              loginMode === 'google'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700/50'
            }`}
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
            Google
          </button>
        </div>

        <div className="space-y-4">
          {loginMode === 'account' ? (
            /* Account Login Form */
            <form onSubmit={handleAccountLogin} className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                <input
                  type="text"
                  placeholder="Tên đăng nhập"
                  className="input-field mb-0 pl-10 w-full"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={status === 'loading'}
                  autoComplete="username"
                />
              </div>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mật khẩu"
                  className="input-field mb-0 pl-10 pr-10 w-full"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={status === 'loading'}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button 
                type="submit"
                disabled={status === 'loading'}
                className="w-full flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                <KeyRound className="w-5 h-5" />
                {status === 'loading' ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </button>
            </form>
          ) : (
            /* Google Login Button */
            <button 
                onClick={() => handleGoogleLogin()}
                disabled={status === 'loading'}
                className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3 px-6 rounded-lg hover:bg-slate-100 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                {status === 'loading' ? 'Đang đăng nhập...' : 'Sign in with Google'}
            </button>
          )}
            
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                <Lock className="w-4 h-4" />
                <span>Secure Access Restricted</span>
            </div>
        </div>
      </div>
    </div>
  );
}
