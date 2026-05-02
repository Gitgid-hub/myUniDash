/** Row returned by GET `/api/admin/workspace-users` (admin-only). */
export type WorkspaceUserRow = {
  id: string;
  email: string;
  created_at: string | null;
  last_sign_in_at: string | null;
  workspace_saved_at: string | null;
  last_activity_at: string | null;
};
