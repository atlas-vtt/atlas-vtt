import React from 'react';
import { Button } from '../../packages/components/primitives/button';

interface ActionCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

/** A tile of the dashboard's action grid. */
export function ActionCard({ icon, title, description, onClick }: ActionCardProps): React.ReactElement {
  return (
    <Button variant="ghost" className="action-card" onClick={onClick}>
      <span className="action-icon">{icon}</span>
      <span className="action-text">
        <span className="action-title">{title}</span>
        <span className="action-desc">{description}</span>
      </span>
    </Button>
  );
}
