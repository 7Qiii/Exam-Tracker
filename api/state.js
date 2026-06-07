import { get, put } from "@vercel/blob";

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
      const result = await readCloudState();
      if (!result) {
        response.status(200).json({ state: null });
        return;
      }

      response.status(200).json({ state: result });
      return;
    }

    const state = request.body;
    if (!isValidState(state)) {
      response.status(400).json({ error: "Invalid state format" });
      return;
    }

    await put(BLOB_KEY, JSON.stringify(state), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json"
    });

    response.status(200).json({ ok: true });
  } catch (error) {
    response.status(500).json({ error: error.message || "Cloud sync failed" });
  }
}

async function readCloudState() {
  try {
    const result = await get(BLOB_KEY, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return null;
    }

    return await new Response(result.stream).json();
  } catch (error) {
    if (error?.name === "BlobNotFoundError" || /not found/i.test(error?.message || "")) {
      return null;
    }

    throw error;
  }
}

function isValidState(value) {
  return Boolean(
    value &&
      Array.isArray(value.subjects) &&
      Array.isArray(value.records) &&
      (!value.mistakes || Array.isArray(value.mistakes))
  );
}
