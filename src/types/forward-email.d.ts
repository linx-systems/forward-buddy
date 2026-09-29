export interface Account {
  email: string;
  plan: string;
  [key: string]: unknown;
}

export interface Domain {
  name: string;
  domain?: string;
  [key: string]: unknown;
}

export interface Alias {
  id: string;
  name: string;
  domain?: string | { name: string };
  recipients?: string[];
  description?: string;
  labels?: string[];
  is_enabled?: boolean;
  has_imap?: boolean;
  has_pgp?: boolean;
  has_recipient_verification?: boolean;
  created_at?: string;
  updated_at?: string;
  vacation_responder_is_enabled?: boolean;
  vacation_responder_start_date?: string;
  vacation_responder_end_date?: string;
  vacation_responder_subject?: string;
  vacation_responder_message?: string;
  [key: string]: unknown;
}

export interface SieveScript {
  id: string;
  name: string;
  content: string;
  description?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface AliasTypeInfo {
  type: 'catchall' | 'regex' | 'direct';
  label: string;
  color: string;
  canDisable: boolean;
}

export interface TruncateResult {
  visible: string[];
  extra: number;
}

export interface PasswordResult {
  password?: string;
  generated_password?: string;
  [key: string]: unknown;
}

export type AuditAction =
  | 'credentials_saved'
  | 'credentials_removed'
  | 'alias_created'
  | 'alias_updated'
  | 'alias_deleted'
  | 'password_generated'
  | 'sieve_created'
  | 'sieve_updated'
  | 'sieve_deleted'
  | 'sieve_activated';

export type AuditStatus = 'success' | 'failure';

export type AuditErrorCategory =
  | 'authentication'
  | 'network'
  | 'rate_limited'
  | 'request'
  | 'server';

export interface AuditEvent {
  id: string;
  timestamp: string;
  action: AuditAction;
  status: AuditStatus;
  target: string;
  statusCode?: number;
  errorCategory?: AuditErrorCategory;
}

export interface AliasMatch {
  address: string;
  alias: Alias;
  domain: string;
}

export interface AliasMatchResult {
  matches: AliasMatch[];
  failedDomains: string[];
}
