# Media, licencias y atribución

## Flujo

El cliente pide a Supabase una reserva y firma efímera, sube directamente al
endpoint de Cloudinary y espera el webhook verificado. El activo nace pendiente;
el cliente nunca recibe el API secret ni firma sus propios parámetros.

| Tipo | Entrada | Entrega del piloto |
| --- | --- | --- |
| Imagen | 10 MB, formatos permitidos | máximo 2048 px, formato/calidad automática |
| Vídeo | 75 MB y 45 s | máximo 720p y thumbnail obligatorio |

Cada usuario dispone de diez reservas de vídeo mensuales. Se avisa al 60 % y 70 %
de cuota global y se bloquean firmas al 80 %. La interfaz `MediaProvider` conserva
independencia frente a Cloudinary.

## Catálogo

Las imágenes de artista/sala deben guardar URL original, autor, licencia,
atribución y momento de captura. Wikimedia Commons y press kits con permiso son
válidos; buscadores y redes sociales no son fuentes de licencia. Sin prueba se usa
placeholder. Los ocho objetos heredados permanecen en cuarentena hasta demostrar
propietario, relación y derechos.
