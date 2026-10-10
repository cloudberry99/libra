import type { ServerRecord, Subscription } from '../shared/types';
export type Page = 'servers' | 'subscriptions' | 'security';
export type DialogState =
  | { kind: 'server'; server?: ServerRecord }
  | { kind: 'subscription'; subscription?: Subscription }
  | { kind: 'import'; server: ServerRecord }
  | { kind: 'json' }
  | { kind: 'qr'; subscription: Subscription }
  | { kind: 'help' }
  | { kind: 'deleteServer'; server: ServerRecord }
  | { kind: 'deleteSubscription'; subscription: Subscription }
  | null;
