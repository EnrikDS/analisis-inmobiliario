export const SOL={lat:40.4168,lon:-3.7038};
const routeCache=new Map(),pending=new Map();
let queue=Promise.resolve(),lastRequest=0;
async function requestJSON(url,options={}){
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`El proveedor responde HTTP ${response.status}`);
 return response.json();
}
export async function drivingRoute(place){
 if(routeCache.has(place.id))return routeCache.get(place.id);
 if(pending.has(place.id))return pending.get(place.id);
 const job=queue.catch(()=>{}).then(async()=>{
  const delay=Math.max(0,1100-(Date.now()-lastRequest));if(delay)await new Promise(r=>setTimeout(r,delay));lastRequest=Date.now();
  const base=(process.env.OSRM_URL||'https://router.project-osrm.org').replace(/\/$/,'');
  const url=`${base}/route/v1/driving/${place.lon},${place.lat};${SOL.lon},${SOL.lat}?overview=simplified&geometries=geojson`;
  const body=await requestJSON(url,{headers:{'User-Agent':'ZonasMadridLocalMVP/0.4'}});
  if(body.code!=='Ok'||!body.routes?.length)throw new Error('No se ha encontrado una ruta por carretera.');
  if(body.waypoints[0].distance>500)throw new Error('La referencia del municipio está demasiado lejos de una carretera; no se asigna un tiempo.');
  const route=body.routes[0];
  const value={minutes:Math.round(route.duration/6)/10,km:Math.round(route.distance/10)/100,geometry:route.geometry,origin:[place.lon,place.lat],destination:[SOL.lon,SOL.lat],snappedOriginMeters:Math.round(body.waypoints[0].distance),snappedDestinationMeters:Math.round(body.waypoints[1].distance),traffic:false,source:'OSRM / OpenStreetMap',calculatedAt:new Date().toISOString(),dataVersion:body.data_version??null};
  routeCache.set(place.id,value);return value;
 });
 queue=job;pending.set(place.id,job);try{return await job}finally{pending.delete(place.id)}
}
export async function transitRoute(place,date,time){
 if(!process.env.OTP_URL)return {status:'unconfigured',message:'Conecta OpenTripPlanner con horarios GTFS para obtener tiempos puerta a puerta. Mientras tanto, consulta el enlace de transporte público.'};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('Fecha u hora inválida.');
 const query=`query LocalJourney($from:InputCoordinates!,$to:InputCoordinates!,$date:String!,$time:String!){plan(from:$from,to:$to,date:$date,time:$time,numItineraries:3,transportModes:[{mode:WALK},{mode:TRANSIT}]){itineraries{duration startTime endTime walkTime waitingTime numberOfTransfers legs{mode duration from{name} to{name} route{shortName longName}}}}}`;
 const result=await requestJSON(process.env.OTP_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables:{from:{lat:place.lat,lon:place.lon},to:SOL,date,time:time+':00'}})});
 if(result.errors?.length)throw new Error('OpenTripPlanner no ha podido resolver la consulta. Revisa la versión/API y los horarios GTFS.');
 const itineraries=result.data?.plan?.itineraries??[];
 if(!itineraries.length)return {status:'no-route',message:'No hay itinerarios para esta fecha y hora en los datos del servidor.'};
 const best=[...itineraries].sort((a,b)=>a.endTime-b.endTime)[0];
 return {status:'ok',minutes:Math.round(best.duration/6)/10,source:'OpenTripPlanner · horarios GTFS',date,time,timezone:'Europe/Madrid',itinerary:best};
}
