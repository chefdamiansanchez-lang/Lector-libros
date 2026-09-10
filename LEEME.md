# Lector de Libros — cómo generar el APK sin PC

Este proyecto usa **Cordova** en vez de AppGeyser porque tu app necesita
funciones que un empaquetador simple no soporta: lectura de archivos del
celular, voz nativa (TTS) y reproducción en segundo plano. Por eso lo
compilamos en la nube con **GitHub Actions**, gratis y desde el celular.

## Pasos (todo desde el navegador del celular)

1. **Creá una cuenta en GitHub** (github.com) si no tenés.
2. Creá un **repositorio nuevo**, por ejemplo `lector-libros` (puede ser
   público o privado).
3. Subí **todos los archivos y carpetas de este proyecto** a ese repositorio
   (podés usar la opción "Add file → Upload files" en la web de GitHub, o la
   app de GitHub para Android, y arrastrar la carpeta completa —incluida la
   carpeta oculta `.github`—).
4. Andá a la pestaña **Actions** de tu repositorio. Debería aparecer el
   workflow **"Build APK"** corriendo solo (se dispara al subir a la rama
   `main`). Si no arrancó solo, tocá "Run workflow".
5. Esperá unos minutos a que termine (ícono verde ✅).
6. Entrá a esa ejecución y bajá hasta **Artifacts** → descargá
   `lector-libros-apk`. Es un .zip que contiene el `.apk`.
7. Instalá el APK en tu celular (activando "instalar apps de orígenes
   desconocidos" si te lo pide).

## Primer uso en el celular

Al abrir la app por primera vez, andá a:
**Ajustes → Apps → Lector de Libros → Permisos → Archivos y contenido
multimedia → Permitir gestionar todos los archivos.**

Esto es porque Android moderno restringe el acceso a archivos como EPUB/PDF;
sin este permiso la app no va a encontrar tus libros. Como instalás el APK
manualmente (no es de Play Store), podés activarlo así sin problema.

Después guardá tus libros en la carpeta **Descargas**, **Documents** o una
carpeta **Books** / **eBooks** / **Libros**, abrí la app, tocá "Ingresar" →
"Dar acceso", y deberían aparecer listados.

## Qué hace cada parte

- `www/index.html` + `www/css/style.css` + `www/js/app.js` → la app en sí
  (esto es lo que ya veías funcionar en el navegador).
- `config.xml` → le dice a Cordova qué permisos y plugins nativos necesita
  la app (TTS, segundo plano, acceso a archivos).
- `.github/workflows/build.yml` → la receta que usa GitHub para compilar el
  APK automáticamente en la nube.

## Formatos y voz

- TXT, PDF y EPUB se leen extrayendo el texto y lo va reproduciendo en
  bloques con la voz nativa de Android.
- Podés elegir entre español (Argentina/España/México) e inglés desde el
  selector de voz del lector; eso selecciona qué voz del sistema usa el TTS.
- Si tu celular no tiene instalada alguna de esas voces, Android puede
  ofrecerte descargarla la primera vez (Ajustes → Accesibilidad → Texto a
  voz).

## Si algo no compila

Fijate en la pestaña Actions cuál paso falló (aparece en rojo) y mandame el
mensaje de error — los errores más comunes son de versión de plugin, y son
fáciles de resolver ajustando `config.xml`.
