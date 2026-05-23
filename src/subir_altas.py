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
        page.get_by_role("button", name=" Nuevo Articulo").click()

        # –– Datos de interacción con ventas –––––––––––––––––––––––––––––––––––
        
        # Proveedor 
        page.locator("label").filter(has_text="Proveedor").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['PROVEEDOR'])).click()

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
        page.locator("label").filter(has_text="U. Venta").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.locator("button.list-group-item", has_text=str(row['U.VENTA'])).click()

        fecha_1 = pd.to_datetime(row['Fecha 1'], dayfirst=True).strftime('%Y-%m-%d') if pd.notna(row['Fecha 1']) else ""
        fecha_2 = pd.to_datetime(row['Fecha 2'], dayfirst=True).strftime('%Y-%m-%d') if pd.notna(row['Fecha 2']) else ""
        
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
        page.locator("label").filter(has_text="Linea").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['LINEA']), exact=True).click()

        # Modelo
        page.locator("label").filter(has_text="Modelo").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['MODELO']), exact=True).click()

        # Tipo de articulo
        page.locator("label").filter(has_text="Tipo Articulo").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['TIPO ARTICULO']), exact=True).click()

        # Marca
        page.locator("label").filter(has_text="Marca").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['MARCA']), exact=True).click()

        # Categoria
        page.locator("label").filter(has_text="Categoría").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['CATEGORIA']), exact=True).click()

        # Sublinea
        page.locator("label").filter(has_text="Sublinea").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['SUBLINEA']), exact=True).click()

        # Subcatart
        page.locator("label").filter(has_text="Subcatart").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['SUBCATART']), exact=True).click()

        # Clasificacion precio
        page.locator("label").filter(has_text="Clasificación de Precio").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['CLASIFICACION PRECIO']), exact=True).click()

        # Carpeta de vida
        page.locator("label").filter(has_text="Carpeta de Vida").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['CARPETA DE VIDA']), exact=True).click()

        # Subtipo
        page.locator("label").filter(has_text="SubTipo").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['SUBTIPO']), exact=True).click()

        # U. compra
        page.locator("label").filter(has_text="U. Compra").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['U.COMPRA']), exact=True).click()

        # Estilo
        page.locator("label").filter(has_text="Estilo").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['ESTILO']), exact=True).click()

        # Familia
        page.locator("label").filter(has_text="Familia").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['FAMILIA']), exact=True).click()

        # TIPO GAIA
        page.locator("label").filter(has_text="TIPO GAIA").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['TIPO GAIA']), exact=True).click()

        # Visibilidad
        page.locator("label").filter(has_text="Visibilidad").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['VISIBILIDAD']), exact=True).click()

        # Categoria Completa
        page.get_by_role("button", name="--SELECCIONA--").click()
        page.get_by_role("button", name=str(row['CATEGORÍA COMPLETA']), exact=True).click()

        # –– Comportamiento de Entrada y Recepción –––––––––––––––––––––––––––––––––––
        
        page.get_by_role("button", name="Comportamiento de Entrega y").click()

        # Tiempo de entrega a Clientes
        page.locator("label").filter(has_text="Tiempo de entrega a Clientes").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(int(row['TIEMPO DE ENTREGA A CLIENTES'])) if pd.notna(row['TIEMPO DE ENTREGA A CLIENTES']) else "", exact=True).click()

        # Tiempo de producción
        page.locator("label").filter(has_text=re.compile(r"Tiempo de Producción|Tipo de Producción", re.IGNORECASE)).locator("xpath=following::input").first.fill(str(int(row['TIEMPO DE PRODUCCION'])) if pd.notna(row['TIEMPO DE PRODUCCION']) else "")

        # Tiempo resurtido proveedor
        page.locator("label").filter(has_text="Tiempo resurtido proveedor").locator("xpath=following::input").first.fill(str(int(row['TIEMPO RESURTIDO PROVEEDOR'])) if pd.notna(row['TIEMPO RESURTIDO PROVEEDOR']) else "")

        # Tiempo Entrega
        page.locator("label").filter(has_text="Tiempo Entrega").locator("xpath=following::input").first.fill(str(int(row['TIEMPO ENTREGA'])) if pd.notna(row['TIEMPO ENTREGA']) else "")

        # Comportamiento bajo el umbral
        page.locator("label").filter(has_text="Comportamiento bajo umbral").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['COMPORTAMIENTO BAJO EL UMBRAL']), exact=True).click()

        # –– Costeo –––––––––––––––––––––––––––––––––––

        page.get_by_role("button", name="Costeo").click()
        
        # Costo compra
        page.locator("[id=\"Costo Compra\"]").click()
        page.locator("[id=\"Costo Compra\"]").fill(str(row['COSTO DE COMPRA']))
        
        # Moneda
        page.locator("label").filter(has_text="Moneda").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['MONEDA']), exact=True).click()
        
        # –– Material –––––––––––––––––––––––––––––––––––

        page.get_by_role("button", name="Material").click()

        # Material
        page.locator("label").filter(has_text="Material").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['MATERIAL']), exact=True).click()

        # Color
        page.locator("label").filter(has_text="Color").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['COLOR']), exact=True).click()

        # Familia de color
        page.locator("label").filter(has_text="Familia de color").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['FAMILIA DE COLOR']), exact=True).click()

        # Material Principal
        page.locator("label").filter(has_text="Material principal").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['MATERIAL PRINCIPAL']), exact=True).click()

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
        page.locator("label").filter(has_text="Tipo Armado").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()
        page.get_by_role("button", name=str(row['TIPO ARMADO']), exact=True).click()

        # page.pause()

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    start_time = time.time()
    run(playwright)
    print(f"--- Tiempo total de ejecución: {time.time() - start_time:.2f} segundos ---")