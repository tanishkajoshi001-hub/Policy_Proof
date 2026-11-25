import React from 'react';
import { Card, Container, Loading } from '../../shared/ui';

export const LoadingFallback: React.FC<{ label?: string }> = ({ label }) => {
  return (
    <Container maxWidth="lg" className="py-12">
      <Card>
        <Loading label={label ?? 'Loading application module...'} />
      </Card>
    </Container>
  );
};
