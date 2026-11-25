import React from 'react';
import { APP_ROUTES } from '../../shared/contracts';
import { useAppShell } from '../providers/useAppShell';
import { TrackingSlot } from '../slots/TrackingSlot';
import { ReservedSlotPage } from '../slots/ReservedSlotPage';
import { NotFoundPage } from '../boundaries/NotFoundPage';

export const AppRouter: React.FC = () => {
  const { currentPath, navigate } = useAppShell();

  if (currentPath === APP_ROUTES.HOME || currentPath.startsWith(APP_ROUTES.TRACKING)) {
    return <TrackingSlot />;
  }

  if (
    currentPath === APP_ROUTES.PATIENT ||
    currentPath.startsWith(`${APP_ROUTES.PATIENT}/`)
  ) {
    return (
      <ReservedSlotPage
        slotTitle="Patient Rehabilitation Experience"
        routePath={APP_ROUTES.PATIENT}
        owner="Person 4 (Middle 30%)"
        branchName="feature/patient-experience"
        reservedPaths={[
          'src/features/patient/**',
          'src/features/progress/**',
          'src/features/i18n/**',
        ]}
        onReturnHome={() => navigate(APP_ROUTES.HOME)}
      />
    );
  }

  if (
    currentPath === APP_ROUTES.DOCTOR ||
    currentPath.startsWith(`${APP_ROUTES.DOCTOR}/`)
  ) {
    return (
      <ReservedSlotPage
        slotTitle="Doctor Workspace & Plan Management"
        routePath={APP_ROUTES.DOCTOR}
        owner="Person 2 (Final 20%)"
        branchName="feature/backend-doctor-release"
        reservedPaths={[
          'src/features/doctor/**',
          'src/shared/adapters/** (production Supabase implementations)',
          'supabase/**',
        ]}
        onReturnHome={() => navigate(APP_ROUTES.HOME)}
      />
    );
  }

  return (
    <NotFoundPage
      path={currentPath}
      onNavigateHome={() => navigate(APP_ROUTES.HOME)}
    />
  );
};
