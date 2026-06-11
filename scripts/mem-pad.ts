// Pads a student with N filler facts dated AFTER the existing ones, pushing the
// early high-value facts (Sofia, interview date) out of the recent-20 window.
// Usage: tsx scripts/mem-pad.ts <STUDENT_ID> <N>
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { studentFact } from "../lib/db/schema";

const STUDENT_ID = process.argv[2];
const N = Number(process.argv[3] || 25);
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

const FILLERS = [
  "Prefers afternoon practice over morning.",
  "Likes football metaphors in explanations.",
  "Responds well to visual flashcards.",
  "Enjoys talking about Italian food.",
  "Tends to speak quickly when nervous.",
  "Good at guessing vocabulary from context.",
  "Sometimes forgets articles before nouns.",
  "Likes short five-minute warm-up games.",
  "Has a strong Roman accent he wants to soften.",
  "Watches English football commentary for practice.",
  "Prefers concrete examples over abstract rules.",
  "Comfortable with numbers and prices.",
  "Mixes up 'since' and 'for' occasionally.",
  "Likes role-play set in restaurants.",
  "Wants to learn idioms about travel.",
  "Drops the 'h' sound at the start of words.",
  "Enjoys competitive quiz formats.",
  "Reads simple English news on his commute.",
  "Confident with greetings and small talk.",
  "Wants subtitles when watching English videos.",
  "Likes to repeat new phrases out loud.",
  "Struggles with phrasal verbs like 'look up'.",
  "Prefers a slower speaking partner.",
  "Enjoys learning weather vocabulary.",
  "Good memory for vocabulary he finds funny.",
  "Likes maps and directions exercises.",
  "Asks lots of questions about pronunciation.",
  "Prefers digital homework over paper.",
  "Gets distracted by long instructions.",
  "Wants more listening practice.",
];

async function main() {
  const now = Date.now();
  const rows = [];
  for (let i = 0; i < N; i++) {
    rows.push({
      studentId: STUDENT_ID,
      category: "note" as const,
      fact: FILLERS[i % FILLERS.length],
      source: "chat" as const,
      sourceRef: null,
      // each newer than the last so they dominate the recent-20 window
      createdAt: new Date(now + (i + 1) * 1000),
    });
  }
  await db.insert(studentFact).values(rows);
  console.log(`padded ${N} filler facts`);
  await client.end();
}
main();
