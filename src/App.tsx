import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/ui/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import HistoricalAnalysis from './pages/HistoricalAnalysis';
import OptionsChain from './pages/OptionsChain';
import SymbolSearch from './pages/SymbolSearch';
import Settings from './pages/Settings';
import LiveFODashboard from './pages/LiveFODashboard';
import LoginForm from './components/auth/LoginForm';

function App() {
  return (
    <ThemeProvider>
      <ErrorBoundary>
        <AuthProvider>
          <Router>
            <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors duration-200">
            <Routes>
            <Route path="/login" element={<LoginForm />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Layout>
                  <Navigate to="/dashboard" replace />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/historical" element={
              <ProtectedRoute>
                <Layout>
                  <HistoricalAnalysis />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/options" element={
              <ProtectedRoute>
                <Layout>
                  <OptionsChain />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/symbols" element={
              <ProtectedRoute>
                <Layout>
                  <SymbolSearch />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute>
                <Layout>
                  <Settings />
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/fno-dashboard" element={
              <ProtectedRoute>
                <Layout>
                  <LiveFODashboard />
                </Layout>
              </ProtectedRoute>
            } />
            </Routes>
            </div>
          </Router>
        </AuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
