import { Response } from 'express';

export interface ApiError {
  message: string;
  statusCode: number;
  isQuotaExceeded?: boolean;
  retryAfter?: number;
}

export class TrueDataError extends Error {
  statusCode: number;
  isQuotaExceeded: boolean;
  retryAfter?: number;

  constructor(message: string, statusCode: number = 500, isQuotaExceeded: boolean = false, retryAfter?: number) {
    super(message);
    this.name = 'TrueDataError';
    this.statusCode = statusCode;
    this.isQuotaExceeded = isQuotaExceeded;
    this.retryAfter = retryAfter;
  }
}

export const handleTrueDataError = (error: any): TrueDataError => {
  // Check if it's a quota exceeded error
  const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
  
  if (errorMessage.toLowerCase().includes('quota exceeded') || 
      errorMessage.toLowerCase().includes('rate limit') ||
      errorMessage.toLowerCase().includes('api request quota exceeded')) {
    return new TrueDataError(
      'API quota exceeded. Please try again later.',
      429,
      true,
      300 // 5 minutes retry after
    );
  }

  // Check for authentication errors
  if (error.response?.status === 401) {
    return new TrueDataError('Authentication failed', 401);
  }

  // Check for not found errors
  if (error.response?.status === 404) {
    return new TrueDataError('Data not found', 404);
  }

  // Default server error
  return new TrueDataError(
    'Failed to fetch data from TrueData API',
    error.response?.status || 500
  );
};

export const sendErrorResponse = (res: Response, error: TrueDataError) => {
  const response: any = {
    success: false,
    message: error.message,
    isQuotaExceeded: error.isQuotaExceeded
  };

  if (error.retryAfter) {
    response.retryAfter = error.retryAfter;
    res.set('Retry-After', error.retryAfter.toString());
  }

  res.status(error.statusCode).json(response);
};