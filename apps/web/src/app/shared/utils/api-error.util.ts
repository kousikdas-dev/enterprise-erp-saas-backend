import { ApiClientError } from '../../core/api/api.types';

export function apiErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (err instanceof ApiClientError) {
    if (err.status === 403) {
      return err.messages.join(' ') || 'You do not have permission for this action.';
    }
    if (err.status === 401) {
      return 'Session expired. Please sign in again.';
    }
    if (err.status === 404) {
      return err.messages.join(' ') || 'Resource not found.';
    }
    if (err.status === 409) {
      return (
        err.messages.join(' ') ||
        'This action conflicts with the current business state.'
      );
    }
    if (err.status === 502 || err.status === 503) {
      return (
        err.messages.join(' ') ||
        'A downstream service is unavailable. You can retry when it recovers.'
      );
    }
    return err.messages.join(' ') || fallback;
  }
  return fallback;
}
