import { useSyncExternalStore } from "react";

import { currentTheme, subscribeTheme, type Theme } from "@/lib/theme";

// null on the server and the first client render: the real theme is only known in the browser.
export const useTheme = (): Theme | null => useSyncExternalStore(subscribeTheme, currentTheme, () => null);
