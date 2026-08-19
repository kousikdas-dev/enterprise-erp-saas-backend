import { assertJwtSecretForEnvironment } from './assert-jwt-secret';

describe('assertJwtSecretForEnvironment', () => {
  it('allows the local placeholder secret outside production', () => {
    expect(() =>
      assertJwtSecretForEnvironment(
        'development',
        'change-me-use-a-unique-jwt-access-secret-min-32-chars',
      ),
    ).not.toThrow();
  });

  it('rejects insecure placeholder secrets in production', () => {
    expect(() =>
      assertJwtSecretForEnvironment(
        'production',
        'change-me-use-a-unique-jwt-access-secret-min-32-chars',
      ),
    ).toThrow(/production/);
    expect(() =>
      assertJwtSecretForEnvironment(
        'production',
        'replace-with-a-long-random-access-secret',
      ),
    ).toThrow(/production/);
  });

  it('rejects short secrets in production', () => {
    expect(() =>
      assertJwtSecretForEnvironment('production', 'short-secret'),
    ).toThrow(/production/);
  });

  it('allows a unique long secret in production', () => {
    expect(() =>
      assertJwtSecretForEnvironment(
        'production',
        'local-dev-only-unique-jwt-access-secret-value-48',
      ),
    ).not.toThrow();
  });
});
