import { Card, CardBody } from "@/components/ui/Card";

export function ErrorCard({ error, fallback }: { error: unknown; fallback: string }) {
  const message = error instanceof Error ? error.message : fallback;
  // PostgREST's answer when an admin_* function hasn't been created yet.
  const missingFunction = /could not find the function/i.test(message);
  return (
    <Card>
      <CardBody>
        {missingFunction ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">This page isn&apos;t switched on yet.</p>
            <p className="text-muted">
              Run <code className="rounded bg-slate-100 px-1">supabase/proposed/phase2_admin_functions.sql</code>{" "}
              in the Supabase SQL editor, then reload. It only adds admin functions — no
              tables or columns change.
            </p>
          </div>
        ) : (
          <p className="text-sm text-danger">{message}</p>
        )}
      </CardBody>
    </Card>
  );
}
