import type { Alias, SieveScript } from '../types/forward-email.js';

export const DEMO_DOMAINS = [
  { name: 'example.com' },
  { name: 'johndoe.net' },
];

export const DEMO_ALIASES: Record<string, Alias[]> = {
  'example.com': [
    {
      id: 'demo-1', name: 'hello', is_enabled: true,
      recipients: ['john@gmail.com'], description: 'Main contact alias',
      labels: ['personal'], has_imap: true, has_pgp: false,
      has_recipient_verification: false,
      vacation_responder_is_enabled: true,
      vacation_responder_start_date: '2026-04-20',
      vacation_responder_end_date: '2026-05-04',
      vacation_responder_subject: 'Out of office',
      vacation_responder_message: 'Thanks for your email! I am on vacation until May 4th and will reply when I return.',
      created_at: '2025-01-15T10:30:00Z', updated_at: '2025-06-20T14:00:00Z',
    },
    {
      id: 'demo-2', name: 'shop', is_enabled: true,
      recipients: ['john@gmail.com'], description: 'Online shopping',
      labels: ['shopping'], has_imap: false, has_pgp: false,
      has_recipient_verification: false,
      created_at: '2025-02-10T08:00:00Z', updated_at: '2025-05-12T09:30:00Z',
    },
    {
      id: 'demo-3', name: '*', is_enabled: true,
      recipients: ['john@gmail.com'], description: 'Catch-all for example.com',
      labels: [], has_imap: false, has_pgp: false,
      has_recipient_verification: false,
      created_at: '2025-01-15T10:30:00Z', updated_at: '2025-01-15T10:30:00Z',
    },
    {
      id: 'demo-4', name: 'news', is_enabled: false,
      recipients: ['john@gmail.com'], description: 'Newsletter signups (disabled)',
      labels: ['newsletters'], has_imap: false, has_pgp: false,
      has_recipient_verification: false,
      created_at: '2025-03-01T12:00:00Z', updated_at: '2025-07-04T16:45:00Z',
    },
    {
      id: 'demo-5', name: '/^support-.*/', is_enabled: true,
      recipients: ['john@gmail.com', 'jane@gmail.com'], description: 'Support regex pattern',
      labels: ['work'], has_imap: true, has_pgp: true,
      has_recipient_verification: true,
      created_at: '2025-04-20T11:00:00Z', updated_at: '2025-08-01T10:00:00Z',
    },
  ],
  'johndoe.net': [
    {
      id: 'demo-6', name: 'me', is_enabled: true,
      recipients: ['john@gmail.com'], description: 'Personal blog contact',
      labels: ['blog'], has_imap: true, has_pgp: false,
      has_recipient_verification: false,
      created_at: '2025-05-01T09:00:00Z', updated_at: '2025-05-01T09:00:00Z',
    },
  ],
};

export const DEMO_SIEVE_SCRIPTS: Record<string, SieveScript[]> = {
  'example.com:demo-1': [
    {
      id: 'sieve-1', name: 'File newsletters',
      content: 'require "fileinto";\nif header :contains "List-Id" "newsletter" {\n  fileinto "Newsletters";\n}',
      description: 'Move newsletter messages to folder',
      is_active: true,
      created_at: '2025-06-01T10:00:00Z', updated_at: '2025-06-01T10:00:00Z',
    },
    {
      id: 'sieve-2', name: 'Reject spam senders',
      content: 'if header :is "from" "spammer@junk.com" {\n  reject "Unwanted mail";\n}',
      description: 'Block known spam sender',
      is_active: false,
      created_at: '2025-07-15T12:00:00Z', updated_at: '2025-07-15T12:00:00Z',
    },
  ],
};
