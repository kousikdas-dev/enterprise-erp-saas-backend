export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  email?: string;
  typ: 'access';
  iat?: number;
  exp?: number;
}
