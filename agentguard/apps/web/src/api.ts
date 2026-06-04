const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function parseErrorResponse(response: Response) {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error ?? text;
  } catch {
    return text;
  }
}

function backendOfflineError(error: unknown) {
  if (error instanceof TypeError) {
    return new Error(
      `Cannot reach AgentGuard API at ${API_URL}. Start the full stack with "npm run dev" from the agentguard folder, or make sure the API is running on port 4000.`
    );
  }

  return error instanceof Error ? error : new Error("AgentGuard API request failed");
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_URL}${path}`, init);
    if (!response.ok) throw new Error(await parseErrorResponse(response));
    return response.json() as Promise<T>;
  } catch (error) {
    throw backendOfflineError(error);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}

export async function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function apiDelete<T>(path: string, body: unknown = {}): Promise<T> {
  return requestJson<T>(path, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export { API_URL };
