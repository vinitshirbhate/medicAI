/** A render failure must never leave a triage screen blank.
 *
 * A clinician staring at an empty page has no way to tell a quiet console from a broken one. This
 * catches the failure, names it, and keeps a way back to the queue.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Sundara console render error:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto max-w-[70ch] p-8">
        <div className="paper-card p-6">
          <h2 className="text-[19px] font-semibold">The console could not render this view</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">
            No clinical decision was recorded and no patient data was changed. The triage service is
            unaffected — this is a fault in the console itself.
          </p>
          <pre className="mt-4 rounded-[--radius-md] px-3.5 py-3 font-mono text-[12px] break-words whitespace-pre-wrap"
            style={{ background: "var(--surface-sunken)" }}>
            {error.message}
          </pre>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <button onClick={() => window.location.assign("/")}
              className="focus-ring rounded-full px-4 py-2 text-[13.5px] font-semibold text-white"
              style={{ background: "var(--accent)" }}>
              Back to the queue
            </button>
            <button onClick={() => this.setState({ error: null })}
              className="focus-ring rounded-full border px-4 py-2 text-[13.5px] font-semibold text-ink-2"
              style={{ borderColor: "var(--rule-strong)" }}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
