import type { AuthUser } from "@gym-erp/contracts";

export type SessionStatus = "bootstrapping" | "authenticated" | "anonymous";

export type SessionState = {
  status: SessionStatus;
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type SessionContextValue = SessionState & {
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};
