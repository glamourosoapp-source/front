export const config = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3002/api",
  /**
   * Bandera del módulo de fábrica: sección Fábrica del sidebar, app de la
   * tablet (`/fabrica`) y sus pantallas. Apagada salvo que valga "true"; el
   * Back lleva la suya (`FACTORY_MODULE_ENABLED`). Con fábrica apagada el
   * surtido entra a la sucursal con la entrada de surtido.
   */
  factoryModuleEnabled: process.env.NEXT_PUBLIC_FACTORY_MODULE_ENABLED === "true",
  /**
   * Instalador del Conector de impresión.
   *
   * Apunta a la última publicación del repo del conector: esa dirección no
   * cambia al sacar una versión nueva, así que una sucursal que la tenga
   * anotada siempre baja la actual. GitHub la sirve como archivo adjunto, que
   * es lo que hace que el navegador la descargue en vez de abrirla.
   */
  connectorInstallerUrl:
    process.env.NEXT_PUBLIC_CONNECTOR_INSTALLER_URL ||
    "https://github.com/glamourosoapp-source/conector-impresion/releases/latest/download/setup-conector-impresion.exe",
};
