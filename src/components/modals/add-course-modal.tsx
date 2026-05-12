import { X } from "lucide-react";
import { Button, Panel } from "@/components/ui";
import { coursePalette } from "@/lib/color-utils";

export interface AddCourseModalProps {
  newCourseName: string;
  setNewCourseName: (value: string) => void;
  newCourseCode: string;
  setNewCourseCode: (value: string) => void;
  newCourseColor: string;
  setNewCourseColor: (value: string) => void;
  onClose: () => void;
  onCreate: () => void;
}

export function AddCourseModal({
  newCourseName,
  setNewCourseName,
  newCourseCode,
  setNewCourseCode,
  newCourseColor,
  setNewCourseColor,
  onClose,
  onCreate
}: AddCourseModalProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <Panel className="w-full max-w-xl bg-white/96 dark:bg-[#101317]/96" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Add course</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Create a course, then pick its color once.</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-10 w-10 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid gap-3">
          <input
            value={newCourseName}
            onChange={(event) => setNewCourseName(event.target.value)}
            placeholder="Course name"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]"
          />
          <input
            value={newCourseCode}
            onChange={(event) => setNewCourseCode(event.target.value)}
            placeholder="Short label (optional)"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-white/[0.04]"
          />
          <div>
            <p className="mb-2 text-sm font-medium">Course color</p>
            <div className="flex flex-wrap gap-2 rounded-[24px] border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              {coursePalette.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewCourseColor(color)}
                  className={`h-8 w-8 rounded-full border-2 transition ${newCourseColor === color ? "scale-110 border-slate-900 dark:border-white" : "border-transparent"}`}
                  style={{ backgroundColor: color, boxShadow: `0 0 0 1px ${color}40, 0 10px 24px ${color}30` }}
                  aria-label={`Choose course color ${color}`}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onCreate}>Create course</Button>
        </div>
      </Panel>
    </div>
  );
}
