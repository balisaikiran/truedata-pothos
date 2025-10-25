import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';
import type { User, AuthResponse } from '../../shared/types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing token on app start
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('user_data');
    
    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        // Ensure we DO NOT persist TrueData token from storage for security
        const parsedUser: User = JSON.parse(savedUser);
        if (parsedUser && 'trueDataToken' in parsedUser) {
          // Strip any persisted trueDataToken if present (should not be persisted)
          delete (parsedUser as any).trueDataToken;
        }
        setUser(parsedUser);
        // Set default axios header (our app JWT)
        axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
      } catch (error) {
        console.error('Error parsing saved user data:', error);
        // Clear invalid data
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
      }
    }
    
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      const response = await axios.post<AuthResponse>('/api/auth/login', {
        username,
        password
      });

      if (response.data.success && response.data.token) {
        const { token: authToken, user: userData, trueDataToken } = response.data;
        
        setToken(authToken);
        // Keep TrueData token only in-memory to avoid persistence
        const runtimeUser: User = { ...userData, trueDataToken };
        setUser(runtimeUser);
        
        // Save to localStorage WITHOUT TrueData token
        const persistedUser: User = { ...userData };
        localStorage.setItem('auth_token', authToken);
        localStorage.setItem('user_data', JSON.stringify(persistedUser));
        
        // Set default axios header (our app JWT)
        axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    
    // Clear localStorage
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    
    // Remove axios default header
    delete axios.defaults.headers.common['Authorization'];
    
    // Call logout endpoint
    axios.post('/api/auth/logout').catch(console.error);
  };

  const value: AuthContextType = {
    user,
    token,
    login,
    logout,
    isLoading,
    isAuthenticated: !!token && !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};