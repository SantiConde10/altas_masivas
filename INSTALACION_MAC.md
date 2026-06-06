# Guía de Instalación en macOS — GAIA Automatizaciones

## Requisitos

- macOS 11 (Big Sur) o superior
- En Macs con chip Apple Silicon (M1/M2/M3): **Rosetta 2** instalado (el sistema lo solicita automáticamente si no está)

---

## Paso 1 — Descargar el instalador

1. Ir a la sección de [**Releases**](https://github.com/SantiConde10/altas_masivas/releases) del repositorio.
2. En la última versión disponible, descargar el archivo con extensión **`.dmg`**  
   (ejemplo: `GAIA Automatizaciones-1.0.4.dmg`).

---

## Paso 2 — Instalar la aplicación

1. Abrir el archivo `.dmg` descargado (doble clic).
2. En la ventana que aparece, **arrastrar el ícono de GAIA Automatizaciones** hacia la carpeta **Applications**.
3. Esperar a que termine la copia y cerrar la ventana del instalador.

---

## Paso 3 — Primer lanzamiento (aviso de seguridad de macOS)

La aplicación no está firmada con un certificado de Apple, por lo que macOS bloqueará la apertura la primera vez. Sigue estos pasos según tu versión:

### macOS Ventura (13), Sonoma (14) o Sequoia (15)

1. Intentar abrir la app desde **Launchpad** o la carpeta **Applications**.  
   macOS mostrará el mensaje: *"GAIA Automatizaciones no se puede abrir porque es de un desarrollador no identificado."*

2. Ir a **Configuración del Sistema** → **Privacidad y seguridad**.

3. Desplazarse hacia abajo hasta la sección **Seguridad**. Aparecerá el mensaje:  
   *"Se bloqueó el uso de 'GAIA Automatizaciones' porque no es de un desarrollador identificado."*

4. Hacer clic en **"Abrir de todas formas"**.

5. Confirmar en el diálogo que aparece haciendo clic en **"Abrir"**.

> A partir de este momento la app se abrirá normalmente sin volver a mostrar el aviso.

### macOS Big Sur (11) o Monterey (12)

1. En lugar de hacer doble clic para abrir la app, hacer **clic derecho → Abrir**.
2. En el diálogo de advertencia, hacer clic en **"Abrir"**.

---

## Paso 4 — Uso

1. Al abrir **GAIA Automatizaciones**, la interfaz cargará automáticamente.
2. **Arrastrar y soltar** el archivo `.csv` con los artículos a cargar dentro de la ventana, o usar el botón de selección de archivo.
3. La app validará el archivo antes de iniciar.
4. Hacer clic en **Iniciar carga** para comenzar el proceso.  
   El panel integrado mostrará el progreso en tiempo real con el estado de cada SKU.

---

## Actualizaciones automáticas

La aplicación detecta nuevas versiones automáticamente al iniciarse. Cuando haya una actualización disponible, se descargará en segundo plano y se instalará al próximo reinicio de la app.

---

## Resolución de problemas

| Problema | Solución |
|---|---|
| El `.dmg` no se abre | Verificar que el archivo descargó completo. Intentar abrirlo con clic derecho → Abrir. |
| El botón "Abrir de todas formas" no aparece | Esperá unos segundos después del primer intento fallido antes de ir a Privacidad y seguridad. |
| La app se cierra al iniciar en Mac M1/M2/M3 | Instalar Rosetta 2 ejecutando en la Terminal: `softwareupdate --install-rosetta` |
| Error al procesar el CSV | Verificar que el archivo tenga el formato de columnas correcto (ver plantilla en la carpeta compartida). |
