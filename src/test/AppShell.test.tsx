import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { App } from '../app/App';
import { Button, Input, Card, Alert, Loading, Dialog } from '../shared/ui';

vi.mock('../features/pose/services/poseService', () => ({
  poseService: {
    initialize: vi.fn().mockResolvedValue({}),
    getActiveDelegate: vi.fn().mockReturnValue('GPU'),
    recordCameraFrame: vi.fn(),
    detectVideoFrame: vi.fn().mockReturnValue({
      landmarks: null,
      isNewFrame: true,
      inferenceTimeMs: 12,
      avgInferenceTimeMs: 12,
      p95InferenceTimeMs: 15,
      inferenceFps: 30,
      cameraFps: 30,
      activeDelegate: 'GPU',
    }),
    evaluateKeyJoints: vi.fn().mockReturnValue({ trackingStatus: 'idle', keyJoints: {} }),
    close: vi.fn(),
  },
}));

describe('App Shell Route Slots & Boundaries', () => {
  it('navigates cleanly to reserved Patient and Doctor route slots and 404 fallback', async () => {
    window.history.pushState({}, '', '/');
    await act(async () => {
      render(<App />);
    });

    // Navigate to Patient Reserved Slot
    const patientLink = screen.getByRole('link', { name: /Patient \(Reserved\)/i });
    await act(async () => {
      fireEvent.click(patientLink);
    });
    expect(screen.getByText(/Patient Rehabilitation Experience/i)).toBeInTheDocument();
    expect(screen.getByText(/Person 4 \(Middle 30%\)/i)).toBeInTheDocument();

    // Navigate to Doctor Reserved Slot
    const doctorLink = screen.getByRole('link', { name: /Doctor \(Reserved\)/i });
    await act(async () => {
      fireEvent.click(doctorLink);
    });
    expect(screen.getByText(/Doctor Workspace & Plan Management/i)).toBeInTheDocument();
    expect(screen.getByText(/Person 2 \(Final 20%\)/i)).toBeInTheDocument();

    // Return back to root camera tracking slot
    const backBtn = screen.getByRole('button', { name: /Back to Camera Setup/i });
    await act(async () => {
      fireEvent.click(backBtn);
    });
    expect(screen.getByRole('button', { name: /Start Camera/i })).toBeInTheDocument();
  });

  it('renders NotFoundPage for unknown routes', async () => {
    window.history.pushState({}, '', '/unknown-route-xyz');
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByText(/Page Not Found/i)).toBeInTheDocument();
    window.history.pushState({}, '', '/');
  });
});

describe('Shared UI Primitives', () => {
  it('renders accessible Input, Button, Card, Alert, Loading, and Dialog', () => {
    const onClose = vi.fn();
    render(
      <Card>
        <Input label="Patient Name" helperText="Enter full name" />
        <Button>Submit</Button>
        <Alert tone="info" title="Notice" description="On-device only" />
        <Loading label="Preparing..." />
        <Dialog open={true} title="Confirm Action" onClose={onClose}>
          <p>Dialog content</p>
        </Dialog>
      </Card>
    );

    expect(screen.getByLabelText('Patient Name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    expect(screen.getByText('Notice')).toBeInTheDocument();
    expect(screen.getByText('Preparing...')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Confirm Action' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
