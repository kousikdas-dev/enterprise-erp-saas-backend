export interface ApiSuccessResponse<T> {
  success: true;
  statusCode: number;
  data: T;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

export function wrapSuccess<T>(data: T, statusCode: number): ApiSuccessResponse<T> {
  return {
    success: true,
    statusCode,
    data,
    timestamp: new Date().toISOString(),
  };
}
