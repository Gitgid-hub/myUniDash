import { X } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { coursePalette } from "@/lib/color-utils";

export interface CourseEditorModalProps {
  editName: string;
  setEditName: (value: string) => void;
  editCode: string;
  setEditCode: (value: string) => void;
  editInstructor: string;
  setEditInstructor: (value: string) => void;
  editNotes: string;
  setEditNotes: (value: string) => void;
  editPanoptoFolderUrl: string;
  setEditPanoptoFolderUrl: (value: string) => void;
  editColor: string;
  setEditColor: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  courseArchived: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

export function CourseEditorModal({
  editName,
  setEditName,
  editCode,
  setEditCode,
  editInstructor,
  setEditInstructor,
  editNotes,
  setEditNotes,
  editPanoptoFolderUrl,
  setEditPanoptoFolderUrl,
  editColor,
  setEditColor,
  onClose,
  onSave,
  courseArchived,
  onArchive,
  onRestore,
  onDelete
}: CourseEditorModalProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <Panel className="w-full max-w-2xl bg-white/96 dark:bg-[#101317]/96" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Edit course</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {courseArchived
                ? "This course is archived — hidden from the calendar and active lists. Restore to bring it back with all sessions unchanged."
                : "Update the course details and display style."}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-10 w-10 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Course name" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <input value={editCode} onChange={(event) => setEditCode(event.target.value)} placeholder="Short label" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <input value={editInstructor} onChange={(event) => setEditInstructor(event.target.value)} placeholder="Instructor" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]" />
          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium">Course color</p>
            <div className="flex flex-wrap gap-2">
              {coursePalette.map((color, index) => (
                <button
                  key={`${color}-${index}`}
                  type="button"
                  onClick={() => setEditColor(color)}
                  className={`h-8 w-8 rounded-full border-2 transition ${editColor === color ? "scale-110 border-slate-900 dark:border-white" : "border-transparent"}`}
                  style={{ backgroundColor: color, boxShadow: `0 0 0 1px ${color}40, 0 10px 24px ${color}30` }}
                />
              ))}
            </div>
          </div>
          <textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="Course notes" className="min-h-[120px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none md:col-span-2 dark:border-white/10 dark:bg-white/[0.04]" />
          <div className="md:col-span-2">
            <p className="mb-2 text-sm font-medium">Panopto recordings (optional, but you should.. trust me)</p>
            <input
              id="course-panopto-folder-url"
              value={editPanoptoFolderUrl}
              onChange={(event) => setEditPanoptoFolderUrl(event.target.value)}
              placeholder="Paste the Panopto Sessions list URL for this course"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]"
            />
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              Weekly catch-up and task details use this. Clear the field to fall back to a built-in link when your course code matches our list.
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-between">
          <div className="flex gap-2">
            {courseArchived ? (
              <Button variant="outline" className="text-emerald-600 dark:text-emerald-400" onClick={onRestore}>
                Restore to active
              </Button>
            ) : (
              <Button variant="outline" className="text-slate-600 dark:text-slate-300" onClick={onArchive}>
                Archive
              </Button>
            )}
            <Button variant="outline" className="text-rose-600" onClick={onDelete}>
              Delete
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={onSave}>Save changes</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
