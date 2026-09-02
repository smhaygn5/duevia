import type { ReactNode } from "react";

export function AppHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="product-header">
      <div>
        {eyebrow && <p>{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <span>{description}</span>}
      </div>
      {action && <div className="product-header-actions">{action}</div>}
    </header>
  );
}
