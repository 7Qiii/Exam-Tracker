import { createClient } from "@supabase/supabase-js";

const defaultModel = process.env.OPENAI_MODEL || process.env.AI_MODEL || "gpt-4o-mini";
const defaultBaseUrl = process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL || "https://api.openai.com/v1";
const maxImageBytes = 1.2 * 1024 * 1024;

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    response.status(500).json({ error: "OPENAI_API_KEY is not configured" });
    return;
  }

  const token = (request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const authError = await verifyUser(token);
  if (authError) {
    response.status(authError.status).json({ error: authError.message });
    return;
  }

  const { imageDataUrl, subjectName = "", currentTitle = "", currentKnowledgePoint = "", currentAnalysis = "" } = request.body || {};
  if (!isValidImageDataUrl(imageDataUrl)) {
    response.status(400).json({ error: "Invalid image data" });
    return;
  }
  if (estimateDataUrlBytes(imageDataUrl) > maxImageBytes) {
    response.status(400).json({ error: "Image is too large for AI analysis" });
    return;
  }

  try {
    const result = await analyzeImage({
      apiKey,
      model: defaultModel,
      baseUrl: defaultBaseUrl,
      imageDataUrl,
      subjectName,
      currentTitle,
      currentKnowledgePoint,
      currentAnalysis
    });
    response.status(200).json(result);
  } catch (error) {
    response.status(error.status || 500).json({ error: error.message || "AI analysis failed" });
  }
}

async function verifyUser(token) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  if (!token) return { status: 401, message: "Missing auth token" };

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { status: 401, message: "Invalid auth token" };
  return null;
}

async function analyzeImage({ apiKey, model, baseUrl, imageDataUrl, subjectName, currentTitle, currentKnowledgePoint, currentAnalysis }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildPrompt({ subjectName, currentTitle, currentKnowledgePoint, currentAnalysis })
            },
            {
              type: "input_image",
              image_url: imageDataUrl
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "mistake_review",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              knowledgePoint: { type: "string" },
              questionText: { type: "string" },
              analysis: { type: "string" }
            },
            required: ["title", "knowledgePoint", "questionText", "analysis"]
          }
        }
      }
    })
  });

  if (!response.ok) {
    const message = await response.text();
    const error = new Error(message || "AI analysis failed");
    error.status = response.status;
    throw error;
  }

  return normalizeAiResult(await response.json());
}

function buildPrompt({ subjectName, currentTitle, currentKnowledgePoint, currentAnalysis }) {
  return [
    "你是考研错题整理助手。请根据图片识别题目内容，并生成适合错题本的结构化结果。",
    "要求：",
    "1. 如果图片文字不完整，不要编造题目细节，只写可确认的信息。",
    "2. title 要简短，像错题标题，不超过 24 个中文字符。",
    "3. knowledgePoint 写核心知识点，多个知识点用 / 分隔。",
    "4. questionText 摘录题干关键信息，可为空字符串。",
    "5. analysis 写成中文复盘，包含错因、正确路径、下次识别信号。",
    `当前科目：${subjectName || "未指定"}`,
    `已有标题：${currentTitle || "无"}`,
    `已有知识点：${currentKnowledgePoint || "无"}`,
    `已有解析：${currentAnalysis || "无"}`
  ].join("\n");
}

function normalizeAiResult(payload) {
  const outputText = payload.output_text || findOutputText(payload);
  if (!outputText) throw new Error("AI returned an empty response");
  const parsed = JSON.parse(outputText);
  return {
    title: cleanText(parsed.title),
    knowledgePoint: cleanText(parsed.knowledgePoint),
    questionText: cleanText(parsed.questionText),
    analysis: cleanText(parsed.analysis)
  };
}

function findOutputText(payload) {
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

function isValidImageDataUrl(value) {
  return /^data:image\/(png|jpe?g|webp);base64,/i.test(value || "");
}

function estimateDataUrlBytes(value) {
  const base64 = String(value || "").split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

function cleanText(value) {
  return String(value || "").trim();
}
