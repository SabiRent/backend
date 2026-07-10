import type { CustomError } from '@/types/error.types';

const AppError = (message: string, statusCode: number = 500, code?: string) => {
  const error = new Error(message) as CustomError;
  error.statusCode = statusCode;
  error.isOperational = true;

  if (code) error.code = code;

  Error.captureStackTrace(error, AppError);

  return error;
};

export default AppError;
