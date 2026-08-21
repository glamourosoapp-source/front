// Bitácora de novedades para dirección. Página pública en /novedades.
//
// Contenido curado a partir de los commits de la semana en los tres repos
// (Back, Front y Agent). Al cerrar cada semana se agrega una entrada nueva al
// inicio de RELEASES: la página muestra siempre la primera como "semana actual"
// y el resto como historial.

export type ChangeTag = "nuevo" | "mejora" | "correccion";

export type ChangeItem = {
  title: string;
  /** Qué cambió, en una o dos frases y sin jerga técnica. */
  what: string;
  /** Qué gana el negocio con el cambio. */
  why: string;
  tag: ChangeTag;
};

export type ChangeGroup = {
  id: string;
  /** Clave del ícono; se mapea a un componente en page.tsx. */
  icon: "orders" | "print" | "container" | "delivery" | "catalog" | "team" | "bot" | "fix";
  title: string;
  intro: string;
  items: ChangeItem[];
};

export type WeeklyRelease = {
  id: string;
  /** Rango legible de la semana. */
  range: string;
  /** Resumen de una frase para el encabezado. */
  summary: string;
  stats: { label: string; value: string }[];
  highlights: { title: string; text: string }[];
  groups: ChangeGroup[];
};

export const RELEASES: WeeklyRelease[] = [
  {
    id: "2026-w34",
    range: "Semana del 17 al 21 de agosto de 2026",
    summary:
      "La semana se fue en cerrar el ciclo del pedido de punta a punta: capturarlo sin errores de precio, imprimir la nota de remisión desde el sistema y que WhatsApp y el panel cobren exactamente lo mismo.",
    stats: [
      { label: "Cambios entregados", value: "51" },
      { label: "Capacidades nuevas", value: "37" },
      { label: "Correcciones", value: "10" },
      { label: "Sistemas actualizados", value: "3" },
    ],
    highlights: [
      {
        title: "El precio ya no se teclea",
        text: "El sistema toma el precio del catálogo según la lista del cliente. Nadie puede cobrar de más ni de menos por un error de captura.",
      },
      {
        title: "La nota de remisión sale del CRM",
        text: "Se imprime con el acomodo de la nota física, de una en una o todas las del día, y queda registro de quién la imprimió y cuándo.",
      },
      {
        title: "El bidón de 20 L se cobra solo",
        text: "Cada envase de 20 L de línea líquida agrega su bidón de $25 automáticamente, tanto en el panel como en los pedidos por WhatsApp.",
      },
      {
        title: "Factura y transferencia pasan a una persona",
        text: "El agente de WhatsApp ya no intenta resolverlas: deriva la conversación antes de levantar el pedido.",
      },
    ],
    groups: [
      {
        id: "pedidos",
        icon: "orders",
        title: "Pedidos: capturar más rápido y sin errores",
        intro:
          "El objetivo de estos cambios fue quitarle a la persona que captura todas las decisiones que el sistema puede tomar por ella.",
        items: [
          {
            tag: "nuevo",
            title: "Pedidos en borrador",
            what: "Un pedido se puede guardar como borrador (folio BOR-) y confirmarse después, cuando el cliente cierra. Hay una pestaña «Borradores» con su contador en el listado.",
            why: "El asesor arma el pedido mientras habla con el cliente sin comprometer nada: el borrador no agenda entrega, no suma a los totales del cliente ni aparece en los números del dashboard hasta que se confirma.",
          },
          {
            tag: "mejora",
            title: "El precio y los bidones los pone el sistema",
            what: "En la captura ya no se escribe el precio unitario ni la cantidad de bidones: se muestran calculados a partir del catálogo y de la lista del cliente. Cambiar de cliente recalcula todo el pedido.",
            why: "Se acaban los cobros equivocados por dedazo y los precios que se quedaban «congelados» de un borrador viejo.",
          },
          {
            tag: "nuevo",
            title: "Mayoreo o menudeo por producto, no por pedido",
            what: "Cada renglón del pedido puede ir en mayoreo o menudeo; la lista del cliente solo es el valor por omisión. Los renglones de mayoreo salen en rojo en pantalla y en la nota impresa llevan negritas y la etiqueta MAYOREO.",
            why: "Un mismo pedido puede mezclar listas sin trucos, y en la nota impresa en blanco y negro se distingue a simple vista qué se cobró a mayoreo. Si un producto no tiene precio de mayoreo, el sistema lo baja a menudeo y avisa, en lugar de marcarlo en rojo cobrando menudeo.",
          },
          {
            tag: "nuevo",
            title: "Editar los productos de un pedido ya confirmado",
            what: "El detalle de un pedido confirmado ahora permite cambiar renglones; el sistema recalcula totales, bidones y los acumulados del cliente.",
            why: "Antes había que cancelar y volver a levantar el pedido cuando el cliente cambiaba algo de última hora.",
          },
          {
            tag: "nuevo",
            title: "Domicilio de entrega elegido de la ficha del cliente",
            what: "Al elegir cliente se cargan sus domicilios guardados (hasta 3) con su link de Google Maps, y se marca a cuál se entrega. También se puede capturar una dirección solo para ese pedido.",
            why: "El chofer recibe la dirección correcta con su ubicación de Maps, y queda registrado a cuál de los domicilios del cliente se entregó.",
          },
          {
            tag: "nuevo",
            title: "Papelera de pedidos",
            what: "Eliminar un pedido ya no lo borra: pasa a una pestaña «Papelera» (solo administradores) conservando su folio, y se puede restaurar. Sale de listados, dashboard y totales del cliente mientras está ahí.",
            why: "Un borrado por equivocación deja de ser un problema, y ya no se pierde el rastro de lo que se canceló.",
          },
          {
            tag: "mejora",
            title: "Barra de captura siempre a la vista",
            what: "El resumen y los botones de Cancelar / Guardar borrador / Crear pedido viven en una barra fija al pie de la pantalla.",
            why: "Ya no hay que subir hasta arriba para cerrar el pedido, sobre todo en pedidos largos y en celular.",
          },
        ],
      },
      {
        id: "notas",
        icon: "print",
        title: "Nota de remisión: imprimir desde el sistema",
        intro:
          "Esta semana la nota de remisión dejó de ser un formato aparte: se imprime desde el CRM con el mismo acomodo del papel membretado.",
        items: [
          {
            tag: "nuevo",
            title: "Hoja de impresión igual a la nota física",
            what: "Datos en tres columnas, tabla de productos con columna para palomear, leyenda legal y totales. Sin logo ni folio impresos, porque sale en hoja membretada. Incluye asesor, su teléfono y su equipo.",
            why: "Almacén y reparto trabajan con el formato de siempre, pero generado por el sistema, sin recapturar nada.",
          },
          {
            tag: "nuevo",
            title: "Imprimir varias notas de golpe",
            what: "Botón «Imprimir pedidos» en el listado: sin selección imprime todas las notas del filtro actual, o solo las que se marquen. Está detrás de un permiso propio.",
            why: "Almacén saca de una vez las notas del día en lugar de entrar pedido por pedido.",
          },
          {
            tag: "mejora",
            title: "Control de qué nota ya se imprimió",
            what: "El renglón de un pedido con nota impresa se pinta de azul y guarda la fecha y el usuario de la primera impresión. Reimprimir está permitido para quien tenga el permiso; el botón cambia a «Reimprimir».",
            why: "Se ve de un vistazo qué notas ya salieron, sin bloquear a nadie cuando una hoja se atora o se maltrata.",
          },
          {
            tag: "nuevo",
            title: "Vista previa y descarga como imagen",
            what: "Se puede ver la nota en pantalla y bajarla como imagen sin que cuente como impresión.",
            why: "Sirve para mandarla por WhatsApp o revisarla antes de gastar papel, sin ensuciar el registro de impresiones.",
          },
          {
            tag: "mejora",
            title: "El Excel del pedido trae lo mismo que la nota",
            what: "Se agregaron calle, colonia, municipio, código postal, fecha y horario de entrega, creado por, equipo, teléfono del asesor y la columna de lista de precios.",
            why: "Ya no hay diferencias entre lo que ve quien recibe el Excel y lo que dice la nota impresa.",
          },
        ],
      },
      {
        id: "bidones",
        icon: "container",
        title: "Bidones de 20 litros",
        intro:
          "La política del bidón quedó implementada en el sistema en vez de depender de que cada quien la recuerde.",
        items: [
          {
            tag: "nuevo",
            title: "Un bidón de $25 por cada envase de 20 L",
            what: "Cada unidad de 20 L de línea líquida agrega automáticamente un bidón retornable de $25 al pedido o cotización, en el panel y en WhatsApp. El resumen aclara que si el cliente entrega los vacíos a cambio, el chofer no se los cobra.",
            why: "El envase se cobra siempre igual, se levante el pedido donde se levante, y el cliente lo ve desglosado desde el principio.",
          },
          {
            tag: "nuevo",
            title: "Excepción por producto desde el catálogo",
            what: "Hay presentaciones de 10 L que salen en bidón de 20 L. Ahora se marcan una vez en el catálogo con el selector «Bidón a cambio» y el panel, el agente y la nota lo respetan.",
            why: "Los casos especiales se configuran, no se explican en cada pedido.",
          },
          {
            tag: "correccion",
            title: "La respuesta automática del bidón quedó alineada",
            what: "La pregunta frecuente sobre el bidón decía la política anterior y contradecía el resumen del pedido.",
            why: "El agente y el resumen del pedido ya dicen lo mismo al cliente.",
          },
        ],
      },
      {
        id: "entregas",
        icon: "delivery",
        title: "Agenda de entregas",
        intro: "Se completó la regla de agendamiento para el fin de semana.",
        items: [
          {
            tag: "nuevo",
            title: "Regla de sábado y domingo",
            what: "El sábado corta a las 2:00 pm: lo que entra antes se entrega el lunes y lo de después el martes. Todo pedido registrado en domingo sale el martes. La regla se ve en Configuración → Entregas.",
            why: "Panel y WhatsApp prometen la misma fecha de entrega en fin de semana, que era donde se generaban las diferencias con el cliente.",
          },
        ],
      },
      {
        id: "catalogo",
        icon: "catalog",
        title: "Catálogo e inventario",
        intro: "Mantener el catálogo al día dejó de ser un trabajo manual.",
        items: [
          {
            tag: "nuevo",
            title: "Importar el Excel del punto de venta",
            what: "Botón «Importar Excel» en Catálogo: se sube el archivo del punto de venta y antes de aplicar se ve exactamente qué producto se crea, cuál se actualiza y qué campo cambia. Nunca sobrescribe nombre ni descripción.",
            why: "El catálogo se sincroniza con el punto de venta en minutos y con la posibilidad de revisar antes de aceptar.",
          },
          {
            tag: "nuevo",
            title: "Control de inventario por producto",
            what: "Cada producto se marca como «stock ilimitado» o «llevar inventario». Los ilimitados nunca se reportan agotados, tampoco al agente de WhatsApp.",
            why: "Solo se lleva conteo de lo que realmente vale la pena contar, sin que el resto del catálogo se caiga por falta de existencias capturadas.",
          },
        ],
      },
      {
        id: "equipo",
        icon: "team",
        title: "Perfiles y equipo",
        intro: "Se acomodaron los accesos a la forma real de trabajar del equipo.",
        items: [
          {
            tag: "nuevo",
            title: "Tres perfiles nuevos",
            what: "Supervisor (maneja los pedidos y clientes de su equipo, catálogo solo de lectura), Vendedor independiente (solo lo suyo, sin poder eliminar) y Almacén (ve todos los pedidos y el catálogo, e imprime las notas en lote).",
            why: "Cada rol ve y toca únicamente lo que le corresponde, sin repartir cuentas de administrador.",
          },
          {
            tag: "nuevo",
            title: "Permiso «Pedidos: imprimir notas»",
            what: "La impresión de notas es un permiso aparte, ya activado en los perfiles administrativos.",
            why: "Almacén puede imprimir sin darle acceso a editar o eliminar pedidos.",
          },
          {
            tag: "mejora",
            title: "Teléfono de contacto del usuario",
            what: "El alta de usuarios acepta un teléfono opcional que aparece en el Excel del pedido junto al nombre de quien lo creó.",
            why: "Cuando hay una duda de un pedido, se sabe a quién marcarle sin buscar en otra lista.",
          },
        ],
      },
      {
        id: "agente",
        icon: "bot",
        title: "Agente de WhatsApp",
        intro:
          "El agente se alineó con las reglas del panel y aprendió a reconocer cuándo no le toca a él.",
        items: [
          {
            tag: "nuevo",
            title: "Factura y pago por transferencia van a una persona",
            what: "Si el cliente pide factura o quiere pagar por transferencia, depósito o crédito, la conversación se deriva a una persona antes de crear el pedido. El agente dejó de ofrecer transferencia como forma de pago y solo cierra pedidos en efectivo.",
            why: "Se evita que se levanten pedidos con una forma de pago que el negocio todavía no atiende de forma automática.",
          },
          {
            tag: "mejora",
            title: "Ya no ofrece un catálogo que no existe",
            what: "El saludo ofrecía mandar catálogo y lista de precios. Ahora menciona los rubros reales que sí tienen producto disponible.",
            why: "Se acaba la promesa que nadie podía cumplir y que terminaba en una queja o en una derivación.",
          },
          {
            tag: "mejora",
            title: "Mismas reglas que el panel",
            what: "El agente aplica el bidón automático de 20 L con su excepción del catálogo, respeta el stock ilimitado, registra con qué lista de precios cobró cada renglón, guarda a qué domicilio del cliente se entrega y acepta una ubicación compartida por pin o link de Maps como dirección de entrega.",
            why: "Un pedido levantado por WhatsApp queda con la misma información y el mismo cobro que uno capturado por un asesor.",
          },
          {
            tag: "correccion",
            title: "Los pedidos en papelera no existen para el agente",
            what: "Consultar estado, listar pedidos del cliente y agendar entregas ignoran los pedidos eliminados.",
            why: "El cliente deja de recibir información de un pedido que se canceló.",
          },
        ],
      },
      {
        id: "correcciones",
        icon: "fix",
        title: "Correcciones que evitaban problemas de operación",
        intro:
          "Fallas que no se veían en pantalla pero que sí pegaban en la operación diaria.",
        items: [
          {
            tag: "correccion",
            title: "Los folios ya no se adelantan de día",
            what: "El servidor trabajaba en horario universal: a partir de las 6:00 pm de México los folios empezaban a numerarse con la fecha del día siguiente y el filtro «creado desde/hasta» del listado salía corrido seis horas.",
            why: "Los folios del panel, los del agente y los reportes por fecha vuelven a cuadrar con el día real de trabajo.",
          },
          {
            tag: "correccion",
            title: "Se rompía el alta de borradores durante el resto del día",
            what: "Cuando un folio de la serie del día quedaba libre (por confirmar un borrador o eliminar un pedido), el sistema proponía un número ya usado y rechazaba los pedidos nuevos.",
            why: "Se corrigió en el panel y en WhatsApp: la numeración ya no depende de que la serie esté completa.",
          },
          {
            tag: "correccion",
            title: "Todas las horas se muestran en horario del negocio",
            what: "La fecha del listado, la marca de impresión, el detalle, la nota impresa y los exports usaban la zona horaria de la computadora de quien miraba.",
            why: "Dos personas ven la misma hora en el mismo pedido, sin importar dónde estén.",
          },
          {
            tag: "correccion",
            title: "La imagen de la nota salía recortada",
            what: "La descarga de la nota como imagen perdía cerca de 5 cm del lado derecho, justo la columna de precios y totales. Además, la impresión generaba una hoja en blanco de más.",
            why: "La nota que se manda al cliente o se archiva sale completa y se gasta la mitad de papel.",
          },
          {
            tag: "correccion",
            title: "Detalles varios",
            what: "El detalle del pedido ya calcula bien los bidones al editar un borrador, el selector de plantillas de las campañas de reactivación pedía el permiso equivocado y el menú lateral en celular ahora es un cajón con botón de menú.",
            why: "Menos fricción diaria en las pantallas que más se usan.",
          },
        ],
      },
    ],
  },
];
