"use client";

import { usePathname } from "next/navigation";

/** Each kiosk screen settles in when it opens, so moving between steps feels continuous. */
export function ScreenTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="flex min-h-0 flex-1 flex-col animate-[screen-in_320ms_cubic-bezier(0.22,1,0.36,1)]">
      {children}
    </div>
  );
}
