import React from "react";
import { RuntimeContentProvider } from "./content/runtime";

export default function App({ children }: { children: React.ReactNode }) {
  return <RuntimeContentProvider>{children}</RuntimeContentProvider>;
}
