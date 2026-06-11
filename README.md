# GAIA - Automatización de Carga Masiva

Este proyecto es una herramienta de automatización desarrollada para facilitar la carga masiva de artículos y datos en el sistema de gestión interno de GAIA. Utiliza Python (con Playwright y Pandas) para el procesamiento y la interacción automatizada web, y cuenta con una interfaz de escritorio moderna, intuitiva y con soporte para _Drag & Drop_, construida en Electron.

## Características Principales

- **Interfaz Gráfica Moderna**: Diseño limpio y enfocado en la experiencia de usuario (UI/UX), permitiendo cargar archivos con arrastrar y soltar.
- **Multiplataforma**: Ejecutables independientes y optimizados para Windows y macOS.
- **Actualizaciones Automáticas**: Integración de despliegue continuo (CI/CD) con GitHub Actions y actualizaciones automáticas a través de `electron-updater`.
- **Automatización Robusta**: Interacción web resiliente con Playwright, incluyendo manejo de errores específicos, reportes de progreso y reinicios seguros ante fallos de conexión o timeouts de la plataforma.
- **Manejo Seguro de Credenciales**: Las contraseñas y accesos sensibles se inyectan en tiempo de compilación mediante GitHub Secrets para proteger la integridad del sistema.

## Estructura del Repositorio

```text
alta_masiva/
├── .github/workflows/    # Pipelines de CI/CD para compilación multiplataforma
├── app/                  # Aplicación de escritorio (Frontend y Backend en Node.js/Electron)
│   ├── assets/           # Recursos visuales e íconos
│   ├── main.js           # Proceso principal de Electron (Comunica Node.js con Python)
│   ├── index.html        # Interfaz GAIA con Drag & Drop
│   └── package.json      # Dependencias y scripts de compilación de Electron
├── src/                  # Código fuente en Python (Lógica core de automatización)
│   ├── subir_altas.py    # Script principal de automatización (Playwright)
│   └── lectura_csv.py    # Procesamiento y limpieza de datos (Pandas)
├── pyproject.toml        # Dependencias de Python gestionadas por `uv`
└── README.md             # Documentación principal
```

## Uso (Usuarios Finales)

Para utilizar la aplicación sin entorno de desarrollo:

1. Dirígete a la sección de **Releases** en GitHub.
2. Descarga el instalador correspondiente a tu sistema operativo (ej. `.exe` para Windows, `.dmg` para macOS).
3. Instala y abre la aplicación **GAIA Automatizaciones**.
4. Arrastra y suelta el archivo `.csv` con la información a cargar dentro de la ventana.
5. Inicia la carga masiva; el panel integrado te mostrará en tiempo real el progreso y el estado de cada SKU procesado.

---

## Entorno de Desarrollo

### Requisitos Previos

Para modificar y compilar la aplicación localmente, necesitas:

- **Node.js** (v18 o superior)
- **Python** (v3.11 o superior)
- **uv** (Gestor de dependencias de Python rápido)

### Instalación Local

1. **Clonar y preparar entorno Python:**
   El proyecto utiliza `uv` para gestionar el entorno virtual.

   ```bash
   uv sync
   # Instalar binarios de navegadores para Playwright
   uv run playwright install
   ```

2. **Instalar dependencias de la interfaz (Electron):**
   ```bash
   cd app
   npm install
   ```

### Ejecución en Modo Desarrollo

1. Abre la terminal en el directorio `app/`.
2. Inicia la aplicación de escritorio en modo desarrollo:
   ```bash
   npm start
   ```

### Compilación Manual

El proyecto automatiza la compilación con GitHub Actions, pero para compilar localmente:

1. Empaqueta el script de Python con PyInstaller en un ejecutable en la carpeta `dist/`.
2. Desde la carpeta `app/`, ejecuta los comandos de `electron-builder`:
   ```bash
   npm run build:win  # Para Windows
   npm run build:mac  # Para macOS
   ```
   El resultado se generará en `app/dist/`.

### Para abrir la aplicacion en macOS:

```bash
sudo xattr -rd com.apple.quarantine /Applications/GAIA\ Automatizaciones.app 
```
