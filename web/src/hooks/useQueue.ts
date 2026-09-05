/** The live triage queue.
 *
 * The socket is the primary source. When it drops, the last known queue stays on screen — a blank
 * list during a network blip is worse than a slightly stale one — the console says updates are
 * paused, falls back to polling, and keeps trying to reconnect.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { api, queueSocketUrl } from "../api/client";
import { normalizeQueue } from "../api/normalize";
import type { QueueItem } from "../api/types";

const RECONNECT_MS = 4000;
const POLL_MS = 15000;

export type QueueState = {
  patients: QueueItem[];
  updatedAt: string | null;
  live: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useQueue(): QueueState {
  const [patients, setPatients] = useState<QueueItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const timers = useRef<{ reconnect?: number; poll?: number }>({});

  const refresh = useCallback(async () => {
    try {
      const response = await api.queue();
      setPatients(normalizeQueue(response.patients));
      setUpdatedAt(response.updated_at);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Queue unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      let socket: WebSocket;
      try {
        socket = new WebSocket(queueSocketUrl());
      } catch {
        timers.current.reconnect = window.setTimeout(connect, RECONNECT_MS);
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        setLive(true);
        setError(null);
        window.clearInterval(timers.current.poll);
      };
      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          const message = JSON.parse(event.data) as { type: string; at: string; queue: unknown[] };
          if (message.type !== "queue.updated") return;
          setPatients(normalizeQueue(message.queue));
          setUpdatedAt(message.at);
          setLoading(false);
        } catch {
          // A malformed frame is not a reason to blank the queue; the next one usually parses.
        }
      };
      const drop = () => {
        if (disposed) return;
        setLive(false);
        // Keep the last queue on screen and fall back to polling until the socket returns.
        window.clearInterval(timers.current.poll);
        timers.current.poll = window.setInterval(() => void refresh(), POLL_MS);
        timers.current.reconnect = window.setTimeout(connect, RECONNECT_MS);
      };
      socket.onclose = drop;
      socket.onerror = () => socket.close();
    };

    void refresh();
    connect();

    return () => {
      disposed = true;
      window.clearTimeout(timers.current.reconnect);
      window.clearInterval(timers.current.poll);
      socketRef.current?.close();
    };
  }, [refresh]);

  return { patients, updatedAt, live, loading, error, refresh };
}
