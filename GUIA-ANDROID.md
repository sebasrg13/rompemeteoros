# Rompemeteoros para Android — instalador y actualizador

## Cómo funciona

- La **app** es un APK liviano que trae el juego adentro, así que se juega incluso sin internet.
- El **actualizador** está dentro de la app. Cada vez que se abre (y cada 10 minutos mientras está abierta) mira tu página de actualizaciones:
  - **Si cambiaste el juego:** lo descarga al instante y aparece **"¡Actualización lista! → REINICIAR AHORA"**. No hay que reinstalar nada y el progreso se mantiene.
  - **Si cambiaste la app en sí** (la carpeta `android/`): aparece **"Nueva versión de la app → DESCARGAR"** y se instala encima.
- **GitHub hace todo solo:** cada vez que subís cambios, compila el APK, arma la página de descarga y publica la actualización. Es gratis.

---

## Configuración (una sola vez, unos 15 minutos)

### 1. Crear el repositorio
1. Creá una cuenta en **github.com**, si no tenés.
2. Tocá **New repository**, ponele de nombre **`rompemeteoros`** y dejalo **Public**. En cuentas gratis, GitHub Pages necesita que sea público.
3. Tocá **Create repository**.

### 2. Subir el proyecto
1. Descomprimí **`rompemeteoros-android.zip`** en tu PC.
2. En el repositorio, tocá **Add file → Upload files** y arrastrá **todo el contenido** de la carpeta. Después tocá **Commit changes**.
3. **Importante:** la carpeta `.github` está oculta en Mac y Linux. Si no se subió:
   - Tocá **Add file → Create new file**.
   - Como nombre escribí `.github/workflows/android.yml`.
   - Pegá el contenido de `COPIA-workflow-android.yml`, que viene en el zip.

### 3. Cargar tu llave de firma (secrets)
La llave está en **`LLAVE-rompemeteoros.zip`**. Hace que las actualizaciones de la app se puedan instalar encima de la versión anterior.

1. En el repositorio andá a **Settings → Secrets and variables → Actions → New repository secret**.
2. Creá estos dos secrets:
   - **`KEYSTORE_BASE64`**: pegá todo el contenido de `KEYSTORE_BASE64.txt`.
   - **`KEYSTORE_PASSWORD`**: pegá el contenido de `KEYSTORE_PASSWORD.txt`.

> Guardá `LLAVE-rompemeteoros.zip` en un lugar seguro (por ejemplo, un pendrive o tu Drive) y **no la subas al repositorio**.
> - Si la perdés, las próximas versiones del APK no se van a poder instalar encima: cada usuario tendría que desinstalar y volver a instalar.
> - Si alguien más la consigue, podría firmar versiones haciéndose pasar por tu app.

### 4. Activar la página
1. Andá a **Settings → Pages**.
2. En **Source** elegí **GitHub Actions**.

### 5. Primera publicación
1. Andá a la pestaña **Actions** y abrí **Publicar Rompemeteoros**.
2. Tocá **Run workflow**.
3. Esperá unos 5 minutos, hasta que el círculo quede en verde ✅.

Tu página queda en: **`https://TU-USUARIO.github.io/rompemeteoros/`**

Tiene el botón **DESCARGAR PARA ANDROID**. Ese link es el que compartís con los jugadores.

### 6. Instalar en el celular
1. Abrí la página en el celular y tocá **DESCARGAR PARA ANDROID**.
2. Abrí el `rompemeteoros.apk`. Si Android lo pide, permití **"Instalar apps desconocidas"**.
3. Tocá **INSTALAR**.

---

## Publicar mejoras (cada vez que quieras)

### Cambios del juego (lo normal)
1. Hacé los cambios en `src/`, o pedíselos a Claude y reemplazá los archivos.
2. Escribí qué cambió en **`NOVEDADES.txt`**. Es lo que ve el jugador en el aviso.
3. Subí los archivos cambiados al repositorio con **Add file → Upload files → Commit**.
4. GitHub publica solo en unos 5 minutos.

Todos los que tienen la app instalada reciben **"¡Actualización lista!"** la próxima vez que la abren, o dentro de los 10 minutos si la tienen abierta. También pueden entrar a **Ajustes → Buscar actualizaciones**.

### Cambios en la app Android (poco frecuente)
Si cambiás algo en `android/`, subí también el número en **`android/app/version.properties`**. Por ejemplo, `versionCode=2` y `versionName=1.1`.

Los jugadores ven **"Nueva versión de la app → DESCARGAR"** y la instalan encima.

---

## Compilar a mano (opcional, con Android Studio)
1. Instalá **Android Studio** y **Python 3**.
2. En la carpeta del proyecto ejecutá `python3 build.py`.
3. Copiá `rompemeteoros.keystore` a `android/app/` y `keystore.properties` a `android/`. Los dos vienen en `LLAVE-rompemeteoros.zip`.
4. En `android/gradle.properties` poné tu dirección en `updateBase=`, terminada en `/`.
5. Abrí la carpeta `android/` en Android Studio y tocá **Build → Build APK(s)**.

---

## Qué funciona dentro del APK

| Función | En el APK |
|---|---|
| Campaña, bolsa, ciclos, bosses, Arsenal, tienda | ✅ completo, también sin internet |
| Actualizaciones instantáneas del juego | ✅ |
| Copa Semanal (jugar) | ✅ |
| Duelo online, rankings y ranking de la Copa | ⏳ necesitan un servidor propio (por ejemplo Firebase); hoy funcionan dentro de Claude. Es el próximo paso |
| Compra de Monedas Lunares con dinero real | ⏳ necesita Google Play Billing o Mercado Pago más el servidor |
