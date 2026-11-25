import React from 'react';
import { Alert, Button, Card, Container } from '../../shared/ui';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected application error occurred.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Application ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: null });
  };

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <Container maxWidth="md">
            <Card className="flex flex-col gap-4">
              <Alert
                tone="danger"
                title="Something went wrong"
                description={this.state.errorMessage ?? 'Unable to render this view.'}
              />
              <div className="flex flex-wrap gap-3">
                <Button variant="primary" onClick={this.handleReset}>
                  Try Again
                </Button>
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  Reload Page
                </Button>
              </div>
            </Card>
          </Container>
        </div>
      );
    }

    return this.props.children;
  }
}
