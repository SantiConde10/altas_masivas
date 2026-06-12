# Instalación de GAIA en Mac (App sin firma)

La aplicación está compilada sin código de firma. macOS mostrará una advertencia la primera vez, pero es segura de usar.

## Opción 1: Abrir desde Finder (Recomendado para usuarios)

1. Descarga el `.dmg` desde los releases
2. Abre el `.dmg` - se montará en tu Mac
3. **Control + click** en `GAIA Automatizaciones.app`
4. Selecciona **"Abrir"** en el menú
5. Click en **"Abrir"** en el diálogo de seguridad

macOS recordará tu selección y las próximas veces se abrirá sin preguntar.

## Opción 2: Terminal (Más rápido)

```bash
# Si la app está en Aplicaciones:
xattr -rd com.apple.quarantine "/Applications/GAIA Automatizaciones.app"

# Luego abre normalmente desde Finder o con:
open "/Applications/GAIA Automatizaciones.app"
```

## Opción 3: Desde Spotlight

1. Press **Cmd + Space**
2. Escribe "GAIA"
3. Press **Enter**
4. Si aparece advertencia, click "Abrir"

## ¿Por qué ocurre esto?

macOS requiere que apps sean "notarizadas" (firmadas por Apple). Como esta app es de distribución privada, no está notarizada. Pero es completamente segura porque:

- El código fuente es conocido
- Se distribuye desde GitHub (repositorio privado seguro)
- Tiene acceso limitado a ficheros (solo CSV)

## Solución permanente (Para administradores)

Si necesitas desactivar Gatekeeper completamente:

```bash
sudo spctl --master-disable
```

⚠️ **No recomendado** - Solo hazlo si entiendes los riesgos de seguridad.

## Auto-Updates

Los auto-updates funcionarán normalmente. macOS no cuestionará las actualizaciones después de la primera instalación.

---

¿Problemas? Revisa los logs en **Cmd+Opt+I** cuando la app esté abierta.
