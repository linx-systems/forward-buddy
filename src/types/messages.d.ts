import type { Alias, Account, PasswordResult, SieveScript } from './forward-email.js';

export type MessageType =
  | { type: 'testConnection'; token: string }
  | { type: 'getDomains' }
  | { type: 'getAliases'; domain: string }
  | { type: 'createAlias'; domain: string; data: Partial<Alias> }
  | { type: 'updateAlias'; domain: string; id: string; data: Partial<Alias> }
  | { type: 'deleteAlias'; domain: string; id: string }
  | { type: 'generatePassword'; domain: string; id: string }
  | { type: 'matchAliases'; addresses: string[] }
  | { type: 'setDemoMode'; enabled: boolean }
  | { type: 'getDemoMode' }
  | { type: 'getSieveScripts'; domain: string; aliasId: string }
  | { type: 'getSieveScript'; domain: string; aliasId: string; scriptId: string }
  | { type: 'createSieveScript'; domain: string; aliasId: string; data: Partial<SieveScript> }
  | { type: 'updateSieveScript'; domain: string; aliasId: string; scriptId: string; data: Partial<SieveScript> }
  | { type: 'deleteSieveScript'; domain: string; aliasId: string; scriptId: string }
  | { type: 'activateSieveScript'; domain: string; aliasId: string; scriptId: string };

export type MessageResponse<T = unknown> =
  | { data: T; error?: never; status?: never }
  | { error: string; status?: number; data?: never };
