# Política de privacidad

> **Pendiente de revisión legal.** Borrador de producto que describe lo que la app hace hoy. Última actualización: 10 de noviembre de 2026.

Live Space es una app para subir y ver las fotos y vídeos que el público graba en los conciertos, ordenados por canción. Aquí explicamos qué datos usamos, para qué, con quién los compartimos y cómo puedes borrarlos.

## Quién es responsable

El responsable del tratamiento es **{{TITULAR}}**. Para cualquier cosa sobre tus datos escríbenos a **{{EMAIL}}**.

## Qué datos usamos

### Tu cuenta

- Email y contraseña (la contraseña se guarda cifrada; nunca la vemos).
- Si entras con Google o con Apple: el identificador de esa cuenta, tu email y, si el proveedor lo envía, tu nombre y foto. Con Apple puedes ocultar tu email real.
- Tu perfil: nombre de usuario, nombre visible, ciudad, bio y los enlaces que añadas (web, Instagram, Spotify). El nombre de usuario, el nombre, la foto, la ciudad, la bio y los enlaces son públicos.
- La fecha en la que aceptaste las condiciones al publicar por primera vez.

### Lo que subes

- Las fotos y los vídeos que publicas, el concierto y la canción en los que los colocas, el texto que añadas y la hora en la que se grabaron (la leemos de los metadatos del archivo para ordenarlos en la noche). Son públicos: cualquiera puede verlos en el concierto, en tu perfil y en Momentos.
- **Vídeos:** la app los comprime en el móvil antes de subirlos y el archivo que sube no lleva la ubicación ni otros metadatos.
- **Fotos:** se suben tal cual. Si tu cámara guarda la ubicación dentro de la foto (EXIF), puede seguir en el archivo publicado. Si no quieres que esté, desactiva la ubicación de la cámara antes de grabar o quítala antes de subir.
- Tu elección sobre si el artista y la sala pueden reutilizar cada momento (ver la [Licencia de los momentos](/licencia-momentos)).
- Los clips de Instagram, TikTok o YouTube que importas: guardamos el enlace y los datos públicos que da la plataforma (autor, miniatura, fecha), no el vídeo.

### Lo que haces en la app

- Me gusta, a quién sigues (personas, artistas, salas y festivales), conciertos guardados y asistencias («Voy», «Fui»).
- Las visualizaciones de momentos: contamos una por persona, momento y día después de 3 segundos de reproducción, para enseñar el ángulo más visto. Solo se publica el total por momento, nunca quién lo vio. Si no tienes cuenta usamos un identificador aleatorio guardado en tu móvil.
- Reportes que envías, personas que bloqueas y artistas o salas que ocultas del mapa.
- Las etiquetas que pones a una sala después de un concierto.
- Si gestionas un artista, una sala o un festival: tus solicitudes para gestionarlo, los conciertos que propones y las decisiones que tomas.
- Si compras merch: el pedido (artículos, importe, punto y código de recogida) y los identificadores del pago. El pago lo procesa Stripe; no vemos ni guardamos tu tarjeta.

### Tu ubicación

- Solo si la permites, y solo para centrar el mapa y enseñarte conciertos y artistas cerca.
- La posición se guarda en tu móvil. Para buscar resultados cercanos enviamos a nuestro servidor una zona aproximada (o tu posición, en Explorar) que se usa para esa consulta y no se guarda en ninguna tabla.
- Para encontrar los vídeos de un concierto en tu galería, la app mira en el móvil la hora y el lugar de tus fotos y vídeos. Eso no sale del móvil hasta que eliges qué subir.
- Al subir momentos, para saber de qué concierto son, la app lee en el móvil la hora y, si el archivo la lleva, la ubicación con la que se grabaron las fotos y vídeos que eliges, y la compara con la de las salas. Esa ubicación solo sirve para elegir el concierto: la app no la envía a nuestro servidor, no la guarda en ninguna tabla ni en el móvil, no la apunta en registros ni la manda a nadie, y la olvida al salir de la pantalla de subida. Lo único que se guarda es el concierto en el que publicas. (Las fotos, eso sí, se suben tal cual: mira «Lo que subes».)
- Puedes retirar el permiso cuando quieras en los ajustes del sistema.

### Notificaciones

La app solo usa notificaciones locales que programa el propio móvil (nuevos conciertos de lo que sigues y «¿Subes lo de anoche?»). No usamos notificaciones push ni guardamos ningún identificador de tu dispositivo para enviártelas.

### Lo que no hacemos

- No usamos herramientas de analítica, publicidad ni seguimiento, ni informes de errores de terceros.
- No vendemos tus datos ni hacemos perfiles para publicidad.

## Para qué y con qué base legal

- **Darte el servicio que pides** (crear la cuenta, publicar, seguir, guardar, comprar merch): ejecución del contrato que aceptas con las [Condiciones de uso](/condiciones).
- **Ubicación, galería, notificaciones y licencia de reutilización:** tu consentimiento, que puedes retirar en cualquier momento.
- **Seguridad y moderación** (reportes, bloqueos, ocultar contenido reportado, límites de subida, evitar abusos) y **contar visualizaciones**: nuestro interés legítimo en mantener la app segura y útil.
- **Cumplir la ley** (por ejemplo, retirar contenido ilícito cuando nos avisan, o conservar datos de pagos): obligación legal.

## Con quién los compartimos

Usamos proveedores que tratan los datos por encargo nuestro y solo para esto:

- **Supabase** (base de datos, cuentas y funciones del servidor), en la Unión Europea (París).
- **Cloudflare** (R2): almacenamiento y entrega de los vídeos y de las portadas de conciertos.
- **Cloudinary**: almacenamiento y entrega de las fotos y miniaturas.
- **Google** y **Apple**: solo si entras con ellos.
- **Stripe**: pagos del merch; recibe tu email y el pedido.
- **GitHub**: guarda durante 14 días una copia de seguridad cifrada de la base de datos.
- **OpenFreeMap**: sirve los mapas. Al ver el mapa, su servidor recibe tu dirección IP y la zona que miras.
- **Google Fonts**: tipografías de la app; recibe tu dirección IP.
- **YouTube, TikTok e Instagram (Meta)**: al ver un clip importado se carga su reproductor, que puede usar sus propias cookies según sus políticas.
- **api.qrserver.com**: dibuja el código QR cuando compartes un concierto (solo recibe el enlace del concierto).

Lo que publicas es visible para cualquiera. Si permites la reutilización, el artista y la sala del concierto pueden descargar y publicar ese momento citándote.

## Transferencias fuera de la Unión Europea

Cloudflare, Cloudinary, Google, Apple, Stripe, GitHub y Meta son empresas con sede o servidores en Estados Unidos. Cuando tus datos salen del Espacio Económico Europeo lo hacen con las garantías del RGPD: el Marco de Privacidad de Datos UE-EE. UU. cuando la empresa está adherida, o cláusulas contractuales tipo de la Comisión Europea.

## Cuánto tiempo los guardamos

- Mientras tengas la cuenta.
- Si borras la cuenta, todo lo anterior se borra en el momento; los archivos de tus fotos y vídeos se eliminan de los servidores en los días siguientes, y las copias de seguridad cifradas desaparecen en un máximo de 14 días.
- Se quedan solo datos que ya no te identifican: el total de visualizaciones de los momentos de otras personas, los pedidos de merch sin tu nombre (los datos del pago los conserva Stripe según sus obligaciones legales) y el registro de decisiones de moderación sin tu nombre.
- Lo que ocurre en la [página de borrado de cuenta](/borrar-cuenta) lo explicamos con más detalle allí.

## Tus derechos

Puedes pedirnos acceder a tus datos, corregirlos, borrarlos, limitar su uso, oponerte a él y llevártelos (portabilidad), y retirar un consentimiento sin que afecte a lo anterior.

- Corregir: desde Perfil → Ajustes → Perfil.
- Borrar la cuenta: desde Perfil → Ajustes → Cuenta → Eliminar cuenta, o como se explica en [Borrar tu cuenta](/borrar-cuenta).
- Todo lo demás: escribe a **{{EMAIL}}** desde el email de tu cuenta. Respondemos en un mes como máximo.

Si crees que no hemos tratado bien tus datos, puedes reclamar ante la Agencia Española de Protección de Datos en [www.aepd.es](https://www.aepd.es).

## Edad mínima

Live Space es para mayores de 14 años, la edad a partir de la cual la ley española permite consentir el tratamiento de los propios datos. Si tienes menos, no crees una cuenta. Si sabemos que una cuenta es de alguien menor de 14, la borramos.

## Datos guardados en tu móvil

La app guarda en el propio móvil tu sesión, tus preferencias (ciudad, gustos, última ubicación, vista del mapa, elección de licencia), la cola de subidas pendientes y el identificador aleatorio de visualizaciones. La web pública no usa cookies.

## Cambios

Si cambiamos algo importante te lo diremos en la app antes de que se aplique.
