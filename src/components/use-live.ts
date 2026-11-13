"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const listeners = new Set<() => void>();
let source: EventSource | null = null;

// One EventSource per tab, however many components are listening.
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!source) {
    source = new EventSource("/api/events");
    source.addEventListener("change", () => listeners.forEach((l) => l()));
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      source?.close();
      source = null;
    }
  };
}

/** Fetches JSON and refetches whenever the database changes. Pass null to skip. */
export function useLive<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(url !== null);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    if (!url) return;
    const ticket = ++latest.current;
    try {
      const response = await fetch(url, { cache: "no-store" });
      const body = await response.json();
      // A slower, older response must not overwrite a newer one.
      if (ticket !== latest.current) return;
      if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status}).`);
      setData(body as T);
      setError(null);
    } catch (e) {
      if (ticket === latest.current) setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (!url) {
      latest.current++;
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
    return subscribe(() => void refresh());
  }, [url, refresh]);

  return { data, error, loading, refresh };
}

/** Sends a JSON request and throws the server's error message on failure. */
export async function send<T = unknown>(url: string, method: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(parsed.error ?? `Request failed (${response.status}).`);
  return parsed as T;
}
