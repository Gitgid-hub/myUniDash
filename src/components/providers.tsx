"use client";

import { AuthProvider } from "@/lib/auth";
import { GlobalToastHub } from "@/components/global-toast-hub";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <GlobalToastHub />
    </AuthProvider>
  );
}
