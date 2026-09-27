export const criteria=[['price','Precio'],['travel','Tiempo mínimo a Sol'],['cercanias','Cercanías'],['ave','Alta velocidad'],['bus','Parada de bus'],['green','Zonas verdes'],['school','Colegios'],['hospital','Hospitales'],['crime','Seguridad']];
export const defaultWeights={price:35,travel:75,cercanias:55,ave:25,bus:0,green:40,school:0,hospital:25,crime:0};
export function distance(a,b){const r=Math.PI/180,lat=(b.lat-a.lat)*r,lon=(b.lon-a.lon)*r,h=Math.sin(lat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(lon/2)**2;return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)))}
// Budget is a hard eligibility filter. Unknown municipal prices cannot be certified as affordable.
export function withinBudget(place,mode,budget,area=90){
 if(!(Number(budget)>0))return true;
 const price=place?.[mode]?.value;
 if(!Number.isFinite(price))return false;
 return mode==='rent'?price<=Number(budget):price*(Number(area)>0?Number(area):90)<=Number(budget);
}
const decay=(value,scale)=>Number.isFinite(value)?Math.exp(-value/scale):null;
export function closest(point,items){let item=null,km=Infinity;for(const candidate of items){const d=distance(point,candidate);if(d<km){item=candidate;km=d}}return item?{...item,km}:null}
export function makeBusLookup(stops){
 const size=.1,bins=new Map();
 for(const stop of stops){const key=`${Math.floor(stop.lat/size)}:${Math.floor(stop.lon/size)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(stop)}
 return point=>{const result=[],lat=Math.floor(point.lat/size),lon=Math.floor(point.lon/size);
  for(let y=lat-3;y<=lat+3;y++)for(let x=lon-4;x<=lon+4;x++)result.push(...(bins.get(`${y}:${x}`)??[]));
  return result;
 };
}
export function nearestBusStop(point,stops=[]){
 let best=null;
 for(const stop of stops){
  if(Math.abs(stop.lat-point.lat)>.23||Math.abs(stop.lon-point.lon)>.36)continue;
  const km=distance(point,stop);
  if(km>25)continue;
  if(!best||km<best.km)best={...stop,km};
 }
 return best;
}
export function minimumTravel(car,transit){
 const options=[['Coche',car],['Transporte público',transit]].filter(([,minutes])=>Number.isFinite(minutes));
 return options.length?options.reduce((a,b)=>a[1]<=b[1]?a:b):null;
}
export function metrics(point,data,mode='buy',place=null){
 place=place??data.places.find(p=>p.id===point.id)??closest(point,data.places);
 const rail=closest(point,data.stations.filter(s=>s.type==='cercanias'));
 const ave=closest(point,data.stations.filter(s=>s.type==='ave'));
 const green=closest(point,data.amenities.filter(s=>s.type==='green'));
 const hospital=closest(point,data.amenities.filter(s=>s.type==='hospital'));
 const priceRecord=place?.[mode]??null,road=data.routes?.[place?.id]??null;
 const transit=data.transit?.[place?.id]??null;
 const travel=minimumTravel(road?.minutes,transit?.minutes);
 return {price:priceRecord?.value??null,priceRecord,car:road?.minutes??null,road,transit:transit?.minutes??null,transitRecord:transit,travel:travel?.[1]??null,travelMode:travel?.[0]??null,rail,ave,green,hospital,school:null,busStop:nearestBusStop(point,data.busLookup?.(point)??(data.buses?.schemaVersion===2?data.buses.stops:[])),crime:place?.crime?.value??null,crimeRecord:place?.crime??null,reference:place};
}
export function scoreMetrics(m,weights,mode='buy'){
 const clamp=x=>Math.max(0,Math.min(1,x));
 const values={price:Number.isFinite(m.price)?clamp(((mode==='buy'?6500:1800)-m.price)/(mode==='buy'?6000:1500)):null,travel:decay(m.travel,75),cercanias:decay(m.rail?.km,6),ave:decay(m.ave?.km,24),bus:decay(m.busStop?.km,4),green:decay(m.green?.km,19),school:null,hospital:decay(m.hospital?.km,23),crime:Number.isFinite(m.crime)?clamp((90-m.crime)/70):null};
 let total=0,knownWeight=0,requestedWeight=0;const missing=[];
 for(const [key] of criteria){const w=Math.max(0,Number(weights[key])||0);requestedWeight+=w;if(values[key]!==null){knownWeight+=w;total+=w*values[key]}else if(w)missing.push(key)}
 return {total:knownWeight?Math.round(100*total/knownWeight):null,coverage:requestedWeight?Math.round(100*knownWeight/requestedWeight):0,values,missing,metrics:m};
}
export function score(point,data,weights=defaultWeights,mode='buy',place=null){return scoreMetrics(metrics(point,data,mode,place),weights,mode)}
