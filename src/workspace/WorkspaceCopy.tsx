"use client";

import { createContext, useContext } from "react";
import { copy } from "@/lib/copy";

export const WorkspaceCopy = createContext(copy);
export const useCopy = () => useContext(WorkspaceCopy);
