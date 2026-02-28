
import { createContext, useContext, useState, useEffect } from 'react';
import { googleLogout } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for token on mount
    const token = localStorage.getItem('admin_token');
    const savedUser = localStorage.getItem('admin_user');
    
    if (token && savedUser) {
        try {
            const decoded = jwtDecode(token);
            // Check expiry
            if (decoded.exp * 1000 < Date.now()) {
                logout();
            } else {
                setUser(JSON.parse(savedUser));
            }
        } catch (e) {
            logout();
        }
    }
    setLoading(false);
  }, []);

  // Google login
  const loginWithGoogle = async (googleToken) => {
    try {
      const res = await axios.post('/auth/google', { token: googleToken });
      
      if (res.data.success) {
        const { token, user } = res.data;
        localStorage.setItem('admin_token', token);
        localStorage.setItem('admin_user', JSON.stringify(user));
        setUser(user);
        return { success: true };
      }
      return { success: false, message: res.data.message };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: error.response?.data?.message || 'Login failed' };
    }
  };

  // Account login (username/password)
  const loginWithAccount = async (username, password) => {
    try {
      const res = await axios.post('/auth/login', { username, password });
      
      if (res.data.success) {
        const { token, user } = res.data;
        localStorage.setItem('admin_token', token);
        localStorage.setItem('admin_user', JSON.stringify(user));
        setUser(user);
        return { success: true };
      }
      return { success: false, message: res.data.message };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: error.response?.data?.message || 'Đăng nhập thất bại' };
    }
  };

  const logout = () => {
    try {
      googleLogout();
    } catch (e) {
      // Ignore error if not logged in with Google
    }
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loginWithGoogle, loginWithAccount, logout, loading }}>
        {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
