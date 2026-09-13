# LifePuff · web

Las dos páginas web de LifePuff. Nada más.

- **`/`** — recoge los enlaces que LifePuff manda por correo (confirmar la
  cuenta, recuperar la contraseña) y se los pasa a la app del teléfono.
- **`/oauth/consent`** — la pantalla donde decides si un asistente de IA puede
  entrar en tu LifePuff, y con qué permisos.

Son HTML suelto: sin compilación, sin servidor, sin dependencias que instalar.
Se pueden leer enteras de arriba abajo.

## No hay secretos aquí dentro

Este repositorio es público a propósito, porque no guarda nada que no lo sea.
Los dos únicos datos que contiene son la dirección del proyecto y la **clave
publicable**, la misma que ya lleva la app instalada en cualquier teléfono. No
hay claves de servidor, ni de proveedores de IA, ni datos de nadie.

Quien decide si concede el acceso es Supabase Auth, con la sesión de la persona
que está mirando la página. Estas páginas solo preguntan y enseñan lo que se va
a conceder.

## Para ponerlo en marcha o cambiar algo

Está en [`LEEME.md`](LEEME.md).
