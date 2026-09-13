# Las dos páginas web de LifePuff

Son dos archivos HTML sueltos. No hay compilación, ni servidor, ni dependencias
que instalar: se editan con el bloc de notas y se suben tal cual.

| Archivo | Para qué |
| --- | --- |
| `index.html` | Recoge los enlaces que Supabase manda por correo (confirmar la cuenta, recuperar la contraseña) y se los pasa a la app, que vive en `lifepuff://auth-callback`. |
| `oauth/consent/index.html` | La pantalla donde decides si un asistente de IA puede entrar en tu LifePuff. |
| `estilo.css` | El aspecto de las dos. |

## Por qué no están en Supabase

Se intentó. Supabase devuelve como **texto plano** cualquier HTML que salga de
`*.supabase.co`, tanto en Edge Functions como en Storage: es una defensa contra
el phishing y no se puede desactivar sin un dominio propio de pago. Por eso las
páginas se publican aparte y en Supabase solo queda la API en JSON
(`supabase/functions/lifepuff`, hoy únicamente `/mcp`, todavía sin montar).

## Qué hay dentro (y qué no)

Dentro solo hay dos datos, y los dos son públicos: la dirección del proyecto y
la **clave publicable**, la misma que ya lleva la app instalada en el teléfono.
No hay `service_role` ni `sb_secret_*`, y no puede haberlos: quien decide es
Supabase Auth, con la sesión de quien esté mirando la página.

## Publicarlas

Con GitHub Pages, que es gratis.

El repositorio es `lifepuff/lifepuff.github.io`, de la organización `lifepuff`.
Al llamarse así, GitHub lo sirve en la raíz del dominio y no en una subcarpeta.
Pages está configurado en la rama `main`, carpeta `/ (root)`: subir a `main` es
publicar, y tarda uno o dos minutos en verse.

Para cambiar algo después: editas el archivo, lo subes, y a los pocos minutos
está cambiado. No hay que tocar la app ni Supabase.

## Lo que hay que poner en Supabase

En **Authentication → URL Configuration**:

- **Site URL**: `https://lifepuff.github.io`
- **Redirect URLs**: deja `lifepuff://auth-callback` y añade
  `https://lifepuff.github.io/oauth/consent`
  (hace falta para el botón de Google de la pantalla de permisos).

En **Authentication → OAuth Server**:

- **Authorization Path**: `/oauth/consent`
- **Enable OAuth Server**: encendido
- **Allow Dynamic OAuth Apps**: enciéndelo el último, y solo si quieres que
  cualquier asistente pueda registrarse solo.

### Ojo con el Site URL

El Site URL es también el sitio al que van los enlaces de los correos. Por eso
`index.html` existe: en cuanto el Site URL deja de ser `lifepuff://auth-callback`,
sin esa página los correos de confirmación dejarían de abrir la app. Cambia las
dos cosas a la vez —publicar la página y cambiar el Site URL— y comprueba
después un registro nuevo y un inicio de sesión con Google desde el móvil.

## Probarlas sin publicar nada

```bash
npx serve web -l 4599
```

Y abrir `http://localhost:4599/oauth/consent/?authorization_id=prueba`.
Sin una petición de verdad dirá que falta información o pedirá entrar; eso es
justo lo que tiene que hacer.
