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
  /** Machine-readable error identifier, set only by exceptions that opt in via a `code` field on their response payload. Absent for ordinary exceptions — never inferred from `message`. */
  code?: string;
  /** Structured, machine-readable context for `code`, set only when the throwing exception provides one. */
  details?: unknown;
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
