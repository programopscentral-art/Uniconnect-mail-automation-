/**
 * Operations OS — Server-Sent Events channel registry.
 *
 * One channel per connected user. Producers call publish() to fan out to
 * all sessions a user has open across browser tabs/devices.
 *
 * Phase 0: registry + publish helper. Consumers (the dashboard) connect in
 * Phase 4. The submission API routes already emit events through this
 * registry on state changes so when the dashboards land, they're live.
 *
 * Scope enforcement: callers MUST resolve the recipient user list before
 * calling publish. This registry does NOT do scope filtering — that's an
 * application-layer concern (who should receive an event for campus X).
 *
 * Why in-memory registry, not Redis pub/sub: Phase 0 runs on a single app
 * instance. When we scale to multiple app instances (V1+), the registry
 * becomes a Redis pub/sub subscription per instance. Interface stays the
 * same; only the transport changes.
 */

import type { EventType } from '@uniconnect/shared';

export interface OpsOSSSEEvent {
    event_type: EventType | 'connected' | 'heartbeat';
    data: Record<string, unknown>;
    /** Server-side timestamp (ISO). Clients should use their own wall clock for display. */
    server_time: string;
}

interface Subscriber {
    /** Called per event. Implementations write to the SSE response stream. */
    send: (event: OpsOSSSEEvent) => void;
}

class ChannelRegistry {
    private channels = new Map<string, Set<Subscriber>>();

    subscribe(user_id: string, sub: Subscriber): () => void {
        let set = this.channels.get(user_id);
        if (!set) {
            set = new Set();
            this.channels.set(user_id, set);
        }
        set.add(sub);
        return () => this.unsubscribe(user_id, sub);
    }

    unsubscribe(user_id: string, sub: Subscriber): void {
        const set = this.channels.get(user_id);
        if (!set) return;
        set.delete(sub);
        if (set.size === 0) this.channels.delete(user_id);
    }

    publish(user_id: string, event: Omit<OpsOSSSEEvent, 'server_time'>): void {
        const set = this.channels.get(user_id);
        if (!set || set.size === 0) return;
        const full: OpsOSSSEEvent = { ...event, server_time: new Date().toISOString() };
        for (const sub of set) {
            try {
                sub.send(full);
            } catch (e) {
                console.error('[OPS_OS_SSE] subscriber send failed:', (e as Error).message);
            }
        }
    }

    /** Fan out to a list of users — typical pattern for scope-filtered events. */
    publishMany(user_ids: string[], event: Omit<OpsOSSSEEvent, 'server_time'>): void {
        for (const uid of user_ids) this.publish(uid, event);
    }

    subscriberCount(user_id: string): number {
        return this.channels.get(user_id)?.size ?? 0;
    }

    totalChannels(): number {
        return this.channels.size;
    }
}

export const opsOsChannels = new ChannelRegistry();
