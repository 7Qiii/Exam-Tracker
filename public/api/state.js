import { list, put } from "@vercel/blob";

const BLOB_KEY = "exam-11408-state.json";

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (!["GET", "PUT"].includes(request.method)) {
    response.setHeader("Allow", "GET, PUT, OPTIONS");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const expectedPin = process.env.APP_PIN;
  if (!expectedPin) {
    response.status(500).json({ error: "APP_PIN is not configured" });
    return;
  }

  const providedPin = request.headers["x-app-pin"];
  if (providedPin !== expectedPin) {
    response.status(401).json({ error: "Invalid sync password" });
    return;
  }

  try {
    if (request.method === "GET") {
      const result = await list({ prefix: BLOB_KEY, limit: 1 });
      const blob = result.blobs.find((item) => item.pathname === BLOB_KEY);

      if (!blob) {
        response.status(200).json({ state: null });
        return;
      }

      const blobResponse = await fetch(`${blob.url}?t=${Date.now()}`);
      if (!blobResponse.ok) {
        response.status(502).json({ error: "Could not read cloud data" });
        return;
      }

      const state = await blobResponse.json();
      response.status(200).json({ state });
      return;
    }

    const state = request.body;
    if (!isValidState(state)) {
      response.status(400).json({ error: "Invalid state format" });
      return;
    }

    await put(BLOB_KEY, JSON.stringify(state), {
      access: "public",
      allowOverwrite: true,
      contentType: "application/json"
    });

    response.status(200).json({ ok: true });
  } catch (error) {
    response.status(500).json({ error: error.message || "Cloud sync failed" });
  }
}

function isValidState(value) {
  return Boolean(value && Array.isArray(value.subjects) && Array.isArray(value.records));
}
