# Guía: Pestaña de Validación de Actualizaciones

## Descripción General

Se ha implementado una nueva pestaña **"Validación"** en la aplicación GAIA para validar el mecanismo de actualización automática. Esta herramienta permite verificar que la app puede detectar y descargar nuevas versiones desde GitHub.

## Ubicación

- **Botón**: En la barra lateral izquierda, debajo de "Tareas"
- **Ruta**: `/app/panels/validacion/`

## Cómo Usar

### 1. Acceder a la Pestaña

1. Inicia la aplicación
2. Haz clic en el botón "Validación" en la barra lateral
3. Verás tres secciones: Status Overview, dos métodos de validación, y Logs

### 2. Método 1: Electron Updater (Recomendado)

Este es el método estándar que usa electron-updater, el mismo que usa la app automáticamente.

**Pasos:**
1. Selecciona la pestaña "Electron Updater"
2. Haz clic en "Verificar Actualizaciones"
3. Espera a que se complete la verificación (máximo 30 segundos)

**Qué verifica:**
- ✓ Conexión a GitHub releases
- ✓ Si hay nueva versión disponible
- ✓ Información del archivo (.dmg)
- ✓ Tiempo de búsqueda

**Resultado esperado:**
- Si hay una versión más nueva: "✓ Actualización disponible: vX.X.X"
- Si está actualizada: "✓ Ya está en la versión más reciente"

---

### 3. Método 2: GitHub API (Avanzado)

Este método consulta directamente la API de GitHub y da más control.

**Configuración:**

```
Token de GitHub: (opcional) Tu token personal si quieres mayores límites
Propietario: SantiConde10
Repositorio: altas_masivas
```

**Pasos:**
1. (Opcional) Configura un token de GitHub en el campo "Token de GitHub"
2. Verifica que owner y repo sean correctos
3. Haz clic en "Verificar con GitHub API"
4. Espera el resultado

**Qué verifica:**
- ✓ Autenticación y token válido
- ✓ Conexión a GitHub API
- ✓ Releases disponibles
- ✓ Versión más reciente (estable)
- ✓ Comparación de versiones
- ✓ Información de archivos

**Token de GitHub:**
- Puedes dejar vacío para usar límites de API anónimo (60 req/hora)
- Con token: 5000 req/hora
- Crear token: https://github.com/settings/tokens
- Permisos necesarios: `read:user` (mínimo)

---

## Panel de Status

En la parte superior verás:

```
┌─────────────────┬──────────────────────┬───────────────┐
│ Versión Actual  │ Versión Disponible   │ Estado        │
│ v1.0.11         │ v1.0.12              │ Actualización │
│                 │                      │ disponible    │
└─────────────────┴──────────────────────┴───────────────┘
```

Se actualiza automáticamente después de cada verificación.

---

## Logs

Hay dos niveles de logging:

### Logs por Método
Debajo de cada método, en la sección "Resultado", verás:
- Cada paso del proceso
- Errores específicos si hay
- Información detallada de la respuesta

### Logs Globales
Al final de la pantalla, en "Logs Detallados", verás:
- Historial de todas las acciones
- Timestamps de cada evento
- Colores: verde (éxito), rojo (error), azul (info)

**Botón "Limpiar"**: Borra el historial de logs

---

## Flujo Típico de Desarrollo

### Hacer un nuevo release

1. **En GitHub:**
   - Crea un nuevo release/tag (ej: v1.0.12)
   - Carga el .dmg nuevo

2. **En tu Mac:**
   - Espera 1-2 minutos a que GitHub API esté actualizada
   - Abre la app
   - Ve a "Validación"
   - Haz clic en "Verificar Actualizaciones"

3. **Verifica el resultado:**
   - Debe mostrar: "Actualización disponible: v1.0.12"
   - En Logs: debe haber información del archivo .dmg

### Si ocurre un error

1. Checa los logs en la pestaña de Validación
2. Si dice "401" → token inválido o repositorio privado
3. Si dice "404" → verifica owner/repo correctos
4. Si dice timeout → GitHub está lento, reintenta

---

## Troubleshooting

### Electron Updater en Linux: "APPIMAGE env is not defined"
**¿Por qué ocurre?**
- En Linux, electron-updater requiere que la app esté empaquetada como AppImage
- En desarrollo (npm start), la app no es AppImage
- Esto es normal y esperado en desarrollo

**Solución:**
- Para testing en Linux durante desarrollo, **usa el método de GitHub API**
- En producción (cuando la app esté empaquetada como AppImage) funcionará Electron Updater
- No es un error, es una limitación de electron-updater en desarrollo

### Error: "GitHub API responded with 401"
- Token inválido o expirado
- El repositorio es privado y necesita autenticación
- Solución: Genera un token nuevo en https://github.com/settings/tokens

### Error: "404 Not Found"
- Owner o repo es incorrecto
- El repositorio no existe o es privado sin token
- Solución: Verifica que sea "SantiConde10" / "altas_masivas" y usa un token si es privado

### Error: "Timeout después de 30 segundos"
- GitHub está muy lento o no hay conexión internet
- Solución: Verifica tu conexión y reintenta en unos segundos

### No muestra actualización disponible
- La versión en GitHub es menor o igual a la actual
- Solución: Verifica que el tag en GitHub sea vX.X.X con número mayor que la versión actual

### Electron Updater dice "No disponible en dev"
- Estás en Linux durante desarrollo
- Solución: Usa GitHub API en su lugar, o compila la app para testing (ver abajo)

---

## Variables de Entorno

Si quieres que el token se configure automáticamente (sin pasar por la UI):

```bash
export GH_TOKEN="ghp_xxxxxxxxxxxxx"
```

La app lo buscará automáticamente si no configuras uno en la UI.

---

## Archivos Modificados

```
app/
  ├── index.html (actualizado)
  ├── main.js (actualizado)
  ├── preload.js (actualizado)
  ├── renderer.js (actualizado)
  └── panels/
      └── validacion/
          ├── validacion.html (nuevo)
          └── validacion.css (nuevo)
```

---

## Notas Técnicas

### Métodos de IPC

Los siguientes métodos están disponibles en `window.electronAPI`:

```javascript
// Electron Updater
const result = await window.electronAPI.checkUpdatesElectron();

// GitHub API
const result = await window.electronAPI.checkUpdatesGithub({
  token: "ghp_xxx",      // opcional
  owner: "SantiConde10", // requerido
  repo: "altas_masivas"  // requerido
});
```

### Respuesta

Ambos métodos retornan:
```javascript
{
  success: boolean,
  logs: string[],
  availableVersion: string | null,
  error?: string
}
```

---

## Testing en Diferentes Plataformas

### Mac (Recomendado para dev de Electron Updater)
- Ambos métodos funcionan bien
- Electron Updater usa `.dmg` files automáticamente
- GitHub API también funciona perfectamente

### Linux (En desarrollo)
- **Electron Updater**: NO funciona en modo desarrollo (necesita AppImage)
  - Solución: Usa GitHub API en desarrollo
  - O compila con: `npm run build:mac` o `npm run build:win`
- **GitHub API**: Funciona perfectamente ✅

### Linux (En producción - empaquetada como AppImage)
- Ambos métodos funcionarán correctamente
- Asegurate de distribuir como `.AppImage`

### Windows
- Ambos métodos funcionan
- Electron Updater usa `.exe` (NSIS installer)
- GitHub API también funciona

---

## Próximas Mejoras (Sugerencias)

- [ ] Botón para descargar e instalar automáticamente
- [ ] Programación de checks periódicos en background
- [ ] Historial de releases descargados
- [ ] Comparador visual de cambios entre versiones
