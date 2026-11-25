import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('RehabBuddy Camera & Pose View Tests', () => {
  test('Desktop layout: renders header, checklist, privacy badge and starts camera', async ({ page, browserName }, testInfo) => {
    await page.goto('/');

    // 1. Verify Header & Branding
    await expect(page.locator('h1')).toContainText('RehabBuddy');
    await expect(page.getByText('Elbow & Forearm Rehabilitation')).toBeVisible();

    // 2. Verify Privacy Banner & Setup Checklist
    await expect(page.getByText('100% On-Device Processing').first()).toBeVisible();
    await expect(page.getByText('Setup Checklist for Best Results')).toBeVisible();
    await expect(page.getByText('Distance: 1.5 to 2 meters')).toBeVisible();

    // Capture initial desktop screenshot
    await page.screenshot({ path: path.join('e2e', 'screenshots', 'desktop-initial.png'), fullPage: true });

    // 3. Test Language Toggle to Hindi and back
    await page.getByRole('button', { name: 'हिंदी में बदलें' }).click();
    await expect(page.getByText('कैमरा सेटअप एवं रियल-टाइम पोज़ डिटेक्शन')).toBeVisible();
    await expect(page.getByRole('button', { name: 'कैमरा शुरू करें' })).toBeVisible();

    // Switch back to English
    await page.getByRole('button', { name: 'Switch to English' }).click();
    await expect(page.getByText('Camera Setup & Real-Time Pose Detection')).toBeVisible();

    // 4. Click Start Camera Button (Automated synthetic device will stream)
    const startButton = page.getByRole('button', { name: 'Start Camera' });
    await expect(startButton).toBeVisible();
    await startButton.click();

    // 5. Verify Stop Camera button appears when active
    const stopButton = page.getByRole('button', { name: 'Stop Camera' });
    await expect(stopButton).toBeVisible({ timeout: 10000 });

    // Wait a brief moment for camera video element to receive stream
    await page.waitForTimeout(2000);

    // Capture active camera desktop screenshot
    await page.screenshot({ path: path.join('e2e', 'screenshots', 'desktop-camera-active.png'), fullPage: true });

    // 6. Test Stop Camera
    await stopButton.click();
    await expect(startButton).toBeVisible();
  });

  test('Mobile layout: responsive scaling and touch targets', async ({ page }) => {
    await page.goto('/');

    // Verify brand on mobile
    await expect(page.locator('h1')).toContainText('RehabBuddy');

    // Verify Start Camera button has adequate touch target
    const startButton = page.getByRole('button', { name: 'Start Camera' });
    await expect(startButton).toBeVisible();

    const box = await startButton.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // PRD / Accessibility mandate: touch targets >= 48px
      expect(box.height).toBeGreaterThanOrEqual(48);
    }

    // Capture mobile viewport screenshot
    await page.screenshot({ path: path.join('e2e', 'screenshots', 'mobile-initial.png'), fullPage: true });

    // Test camera activation on mobile
    await startButton.click();
    await expect(page.getByRole('button', { name: 'Stop Camera' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join('e2e', 'screenshots', 'mobile-camera-active.png'), fullPage: true });
  });

  test('Privacy & CPU fallback: loads WASM/model locally with zero external requests and runs CPU delegate', async ({ page }) => {
    const externalRequests: string[] = [];
    const localMediaPipeRequests: string[] = [];
    const nonGetRequests: string[] = [];

    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith('http://localhost:4173') && !url.startsWith('data:') && !url.startsWith('blob:')) {
        externalRequests.push(url);
      }
      if (url.includes('/wasm/') || url.includes('/models/')) {
        localMediaPipeRequests.push(url);
      }
      if (req.method() !== 'GET') {
        nonGetRequests.push(`${req.method()} ${url}`);
      }
    });

    await page.goto('/?delegate=cpu');
    await page.getByRole('button', { name: 'Start Camera' }).click();
    await expect(page.getByTestId('pose-telemetry')).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1500);

    await expect(page.getByTestId('pose-telemetry')).toContainText('CPU');
    await expect(page.getByTestId('tracking-status')).toContainText('No Person Detected');

    expect(externalRequests).toEqual([]);
    expect(nonGetRequests).toEqual([]);
    expect(localMediaPipeRequests.some((u) => u.includes('/models/pose_landmarker_lite.task'))).toBe(true);
    expect(localMediaPipeRequests.some((u) => u.includes('/wasm/'))).toBe(true);

    await page.getByRole('button', { name: 'Stop Camera' }).click();
    await expect(page.getByRole('button', { name: 'Start Camera' })).toBeVisible();
  });
});
