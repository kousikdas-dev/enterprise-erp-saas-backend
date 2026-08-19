const INSECURE_JWT_SECRETS = new Set([
  'replace-with-a-long-random-access-secret',
  'change-me-use-a-unique-jwt-access-secret-min-32-chars',
  'test-access-secret-change-me',
]);

export function assertJwtSecretForEnvironment(
  nodeEnv: string,
  secret: string,
): void {
  if (nodeEnv !== 'production') {
    return;
  }
  if (secret.length < 32 || INSECURE_JWT_SECRETS.has(secret)) {
    throw new Error(
      'JWT_ACCESS_SECRET must be a unique secret of at least 32 characters in production',
    );
  }
}
