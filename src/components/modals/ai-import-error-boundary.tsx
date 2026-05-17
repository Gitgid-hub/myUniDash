"use client";

import { Component, type ReactNode } from "react";
import { Button, Panel } from "@/components/ui";

type Props = {
  children: ReactNode;
  onReset: () => void;
};

type State = {
  error: Error | null;
};

export class AiImportErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-[56] flex items-center justify-center bg-black/45 px-3 py-4">
          <Panel className="max-w-sm p-4">
            <h3 className="text-base font-semibold">Could not show parsed tasks</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              The screenshot was processed, but the review screen failed to load. You can try again.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  this.setState({ error: null });
                  this.props.onReset();
                }}
              >
                Try again
              </Button>
            </div>
          </Panel>
        </div>
      );
    }
    return this.props.children;
  }
}
