import { DemoViewProvider } from "../contexts/DemoContext";
import AdminDashboard from "./AdminDashboard";
import CountryHeadDashboard from "./CountryHeadDashboard";
import { useDemoView } from "../contexts/DemoContext";

function DemoInner() {
  const { demoView } = useDemoView();
  return demoView === "admin" ? <AdminDashboard /> : <CountryHeadDashboard />;
}

export default function DemoDashboard() {
  return (
    <DemoViewProvider>
      <DemoInner />
    </DemoViewProvider>
  );
}
