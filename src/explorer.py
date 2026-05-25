import re
import time
import os
from playwright.sync_api import Playwright, sync_playwright, expect
from dotenv import load_dotenv
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

load_dotenv("secrets/.env")

usuario = os.getenv("USUARIO")
password = os.getenv("PASSWORD")
url_gaia = os.getenv("URL")


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
    page.get_by_role("button", name=" Nuevo Articulo").click()

    # –– Datos de interacción con ventas –––––––––––––––––––––––––––––––––––

    page.wait_for_load_state("networkidle")
    page.locator("label").filter(has_text="Proveedor").locator("xpath=following::button[contains(@class, 'form-control')]").first.click()

    proveedores = page.locator(".list-group.py-1").locator("button").all_inner_texts()

    logging.info(proveedores)

    # –– Obtener HTML –––––––––––––––––––––––––––––––––––

    # html = page.content()
    # with open("pagina.html", "w", encoding="utf-8") as f:
    #     f.write(html)

    # ---------------------
    context.close()
    browser.close()


with sync_playwright() as playwright:
    start_time = time.time()
    run(playwright)
    logging.info(f"--- Tiempo total de ejecución: {time.time() - start_time:.2f} segundos ---")