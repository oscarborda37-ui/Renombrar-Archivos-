# Herramienta de Renombrado Masivo Alfanumérico
**Levapan S.A. • Gestión Inteligente de Archivos y Consecutivos Secuenciales**

Esta herramienta permite renombrar grandes volúmenes de archivos de forma automatizada, garantizando que cada nuevo lote o archivo continúe con el consecutivo alfanumérico correcto, evitando duplicados y manteniendo un historial auditable con capacidad de reversión (Undo).

---

## 🚀 ¿Cómo Iniciar la Herramienta?

Tienes dos alternativas según tu preferencia de trabajo:

### Opción 1: Aplicación Web Moderna (Recomendada)
1. Haz doble clic en el archivo **`Iniciar_Herramienta.bat`**.
2. Se abrirá automáticamente la aplicación en **Microsoft Edge** o tu navegador predeterminado en `http://localhost:4567`.
3. Haz clic en **"📂 Abrir Carpeta en Disco"** para vincular la carpeta donde están tus archivos.

> **Ventajas de la Aplicación Web:**
> - Vista previa en tiempo real de todos los nombres antes de aplicar cualquier cambio.
> - Renombra archivos directamente en el disco duro sin necesidad de moverlos ni descargarlos.
> - Detección automática del último serial en la carpeta.
> - Soporta modo oscuro y modo claro.
> - Botón para deshacer (Undo) cambios si te equivocas.

### Opción 2: Herramienta de Escritorio PowerShell
1. Haz clic derecho sobre **`Renombrador_PowerShell.ps1`** y selecciona **"Ejecutar con PowerShell"**.
2. Sigue las instrucciones interactivas en pantalla para seleccionar la carpeta y definir los parámetros.

---

## 🧩 Variables Disponibles para los Patrones

Puedes construir cualquier formato en el campo **"Estructura del Nuevo Nombre"**:

| Variable | Descripción | Ejemplo de Salida |
| :--- | :--- | :--- |
| `{SERIAL}` | Consecutivo alfanumérico calculado | `LEV-0001`, `A001`, `FAC-2024-001` |
| `{ORIGINAL}` | Nombre original del archivo (sin extensión) | `Factura_Marzo` |
| `{EXT}` | Extensión original del archivo (con el punto) | `.pdf`, `.xlsx`, `.docx` |
| `{FECHA}` | Fecha actual en formato `AAAA-MM-DD` | `2026-10-29` |
| `{HORA}` | Hora actual en formato `HHMMSS` | `154520` |
| `{INDICE}` | Contador correlativo simple (1, 2, 3...) | `1`, `2`, `3` |

### Ejemplos Prácticos:

- **Facturas Contables:**  
  `{SERIAL}_{ORIGINAL}` $\rightarrow$ `FAC-0001_Recibo_Levapan.pdf`
- **Control de Calidad / Producción:**  
  `LEV_LOTE_{SERIAL}_{FECHA}` $\rightarrow$ `LEV_LOTE_0045_2026-10-29.xlsx`
- **Expedientes de Personal:**  
  `EXP-{SERIAL}_{ORIGINAL}` $\rightarrow$ `EXP-2024-0012_Oscar_Borda.pdf`

---

## 🧠 ¿Cómo Funciona la Administración Inteligente del Serial?

1. **Detección Automática en la Carpeta:**
   Cuando abres una carpeta donde ya existen archivos renombrados (por ejemplo, `LEV-0042.pdf`, `LEV-0043.pdf`), la herramienta analiza todos los nombres y detecta cuál es el número más alto existente. Muestra una sugerencia visible para continuar inmediatamente desde `LEV-0044` con un solo clic.

2. **Memoria de Consecutivo Global:**
   Cada vez que completas un renombramiento masivo, el próximo número queda memorizado tanto en tu navegador como en el archivo `historial_seriales.json`. Así, cuando lleguen nuevos archivos la próxima semana o mes, la herramienta recordará en qué número se quedó.

3. **Tipos de Incremento Disponibles:**
   - **Numérico Inteligente:** Detecta el último grupo de números y lo avanza manteniendo ceros a la izquierda y prefijos (ej: `LEV-A099` $\rightarrow$ `LEV-A100`).
   - **Alfanumérico Base-36:** Avanza números y letras secuencialmente (0-9 y A-Z: ej. `0009` $\rightarrow$ `000A` $\rightarrow$ `000B`).
   - **Alfabético Puro:** Avanza como las columnas de Excel (`A` $\rightarrow$ `B` ... `Z` $\rightarrow$ `AA`).

4. **Memoria de Carpeta Previa (IndexedDB):**
   La aplicación recuerda la última carpeta utilizada. Al recargar la página o volver a abrir la herramienta, te mostrará la tarjeta de la sesión anterior con un botón de **"Reconectar Carpeta con 1 clic"** (o reconexión instantánea si los permisos persisten).

5. **Modo Centinela (Auto-Renombrar Archivos Nuevos):**
   Al activar el interruptor **"⚡ Auto-Renombrar Archivos Nuevos"**, la herramienta vigila la carpeta en tiempo real. Cada vez que tú o tu equipo agreguen, peguen o arrastren un archivo nuevo a la carpeta, el sistema lo detectará automáticamente y lo renombrará al instante siguiendo el siguiente serial disponible, sin requerir clics manuales.

6. **Historial y Deshacer (Undo):**
   En la pestaña **"Historial & Deshacer"** puedes consultar todos los lotes renombrados en el pasado (tanto masivos como automáticos), ver qué nombre tenía cada archivo antes del cambio y revertirlos a su estado original con el botón **"↩ Deshacer Lote"**.

---

## 📁 Estructura del Proyecto

```text
Renombrar Archivos/
├── .gitattributes              # Normalización de saltos de línea (CRLF/LF)
├── .gitignore                  # Exclusión de temporales y archivos de sistema
├── Iniciar_Herramienta.bat      # Lanzador con un clic para Windows
├── server.ps1                  # Micro-servidor local nativo en PowerShell
├── index.html                  # Interfaz gráfica moderna y responsive
├── styles.css                  # Estilos visuales con Glassmorphism y temas
├── app.js                      # Motor alfanumérico, API de archivos y lógica
├── Renombrador_PowerShell.ps1  # Script nativo complementario para PowerShell
├── historial_seriales.json     # Archivo local de auditoría y consecutivo
└── README.md                   # Esta documentación
```

---

## 💻 Requisitos del Sistema

- **Sistema Operativo:** Windows 10 o Windows 11.
- **PowerShell:** Versión 5.1 o superior (incluido por defecto en Windows).
- **Navegador Web:** Microsoft Edge, Google Chrome o cualquier navegador moderno compatible con Chromium (para compatibilidad total con la File System Access API).

