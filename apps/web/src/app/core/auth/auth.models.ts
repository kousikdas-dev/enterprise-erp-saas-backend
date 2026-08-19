export interface LoginRequest {
  tenantCode: string;
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthMeResponse {
  userId: string;
  tenantId: string;
}

export interface CurrentUser {
  userId: string;
  tenantId: string;
}
