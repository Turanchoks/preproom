import { notFound } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { StudentPanel } from "@/components/studio/student-panel";
import { getStudentById } from "@/lib/db/queries-studio";

export default async function Page({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const session = await auth();

  if (!session?.user) {
    notFound();
  }

  const student = await getStudentById({ id: studentId });

  if (!student || student.userId !== session.user.id) {
    notFound();
  }

  return <StudentPanel student={student} />;
}
