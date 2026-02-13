import type { Alias, Account, PasswordResult } from './forward-email.js';

export type MessageType =
  | { type: 'testConnection'; token: string }
  | { type: 'getDomains' }
  | { type: 'getAliases'; domain: string }
  | { type: 'createAlias'; domain: string; data: Partial<Alias> }
  | { type: 'updateAlias'; domain: string; id: string; data: Partial<Alias> }
  | { type: 'deleteAlias'; domain: string; id: string }
  | { type: 'generatePassword'; domain: string; id: string }
  | { type: 'matchAliases'; addresses: string[] };

export type MessageResponse<T = unknown> =
  | { data: T; error?: never; status?: never }
  | { error: string; status?: number; data?: never };
