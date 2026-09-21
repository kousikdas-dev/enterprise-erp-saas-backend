export interface ApiEnvelope<T> {
  success?: boolean;
  statusCode?: number;
  data?: T;
  message?: string | string[];
  /** Machine-readable error identifier — present only when the throwing exception opted in. Never inferred from `message`. */
  code?: string;
  details?: unknown;
  error?: string;
  timestamp?: string;
  path?: string;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly messages: string[];
  /** Machine-readable error identifier for branching in UI code — check this, never `messages` text. */
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, messages: string[], code?: string, details?: unknown) {
    super(messages.join(', ') || `HTTP ${status}`);
    this.name = 'ApiClientError';
    this.status = status;
    this.messages = messages;
    this.code = code;
    this.details = details;
  }
}
