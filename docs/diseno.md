# Diseño y componentes

## Sistema compartido

- `AppShell` controla safe areas, ancho y navegación responsive.
- `Page` y `Content` reemplazan los contenedores de Ionic.
- Modal, drawer/sheet, tabs, toast y spinner se construyen con Radix y HTML.
- Mapa, administración, detalle de evento y creación se cargan dinámicamente.
- Los tokens de color, espacio, tipografía y movimiento viven en CSS versionado.

Los componentes de dominio no conocen plataforma. Un adaptador de capacidades
decide cámara, archivos, QR, deep links y notificaciones. Se respetan foco,
teclado, reducción de movimiento, contraste y objetivos táctiles de 44 px.

## Criterios de revisión visual

Se prueban 360 px, tablet y escritorio; modo de red lenta; textos largos; ausencia
de imagen; listas vacías; scroll al volver y teclado móvil. Ningún componente
debe depender de selectores CSS internos de un proveedor.
