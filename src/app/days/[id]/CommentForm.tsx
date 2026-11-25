"use client";

import { useActionState, useEffect, useRef } from "react";
import { addCommentAction, type CommentState } from "@/app/actions";

export function CommentForm({ dayId }: { dayId: string }) {
  const [state, action, pending] = useActionState<CommentState, FormData>(addCommentAction.bind(null, dayId), {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) form.current?.reset();
  }, [state.ok]);
  return (
    <form ref={form} action={action} className="space-y-2">
      <textarea name="body" required maxLength={500} rows={2} placeholder="Say something about this day…" className="input min-h-[64px] resize-y" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-bad">{state.error}</span>
        <button disabled={pending} className="btn-primary">
          {pending ? "Posting…" : "Comment"}
        </button>
      </div>
    </form>
  );
}
