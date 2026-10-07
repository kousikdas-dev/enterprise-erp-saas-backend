export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  tenantName?: string;
  email?: string;
  userName?: string;
  typ: 'access';
  iat?: number;
  exp?: number;
}
