/**
 * @fileoverview Global Design System Tokens for RehabBuddy.
 * Shared across all feature modules (Patient, Motion Engine, Doctor).
 * Person 4 and Person 2 MUST reuse these semantic tokens rather than inventing ad-hoc palettes.
 */

export const designTokens = {
  colors: {
    surface: {
      canvas: 'var(--rb-surface-canvas)',       // #090d16
      primary: 'var(--rb-surface-primary)',     // #0f172a
      elevated: 'var(--rb-surface-elevated)',   // #151f32
      muted: 'var(--rb-surface-muted)',         // #1e293b
    },
    text: {
      primary: 'var(--rb-text-primary)',        // #f8fafc
      secondary: 'var(--rb-text-secondary)',    // #cbd5e1
      muted: 'var(--rb-text-muted)',            // #94a3b8
      inverse: 'var(--rb-text-inverse)',        // #090d16
    },
    border: {
      subtle: 'var(--rb-border-subtle)',        // #1e293b
      strong: 'var(--rb-border-strong)',        // #334155
    },
    semantic: {
      accent: 'var(--rb-accent)',               // #14b8a6 (Medical Teal)
      accentHover: 'var(--rb-accent-hover)',    // #2dd4bf
      accentSoft: 'var(--rb-accent-soft)',      // rgba(20, 184, 166, 0.14)
      success: 'var(--rb-success)',             // #10b981
      successSoft: 'var(--rb-success-soft)',    // rgba(16, 185, 129, 0.14)
      warning: 'var(--rb-warning)',             // #f59e0b
      warningSoft: 'var(--rb-warning-soft)',    // rgba(245, 158, 11, 0.14)
      danger: 'var(--rb-danger)',               // #ef4444
      dangerSoft: 'var(--rb-danger-soft)',      // rgba(239, 68, 68, 0.16)
    },
  },
  typography: {
    fontFamilySans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    scale: {
      xs: '0.75rem',   // 12px
      sm: '0.875rem',  // 14px
      base: '1rem',    // 16px
      lg: '1.125rem',  // 18px
      xl: '1.25rem',   // 20px
      '2xl': '1.5rem', // 24px
    },
  },
  spacing: {
    1: '0.25rem',  // 4px
    2: '0.5rem',   // 8px
    3: '0.75rem',  // 12px
    4: '1rem',     // 16px
    5: '1.25rem',  // 20px
    6: '1.5rem',   // 24px
    8: '2rem',     // 32px
  },
  radius: {
    md: '0.5rem',   // 8px
    lg: '0.75rem',  // 12px
    xl: '1rem',     // 16px
    '2xl': '1.25rem',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.35)',
    md: '0 4px 12px -2px rgba(0, 0, 0, 0.45)',
    lg: '0 12px 28px -6px rgba(0, 0, 0, 0.55)',
  },
  focusRing: {
    width: '2px',
    offset: '2px',
    color: 'var(--rb-focus-ring)',
  },
  accessibility: {
    /** Minimum recommended touch target for patient/elderly controls (PRD Accessibility). */
    minTouchTargetPx: 48,
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
  },
} as const;

export type DesignTokens = typeof designTokens;
