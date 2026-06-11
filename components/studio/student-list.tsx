"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Student } from "@/lib/db/schema";
import { cn, fetcher } from "@/lib/utils";
import { avatarColorClass } from "./avatar";
import { StudentFormDialog } from "./student-form-dialog";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function useActiveStudentId(): string | null {
  const pathname = usePathname();
  const match = pathname?.match(/\/app\/student\/([^/]+)/);
  return match ? match[1] : null;
}

export function StudentList() {
  const { setOpenMobile } = useSidebar();
  const activeStudentId = useActiveStudentId();

  const { data: students, isLoading } = useSWR<Student[]>(
    `${BASE}/api/students`,
    fetcher,
    { revalidateOnFocus: false }
  );

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/70">
        Students
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {isLoading && !students ? (
            <div className="flex flex-col gap-1 px-1 py-1">
              {[60, 44, 52].map((w) => (
                <div
                  className="h-7 max-w-(--w) animate-pulse rounded-md bg-sidebar-foreground/[0.06]"
                  key={w}
                  style={{ "--w": `${w}%` } as React.CSSProperties}
                />
              ))}
            </div>
          ) : null}

          {students?.map((student) => {
            const isActive = student.id === activeStudentId;
            return (
              <SidebarMenuItem key={student.id}>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "h-8 rounded-lg text-[13px] text-sidebar-foreground/80",
                    isActive &&
                      "bg-sidebar-accent text-sidebar-accent-foreground"
                  )}
                  isActive={isActive}
                >
                  <Link
                    href={`/app/student/${student.id}`}
                    onClick={() => setOpenMobile(false)}
                  >
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        avatarColorClass(student.avatarColor)
                      )}
                    />
                    <span className="flex-1 truncate font-medium">
                      {student.name}
                    </span>
                    {student.level ? (
                      <span className="shrink-0 rounded bg-sidebar-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold text-sidebar-foreground/60">
                        {student.level}
                      </span>
                    ) : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}

          <SidebarMenuItem>
            <StudentFormDialog
              trigger={
                <SidebarMenuButton className="h-8 rounded-lg text-[13px] text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground">
                  <PlusIcon className="size-4" />
                  <span>Add student</span>
                </SidebarMenuButton>
              }
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
