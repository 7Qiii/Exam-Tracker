import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;

export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUpWithPassword(email, password) {
  const redirectTo = `${window.location.origin}/login?confirmed=1`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo
    }
  });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadCloudData() {
  if (!supabase) return null;
  const session = await getSession();
  if (!session?.user) return null;

  const [subjects, records, mistakes, images] = await Promise.all([
    supabase.from("subjects").select("*").order("created_at", { ascending: true }),
    supabase.from("records").select("*").order("date", { ascending: false }),
    supabase.from("mistakes").select("*").order("updated_at", { ascending: false }),
    supabase.from("mistake_images").select("*").order("created_at", { ascending: true })
  ]);

  [subjects, records, mistakes, images].forEach((result) => {
    if (result.error) throw result.error;
  });

  return {
    user: session.user,
    subjects: subjects.data.map(fromSubjectRow),
    records: records.data.map(fromRecordRow),
    mistakes: mistakes.data.map(fromMistakeRow),
    images: images.data.map(fromImageRow)
  };
}

export async function upsertSubject(subject) {
  if (!supabase) return;
  const { error } = await supabase.from("subjects").upsert(toSubjectRow(subject));
  if (!error) return;
  if (isMissingSubjectSettingsColumn(error)) {
    const { error: legacyError } = await supabase.from("subjects").upsert(toLegacySubjectRow(subject));
    if (legacyError) throw legacyError;
    return;
  }
  throw error;
}

export async function upsertRecord(record) {
  if (!supabase) return;
  const { error } = await supabase.from("records").upsert(toRecordRow(record));
  if (error) throw error;
}

export async function deleteRecordCloud(id) {
  if (!supabase) return;
  const { error } = await supabase.from("records").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteSubjectCloud(id) {
  if (!supabase) return;
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertMistake(mistake) {
  if (!supabase) return;
  const { error } = await supabase.from("mistakes").upsert(toMistakeRow(mistake));
  if (error) throw error;
}

export async function deleteMistakeCloud(id) {
  if (!supabase) return;
  const { error } = await supabase.from("mistakes").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertMistakeImage(image) {
  if (!supabase) return;
  const { error } = await supabase.from("mistake_images").upsert(toImageRow(image));
  if (error) throw error;
}

export async function deleteMistakeImageCloud(id) {
  if (!supabase) return;
  const { error } = await supabase.from("mistake_images").delete().eq("id", id);
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

function fromSubjectRow(row) {
  return {
    id: row.id,
    name: row.name,
    fullScore: row.full_score,
    color: row.color,
    hidden: Boolean(row.hidden),
    sortOrder: Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : undefined,
    createdAt: row.created_at
  };
}

function toSubjectRow(subject) {
  return {
    ...toLegacySubjectRow(subject),
    display_order: Number(subject.sortOrder ?? 0),
    hidden: Boolean(subject.hidden)
  };
}

function toLegacySubjectRow(subject) {
  return {
    id: subject.id,
    name: subject.name,
    full_score: Number(subject.fullScore),
    target_score: Number(subject.fullScore),
    color: subject.color
  };
}

function isMissingSubjectSettingsColumn(error) {
  return /display_order|hidden/i.test(`${error.message || ""} ${error.details || ""}`);
}

function fromRecordRow(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    paperName: row.paper_name,
    score: row.score,
    fullScore: row.full_score,
    date: row.date,
    note: row.note || "",
    createdAt: row.created_at
  };
}

function toRecordRow(record) {
  return {
    id: record.id,
    subject_id: record.subjectId,
    paper_name: record.paperName,
    score: Number(record.score),
    full_score: Number(record.fullScore),
    date: record.date,
    note: record.note || "",
    created_at: record.createdAt
  };
}

function fromMistakeRow(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    title: row.title,
    knowledgePoint: row.knowledge_point || "",
    reason: row.reason || "concept",
    status: row.status || "待复盘",
    sourceRecordId: row.source_record_id || "",
    questionText: row.question_text || "",
    analysis: row.analysis || "",
    nextReviewAt: row.next_review_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toMistakeRow(mistake) {
  return {
    id: mistake.id,
    subject_id: mistake.subjectId,
    title: mistake.title,
    knowledge_point: mistake.knowledgePoint || "",
    reason: mistake.reason || "concept",
    status: mistake.status || "待复盘",
    source_record_id: mistake.sourceRecordId || null,
    question_text: mistake.questionText || "",
    analysis: mistake.analysis || "",
    next_review_at: mistake.nextReviewAt || null,
    created_at: mistake.createdAt,
    updated_at: mistake.updatedAt
  };
}

function fromImageRow(row) {
  return {
    id: row.id,
    ownerType: "mistake",
    ownerId: row.mistake_id,
    name: row.file_name,
    type: row.mime_type,
    size: row.size,
    storageKey: row.storage_key,
    url: row.public_url,
    width: row.width,
    height: row.height,
    createdAt: row.created_at
  };
}

function toImageRow(image) {
  return {
    id: image.id,
    mistake_id: image.ownerId,
    storage_key: image.storageKey,
    public_url: image.url,
    file_name: image.name,
    mime_type: image.type,
    size: image.size,
    width: image.width || null,
    height: image.height || null,
    created_at: image.createdAt
  };
}
