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

custom_csv_path = sys.argv[1] if len(sys.argv) > 1 else None
df = transformar_df(custom_csv_path)

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

def click_dropdown_option(page, label_text, value):
    page.locator("label").filter(has_text=label_text).locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
    val_lower = value.lower()
    xpath = f'//button[not(contains(@class, "form-control"))][translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚÑÜ", "abcdefghijklmnopqrstuvwxyzáéíóúñü") = "{val_lower}"]'
    page.locator(xpath).first.click()

def procesar_fila(page, row) -> None:

    # –– Datos de interacción con ventas –––––––––––––––––––––––––––––––––––
    
    # Proveedor 
    val_proveedor = clean_val(row['PROVEEDOR'])
    if val_proveedor:
        click_dropdown_option(page, "Proveedor", val_proveedor)

    # SKU 
    page.locator("#SKU").click()
    page.locator("#SKU").fill(str(row['SKU']))

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
    
    # --- Agregar sku ---
    grid_idx = 0
    for sku_key, sku_cantidad in row['Agregar SKU'].items():
        page.locator("[id=\"Agregar SKU\"]").click()
        page.locator("[id=\"Agregar SKU\"]").fill(str(sku_key))
        page.get_by_role("button").filter(has_text="").click()
        
        # Click grid cell to edit quantity
        cell_clicked = False
        try:
            # Click the Cantidad cell directly by index:
            # First row quantity is index 1, second row is 3, etc.
            page.get_by_role("gridcell").nth((grid_idx * 2) + 1).click(timeout=3000)
            cell_clicked = True
        except Exception:
            pass

        if not cell_clicked:
            try:
                if grid_idx == 0:
                    page.get_by_role("gridcell", name="1", exact=True).click(timeout=3000)
                else:
                    page.get_by_role("gridcell", name="1").nth(grid_idx * 2).click(timeout=3000)
            except Exception as cell_err:
                print(f"Advertencia: No se pudo hacer click en la celda de la fila {grid_idx+1}: {cell_err}")

        # Fill quantity using a robust spinbutton locator
        try:
            # Try by role spinbutton first
            page.get_by_role("spinbutton").first.fill(str(sku_cantidad), timeout=5000)
        except Exception:
            # Fallback to the specific named spinbutton
            page.get_by_role("spinbutton", name=re.compile("Cantidad", re.IGNORECASE)).first.fill(str(sku_cantidad))
            
        grid_idx += 1

    # –– Clasificación –––––––––––––––––––––––––––––––––––

    page.get_by_role("button", name="Clasificación").click()

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

    # –– Comportamiento de Entrada y Recepción –––––––––––––––––––––––––––––––––––
    
    page.get_by_role("button", name="Comportamiento de Entrega y").click()

    # Tiempo de entrega a Clientes
    val_tiempo_entrega_clientes = clean_val(row['TIEMPO DE ENTREGA A CLIENTES'])
    if val_tiempo_entrega_clientes:
        click_dropdown_option(page, "Tiempo de entrega a Clientes", val_tiempo_entrega_clientes)

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
        page.locator("label").filter(has_text="Tiempo Entrega").locator("xpath=following::input").first.fill(val_tiempo_entrega)

    # Comportamiento bajo el umbral
    val_comportamiento_umbral = clean_val(row['COMPORTAMIENTO BAJO EL UMBRAL'])
    if val_comportamiento_umbral:
        click_dropdown_option(page, "Comportamiento bajo umbral", val_comportamiento_umbral)

    # –– Costeo –––––––––––––––––––––––––––––––––––

    page.get_by_role("button", name="Costeo").click()
    
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
    
    # –– Material –––––––––––––––––––––––––––––––––––

    page.get_by_role("button", name="Material").click()

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

    # –– Ficha técnica –––––––––––––––––––––––––––––––––––

    page.get_by_role("button", name="Ficha técnica").click()

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

def run(playwright: Playwright) -> None:
    browser = playwright.chromium.launch(headless=False) # slow_mo=100
    context = browser.new_context()
    page = context.new_page()
    page.goto(url_gaia)
    page.wait_for_load_state("networkidle")
    page.get_by_role("textbox", name="Usuario").fill(usuario)
    page.get_by_role("textbox", name="Contraseña").click()
    page.get_by_role("textbox", name="Contraseña").fill(password)
    page.get_by_role("button", name="INICIAR SESIÓN").click()
    page.wait_for_load_state("networkidle")

    page.get_by_role("textbox", name="Menú: busca módulos").click()
    page.get_by_role("button", name=" Inventarios ▸").click()

    for index, row in df.iterrows():
        print(f"--- Fila {index+1} / {len(df)} | SKU: {row['SKU']} | Proveedor: {row['PROVEEDOR']} ---")
        try:
            if index == 0:
                page.get_by_role("button", name=" Nuevo Articulo").click()

            procesar_fila(page, row)

            # Click Guardar
            page.get_by_role("button", name=" Guardar").click()

            # Click + Nuevo if there are more records to process
            if index < len(df) - 1:
                page.get_by_role("button", name="+ Nuevo").click()
                page.wait_for_load_state("networkidle")

            print(f"RESULTADO | FILA: {index+1} | ESTADO: OK | SKU: {row['SKU']}")
        except Exception as e:
            print(f"RESULTADO | FILA: {index+1} | ESTADO: ERROR | SKU: {row['SKU']} | MOTIVO: {str(e)}")
            if "Target page, context or browser has been closed" in str(e):
                break

    # ---------------------
    context.close()
    browser.close()


print(f"Total de SKUs a subir (cantidad de filas): {len(df)}")

with sync_playwright() as playwright:
    start_time = time.time()
    run(playwright)
    print(f"--- Tiempo total de ejecución: {time.time() - start_time:.2f} segundos ---")