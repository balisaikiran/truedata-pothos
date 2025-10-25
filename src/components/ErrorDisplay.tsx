import React from 'react';
import { AlertCircle, Clock, Wifi } from 'lucide-react';

interface ErrorDisplayProps {
  error: any;
  onRetry?: () => void;
  className?: string;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onRetry, className = '' }) => {
  const getErrorInfo = () => {
    if (error?.isQuotaExceeded) {
      return {
        icon: <AlertCircle className="w-8 h-8 text-orange-500" />,
        title: 'API Quota Exceeded',
        message: error.quotaMessage || 'The TrueData API quota has been exceeded. Please try again later.',
        type: 'quota',
        showRetry: false
      };
    }
    
    if (error?.isRateLimited) {
      const retryAfter = error.retryAfter ? Math.ceil(error.retryAfter / 1000) : 60;
      return {
        icon: <Clock className="w-8 h-8 text-yellow-500" />,
        title: 'Rate Limited',
        message: `Too many requests. Please wait ${retryAfter} seconds before trying again.`,
        type: 'rateLimit',
        showRetry: true,
        retryDelay: retryAfter
      };
    }
    
    if (error?.response?.status === 401 || error?.isAuthError) {
      return {
        icon: <AlertCircle className="w-8 h-8 text-red-500" />,
        title: 'Authentication Error',
        message: 'Your session has expired. Please log in again.',
        type: 'auth',
        showRetry: false
      };
    }
    
    if (error?.code === 'NETWORK_ERROR' || error?.message?.includes('Network Error')) {
      return {
        icon: <Wifi className="w-8 h-8 text-red-500" />,
        title: 'Network Error',
        message: 'Unable to connect to the server. Please check your internet connection.',
        type: 'network',
        showRetry: true
      };
    }
    
    // Generic error
    return {
      icon: <AlertCircle className="w-8 h-8 text-red-500" />,
      title: 'Error',
      message: error?.message || 'An unexpected error occurred. Please try again.',
      type: 'generic',
      showRetry: true
    };
  };

  const errorInfo = getErrorInfo();

  const getBackgroundColor = () => {
    switch (errorInfo.type) {
      case 'quota':
        return 'bg-orange-50 border-orange-200';
      case 'rateLimit':
        return 'bg-yellow-50 border-yellow-200';
      case 'auth':
        return 'bg-red-50 border-red-200';
      case 'network':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={`rounded-lg border p-6 ${getBackgroundColor()} ${className}`}>
      <div className="flex items-start space-x-4">
        <div className="flex-shrink-0">
          {errorInfo.icon}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {errorInfo.title}
          </h3>
          <p className="text-gray-700 mb-4">
            {errorInfo.message}
          </p>
          
          {errorInfo.type === 'quota' && (
            <div className="bg-orange-100 border border-orange-200 rounded-md p-3 mb-4">
              <p className="text-sm text-orange-800">
                <strong>Trial Account Limitation:</strong> The TrueData trial account has limited API calls. 
                Consider upgrading to a paid plan for unlimited access.
              </p>
            </div>
          )}
          
          {errorInfo.showRetry && onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              Try Again
            </button>
          )}
          
          {errorInfo.type === 'auth' && (
            <button
              onClick={() => window.location.href = '/login'}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
            >
              Go to Login
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorDisplay;