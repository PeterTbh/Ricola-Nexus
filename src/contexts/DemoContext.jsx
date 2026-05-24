import { createContext, useContext, useState } from "react";

export const DemoViewContext = createContext({ demoView: "admin", setDemoView: () => {} });

export function DemoViewProvider({ children }) {
  const [demoView, setDemoView] = useState("admin");
  return (
    <DemoViewContext.Provider value={{ demoView, setDemoView }}>
      {children}
    </DemoViewContext.Provider>
  );
}

export function useDemoView() {
  return useContext(DemoViewContext);
}
