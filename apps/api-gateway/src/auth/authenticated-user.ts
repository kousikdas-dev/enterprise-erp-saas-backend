export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  tenantName?: string;
  userName?: string;
}
