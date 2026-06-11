import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  name: text("name"),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  isAnonymous: boolean("isAnonymous").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
  studentId: uuid("studentId").references(() => student.id, {
    onDelete: "set null",
  }),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  })
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", {
      enum: ["text", "code", "image", "sheet", "homework"],
    })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    studentId: uuid("studentId").references(() => student.id, {
      onDelete: "set null",
    }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
  })
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

// ── TutorRoom additions ──────────────────────────────────────────────

export const student = pgTable("Student", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  name: text("name").notNull(),
  level: varchar("level", { length: 8 }),
  goals: text("goals"),
  nativeLanguage: varchar("nativeLanguage", { length: 32 }),
  targetLanguage: varchar("targetLanguage", { length: 32 }),
  avatarColor: varchar("avatarColor", { length: 16 }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Student = InferSelectModel<typeof student>;

export const studentFact = pgTable("StudentFact", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  studentId: uuid("studentId")
    .notNull()
    .references(() => student.id, { onDelete: "cascade" }),
  category: varchar("category", {
    enum: ["strength", "error", "interest", "note", "progress"],
  })
    .notNull()
    .default("note"),
  fact: text("fact").notNull(),
  source: varchar("source", {
    enum: ["chat", "video_analysis", "teacher", "homework_result"],
  })
    .notNull()
    .default("chat"),
  sourceRef: text("sourceRef"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type StudentFact = InferSelectModel<typeof studentFact>;

export const video = pgTable("Video", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  studentId: uuid("studentId")
    .notNull()
    .references(() => student.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  gcsUri: text("gcsUri"),
  mimeType: varchar("mimeType", { length: 64 }),
  status: varchar("status", {
    enum: ["uploading", "processing", "ready", "failed"],
  })
    .notNull()
    .default("uploading"),
  summary: text("summary"),
  analysisDocumentId: uuid("analysisDocumentId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Video = InferSelectModel<typeof video>;

export const share = pgTable("Share", {
  slug: varchar("slug", { length: 32 }).primaryKey().notNull(),
  documentId: uuid("documentId").notNull(),
  studentId: uuid("studentId").references(() => student.id, {
    onDelete: "cascade",
  }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Share = InferSelectModel<typeof share>;
