import { sanitizeAuditMetadata } from './sanitize-audit-metadata';

describe('sanitizeAuditMetadata', () => {
  it('strips passwords and tokens from nested objects', () => {
    const result = sanitizeAuditMetadata({
      email: 'ada@demo.local',
      password: 'secret',
      passwordHash: 'scrypt$...',
      nested: {
        accessToken: 'jwt',
        refreshToken: 'opaque',
        role: 'admin',
      },
    });

    expect(result).toEqual({
      email: 'ada@demo.local',
      nested: { role: 'admin' },
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|scrypt|jwt|opaque/i);
  });
});
