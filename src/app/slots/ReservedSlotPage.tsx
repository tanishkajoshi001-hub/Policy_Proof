import React from 'react';
import { Alert, Button, Card } from '../../shared/ui';
import { APP_ROUTES } from '../../shared/contracts';
import { Layers } from 'lucide-react';

export interface ReservedSlotPageProps {
  slotTitle: string;
  routePath: string;
  owner: string;
  branchName: string;
  reservedPaths: string[];
  onReturnHome: () => void;
}

/**
 * Explicit unimplemented route slot placeholder.
 * Per Startup PRD Section 3.3 & 5.1, unimplemented feature modules must be clearly
 * identified without fake functionality, fabricated data, or nonfunctional buttons.
 */
export const ReservedSlotPage: React.FC<ReservedSlotPageProps> = ({
  slotTitle,
  routePath,
  owner,
  branchName,
  reservedPaths,
  onReturnHome,
}) => {
  return (
    <Card className="flex flex-col gap-5 my-2">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-brand-400">
          <Layers className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-brand-400">
            Reserved Route Slot • {routePath}
          </span>
          <h2 className="text-xl font-bold text-white">{slotTitle}</h2>
        </div>
      </div>

      <Alert
        tone="info"
        title="Module Not Yet Implemented (Reserved for Downstream Owner)"
        description={`This route slot is reserved for ${owner} on branch "${branchName}". No placeholder patient or clinician data is fabricated at the startup foundation stage.`}
      />

      <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 text-xs text-slate-300 space-y-2">
        <p className="font-semibold text-slate-200">Assigned Ownership Folders:</p>
        <ul className="list-disc list-inside space-y-1 font-mono text-slate-400">
          {reservedPaths.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>

      <div>
        <Button variant="secondary" onClick={onReturnHome}>
          Back to Camera Setup ({APP_ROUTES.HOME})
        </Button>
      </div>
    </Card>
  );
};
