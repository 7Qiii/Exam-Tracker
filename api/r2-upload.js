import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

const maxFileSize = 2 * 1024 * 1024;

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  if (!supabaseUrl || !supabaseAnonKey || !bucket || !publicBaseUrl) {
    response.status(500).json({ error: "Supabase or R2 environment variables are missing" });
    return;
  }

  const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    response.status(401).json({ error: "Missing auth token" });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    response.status(401).json({ error: "Invalid auth token" });
    return;
  }

  const { mistakeId, fileName, contentType, size } = request.body || {};
  if (!mistakeId || !fileName || !contentType?.startsWith("image/")) {
    response.status(400).json({ error: "Invalid upload request" });
    return;
  }

  if (Number(size) > maxFileSize) {
    response.status(400).json({ error: "Image is too large after compression" });
    return;
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    response.status(500).json({ error: "R2 credentials are missing" });
    return;
  }

  const extension = contentType.includes("webp") ? "webp" : "jpg";
  const imageId = crypto.randomUUID();
  const key = `users/${data.user.id}/mistakes/${mistakeId}/${imageId}.${extension}`;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey }
  });

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType
    }),
    { expiresIn: 300 }
  );

  response.status(200).json({
    imageId,
    storageKey: key,
    uploadUrl,
    publicUrl: `${publicBaseUrl.replace(/\/$/, "")}/${key}`
  });
}
