import { UserRole } from '@prisma/client';

/** The user resolved from a verified bearer token, attached to the request. */
export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
}

/** Claims carried in the signed access token. */
export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: UserRole;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  user: AuthenticatedUser;
}
