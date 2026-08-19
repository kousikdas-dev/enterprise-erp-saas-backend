import { ApiClientError } from '../../core/api/api.types';

export function apiErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (err instanceof ApiClientError) {
    if (err.status === 403) {
      return err.messages.join(' ') || 'You do not have permission for this action.';
    }
    if (err.status === 401) {
      return 'Session expired. Please sign in again.';
    }
    return err.messages.join(' ') || fallback;
  }
  return fallback;
}
