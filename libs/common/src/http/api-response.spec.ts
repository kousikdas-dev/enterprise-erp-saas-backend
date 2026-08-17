import { wrapSuccess } from './api-response';

describe('wrapSuccess', () => {
  it('wraps payload in the standard success envelope', () => {
    const result = wrapSuccess({ ok: true }, 200);

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.data).toEqual({ ok: true });
    expect(typeof result.timestamp).toBe('string');
  });
});
