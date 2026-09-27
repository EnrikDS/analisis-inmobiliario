# Zonas para vivir · MVP 0.5.0

## Acceso web para la familia

La versión 0.5.0 muestra el número de versión en el título y admite alojamiento con una contraseña familiar. Sigue funcionando localmente sin contraseña: consulta [cómo publicarla en Railway](docs/despliegue-railway.md). No guardes la contraseña en el repositorio.

## Arranque local

Necesitas Node.js 20 o posterior. No hacen falta paquetes npm adicionales.

1. Descomprime el ZIP conservando sus carpetas `src`, `data`, `docs`, `scripts` y `test`.
2. Abre una terminal dentro de la carpeta que contiene `package.json`.
3. Ejecuta `npm start` (o `bash iniciar-ubuntu.sh`).
4. Abre http://localhost:4173. Mantén abierta la terminal. Ctrl+C detiene el servidor.

No abras index.html directamente. Si aparece `EADDRINUSE`, ya hay otro proceso usando el puerto 4173: detén la instancia anterior con Ctrl+C en su terminal o ejecuta `PORT=4174 npm start` y abre http://localhost:4174.

## Novedades

- 1.128 municipios: Madrid + Toledo + Guadalajara + Segovia + Ávila.
- Dos sliders de población mínima/máxima municipal (INE 2023), buscador y filtro «solo con precio municipal».
- Presupuesto excluyente para celdas y municipios: compra = media municipal en €/m² × superficie indicada; alquiler = mediana mensual. Si no hay precio municipal, se excluye mientras el presupuesto sea positivo. Con presupuesto 0 se muestran también los municipios sin precio. Es una aproximación municipal, no una oferta concreta.
- Límites provinciales derivados de geometría geográfica, con nombres visibles.
- Compra: precios medios notariales INE 2024 para 45 municipios.
- Alquiler: mediana de rentas declaradas MIVAU, principalmente 2024, para 313 municipios. Euros al mes, no €/m².
- 1.105 rutas OSRM sobre la red viaria incluidas. No se usan fórmulas en línea recta para tiempos de viaje.
- Botón para consultar/mostrar la ruta por carretera del municipio. Precisa Internet.
- Slider «Tiempo mínimo a Sol»: toma el menor tiempo entre coche precalculado y transporte público si se calcula con OpenTripPlanner. De fábrica solo hay tiempos de coche; no se afirma que sea siempre el modo más rápido. El motor OTP y sus GTFS no se incluyen.
- Score con cobertura visible: los datos desconocidos no se sustituyen por cifras inventadas.
- Importador GTFS para paradas de autobús con subida permitida, sin exigir destino en Madrid. Pueden añadirse feeds oficiales de varios operadores. Se activa el slider después de importar.
- Tasas oficiales municipales de criminalidad para 44 municipios donde el INE las publica (2023). El slider «Seguridad» empieza en cero y solo puntúa donde existe una tasa municipal.
- Colores con escala relativa según las celdas visibles; el score numérico de 0 a 100 mantiene su significado absoluto.

Los precios son históricos, no precios de anuncios actuales. Los POI (estaciones, parques, hospitales) siguen siendo la muestra aproximada inicial. Cercanías, alta velocidad y autobuses puntúan solo por distancia continua a su estación o parada. Colegios no puntúan todavía. Los enlaces inmobiliarios siguen siendo búsquedas externas, no anuncios sincronizados.

## Activar paradas de autobús

El GTFS oficial del CRTM registra autobuses interurbanos de Madrid y paradas también en Guadalajara, Segovia, Toledo y Ávila. Para obtener el feed actualizado en tu equipo, ejecuta (requiere Python 3 e Internet):

```bash
python3 scripts/import_buses.py --download-crtm
npm start
```

El importador crea `data/buses.json` y selecciona paradas con subida permitida y viajes para el próximo día laborable. **Si conservas un `data/buses.json` de una versión anterior, vuelve a ejecutar este comando:** aquel fichero contenía solo paradas con una línea directa a Madrid centro. Si el servidor ya estaba abierto, recarga la página. Puedes añadir GTFS de otros operadores con `--gtfs ALSA=/ruta/archivo.zip`, repetible. `python3 scripts/import_buses.py --help` muestra los parámetros. No necesitas instalar paquetes Python.

Solo puntúa la distancia continua a la parada más próxima; la dirección, la frecuencia y el destino no afectan a ese slider. La ficha informa de líneas y expediciones programadas como contexto. Los GTFS caducan: vuelve a importar para mantener la información al día.

## Criminalidad y tiempo a Sol

La tasa de «Seguridad» procede del INE (2023, infracciones penales registradas por 1.000 habitantes). Se muestra exclusivamente en municipios publicados, sin extrapolar al resto ni confundirla con seguridad por barrio. Incluye delitos que pueden no reflejar la experiencia residencial (por ejemplo, cibercriminalidad). No conviene comparar los scores de municipios con cobertura distinta sin mirar el desglose.

Para calcular el mínimo de tiempo entre coche y transporte público en todo el mapa se necesita instalar un servidor OpenTripPlanner con horarios GTFS válidos. Con `OTP_URL` configurado, `node scripts/precompute_transit.js --date=AAAA-MM-DD --time=08:00` guarda `data/transit.json`. Consulta `docs/routing.md` antes de usarlo: el adaptador no se ha validado aún con un grafo regional real. Sin ese paso, el slider usa las rutas OSRM precalculadas de coche e indica la cobertura.

## Arquitectura

- `server.js`: HTTP, estáticos permitidos y endpoints de datos/anuncios/rutas. Escucha en 127.0.0.1 por defecto; en alojamiento web usa `HOST=0.0.0.0` y exige `FAMILY_PASSWORD`.
- `src/providers.js`: contrato normalizado de datos y anuncios.
- `src/routing.js`: adaptadores OSRM y OTP, caché y limitación de consultas OSRM.
- `src/geo.js`: pertenencia a polígonos (incluidos huecos) e índice espacial.
- `src/scoring.js`: criterios continuos y media ponderada sobre los datos disponibles, con porcentaje de cobertura.
- `src/app.js`: canvas, grid fijo de ≈2,5 km, filtros y fichas; no consulta rutas al mover sliders.
- `data/geography.json`: municipios, geometrías, población, precios y procedencia.
- `data/routes.json`: instantánea de tiempos sobre la red viaria.

## Verificación

```bash
npm test
python3 -m unittest discover -s test -p 'test_*.py'
```

Las pruebas cubren precios y unidades, presupuesto en compra/alquiler, valores desconocidos, geometrías, filtros y endpoints. `scripts/package.py` crea el ZIP conservando rutas relativas. La entrega se comprueba después de extraer el ZIP, no solo sobre el código original.

## Actualizar fuentes (opcional)

Los datos necesarios ya se incluyen. Para reconstruirlos se necesita Python y Shapely:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install shapely
python scripts/build_data.py --download
```

Para rellenar tiempos ausentes sobre un OSRM propio (la caché existente se conserva):

```bash
OSRM_URL=http://localhost:5000 python3 scripts/refresh_routes.py
```

Para reemplazar una instantánea completa, guarda una copia de `data/routes.json` y retírala antes del refresco. No ejecutes refrescos masivos repetidos contra el servidor público de demostración.

Consulta `docs/sources.md` para medidas, periodos y cobertura, y `docs/routing.md` para la investigación de trayectos y el futuro despliegue privado para familiares.
