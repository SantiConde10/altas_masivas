import pandas as pd
from pathlib import Path
import glob
import logging

def transformar_df(custom_path=None):

    # Buscar cualquier archivo CSV en la carpeta data/
    # Calculamos la ruta relativa a la raíz del proyecto (alta_masiva)
    data_dir = Path(__file__).parent.parent / "data"

    try:
        if custom_path:
            archivo_path = Path(custom_path)
        else:
            csv_files = list(data_dir.glob("*.csv"))
            if not csv_files:
                raise ValueError("No se encontró ningún archivo CSV en la carpeta.")

            # Usamos el primer CSV encontrado
            archivo_path = csv_files[0]

        logging.info(f"Leyendo archivo de datos: {archivo_path.name}")
        df = pd.read_csv(archivo_path, skiprows=2, keep_default_na=False)

        if df.empty:
            raise ValueError("El archivo no contiene datos. Verifica que el CSV tenga filas con información.")

    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"No se pudo leer el archivo CSV. Verifica que el formato sea correcto. Detalle: {e}")

    # 2. Transformación de columnas y creación de Grupo
    def calcular_peso_volumetrico(row):
        try:
            largo = float(row['LARGO (CM)'])
            ancho = float(row['ANCHO (CM)'])
            alto = float(row['ALTO (CM)'])
            if largo > 0 and ancho > 0 and alto > 0:
                return 5000 / (largo * ancho * alto)
        except (ValueError, TypeError, KeyError, ZeroDivisionError):
            pass
        return row.get('PESO VOLUMÉTRICO', '')

    try:
        df['dict_row'] = df.apply(lambda row: {row['Agregar SKU']: row['Cantidad']} if str(row['Agregar SKU']).strip() != '' else {}, axis=1)
        df['Grupo'] = df['SKU'].replace('', None).ffill()
        df['PESO VOLUMÉTRICO'] = df.apply(calcular_peso_volumetrico, axis=1)
    except KeyError as e:
        col_name = str(e).strip("'\"")
        raise ValueError(f"La columna '{col_name}' no se encuentra en el archivo. Verifica el encabezado del CSV.")
    except Exception as e:
        raise ValueError(f"Error durante la transformación del archivo: {e}")

    def consolidar_jsons(subset):
        resultado_dict = {}
        for d in subset['dict_row']:
            if isinstance(d, dict):
                resultado_dict.update(d)
        return resultado_dict

    # 3. Agrupación de los datos y limpieza final
    try:
        consolidados = df.groupby('Grupo').apply(consolidar_jsons)
        df['group_SKU'] = df['Grupo'].map(consolidados)

        df['PROVEEDOR'] = df['PROVEEDOR'].replace('', pd.NA)
        df['SKU'] = df['SKU'].replace('', pd.NA)
        df['DESCRIPCION'] = df['DESCRIPCION'].replace('', pd.NA)
        df.dropna(subset=['PROVEEDOR', 'SKU', 'DESCRIPCION'], how='all', inplace=True)

        df.drop(columns=["dict_row"], inplace=True)
        df.reset_index(drop=True, inplace=True)

        if 'Columna_Control' in df.columns:
            df = df.drop(columns=['Columna_Control'])

        df_final = df.fillna('')
    except KeyError as e:
        col_name = str(e).strip("'\"")
        raise ValueError(f"La columna '{col_name}' no se encuentra en el archivo. Verifica el encabezado del CSV.")
    except Exception as e:
        raise ValueError(f"Error al procesar los datos del archivo: {e}")

    if df_final.empty:
        raise ValueError("No se encontraron datos válidos en el archivo. Verifica que el CSV tenga filas con información.")

    logging.info(f"Se cargaran {df_final.shape[0]} proveedores")
    return df_final
