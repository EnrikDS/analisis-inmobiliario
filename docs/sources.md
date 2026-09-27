# Fuentes y cobertura · versión 0.4

## Precios reales

- Compra: INE, Indicadores Urbanos, tabla 69330 «Grandes Municipios / Aspectos sociales», indicador «Precio medio por metro cuadrado de la vivienda (Euros/m2)». Referencia incluida: 2024. Procede de operaciones notariales, no de anuncios. 45 municipios en el ámbito de la app.
  https://www.ine.es/jaxiT3/Tabla.htm?t=69330
  https://www.ine.es/dyngs/Prensa/UA2025.htm
- Alquiler: MIVAU, serie VDP001_01, PRECIO / COLECTIVA / MEDIANA. Referencia incluida: último año disponible por municipio, principalmente 2024. Unidad: euros al mes por vivienda, NO euros/m². 313 municipios. No se divide la mediana del alquiler por la mediana de superficie: esa división no sería la mediana de €/m².
  https://cdn.mivau.gob.es/portal-web-mivau/Datos_MIVAU/CSV/VDP001_01.csv
- Tasación provincial: MIVAU VDP006_01, vivienda libre, último trimestre publicado (2026-T2). Se ofrece solo como contexto cuando falta una compraventa municipal; no se asigna a cada municipio ni participa en su score.
  https://datos.gob.es/es/catalogo/e05233601-valor-tasado-de-la-vivienda
- Se conserva en el esquema la tasación municipal publicada por la Comunidad de Madrid (2025) para una futura selección de series, sin mezclarla con las compraventas del INE.
  https://datos.comunidad.madrid/dataset/1004050

No son precios de oferta actuales. No se extrapolan los años históricos ni se inventan valores para municipios pequeños. En las fichas se muestra medida, unidad, periodo y enlace de origen. El CSV de alquiler llama COD_POSTAL al identificador; se verifica su correspondencia con el código INE municipal de cinco cifras, no con el código postal de Correos.

## Municipios, población y límites

1. MITECO «Cifras de población 2023», a partir de INE e IGN. © Ministerio para la Transición Ecológica y el Reto Demográfico.
   https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/reto-demografico/datos-demograficos.html
2. Conversión GeoJSON de Cristóbal Gallego-Castillo (UPM), 2026, CC BY 4.0, derivada de la fuente anterior.
   https://doi.org/10.5281/zenodo.20431328
3. Se seleccionan las provincias 05, 19, 28, 40 y 45: 248 municipios de Ávila, 288 de Guadalajara, 179 de Madrid, 209 de Segovia y 204 de Toledo; total 1.128.
4. Las fronteras provinciales se derivan de la unión de municipios, con simplificación aproximada de 100–200 m para la web. No son un croquis dibujado a mano; tampoco son límites de precisión catastral.
5. Los marcadores y orígenes de ruta utilizan GeoNames, subconjunto España, código municipal y comprobación de que el punto esté dentro de su municipio. Coincidencia de nombre o capital administrativa, y después núcleo más poblado. 1.105 referencias de núcleo; 23 puntos representativos de geometría, identificados como tales y sin ruta precalculada.
   https://download.geonames.org/export/dump/
   https://www.geonames.org/export/ (CC BY 4.0)

El filtro es de población del municipio a 1 de enero de 2023. No filtra cada urbanización o pedanía por su propia población. Para eso haría falta incorporar el Nomenclátor de entidades y núcleos del INE/IGN como una segunda capa.

## Trayectos y POI

Rutas: OSRM / OpenStreetMap, 1.105 municipios. Se incluye instantánea de duraciones calculadas sobre carreteras y sus perfiles de velocidad, sin tráfico real ni aparcamiento. Seleccionar «Ver / actualizar ruta» consulta la geometría de esa ruta; necesita conexión a Internet. El origen es el marcador municipal, no el centro de cada celda ni la dirección de una futura vivienda. Sol es peatonal: se informa de la distancia al acceso viario devuelto por el motor y no se añade un supuesto tiempo a pie.

Los puntos de Cercanías, alta velocidad, parques y hospitales siguen siendo la muestra aproximada del primer MVP. Su cobertura aún no es exhaustiva. Colegios se marcan sin datos y no puntúan. «Parada de bus» usa el GTFS oficial del CRTM tras importarlo: https://datos.crtm.es/datasets/885399f83408473c8d815e40c5e702b7 . La ficha del Punto de Acceso Nacional https://nap.transportes.gob.es/Files/Detail/1160 documenta cobertura en Madrid, Guadalajara, Segovia, Toledo y Ávila (y Cuenca), con 8.406 paradas, 354 rutas y calendario declarado hasta agosto de 2027 según su actualización de julio de 2026. El feed no representa necesariamente todas las empresas ni todos los trayectos de provincias limítrofes. Los GTFS de otros operadores, como ALSA o Samar, pueden importarse por separado si se dispone de los ZIP vigentes.

El importador solo incluye paradas donde se permite subir en algún autobús programado para el día laborable de referencia. El destino del viaje no interviene: el score usa únicamente distancia geodésica a la parada más cercana de los feeds incluidos, con decaimiento continuo. Cercanías y alta velocidad también puntúan por cercanía, con escalas diferentes. Frecuencia, dirección, duración y transbordos no influyen en esos tres sliders. En zonas sin parada incluida en los feeds importados, el criterio queda sin dato: no implica ausencia real de autobuses.

Criminalidad: la misma tabla 69330 del INE usada para precios publica el indicador «Total infracciones penales (Tasa por mil habitantes)»; la versión incluida es 2023 para 44 municipios de estas provincias. https://www.ine.es/jaxiT3/Tabla.htm?t=69330 . Incluye modalidades de delito que no equivalen a riesgo personal en una calle. Los denominadores son población municipal; municipios con muchos visitantes pueden tener tasas elevadas sin que todas las infracciones afecten a residentes. Los municipios pequeños carecen de dato y no reciben estimaciones.

## Score y datos ausentes

El grid tiene resolución geográfica fija de aproximadamente 2,5 km y queda asociado al municipio que contiene el centro de cada celda. Las funciones de distancia/tiempo siguen siendo continuas, no círculos binarios. Los precios y la ruta de referencia tienen resolución municipal; no se presentan como datos de cada calle.

Score = 100 × suma(peso × valor normalizado conocido) / suma(pesos con dato conocido).

El presupuesto es excluyente, no parte del score. El peso inicial de precio se redujo a 35 y el tiempo mínimo disponible a Sol subió a 75. El criterio de bus parte de 45 si existe un GTFS nuevo importado, y la criminalidad parte de 0 hasta que el usuario la active. Los tonos se expanden entre los percentiles 10 y 90 de los scores de celdas visibles para dar contraste; esta escala relativa cambia al filtrar o modificar los pesos y no modifica el valor numérico del score.

La cobertura es la fracción del peso solicitado que tiene datos. Si no hay ningún criterio disponible o todos los pesos están a cero, el score es nulo. Los resultados parciales se dibujan con color tenue y se identifican en la ficha. Evita comparar sus puntuaciones con las de municipios con cobertura completa. «Solo con precio municipal» permite comparar zonas con esa cobertura mínima.

El fichero geography.json incluye URLs y huellas SHA256 de los datos originales; scripts/build_data.py permite reconstruir el subconjunto. Las instantáneas de origen se descargaron para esta versión el 27/09/2026. Se distribuyen los datos normalizados, no los CSV nacionales completos.
