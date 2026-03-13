import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { DashboardView } from '../features/dashboard/DashboardView';
import { OperationsView } from '../features/operations/OperationsView';
import { ComplianceView } from '../features/compliance/ComplianceView';
import { GovernanceView } from '../features/governance/GovernanceView';
import { MonitoringView } from '../features/monitoring/MonitoringView';
import { SystemPanel } from '../features/system/SystemPanel';
import { useApp } from '../state/AppContext';

export function App() {
  const {
    activeTab,
    setActiveTab,
    summary,
    saveLockfile,
    environment,
    walletAddress,
    operatorSigner,
    clearOperatorSigner,
  } = useApp();

  return (
    <div className="relative z-0 flex min-h-screen flex-col overflow-hidden bg-[#07090b] text-zinc-50 md:flex-row">
      <AmbientBackground />
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        configLoaded={Boolean(summary)}
        onSaveLockfile={saveLockfile}
      />
      <main className="relative z-10 flex min-h-screen flex-1 flex-col">
        <Header
          environment={environment}
          walletAddress={walletAddress}
          operatorSigner={operatorSigner}
          clearOperatorSigner={clearOperatorSigner}
        />
        <div className="custom-scrollbar flex-1 overflow-y-auto p-6 md:p-10 lg:p-12">
          <div className="mb-8">
            <SystemPanel />
          </div>
          {activeTab === 'dashboard' ? <DashboardView /> : null}
          {activeTab === 'operations' ? <OperationsView /> : null}
          {activeTab === 'compliance' ? <ComplianceView /> : null}
          {activeTab === 'governance' ? <GovernanceView /> : null}
          {activeTab === 'monitoring' ? <MonitoringView /> : null}
        </div>
      </main>
    </div>
  );
}

function AmbientBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute left-[-10%] top-[-10%] h-[50vw] w-[50vw] rounded-full bg-emerald-900/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[40vw] w-[40vw] rounded-full bg-teal-900/10 blur-[120px]" />
      <div className="absolute left-[30%] top-[30%] h-[30vw] w-[30vw] rounded-full bg-indigo-900/5 blur-[150px]" />
    </div>
  );
}
