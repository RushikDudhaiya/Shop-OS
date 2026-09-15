type ApiError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export class ApiRequestError extends Error {
  status: number;
  body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiRequestError(0, {
      code: "NETWORK_ERROR",
      message: "Server connect nahi ho raha — API start kariye (npm run dev:api)",
    });
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const body = (data && typeof data === "object"
      ? data
      : {
          code: "REQUEST_FAILED",
          message:
            res.status === 502 || res.status === 503 || res.status === 504
              ? "API server band hai — npm run dev:api chalao"
              : res.statusText || "Request failed",
        }) as ApiError;
    throw new ApiRequestError(res.status, body);
  }

  return data as T;
}
