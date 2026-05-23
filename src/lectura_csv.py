import pandas as pd

def transformar_df():

    path = "../test/"
    archivo = "ALTAS-SED WEB.csv" 

    # 1. Lectura del archivo CSV
    try:
        df = pd.read_csv(path + archivo, skiprows=2)
    except FileNotFoundError:
        print(f"Error: Archivo no encontrado en la ruta {path + archivo}")
        return None
    except Exception as e:
        print(f"Error inesperado al leer el archivo CSV: {e}")
        return None

    # 2. Transformación de columnas y creación de Grupo
    try:
        df['Agregar SKU'] = df.apply(lambda row: {row['Agregar SKU']: row['Cantidad']} if pd.notna(row['Agregar SKU']) else {}, axis=1)
        df['Grupo'] = df['PROVEEDOR'].ffill()
    except KeyError as e:
        print(f"Error: Columna requerida no encontrada para la transformación ('Agregar SKU', 'Cantidad' o 'PROVEEDOR'): {e}")
        return None
    except Exception as e:
        print(f"Error durante la transformación de columnas: {e}")
        return None

    def unir_jsons(lista_de_jsons):
        json_unido = {}
        for j in lista_de_jsons:
            if isinstance(j, dict):
                json_unido.update(j)
        return json_unido

    # 3. Agrupación de los datos
    try:
        reglas_agrupacion = {columna: 'first' for columna in df.columns if columna not in ['Grupo', 'Agregar SKU']}
        reglas_agrupacion['Agregar SKU'] = unir_jsons
        df_final = df.groupby('Grupo', as_index=False).agg(reglas_agrupacion)
    except Exception as e:
        print(f"Error al agrupar los datos: {e}")
        return None

    # 4. Limpieza final
    try:
        if 'Columna_Control' in df_final.columns:
            df_final = df_final.drop(columns=['Columna_Control'])
        
        df_final.replace(None, '', inplace=True)
    except Exception as e:
        print(f"Error en la limpieza final de los datos: {e}")
        return None

    try:
        print("Se cargaran", df_final.shape[0], "proveedores")
    except Exception as e:
        print(f"Error al procesar el resultado final: {e}")

    return df_final
