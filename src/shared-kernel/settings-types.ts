export interface UserSettings {
  displayName: string | null;
  email: string;
  unitPreference: 'oz' | 'ml';
  currencyPreference: string;
  emailVerified: boolean;
}

export interface UpdateSettingsInput {
  displayName?: string | null;
  unitPreference?: string;
  currencyPreference?: string;
}

export interface SessionSummary {
  id: string;
  deviceLabel: string | null;
  createdAt: number;
  expiresAt: number;
  current: boolean;
}

export interface DataExport {
  exportedAt: number;
  profile: { id: string; email: string; displayName: string | null; unitPreference: string; currencyPreference: string; createdAt: number };
  shifts: unknown[];
  goal: unknown | null;
  recipes: unknown[];
}
