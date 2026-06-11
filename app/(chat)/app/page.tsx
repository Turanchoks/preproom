import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { StudentsEmptyState } from "@/components/studio/students-empty-state";
import { getStudentsByUserId } from "@/lib/db/queries-studio";

export default async function Page() {
  const session = await auth();

  if (!session?.user) {
    redirect("/api/auth/guest?redirectUrl=/app");
  }

  const students = await getStudentsByUserId({ userId: session.user.id });

  if (students.length > 0) {
    redirect(`/app/student/${students[0].id}`);
  }

  return <StudentsEmptyState />;
}
