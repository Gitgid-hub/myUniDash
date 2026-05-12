"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";

export type AppConfirmState = {
  title: string;
  description: string;
  variant?: "default" | "danger";
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
} | null;

export function SchoolOsAppConfirm({
  confirm,
  onCancel,
  onConfirm
}: {
  confirm: AppConfirmState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={Boolean(confirm)}
      title={confirm?.title ?? ""}
      description={confirm?.description ?? ""}
      variant={confirm?.variant ?? "default"}
      confirmLabel={confirm?.confirmLabel}
      cancelLabel={confirm?.cancelLabel}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
