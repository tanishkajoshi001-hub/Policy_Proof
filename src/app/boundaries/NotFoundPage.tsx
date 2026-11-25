import React from 'react';
import { Alert, Button, Card } from '../../shared/ui';
import { APP_ROUTES } from '../../shared/contracts';

interface NotFoundPageProps {
  path: string;
  onNavigateHome: () => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ path, onNavigateHome }) => {
  return (
    <Card className="flex flex-col gap-4 my-4">
      <Alert
        tone="warning"
        title="Page Not Found"
        description={`No route is registered for "${path}".`}
      />
      <div>
        <Button variant="primary" onClick={onNavigateHome}>
          Return to Foundation View ({APP_ROUTES.HOME})
        </Button>
      </div>
    </Card>
  );
};
