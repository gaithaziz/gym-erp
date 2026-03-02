import { createContext, useContext } from "react";

const ShellContext = createContext(false);

export function ShellProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useInShell() {
  return useContext(ShellContext);
}
