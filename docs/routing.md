# Trayectos a Sol: investigación e implementación

## Qué significa un tiempo «real»

La duración calculada sobre una red real es una estimación de viaje, no un cronometraje ni una garantía. Hay tres niveles: geometría y velocidades de carretera; tráfico para una hora concreta; transporte público con calendario, esperas y transbordos. La primera versión usaba una fórmula de distancia en línea recta. La versión 0.2 la ha eliminado.

## Opciones

| Sistema | Coche | Transporte público | Requisitos |
|---|---|---|---|
| OSRM + OpenStreetMap | Red real, distancia y tiempo según perfil; sin tráfico en la configuración usada | No | Servicio OSRM externo o servidor propio |
| OpenTripPlanner + OSM + GTFS | No es la opción elegida para coche | Caminar, horarios, frecuencias y transbordos; GTFS-RT si está disponible | Servidor Java, mapa OSM y feeds vigentes de los operadores |
| Google Routes API | Tráfico y hora de salida según modo/preferencia | Itinerarios según cobertura del proveedor | Clave, facturación, cuotas y condiciones del proveedor |
| Algoritmo propio | Dijkstra/A* pueden buscar caminos si tenemos un grafo adecuado | Requiere red temporal, calendarios, frecuencias y conexiones | Mucho mantenimiento de datos y validación además del algoritmo |

Recomendación para este proyecto: OSRM para el mapa inicial de accesibilidad en coche; OpenTripPlanner para transporte público si queremos controlar el sistema y evitar pagar cada consulta. Una API comercial simplifica el montaje a cambio de coste y dependencia de sus condiciones. Implementar un algoritmo propio no elimina el trabajo principal: obtener y mantener una red y horarios correctos.

## Implementado ahora

- 1.105 tiempos OSRM incluidos: el mapa funciona al arrancar sin pedir una ruta por cada celda o slider.
- Grid ligado al municipio y a su núcleo de referencia: no se llama a una API externa al mover los pesos.
- Endpoint /api/route?place=28005: ruta al acceso viario próximo a Sol, geometría para el mapa, duración, distancia, desplazamiento del origen/destino y fecha de cálculo.
- Caché en memoria, deduplicación y límite de una solicitud por 1,1 s para consultas nuevas. La instantánea del grid se conserva aunque el servicio externo falle. El servidor público de demostración no tiene garantía de disponibilidad.
- OSRM_URL configura un servidor propio. Para uso familiar ocasional se puede probar con el servicio de demostración; para trabajo continuo o grandes refrescos se recomienda desplegar el propio.
- No se simulan tráfico, disponibilidad de aparcamiento, acceso autorizado a zonas restringidas ni recorrido peatonal hasta Sol.

## Transporte público

El adaptador /api/transit?place=28005&date=2026-09-28&time=08:00 llama al endpoint GraphQL GTFS de OpenTripPlanner si se establece OTP_URL:

```bash
OTP_URL=http://localhost:8080/otp/gtfs/v1 npm start
```

Usa la consulta `plan`, todavía documentada por OTP 2 aunque obsoleta frente a `planConnection`. Se eligió por compatibilidad entre versiones. Es necesario un servidor OTP con esa API habilitada y un grafo de España central. Hora de entrada: Europe/Madrid; el router debe tener los feeds en esa zona horaria. Incluye caminar y transporte público. El resultado identifica fecha/hora, tramos y transbordos. Se ha probado el contrato mediante servidor de prueba; no se ha validado con un grafo regional real cargado en este entorno.

Sin OTP configurado, la app no muestra una duración numérica de transporte público; ofrece un enlace directo de ruta en Google Maps. El slider «Tiempo mínimo a Sol» toma el menor tiempo real disponible entre coche y transporte público. Con los datos incluidos inicialmente solo dispone de los 1.105 tiempos de coche sin tráfico ni aparcamiento, por lo que no afirma que el coche sea siempre la modalidad más rápida. Un cálculo a demanda con OTP actualiza el mínimo del municipio seleccionado.

Si dispones de un OTP con OSM y GTFS válidos para las cinco provincias, puedes precalcular una instantánea municipal para una fecha y hora homogéneas:

```bash
OTP_URL=http://localhost:8080/otp/gtfs/v1 node scripts/precompute_transit.js --date=2026-09-28 --time=08:00 --min-pop=5000
```

El script guarda `data/transit.json` por lotes, salta los municipios ya calculados para la misma fecha/hora y registra fallos sin inventar tiempos. Al recargar la página, el mínimo usa esos viajes donde existan. No se ha ejecutado contra un servidor OTP regional operativo aquí; su contrato API requiere validación con la versión y los feeds que se instalen. La duración del coche procede de una instantánea sin hora ni tráfico y la del transporte público se refiere a la salida indicada: no son una comparación puerta a puerta homogénea hasta que ambos modos incorporen los mismos tramos iniciales/finales y condiciones de hora.

Para desplegar OTP:
1. Preparar un recorte OSM que abarque Madrid y las cuatro provincias.
2. Descargar los feeds GTFS oficiales vigentes (CRTM: Metro, Cercanías, EMT, interurbanos; operadores de las provincias vecinas y servicios ferroviarios de larga distancia donde estén publicados). Un feed de Madrid por sí solo no cubre todos los viajes desde Toledo, Segovia o Ávila.
3. Comprobar licencias, fechas de calendario, identificadores y transbordos; construir el grafo siguiendo el tutorial oficial.
4. Validar viajes de referencia (Alcalá, Aranjuez, Toledo, Segovia y un pueblo con bus), para una fecha/hora concretas, contra los planificadores del operador.
5. Incorporar GTFS-RT donde exista, y después construir matrices para franjas de salida/llegada típicas.

## Fuentes técnicas primarias

- OSRM HTTP API, Route y Table: https://project-osrm.org/docs/v26.4.0/http
- Servidor demo: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
- OpenTripPlanner: https://www.opentripplanner.org/
- Documentación OTP: https://docs.opentripplanner.org/en/latest/Basic-Tutorial/
- API `plan`: https://docs.opentripplanner.org/api/dev-2.x/graphql-gtfs/queries/plan
- Datos abiertos CRTM: https://transparencia.crtm.es/presupuestos-contratos-y-gastos/datos-abiertos/
- Google Routes: https://developers.google.com/maps/documentation/routes/compute-route-over

## Compartir por web más adelante

El frontend ya es una aplicación web y el backend es HTTP. Alojarlos en un servidor no reduce las funciones actuales. Las instantáneas y la caché pasarían a estar centralizadas, y cada familiar usaría un enlace desde cualquier dispositivo. Se debe añadir autenticación en el servidor o proxy (contraseña compartida o cuentas), HTTPS y límites de consumo de rutas. Una contraseña comprobada únicamente con JavaScript en el navegador no protegería los datos. No se ha publicado el proyecto ni añadido una contraseña en esta versión.
