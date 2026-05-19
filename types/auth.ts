export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  updatesOptIn: boolean;
};

export type MagicLinkRequestResult = {
  delivery: 'resend' | 'preview';
  previewUrl?: string;
};

export type AuthSession = {
  sessionToken: string;
  user: AuthUser;
};

export type UpdatesSignupResult = {
  ok: boolean;
  email: string;
  updatesOptIn: boolean;
};
