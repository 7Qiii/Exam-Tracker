import { createClient } from "@supabase/supabase-js";

const defaultModel = process.env.OPENAI_MODEL || process.env.AI_MODEL || "qwen-vl-plus";
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

  const { imageDataUrl, imageUrl, subjectName = "", currentTitle = "", currentKnowledgePoint = "", currentAnalysis = "" } = request.body || {};
  const imageSource = imageDataUrl || imageUrl;
  if (!isValidImageSource(imageSource)) {
    response.status(400).json({ error: "Invalid image data" });
    return;
  }
  if (imageDataUrl && estimateDataUrlBytes(imageDataUrl) > maxImageBytes) {
    response.status(400).json({ error: "Image is too large for AI analysis" });
    return;
  }

  try {
    const result = await analyzeImage({
      apiKey,
      model: defaultModel,
      baseUrl: defaultBaseUrl,
      imageSource,
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

async function analyzeImage({ apiKey, model, baseUrl, imageSource, subjectName, currentTitle, currentKnowledgePoint, currentAnalysis }) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildPrompt({ subjectName, currentTitle, currentKnowledgePoint, currentAnalysis })
            },
            {
              type: "image_url",
              image_url: {
                url: imageSource
              }
            }
          ]
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    const error = new Error(message || "AI analysis failed");
    error.status = response.status;
    throw error;
  }

  return normalizeAiResult(await response.json());
}

function buildPrompt({ subjectName, currentTitle, currentKnowledgePoint, currentAnalysis }) {
  return [
    "你是考研错题整理助手。请根据图片识别题目内容，并生成适合错题本的结构化结果。",
    "只输出一个 JSON 对象，不要 Markdown，不要解释。",
    "JSON 字段必须为 title、knowledgePoint、questionText、analysis。",
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
  const outputText = payload.choices?.[0]?.message?.content || payload.output_text || findOutputText(payload);
  if (!outputText) throw new Error("AI returned an empty response");
  const parsed = parseModelJson(outputText);
  return {
    title: cleanText(parsed.title),
    knowledgePoint: cleanText(parsed.knowledgePoint),
    questionText: cleanText(parsed.questionText),
    analysis: cleanText(parsed.analysis)
  };
}

function parseModelJson(outputText) {
  try {
    return JSON.parse(extractJsonObject(outputText));
  } catch {
    return {
      title: "错题复盘",
      knowledgePoint: "",
      questionText: "",
      analysis: cleanText(outputText)
    };
  }
}

function extractJsonObject(value) {
  const text = String(value || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

function findOutputText(payload) {
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

function isValidImageSource(value) {
  return /^data:image\/(png|jpe?g|webp);base64,/i.test(value || "") || /^https?:\/\//i.test(value || "");
}

function estimateDataUrlBytes(value) {
  const base64 = String(value || "").split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

function cleanText(value) {
  return String(value || "").trim();
}

async function readErrorMessage(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed.error?.message || parsed.message || text;
  } catch {
    return text;
  }
}
