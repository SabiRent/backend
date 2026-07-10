export interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
}
