// Seeds a fresh test user + Marco-clone student for local memory testing.
// Prints: USER <id>  STUDENT <id>  EMAIL <email>  PASS <pass>
import { genSaltSync, hashSync } from "bcrypt-ts";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { student, user } from "../lib/db/schema";

const url = process.env.POSTGRES_URL!;
const client = postgres(url);
const db = drizzle(client);

async function main() {
  const stamp = Date.now();
  const email = `memtest-${stamp}@local.test`;
  const pass = "Test123456";
  const hash = hashSync(pass, genSaltSync(10));
  const [u] = await db.insert(user).values({ email, password: hash }).returning();
  const [s] = await db
    .insert(student)
    .values({
      userId: u.id,
      name: "Marco Rossi",
      level: "A2",
      goals: "Travel English and everyday conversation",
      nativeLanguage: "Italian",
      targetLanguage: "English",
      avatarColor: "#3b82f6",
    })
    .returning();
  console.log(`USER ${u.id}`);
  console.log(`STUDENT ${s.id}`);
  console.log(`EMAIL ${email}`);
  console.log(`PASS ${pass}`);
  await client.end();
}
main();
