"use client";

import { useCallback, useEffect, useState } from "react";
import {
  alreadyInstalled,
  canInstall,
  installTarget,
  promptInstall,
  startCapturingInstallPrompt,
  subscribeToInstallPrompt,
  type InstallTarget,
} from "@/lib/pwa-install";

interface PwaInstall {
  /** Chrome ya ofreció el diálogo: se puede instalar con un clic. */
  available: boolean;
  /** La caja ya corre en su propia ventana o acaba de instalarse. */
  installed: boolean;
  /** "escritorio" en Windows, "Dock" en Mac: dónde queda el icono. */
  target: InstallTarget;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

/**
 * Estado de instalación de la caja, atado al singleton de `lib/pwa-install`.
 *
 * Los tres valores arrancan en su default de servidor a propósito: leer
 * `matchMedia` o `navigator.platform` durante el render rompería la
 * hidratación. Los reales llegan en el efecto.
 */
export function usePwaInstall(): PwaInstall {
  const [state, setState] = useState<Omit<PwaInstall, "install">>({
    available: false,
    installed: false,
    target: "escritorio",
  });

  useEffect(() => {
    startCapturingInstallPrompt();
    const sync = () =>
      setState({
        available: canInstall(),
        installed: alreadyInstalled(),
        target: installTarget(),
      });
    sync();
    return subscribeToInstallPrompt(sync);
  }, []);

  const install = useCallback(async () => {
    const outcome = await promptInstall();
    setState((current) => ({
      ...current,
      available: canInstall(),
      installed: alreadyInstalled(),
    }));
    return outcome;
  }, []);

  return { ...state, install };
}
