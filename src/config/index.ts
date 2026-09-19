export const config = {
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3002/api",
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
