import sys
import os
import logging

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', stream=sys.stdout)

# Aseguramos que el directorio actual esté en sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


class Config:
    """Load credentials from environment variables at runtime.

    This class reads credentials on-demand from environment variables,
    avoiding the security risk of loading secrets from .env files or
    storing them in memory at import time.
    """

    @property
    def username(self):
        """Read username from environment at runtime."""
        username = os.getenv('GAIA_APP_USERNAME')
        if not username:
            raise ValueError("GAIA_APP_USERNAME not configured")
        return username

    @property
    def password(self):
        """Read password from environment at runtime."""
        password = os.getenv('GAIA_APP_PASSWORD')
        if not password:
            raise ValueError("GAIA_APP_PASSWORD not configured")
        return password

    @property
    def app_url(self):
        """Read app URL from environment at runtime."""
        url = os.getenv('GAIA_APP_URL')
        if not url:
            raise ValueError("GAIA_APP_URL not configured")
        return url


# Create a global config instance to be used by other modules
config = Config()

def validate_csv(file_path):
    # Silenciamos los logs informativos para no ensuciar el stdout
    # ya que la app de Electron espera un string exacto ("OK")
    logging.getLogger().setLevel(logging.ERROR)
    from lectura_csv import transformar_df
    try:
        df = transformar_df(file_path)
        import math
        estimado_minutos = math.ceil((len(df) * 23) / 60)
        print(f"OK|{estimado_minutos}")
        sys.exit(0)
    except ValueError as e:
        print(str(e))
        sys.exit(1)
    except Exception as e:
        print(f"Error inesperado al validar el archivo: {e}")
        sys.exit(1)

def run_script(file_path):
    # Ejecutamos el script de subida
    # Para evitar que subir_altas.py lea sys.argv[1] incorrectamente,
    # reemplazamos sys.argv con la ruta del archivo.
    sys.argv = ['subir_altas.py', file_path]
    
    # Importar subir_altas ejecuta el código nivel módulo
    # ya que no tiene un bloque if __name__ == "__main__"
    import subir_altas

if __name__ == '__main__':
    if len(sys.argv) < 3:
        logging.error("Uso: cli.py [validate|run] [archivo_csv]")
        sys.exit(1)

    command = sys.argv[1]
    csv_file = sys.argv[2]

    if command == 'validate':
        validate_csv(csv_file)
    elif command == 'run':
        run_script(csv_file)
    else:
        logging.error(f"Comando desconocido: {command}")
        sys.exit(1)
