import Link from "next/link";
import type { ReactNode } from "react";
import type { OperatorIdentity } from "@/src/auth/operator-auth";

const navigation = [
  ["/", "Register", "R"],
  ["/add", "Add knowledge", "+"],
  ["/inbox", "Inbox", "I"],
  ["/knowledge", "Library", "K"],
  ["/memory-map", "Memory map", "M"],
  ["/retrieval", "Retrieval lab", "D"],
] as const;

export function AdminShell({
  children,
  operator,
  workspace,
}: {
  children: ReactNode;
  operator: OperatorIdentity;
  workspace: string;
}) {
  return (
    <div className="admin-frame">
      <aside className="sidebar">
        <Link href={`/?workspace=${workspace}`} className="wordmark">
          <span className="wordmark-mark" aria-hidden="true">
            A/
          </span>
          <span>
            Axelyn
            <small>Knowledge</small>
          </span>
        </Link>
        <nav aria-label="Primary navigation">
          {navigation.map(([href, label, symbol]) => (
            <Link key={href} href={`${href}?workspace=${workspace}`}>
              <span aria-hidden="true">{symbol}</span>
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-meta">
          <span>Workspace</span>
          <strong>{workspace}</strong>
          <span>Operator</span>
          <strong title={operator.email}>{operator.email}</strong>
        </div>
      </aside>
      <main className="main-canvas">{children}</main>
    </div>
  );
}
