import re
import time
import os
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

df = transformar_df()

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
        page.get_by_role("button", name=" Nuevo Articulo").click()

        # –– Datos de interacción con ventas –––––––––––––––––––––––––––––––––––
        
        # Proveedor 
        val_proveedor = clean_val(row['PROVEEDOR'])
        if val_proveedor:
            page.locator("label").filter(has_text="Proveedor").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_proveedor).click()

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
            page.locator("label").filter(has_text="U. Venta").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.locator("button.list-group-item", has_text=val_u_venta).click()

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
            if grid_idx == 0:
                page.get_by_role("gridcell", name="1", exact=True).click()
            else:
                page.get_by_role("gridcell", name="1").nth(grid_idx * 2).click()
            page.get_by_role("spinbutton", name="Columna Cantidad").fill(str(sku_cantidad))
            grid_idx += 1

        # –– Clasificación –––––––––––––––––––––––––––––––––––

        page.get_by_role("button", name="Clasificación").click()

        # Linea
        val_linea = clean_val(row['LINEA'])
        if val_linea:
            page.locator("label").filter(has_text="Linea").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_linea, exact=True).click()

        # Modelo
        val_modelo = clean_val(row['MODELO'])
        if val_modelo:
            page.locator("label").filter(has_text="Modelo").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_modelo, exact=True).click()

        # Tipo de articulo
        val_tipo_articulo = clean_val(row['TIPO ARTICULO'])
        if val_tipo_articulo:
            page.locator("label").filter(has_text="Tipo Articulo").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_tipo_articulo, exact=True).click()

        # Marca
        val_marca = clean_val(row['MARCA'])
        if val_marca:
            page.locator("label").filter(has_text="Marca").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_marca, exact=True).click()

        # Categoria
        val_categoria = clean_val(row['CATEGORIA'])
        if val_categoria:
            page.locator("label").filter(has_text="Categoría").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_categoria, exact=True).click()

        # Sublinea
        val_sublinea = clean_val(row['SUBLINEA'])
        if val_sublinea:
            page.locator("label").filter(has_text="Sublinea").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_sublinea, exact=True).click()

        # Subcatart
        val_subcatart = clean_val(row['SUBCATART'])
        if val_subcatart:
            page.locator("label").filter(has_text="Subcatart").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_subcatart, exact=True).click()

        # Clasificacion precio
        val_clasificacion_precio = clean_val(row['CLASIFICACION PRECIO'])
        if val_clasificacion_precio:
            page.locator("label").filter(has_text="Clasificación de Precio").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_clasificacion_precio, exact=True).click()

        # Carpeta de vida
        val_carpeta_vida = clean_val(row['CARPETA DE VIDA'])
        if val_carpeta_vida:
            page.locator("label").filter(has_text="Carpeta de Vida").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_carpeta_vida, exact=True).click()

        # Subtipo
        val_subtipo = clean_val(row['SUBTIPO'])
        if val_subtipo:
            page.locator("label").filter(has_text="SubTipo").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_subtipo, exact=True).click()

        # U. compra
        val_u_compra = clean_val(row['U.COMPRA'])
        if val_u_compra:
            page.locator("label").filter(has_text="U. Compra").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_u_compra, exact=True).click()

        # Estilo
        val_estilo = clean_val(row['ESTILO'])
        if val_estilo:
            page.locator("label").filter(has_text="Estilo").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_estilo, exact=True).click()

        # Familia
        val_familia = clean_val(row['FAMILIA'])
        if val_familia:
            page.locator("label").filter(has_text="Familia").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_familia, exact=True).click()

        # TIPO GAIA
        val_tipo_gaia = clean_val(row['TIPO GAIA'])
        if val_tipo_gaia:
            page.locator("label").filter(has_text="TIPO GAIA").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_tipo_gaia, exact=True).click()

        # Visibilidad
        val_visibilidad = clean_val(row['VISIBILIDAD'])
        if val_visibilidad:
            page.locator("label").filter(has_text="Visibilidad").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_visibilidad, exact=True).click()

        # Categoria Completa
        val_categoria_completa = clean_val(row['CATEGORÍA COMPLETA'])
        if val_categoria_completa:
            page.get_by_role("button", name="--SELECCIONA--").click()
            page.get_by_role("button", name=val_categoria_completa, exact=True).click()

        # –– Comportamiento de Entrada y Recepción –––––––––––––––––––––––––––––––––––
        
        page.get_by_role("button", name="Comportamiento de Entrega y").click()

        # Tiempo de entrega a Clientes
        val_tiempo_entrega_clientes = clean_val(row['TIEMPO DE ENTREGA A CLIENTES'])
        if val_tiempo_entrega_clientes:
            page.locator("label").filter(has_text="Tiempo de entrega a Clientes").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_tiempo_entrega_clientes, exact=True).click()

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
            page.locator("label").filter(has_text="Comportamiento bajo umbral").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_comportamiento_umbral, exact=True).click()

        # –– Costeo –––––––––––––––––––––––––––––––––––

        page.get_by_role("button", name="Costeo").click()
        
        # Costo compra
        page.locator("[id=\"Costo Compra\"]").click()
        page.locator("[id=\"Costo Compra\"]").fill(str(row['COSTO DE COMPRA']))
        
        # Moneda
        val_moneda = clean_val(row['MONEDA'])
        if val_moneda:
            page.locator("label").filter(has_text="Moneda").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_moneda, exact=True).click()
        
        # –– Material –––––––––––––––––––––––––––––––––––

        page.get_by_role("button", name="Material").click()

        # Material
        val_material = clean_val(row['MATERIAL'])
        if val_material:
            page.locator("label").filter(has_text="Material").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_material, exact=True).click()

        # Color
        val_color = clean_val(row['COLOR'])
        if val_color:
            page.locator("label").filter(has_text="Color").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_color, exact=True).click()

        # Familia de color
        val_familia_color = clean_val(row['FAMILIA DE COLOR'])
        if val_familia_color:
            page.locator("label").filter(has_text="Familia de color").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_familia_color, exact=True).click()

        # Material Principal
        val_material_principal = clean_val(row['MATERIAL PRINCIPAL'])
        if val_material_principal:
            page.locator("label").filter(has_text="Material principal").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_material_principal, exact=True).click()

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
        page.locator("label").filter(has_text="Largo (cm)").locator("xpath=following::input").first.fill(str(row['LARGO (CM)']))

        # Ancho
        page.locator("label").filter(has_text="Ancho (cm)").locator("xpath=following::input").first.fill(str(row['ANCHO (CM)']))

        # Alto
        page.locator("label").filter(has_text="Alto (cm)").locator("xpath=following::input").first.fill(str(row['ALTO (CM)']))

        # Peso volumetrico
        page.locator("label").filter(has_text="Peso volumetrico").locator("xpath=following::input").first.fill(str(row['PESO VOLUMÉTRICO']))

        # Mantenimiento
        page.locator("label").filter(has_text="Mantenimiento").locator("xpath=following::input").first.fill(str(row['MANTENIMIENTO']) if pd.notna(row['MANTENIMIENTO']) else "")

        # Tipo de empaque
        page.locator("label").filter(has_text="Tipo de empaque").locator("xpath=following::input").first.fill(str(row['TIPO DE EMPAQUE']) if pd.notna(row['TIPO DE EMPAQUE']) else "")

        # Número de piezas
        page.locator("label").filter(has_text="Número de piezas").locator("xpath=following::input").first.fill(str(row['NÚMERO DE PIEZAS']) if pd.notna(row['NÚMERO DE PIEZAS']) else "")

        # Pieza del producto
        page.locator("label").filter(has_text="Piezas del producto").locator("xpath=following::input").first.fill(str(row['PIEZAS DEL PRODUCTO']))
        
        # Instructivo URL
        page.locator("label").filter(has_text="Instructivo URL").locator("xpath=following::input").first.fill(str(row['INSTRUCTIVO URL']) if pd.notna(row['INSTRUCTIVO URL']) else "")

        # Peso máximo soportado (KG) y Peso (KG)
        page.locator("label").filter(has_text="Peso (KG)").locator("xpath=following::input").first.fill(str(row['PESO (KG)']))
        page.locator("label").filter(has_text="Peso máximo soportado (KG)").locator("xpath=following::input").first.fill(str(row['PESO MÁXIMO SOPORTADO (KG)']))

        # Peso armado (KG)
        page.locator("label").filter(has_text="Peso armado (KG)").locator("xpath=following::input").first.fill(str(row['PESO ARMADO (KG)']))

        # Tipo de armado
        val_tipo_armado = clean_val(row['TIPO ARMADO'])
        if val_tipo_armado:
            page.locator("label").filter(has_text="Tipo Armado").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
            page.get_by_role("button", name=val_tipo_armado, exact=True).click()

        # page.pause()

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    start_time = time.time()
    run(playwright)
    print(f"--- Tiempo total de ejecución: {time.time() - start_time:.2f} segundos ---")