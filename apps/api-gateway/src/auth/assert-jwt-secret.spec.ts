import { assertJwtSecretForEnvironment } from './assert-jwt-secret';

describe('assertJwtSecretForEnvironment', () => {
  it('allows the local placeholder secret outside production', () => {
    expect(() =>
      assertJwtSecretForEnvironment(
        'development',
        'replace-with-a-long-random-access-secret',
      ),
    ).not.toThrow();
  });

  it('rejects insecure placeholder secrets in production', () => {
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
});
