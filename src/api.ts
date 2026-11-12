export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const OFFLINE = "Can't reach the server. Check the wifi and try again.";

/** Calls the game server. Throws ApiError with a message fit to show; status 0 means the request never arrived. */
export async function api<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`./api${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, OFFLINE);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || data === null) throw new ApiError(res.status, data?.error ?? OFFLINE);
  return data;
}

export interface BoardRow {
  rank: number;
  name: string;
  hops: number;
  durationMs: number;
  me?: boolean;
}

export interface Board {
  top: BoardRow[];
  me: BoardRow | null;
  finishers: number;
  players: number;
}

/** 83 000 ms reads as 1:23; past an hour it reads as 1:02:03. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
