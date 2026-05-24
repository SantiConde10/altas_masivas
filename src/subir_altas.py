import re
import time
import os
import sys
from playwright.sync_api import Playwright, sync_playwright, expect
from dotenv import load_dotenv
from lectura_csv import transformar_df
import pandas as pd

# Cargar variables de entorno usando la ruta absoluta de secrets/.env
base_dir = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(base_dir, "..", "secrets", ".env")
load_dotenv(dotenv_path)

usuario = os.getenv("USUARIO")
password = os.getenv("PASSWORD")
url_gaia = os.getenv("URL")

# Validar variables de entorno requeridas
missing_vars = []
if not usuario: missing_vars.append("USUARIO")
if not password: missing_vars.append("PASSWORD")
if not url_gaia: missing_vars.append("URL")

if missing_vars:
    print(f"Error: Faltan variables de entorno requeridas en el archivo .env: {', '.join(missing_vars)}", file=sys.stderr)
    sys.exit(1)

custom_csv_path = sys.argv[1] if len(sys.argv) > 1 else None
try:
    df = transformar_df(custom_csv_path)
except Exception as e:
    print(f"Error: Ocurrió un error inesperado al transformar el archivo CSV: {e}", file=sys.stderr)
    sys.exit(1)

if df is None or df.empty:
    print("Error: El DataFrame transformado está vacío o no se pudo generar a partir del archivo CSV.", file=sys.stderr)
    sys.exit(1)

def clean_val(val):
    if pd.isna(val):
        return ""
    val_str = str(val).strip()
    if not val_str:
        return ""
    if val_str.endswith(".0"):
        try:
            return str(int(float(val_str)))
        except:
            pass
    return val_str

def clean_num(val, default=""):
    if pd.isna(val):
        return default
    val_str = str(val).replace(',', '').strip()
    if not val_str:
        return default
    return val_str

def robust_click(page, locator, timeout=5000):
    try:
        locator.click(timeout=timeout)
    except Exception:
        try:
            locator.click(force=True, timeout=timeout)
        except Exception:
            locator.evaluate("el => el.click()")

def click_dropdown_option(page, label_text, value):
    try:
        # Localizar el botón del dropdown al lado de la etiqueta y hacer click para abrirlo
        dropdown_btn = page.locator("label").filter(has_text=label_text).locator("xpath=following::button[contains(@class, 'form-control')]").first
        robust_click(page, dropdown_btn, timeout=5000)
    except Exception as e:
        raise Exception(f"No se pudo abrir el menú desplegable para '{label_text}'. Detalle: {str(e)}")
    
    try:
        # Esperar a que el dropdown cargue sus opciones
        options = page.locator('button:not(.form-control)')
        try:
            options.first.wait_for(state="visible", timeout=3000)
        except:
            pass

        # Buscar de forma insensible a acentos y mayúsculas
        def strip_accents(text):
            replacements = {
                'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
                'ü': 'u', 'ñ': 'n',
                'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ú': 'u',
                'Ü': 'u', 'Ñ': 'n'
            }
            cleaned = text.lower()
            for accented, clean in replacements.items():
                cleaned = cleaned.replace(accented, clean)
            return cleaned.strip()

        target_clean = strip_accents(value)
        value_lower = value.lower().strip()

        # Encontrar el índice de la opción coincidente usando page.evaluate (es instantáneo)
        matching_index = page.evaluate("""([valClean, valLower]) => {
            const buttons = Array.from(document.querySelectorAll('button:not(.form-control)'));
            
            const stripAccents = (text) => {
                const replacements = {
                    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
                    'ü': 'u', 'ñ': 'n',
                    'Á': 'a', 'É': 'e', 'Í': 'i', 'Ó': 'o', 'Ú': 'u',
                    'Ü': 'u', 'Ñ': 'n'
                };
                let cleaned = text.toLowerCase();
                for (const [accented, clean] of Object.entries(replacements)) {
                    cleaned = cleaned.replaceAll(accented, clean);
                }
                return cleaned.trim();
            };

            // 1. Coincidencia exacta limpia
            let idx = buttons.findIndex(btn => stripAccents(btn.innerText) === valClean);
            if (idx !== -1) return idx;

            // 2. Coincidencia por subcadena limpia
            idx = buttons.findIndex(btn => stripAccents(btn.innerText).includes(valClean));
            if (idx !== -1) return idx;

            // 3. Coincidencia exacta en minúsculas (sin quitar acentos)
            idx = buttons.findIndex(btn => btn.innerText.toLowerCase().trim() === valLower);
            if (idx !== -1) return idx;

            return -1;
        }""", [target_clean, value_lower])

        matched = False
        if matching_index != -1:
            robust_click(page, options.nth(matching_index), timeout=3000)
            matched = True

        if not matched:
            # Fallback a XPath si por alguna razón no se encontró con evaluate
            xpath = f'//button[not(contains(@class, "form-control"))][translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÑÜ", "abcdefghijklmnopqrstuvwxyzáéíóúñü") = "{value_lower}"]'
            try:
                page.locator(xpath).first.click(timeout=3000)
                matched = True
            except:
                pass

        if not matched:
            # Listar las primeras 15 opciones usando evaluate para evitar llamadas nth lentas
            available_opts = page.evaluate("""() => {
                const buttons = Array.from(document.querySelectorAll('button:not(.form-control)'));
                return buttons.slice(0, 15).map(btn => btn.innerText.trim());
            }""")
            opts_str = ", ".join(available_opts)
            raise Exception(f"No se encontró la opción '{value}' en el dropdown '{label_text}'. Opciones disponibles: [{opts_str}]")

    except Exception as e:
        raise Exception(f"No se pudo encontrar o hacer click en la opción '{value}' del dropdown '{label_text}'. Detalle: {str(e)}")

def procesar_fila(page, row) -> None:

    # –– Datos de interacción con ventas –––––––––––––––––––––––––––––––––––
    try:
        # Proveedor 
        val_proveedor = clean_val(row['PROVEEDOR'])
        if val_proveedor:
            click_dropdown_option(page, "Proveedor", val_proveedor)

        # SKU 
        page.locator("#SKU").click()
        page.locator("#SKU").fill(str(row['SKU']))
        page.locator("#SKU").press("Tab")
        page.wait_for_timeout(1000)
        
        # Validar si el SKU ya existe antes de continuar
        for selector in [".invalid-feedback", ".text-danger", ".alert-danger", ".error-message"]:
            loc = page.locator(selector)
            try:
                count = loc.count()
                for i in range(count):
                    el = loc.nth(i)
                    if el.is_visible():
                        txt = el.inner_text().strip()
                        if txt and any(k in txt.lower() for k in ["ya existe", "duplicado", "existe", "registrado"]):
                            raise Exception(f"SKU_EXISTENTE: El SKU {row['SKU']} ya existe en el sistema. ({txt})")
            except Exception as check_err:
                if "SKU_EXISTENTE" in str(check_err):
                    raise check_err

        # Nombre 
        page.locator("#Nombre").click()
        page.locator("#Nombre").fill(str(row['NOMBRE']))

        # Descripción 
        page.locator("[id=\"Descripción\"]").click()
        page.locator("[id=\"Descripción\"]").fill(str(row['DESCRIPCION']))

        # SKU 2
        page.locator("[id=\"SKU 2\"]").click()
        page.locator("[id=\"SKU 2\"]").fill(str(row['SKU 2']))

        # CANALVENTAS
        page.get_by_role("button", name="Seleccionar ▾").click()
        page.get_by_text("Seleccionar todos").click()

        # U. Venta
        val_u_venta = clean_val(row['U.VENTA'])
        if val_u_venta:
            click_dropdown_option(page, "U. Venta", val_u_venta)

        fecha_1 = ""
        val_fecha_1 = clean_val(row['Fecha 1'])
        if val_fecha_1:
            try:
                dt1 = pd.to_datetime(val_fecha_1, dayfirst=True)
                if pd.notna(dt1):
                    fecha_1 = dt1.strftime('%Y-%m-%d')
            except Exception as e:
                print(f"Error parseando Fecha 1 '{val_fecha_1}': {e}")

        fecha_2 = ""
        val_fecha_2 = clean_val(row['Fecha 2'])
        if val_fecha_2:
            try:
                dt2 = pd.to_datetime(val_fecha_2, dayfirst=True)
                if pd.notna(dt2):
                    fecha_2 = dt2.strftime('%Y-%m-%d')
            except Exception as e:
                print(f"Error parseando Fecha 2 '{val_fecha_2}': {e}")
        
        if fecha_1:
            page.locator("#Vigencia").fill(fecha_1)
        if fecha_2:
            page.locator("input[type=\"date\"]").nth(1).fill(fecha_2)
    except Exception as e:
        raise Exception(f"Datos de Ventas -> {str(e)}")

    # --- Agregar sku ---
    try:
        grid_idx = 0
        
        # Iterar sobre todos los elementos en el JSON consolidado para este SKU
        group_sku_dict = row.get('group_SKU', {})
        if not isinstance(group_sku_dict, dict):
            group_sku_dict = {}
            
        for sku_key, sku_cantidad in group_sku_dict.items():
            page.locator("[id=\"Agregar SKU\"]").click()
            page.locator("[id=\"Agregar SKU\"]").fill(str(sku_key))
            page.get_by_role("button").filter(has_text="").click()
            
            # Click grid cell to edit quantity
            cell_clicked = False
            cell_idx = (grid_idx * 6) + 1
            cell = page.get_by_role("gridcell").nth(cell_idx)
            try:
                cell.click(timeout=3000)
                cell_clicked = True
            except Exception:
                pass

            if not cell_clicked:
                try:
                    if grid_idx == 0:
                        cell = page.get_by_role("gridcell", name="1", exact=True)
                    else:
                        cell = page.get_by_role("gridcell", name="1").nth(grid_idx * 2)
                    cell.click(timeout=3000)
                except Exception as cell_err:
                    print(f"Advertencia: No se pudo hacer click en la celda de la fila {grid_idx+1}: {cell_err}")

            page.wait_for_timeout(500) # Esperar a que se active el editor

            # Rellenar la cantidad en el editor de la celda activa
            try:
                input_editor = cell.locator(".dx-texteditor-input")
                if input_editor.count() > 0:
                    input_editor.fill(str(sku_cantidad), timeout=5000)
                else:
                    # Fallback: buscar cualquier editor de grid activo
                    active_input = page.locator(".dx-datagrid-rowsview .dx-texteditor-input")
                    if active_input.count() > 0:
                        active_input.fill(str(sku_cantidad), timeout=5000)
                    else:
                        # Fallback a spinbutton
                        page.get_by_role("spinbutton", name=re.compile("Cantidad", re.IGNORECASE)).first.fill(str(sku_cantidad), timeout=5000)
            except Exception as fill_err:
                print(f"Advertencia: Error al escribir la cantidad para la fila {grid_idx+1}: {fill_err}")
                
            grid_idx += 1
    except Exception as e:
        raise Exception(f"Agregar SKU -> {str(e)}")

    # –– Clasificación –––––––––––––––––––––––––––––––––––
    try:
        robust_click(page, page.get_by_role("button", name="Clasificación"))

        # Linea
        val_linea = clean_val(row['LINEA'])
        if val_linea:
            click_dropdown_option(page, "Linea", val_linea)

        # Modelo
        val_modelo = clean_val(row['MODELO'])
        if val_modelo:
            click_dropdown_option(page, "Modelo", val_modelo)

        # Tipo de articulo
        val_tipo_articulo = clean_val(row['TIPO ARTICULO'])
        if val_tipo_articulo:
            click_dropdown_option(page, "Tipo Articulo", val_tipo_articulo)

        # Marca
        val_marca = clean_val(row['MARCA'])
        if val_marca:
            click_dropdown_option(page, "Marca", val_marca)

        # Categoria
        val_categoria = clean_val(row['CATEGORIA'])
        if val_categoria:
            click_dropdown_option(page, "Categoría", val_categoria)

        # Sublinea
        val_sublinea = clean_val(row['SUBLINEA'])
        if val_sublinea:
            click_dropdown_option(page, "Sublinea", val_sublinea)

        # Subcatart
        val_subcatart = clean_val(row['SUBCATART'])
        if val_subcatart:
            click_dropdown_option(page, "Subcatart", val_subcatart)

        # SubCatDetalleArt
        val_subcatdetalleart = clean_val(row['SUBCATDETALLEART'])
        if val_subcatdetalleart:
            click_dropdown_option(page, "Subcatdetalleart", val_subcatdetalleart)

        # Clasificacion precio
        val_clasificacion_precio = clean_val(row['CLASIFICACION PRECIO'])
        if val_clasificacion_precio:
            click_dropdown_option(page, "Clasificación de Precio", val_clasificacion_precio)

        # Carpeta de vida
        val_carpeta_vida = clean_val(row['CARPETA DE VIDA'])
        if val_carpeta_vida:
            click_dropdown_option(page, "Carpeta de Vida", val_carpeta_vida)

        # Subtipo
        val_subtipo = clean_val(row['SUBTIPO'])
        if val_subtipo:
            click_dropdown_option(page, "SubTipo", val_subtipo)

        # U. compra
        val_u_compra = clean_val(row['U.COMPRA'])
        if val_u_compra:
            click_dropdown_option(page, "U. Compra", val_u_compra)

        # Estilo
        val_estilo = clean_val(row['ESTILO'])
        if val_estilo:
            click_dropdown_option(page, "Estilo", val_estilo)

        # Familia
        val_familia = clean_val(row['FAMILIA'])
        if val_familia:
            click_dropdown_option(page, "Familia", val_familia)

        # TIPO GAIA
        val_tipo_gaia = clean_val(row['TIPO GAIA'])
        if val_tipo_gaia:
            click_dropdown_option(page, "TIPO GAIA", val_tipo_gaia)

        # Visibilidad
        val_visibilidad = clean_val(row['VISIBILIDAD'])
        if val_visibilidad:
            click_dropdown_option(page, "Visibilidad", val_visibilidad)

        # Categoria Completa
        val_categoria_completa = clean_val(row['CATEGORÍA COMPLETA'])
        if val_categoria_completa:
            page.get_by_role("button").filter(has_text="--SELECCIONA--").click()
            page.get_by_role("button").filter(has_text=re.compile(rf"^{re.escape(val_categoria_completa)}$", re.IGNORECASE)).first.click()
            page.get_by_role("button", name="").click()
    except Exception as e:
        raise Exception(f"Clasificación -> {str(e)}")

    # –– Comportamiento de Entrada y Recepción –––––––––––––––––––––––––––––––––––
    try:
        robust_click(page, page.get_by_role("button", name="Comportamiento de Entrega y"))

        # Tiempo de entrega a Clientes
        val_tiempo_entrega_clientes = clean_val(row['TIEMPO DE ENTREGA A CLIENTES'])
        if val_tiempo_entrega_clientes:
            # Pasar regex a click_dropdown_option para evitar matches parciales
            click_dropdown_option(page, re.compile(r"^\s*Tiempo de entrega a Clientes\s*:?\s*$", re.IGNORECASE), val_tiempo_entrega_clientes)

        # Tiempo de producción
        val_tiempo_produccion = clean_val(row['TIEMPO DE PRODUCCION'])
        if val_tiempo_produccion:
            page.locator("label").filter(has_text=re.compile(r"Tiempo de Producción|Tipo de Producción", re.IGNORECASE)).locator("xpath=following::input").first.fill(val_tiempo_produccion)

        # Tiempo resurtido proveedor
        val_tiempo_resurtido_proveedor = clean_val(row['TIEMPO RESURTIDO PROVEEDOR'])
        if val_tiempo_resurtido_proveedor:
            page.locator("label").filter(has_text="Tiempo resurtido proveedor").locator("xpath=following::input").first.fill(val_tiempo_resurtido_proveedor)

        # Tiempo Entrega
        val_tiempo_entrega = clean_val(row['TIEMPO ENTREGA'])
        if val_tiempo_entrega:
            try:
                page.locator("label").filter(has_text=re.compile(r"^\s*Tiempo Entrega\s*:?\s*$", re.IGNORECASE)).locator("xpath=following::input").first.fill(val_tiempo_entrega, timeout=5000)
            except:
                page.locator("[id=\"Tiempo Entrega\"]").fill(val_tiempo_entrega)

        # Comportamiento bajo el umbral
        val_comportamiento_umbral = clean_val(row['COMPORTAMIENTO BAJO EL UMBRAL'])
        if val_comportamiento_umbral:
            click_dropdown_option(page, "Comportamiento bajo umbral", val_comportamiento_umbral)
    except Exception as e:
        raise Exception(f"Comportamiento de Entrega y Recepción -> {str(e)}")

    # –– Costeo –––––––––––––––––––––––––––––––––––
    try:
        robust_click(page, page.get_by_role("button", name="Costeo"))
        
        # Costo compra
        page.locator("[id=\"Costo Compra\"]").click()
        page.locator("[id=\"Costo Compra\"]").fill(clean_num(row['COSTO DE COMPRA']))
        
        # Moneda
        val_moneda = clean_val(row['MONEDA'])
        if val_moneda:
            click_dropdown_option(page, "Moneda", val_moneda)

        # Tipo Cambio
        val_tipo_cambio = row.get('TIPO DE CAMBIO') or row.get('TIPO CAMBIO') or row.get('Tipo de Cambio') or row.get('Tipo Cambio', '1')
        page.locator("[id=\"Tipo Cambio\"]").fill(clean_num(val_tipo_cambio, "1"))
    except Exception as e:
        raise Exception(f"Costeo -> {str(e)}")

    # –– Material –––––––––––––––––––––––––––––––––––
    try:
        robust_click(page, page.get_by_role("button", name="Material"))

        # Material
        val_material = clean_val(row['MATERIAL'])
        if val_material:
            click_dropdown_option(page, "Material", val_material)

        # Color
        val_color = clean_val(row['COLOR'])
        if val_color:
            click_dropdown_option(page, "Color", val_color)

        # Familia de color
        val_familia_color = clean_val(row['FAMILIA DE COLOR'])
        if val_familia_color:
            click_dropdown_option(page, "Familia de color", val_familia_color)

        # Material Principal
        val_material_principal = clean_val(row['MATERIAL PRINCIPAL'])
        if val_material_principal:
            click_dropdown_option(page, "Material principal", val_material_principal)

        # Tipo de tela
        page.locator("[id=\"Tipo de tela\"]").click()
        page.locator("[id=\"Tipo de tela\"]").fill(str(row['TIPO DE TELA']) if pd.notna(row['TIPO DE TELA']) else "")

        # Caracteristicas de la tela
        page.locator("[id=\"Características de tela\"]").click()
        page.locator("[id=\"Características de tela\"]").fill(str(row['CARACTERISTICAS DE LA TELA']) if pd.notna(row['CARACTERISTICAS DE LA TELA']) else "")

        # Cojines
        page.locator("#Cojines").click()
        page.locator("#Cojines").fill(str(row['COJINES']) if pd.notna(row['COJINES']) else "")

        # Aplicación en madera
        page.locator("[id=\"Aplicación en madera\"]").click()
        page.locator("[id=\"Aplicación en madera\"]").fill(str(row['APLICACIÓN EN MADERA']) if pd.notna(row['APLICACIÓN EN MADERA']) else "")

        # Mecanismos
        page.locator("[id=\"Mecanismos\"]").click()
        page.locator("[id=\"Mecanismos\"]").fill(str(row['MECANISMOS']) if pd.notna(row['MECANISMOS']) else "")

        # Cristales
        page.locator("[id=\"Cristales\"]").click()
        page.locator("[id=\"Cristales\"]").fill(str(row['CRISTALES']) if pd.notna(row['CRISTALES']) else "")
    except Exception as e:
        raise Exception(f"Material -> {str(e)}")

    # –– Ficha técnica –––––––––––––––––––––––––––––––––––
    try:
        robust_click(page, page.get_by_role("button", name="Ficha técnica"))

        # Largo
        page.locator("label").filter(has_text="Largo (cm)").locator("xpath=following::input").first.fill(clean_num(row['LARGO (CM)']))

        # Ancho
        page.locator("label").filter(has_text="Ancho (cm)").locator("xpath=following::input").first.fill(clean_num(row['ANCHO (CM)']))

        # Alto
        page.locator("label").filter(has_text="Alto (cm)").locator("xpath=following::input").first.fill(clean_num(row['ALTO (CM)']))

        # Peso volumetrico
        page.locator("label").filter(has_text="Peso volumetrico").locator("xpath=following::input").first.fill(clean_num(row['PESO VOLUMÉTRICO']))

        # Mantenimiento
        page.locator("label").filter(has_text="Mantenimiento").locator("xpath=following::input").first.fill(str(row['MANTENIMIENTO']) if pd.notna(row['MANTENIMIENTO']) else "")

        # Tipo de empaque
        page.locator("label").filter(has_text="Tipo de empaque").locator("xpath=following::input").first.fill(str(row['TIPO DE EMPAQUE']) if pd.notna(row['TIPO DE EMPAQUE']) else "")

        # Número de piezas
        page.locator("label").filter(has_text="Número de piezas").locator("xpath=following::input").first.fill(str(row['NÚMERO DE PIEZAS']) if pd.notna(row['NÚMERO DE PIEZAS']) else "")

        # Pieza del producto
        page.locator("label").filter(has_text="Piezas del producto").locator("xpath=following::input").first.fill(clean_num(row['PIEZAS DEL PRODUCTO']))
        
        # Instructivo URL
        page.locator("label").filter(has_text="Instructivo URL").locator("xpath=following::input").first.fill(str(row['INSTRUCTIVO URL']) if pd.notna(row['INSTRUCTIVO URL']) else "")

        # Peso (KG)
        page.locator("label").filter(has_text="Peso (KG)").locator("xpath=following::input").first.fill(clean_num(row['PESO (KG)']))

        # Peso máximo soportado (KG)
        page.locator("label").filter(has_text="Peso máximo soportado (KG)").locator("xpath=following::input").first.fill(clean_num(row['PESO MÁXIMO SOPORTADO (KG)']))

        # Peso armado (KG)
        page.locator("label").filter(has_text="Peso armado (KG)").locator("xpath=following::input").first.fill(clean_num(row['PESO ARMADO (KG)']))

        # Tipo de armado
        val_tipo_armado = clean_val(row['TIPO ARMADO'])
        if val_tipo_armado:
            click_dropdown_option(page, "Tipo Armado", val_tipo_armado)
    except Exception as e:
        raise Exception(f"Ficha técnica -> {str(e)}")
    
    page.pause()

def reset_to_clean_form(page):
    print("Restableciendo el navegador a un estado limpio...")
    try:
        # Intentamos recargar la página
        page.reload()
        page.wait_for_load_state("networkidle", timeout=15000)
        
        # Si se perdió la sesión (por ejemplo, redirigido a login), iniciamos sesión de nuevo
        if page.get_by_role("textbox", name="Usuario").is_visible(timeout=3000):
            page.get_by_role("textbox", name="Usuario").fill(usuario)
            page.get_by_role("textbox", name="Contraseña").fill(password)
            robust_click(page, page.get_by_role("button", name="INICIAR SESIÓN"))
            page.wait_for_load_state("networkidle", timeout=15000)
        
        # Navegar a través de la interfaz al módulo de inventarios
        robust_click(page, page.get_by_role("textbox", name="Menú: busca módulos"), timeout=5000)
        robust_click(page, page.get_by_role("button", name=" Inventarios ▸"), timeout=5000)
        
        # Hacemos click en "Nuevo Articulo" para reabrir el formulario
        robust_click(page, page.get_by_role("button", name=" Nuevo Articulo"), timeout=5000)
        page.wait_for_load_state("networkidle", timeout=10000)
        print("Navegador restablecido exitosamente.")
    except Exception as e:
        raise Exception(f"No se pudo restablecer el navegador a un estado limpio: {e}")

def run(playwright: Playwright) -> None:
    try:
        browser = playwright.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.dialog_messages = []
        page.on("dialog", lambda d: (page.dialog_messages.append(d.message), d.accept()))
    except Exception as e:
        print(f"Error crítico al iniciar el navegador Chromium: {e}", file=sys.stderr)
        return

    try:
        print(f"Conectando a GAIA en {url_gaia}...")
        page.goto(url_gaia, timeout=30000)
        page.wait_for_load_state("networkidle")
    except Exception as e:
        print(f"Error crítico: No se pudo cargar la página {url_gaia}. Detalles: {e}", file=sys.stderr)
        browser.close()
        return

    try:
        print("Iniciando sesión...")
        page.get_by_role("textbox", name="Usuario").fill(usuario)
        robust_click(page, page.get_by_role("textbox", name="Contraseña"))
        page.get_by_role("textbox", name="Contraseña").fill(password)
        robust_click(page, page.get_by_role("button", name="INICIAR SESIÓN"))
        page.wait_for_load_state("networkidle")
        
        # Validar si seguimos en el login (lo cual indica error de credenciales)
        if page.get_by_role("textbox", name="Usuario").is_visible(timeout=3000):
            raise Exception("Credenciales incorrectas o error en el inicio de sesión.")
    except Exception as e:
        print(f"Error crítico durante el inicio de sesión: {e}", file=sys.stderr)
        browser.close()
        return

    try:
        print("Navegando a la sección de Inventarios...")
        robust_click(page, page.get_by_role("textbox", name="Menú: busca módulos"), timeout=5000)
        robust_click(page, page.get_by_role("button", name=" Inventarios ▸"), timeout=5000)
    except Exception as e:
        print(f"Error crítico al navegar al menú de Inventarios: {e}", file=sys.stderr)
        browser.close()
        return

    for index, row in df.iterrows():
        print(f"--- Fila {index+1} / {len(df)} | SKU: {row['SKU']} | Proveedor: {row['PROVEEDOR']} ---")
        try:
            if index == 0:
                try:
                    robust_click(page, page.get_by_role("button", name=" Nuevo Articulo"), timeout=5000)
                except Exception as e:
                    raise Exception(f"No se pudo abrir el formulario de 'Nuevo Articulo': {e}")

            procesar_fila(page, row)

            # Validar errores HTML5 nativos
            invalid_field_msg = page.evaluate("""() => {
                const invalidEl = document.querySelector(':invalid');
                if (invalidEl) {
                    const label = document.querySelector(`label[for="${invalidEl.id}"]`) || invalidEl.closest('label');
                    const fieldName = label ? label.innerText.replace(/[*:]/g, '').trim() : (invalidEl.placeholder || invalidEl.id || invalidEl.name || 'Campo');
                    return `Campo "${fieldName}" -> ${invalidEl.validationMessage}`;
                }
                return null;
            }""")
            if invalid_field_msg:
                raise Exception(f"Validación HTML5: {invalid_field_msg}")

            # Guardar registro
            try:
                guardar_btn = page.get_by_role("button", name=" Guardar")
                robust_click(page, guardar_btn, timeout=5000)
                page.wait_for_timeout(1000)
            except Exception as e:
                raise Exception(f"Error al hacer click en el botón 'Guardar': {e}")

            # Validar mensajes de error visibles en la página tras guardar
            error_msg = None
            error_locators = [
                ".invalid-feedback",
                ".text-danger",
                ".alert-danger",
                "[role='alert']",
                ".error-message",
                ".help-block-error"
            ]
            for selector in error_locators:
                loc = page.locator(selector)
                try:
                    count = loc.count()
                    for i in range(count):
                        el = loc.nth(i)
                        if el.is_visible():
                            txt = el.inner_text().strip()
                            if txt:
                                error_msg = f"Formulario: {txt}"
                                break
                except:
                    pass
                if error_msg:
                    break

            # Verificar si se disparó alguna alerta nativa
            if hasattr(page, 'dialog_messages') and page.dialog_messages:
                alert_text = " | ".join(page.dialog_messages)
                page.dialog_messages.clear()
                if any(k in alert_text.lower() for k in ["ya existe", "duplicado", "existe", "registrado"]):
                    raise Exception(f"SKU_EXISTENTE: Alerta del sistema -> {alert_text}")
                error_msg = f"Alerta del sistema: {alert_text}"

            # Verificar por texto en la página general si no hay error_msg
            if not error_msg:
                try:
                    page_text_loc = page.locator("text=/ya existe|duplicado|ya registrado/i")
                    if page_text_loc.count() > 0 and page_text_loc.first.is_visible():
                        error_msg = f"Formulario: {page_text_loc.first.inner_text().strip()}"
                except:
                    pass

            if error_msg:
                if any(k in error_msg.lower() for k in ["ya existe", "duplicado", "existe", "registrado"]):
                    raise Exception(f"SKU_EXISTENTE: {error_msg}")
                raise Exception(error_msg)

            # Cargar siguiente formulario si restan registros
            if index < len(df) - 1:
                try:
                    nuevo_btn = page.get_by_role("button", name="+ Nuevo")
                    robust_click(page, nuevo_btn, timeout=5000)
                    page.wait_for_load_state("networkidle")
                except Exception as e:
                    raise Exception(f"No se pudo crear el siguiente formulario vacío con '+ Nuevo': {e}")

            print(f"RESULTADO | FILA: {index+1} | ESTADO: OK | SKU: {row['SKU']}")
        except Exception as e:
            is_sku_existente = "SKU_EXISTENTE" in str(e) or any(k in str(e).lower() for k in ["ya existe", "duplicado", "existe", "registrado"])
            motivo_err = "El SKU ya existe en el sistema." if is_sku_existente else str(e)
            print(f"RESULTADO | FILA: {index+1} | ESTADO: ERROR | SKU: {row['SKU']} | MOTIVO: {motivo_err}")
            if "Target page, context or browser has been closed" in str(e):
                break
            # Si es un SKU existente o no es el último registro, intentamos restablecer la interfaz para el siguiente
            if is_sku_existente or index < len(df) - 1:
                try:
                    reset_to_clean_form(page)
                except Exception as reset_err:
                    print(f"Error crítico de recuperación: {reset_err}", file=sys.stderr)
                    break

    # ---------------------
    try:
        context.close()
        browser.close()
    except:
        pass


print(f"Total de SKUs a subir (cantidad de filas): {len(df)}")

with sync_playwright() as playwright:
    start_time = time.time()
    try:
        run(playwright)
    except Exception as e:
        print(f"Error crítico en la ejecución de Playwright: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"--- Tiempo total de ejecución: {time.time() - start_time:.2f} segundos ---")