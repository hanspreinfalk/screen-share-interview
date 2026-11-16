"use client";

import { Lightning, Phone, Plugs } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AuthControls } from "@/components/auth-controls";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const NAV = [
  {
    title: "Interview",
    href: "/interview",
    icon: Phone,
  },
  {
    title: "Automations",
    href: "/automations",
    icon: Lightning,
  },
  {
    title: "Integrations",
    href: "/integrations",
    icon: Plugs,
  },
] as const;

export function AppSidebar({
  className,
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();

  return (
    <Sidebar
      collapsible="icon"
      className={cn("border-r border-[var(--pr-line)] bg-white", className)}
      {...props}
    >
      <SidebarHeader className="gap-3 border-b border-[var(--pr-line)] px-3 py-3">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="text-[var(--pr-ink)]" />
          <Link
            href="/interview"
            className="pr-label flex min-w-0 flex-1 items-center !text-[11px] !tracking-[0.18em] text-[var(--pr-ink)] group-data-[collapsible=icon]:hidden"
          >
            Pacific
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.title}
                      render={<Link href={item.href} />}
                      className={cn(
                        "pr-body text-[13px] text-[var(--pr-soft)]",
                        active && "text-[var(--pr-ink)]",
                      )}
                    >
                      <Icon weight={active ? "fill" : "regular"} />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-[var(--pr-line)] p-3">
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:justify-center">
          <span className="pr-body text-[11px] text-[var(--pr-muted)] group-data-[collapsible=icon]:hidden">
            Account
          </span>
          <AuthControls />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
