import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
export const isSupabaseProxyEnabled = shouldUseSupabaseProxy();
const supabaseApiUrl = isSupabaseProxyEnabled ? `${window.location.origin}/api/supabase-proxy` : supabaseUrl;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseApiUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      },
      realtime: {
        params: {
          eventsPerSecond: 2
        }
      },
      global: {
        headers: isSupabaseProxyEnabled ? { "x-supabase-url": supabaseUrl } : {}
      }
    })
  : null;

function shouldUseSupabaseProxy() {
  if (typeof window === "undefined") return false;
  if (import.meta.env.VITE_SUPABASE_PROXY === "false") return false;
  return window.location.hostname !== "127.0.0.1" && window.location.hostname !== "localhost";
}

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
  if (!error) return;
  if (isMissingRecordUpdatedAtColumn(error)) {
    const { error: withoutUpdatedAtError } = await supabase.from("records").upsert(toRecordRowWithoutUpdatedAt(record));
    if (!withoutUpdatedAtError) return;
    if (isMissingRecordCompositeColumn(withoutUpdatedAtError)) {
      const { error: withoutBothError } = await supabase.from("records").upsert(toRecordRowWithoutUpdatedAtAndComposite(record));
      if (!withoutBothError) return;
      if (isMissingRecordDurationColumn(withoutBothError) || isMissingRecordSourceColumn(withoutBothError)) {
        const { error: legacyError } = await supabase.from("records").upsert(toLegacyRecordRow(record));
        if (legacyError) throw legacyError;
        return;
      }
      throw withoutBothError;
    }
    if (isMissingRecordDurationColumn(withoutUpdatedAtError) || isMissingRecordSourceColumn(withoutUpdatedAtError)) {
      const { error: legacyError } = await supabase.from("records").upsert(toLegacyRecordRow(record));
      if (legacyError) throw legacyError;
      return;
    }
    throw withoutUpdatedAtError;
  }
  if (isMissingRecordCompositeColumn(error)) {
    const { error: withoutCompositeError } = await supabase.from("records").upsert(toRecordRowWithoutComposite(record));
    if (!withoutCompositeError) return;
    if (isMissingRecordUpdatedAtColumn(withoutCompositeError)) {
      const { error: withoutBothError } = await supabase.from("records").upsert(toRecordRowWithoutUpdatedAtAndComposite(record));
      if (!withoutBothError) return;
      if (isMissingRecordDurationColumn(withoutBothError) || isMissingRecordSourceColumn(withoutBothError)) {
        const { error: legacyError } = await supabase.from("records").upsert(toLegacyRecordRow(record));
        if (legacyError) throw legacyError;
        return;
      }
      throw withoutBothError;
    }
    throw withoutCompositeError;
  }
  if (isMissingRecordDurationColumn(error) || isMissingRecordSourceColumn(error)) {
    const { error: legacyError } = await supabase.from("records").upsert(toLegacyRecordRow(record));
    if (legacyError) throw legacyError;
    return;
  }
  throw error;
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
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
  return () => data.subscription.unsubscribe();
}

export function subscribeCloudChanges(userId, handlers = {}) {
  if (!supabase || !userId) return () => {};

  const channel = supabase
    .channel(`exam-tracker-sync:${userId}`)
    .on("postgres_changes", realtimeOptions("subjects", userId), (payload) => {
      dispatchRealtimePayload(payload, fromSubjectRow, handlers.subjects);
    })
    .on("postgres_changes", realtimeOptions("records", userId), (payload) => {
      dispatchRealtimePayload(payload, fromRecordRow, handlers.records);
    })
    .on("postgres_changes", realtimeOptions("mistakes", userId), (payload) => {
      dispatchRealtimePayload(payload, fromMistakeRow, handlers.mistakes);
    })
    .on("postgres_changes", realtimeOptions("mistake_images", userId), (payload) => {
      dispatchRealtimePayload(payload, fromImageRow, handlers.images);
    })
    .subscribe((status, error) => {
      handlers.onStatus?.(status, error);
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

function realtimeOptions(table, userId) {
  return {
    event: "*",
    schema: "public",
    table,
    filter: `user_id=eq.${userId}`
  };
}

function dispatchRealtimePayload(payload, mapRow, handlers = {}) {
  if (payload.eventType === "DELETE") {
    handlers.delete?.(payload.old?.id, payload.old, payload);
    return;
  }
  if (payload.new) {
    handlers.upsert?.(mapRow(payload.new), payload);
  }
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

function isMissingRecordDurationColumn(error) {
  return /duration_minutes/i.test(`${error.message || ""} ${error.details || ""}`);
}

function isMissingRecordSourceColumn(error) {
  return /record_type|exercise_book_name|exercise_page|exercise_question/i.test(`${error.message || ""} ${error.details || ""}`);
}

function isMissingRecordUpdatedAtColumn(error) {
  return /updated_at/i.test(`${error.message || ""} ${error.details || ""}`);
}

function isMissingRecordCompositeColumn(error) {
  return /composite_source_ids/i.test(`${error.message || ""} ${error.details || ""}`);
}

function fromRecordRow(row) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    recordType: row.record_type || "paper",
    paperName: row.paper_name,
    exerciseBookName: row.exercise_book_name || "",
    exercisePage: row.exercise_page || "",
    exerciseQuestion: row.exercise_question || "",
    score: row.score,
    fullScore: row.full_score,
    durationMinutes: row.duration_minutes == null ? "" : Number(row.duration_minutes),
    date: row.date,
    note: row.note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    compositeSourceIds: Array.isArray(row.composite_source_ids) ? row.composite_source_ids : []
  };
}

function toRecordRow(record) {
  return {
    ...toRecordRowWithoutUpdatedAt(record),
    updated_at: record.updatedAt || record.createdAt
  };
}

function toRecordRowWithoutComposite(record) {
  const row = toRecordRow(record);
  delete row.composite_source_ids;
  return row;
}

function toRecordRowWithoutUpdatedAtAndComposite(record) {
  const row = toRecordRowWithoutUpdatedAt(record);
  delete row.composite_source_ids;
  return row;
}

function toRecordRowWithoutUpdatedAt(record) {
  return {
    ...toLegacyRecordRow(record),
    duration_minutes: toDurationValue(record.durationMinutes),
    record_type: record.recordType === "exercise" || record.recordType === "composite" ? record.recordType : "paper",
    exercise_book_name: record.recordType === "exercise" ? record.exerciseBookName || "" : "",
    exercise_page: record.recordType === "exercise" ? record.exercisePage || "" : "",
    exercise_question: record.recordType === "exercise" ? record.exerciseQuestion || "" : "",
    composite_source_ids: Array.isArray(record.compositeSourceIds) ? record.compositeSourceIds : []
  };
}

function toLegacyRecordRow(record) {
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

function toDurationValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : null;
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
