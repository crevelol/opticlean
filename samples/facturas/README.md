# Facturas de prueba · OptiClean

Archivos para validar **Nuevo pedido → Subir archivo** (XML / PDF / Word).

| Archivo | Formato | Cliente | Productos |
|---|---|---|---|
| `factura-prueba-opticlean.xml` | XML SRI | Hotel Alameda | P001, P032, P018 |
| `factura-prueba-opticlean.docx` | Word | Clínica del Norte | P005, P008, P015 |
| `factura-prueba-opticlean.pdf` | PDF | Corporación Horizonte | P012, P025, P001 |

El XML se parsea con el parser local (sin IA). PDF y DOCX usan extracción + IA si `OPENAI_API_KEY` está configurada.
