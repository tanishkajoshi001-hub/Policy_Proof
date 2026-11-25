import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { App } from '../app/App';

// Mock MediaPipe PoseService
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

describe('App Initial Render and Accessibility', () => {
  it('renders application brand, clinical scope, and setup checklist', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Rehab/);
    expect(screen.getByText(/Elbow & Forearm Rehabilitation/i)).toBeInTheDocument();
    expect(screen.getByText(/Setup Checklist for Best Results/i)).toBeInTheDocument();
    expect(screen.getAllByText(/100% On-Device Processing/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Start Camera/i })).toBeInTheDocument();
  });

  it('switches language from English to Hindi and updates UI text', async () => {
    await act(async () => {
      render(<App />);
    });

    const hindiBtn = screen.getByRole('button', { name: /हिंदी में बदलें/i });
    await act(async () => {
      fireEvent.click(hindiBtn);
    });

    expect(screen.getByText(/कोहनी एवं अग्रभाग/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /कैमरा शुरू करें/i })).toBeInTheDocument();
    expect(screen.getByText(/उत्तम परिणाम के लिए सेटअप गाइड/i)).toBeInTheDocument();

    const englishBtn = screen.getByRole('button', { name: /Switch to English/i });
    await act(async () => {
      fireEvent.click(englishBtn);
    });
    expect(screen.getByText(/Elbow & Forearm Rehabilitation/i)).toBeInTheDocument();
  });
});
