# GAIA - Automatización de Carga Masiva

Este proyecto es una herramienta de automatización desarrollada para facilitar la carga masiva de artículos y datos en el sistema de gestión interno de GAIA. Utiliza Python (con Playwright y Pandas) para el procesamiento y ejecución web, y cuenta con una interfaz de escritorio ligera y minimalista construida en Electron.

## Estructura del Repositorio

El proyecto sigue una arquitectura estandarizada:

```text
alta_masiva/
├── app/                  # Aplicación de escritorio (Frontend y Backend en Node.js/Electron)
│   ├── assets/           # Recursos visuales (Logos)
│   ├── main.js           # Proceso principal de Electron (Ejecuta Python)
│   ├── index.html        # Interfaz GAIA Minimalista
│   └── ...
├── src/                  # Código fuente en Python (Lógica core de automatización)
│   ├── subir_altas.py    # Script principal de Playwright
│   └── lectura_csv.py    # Procesamiento y transformación de datos con Pandas
├── data/                 # Directorio para archivos de entrada
│   └── *.csv             # Archivos CSV con los datos a procesar (Ej. ALTAS-SED WEB.csv)
├── assets/               # Recursos visuales generales del proyecto
├── secrets/              # Credenciales y variables de entorno seguras
├── pyproject.toml        # Dependencias de Python gestionadas por `uv`
└── README.md             # Documentación principal
```

## Requisitos Previos

Para ejecutar la aplicación localmente, asegúrate de tener instalado:
- **Node.js** (v18 o superior)
- **Python** (v3.11 o superior)
- **uv** (Gestor de dependencias de Python ultra-rápido)

## Instalación

1. **Clonar y preparar entorno Python:**
   El proyecto utiliza `uv` para gestionar el entorno virtual y las dependencias de forma eficiente.
   ```bash
   uv sync
   # Opcional: Instalar navegadores de playwright si no están instalados
   uv run playwright install
   ```

2. **Instalar dependencias de la interfaz gráfica:**
   ```bash
   cd app
   npm install
   ```

## Uso

### Ejecución a través de la Interfaz Gráfica (Recomendado)

1. Coloca tu archivo `.csv` con la información a cargar dentro de la carpeta `data/`. El sistema leerá automáticamente el primer archivo `.csv` que encuentre en dicho directorio.
2. Abre la terminal en el directorio `app/`.
3. Inicia la aplicación de escritorio:
   ```bash
   npm start
   ```
4. En la ventana de la aplicación, presiona el botón **"Iniciar Carga Masiva"**. La consola integrada te mostrará en tiempo real los mensajes de lectura del CSV y el progreso de la automatización en el navegador.

### Ejecución Manual vía Terminal

Si deseas ejecutar el script directamente sin la interfaz gráfica:
1. Asegúrate de colocar tu archivo `.csv` en la carpeta `data/`.
2. Desde la raíz del proyecto (`alta_masiva/`), ejecuta:
   ```bash
   uv run python src/subir_altas.py
   # O si tienes el entorno virtual activado:
   # .venv/bin/python src/subir_altas.py
   ```
