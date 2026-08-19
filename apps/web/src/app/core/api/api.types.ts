export interface ApiEnvelope<T> {
  success?: boolean;
  statusCode?: number;
  data?: T;
  message?: string | string[];
  error?: string;
  timestamp?: string;
  path?: string;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly messages: string[];

  constructor(status: number, messages: string[]) {
    super(messages.join(', ') || `HTTP ${status}`);
    this.name = 'ApiClientError';
    this.status = status;
    this.messages = messages;
  }
}
