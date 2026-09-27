import {readFileSync,statSync} from 'node:fs';
import {stations,amenities} from './seed.js';
const readJSON=name=>JSON.parse(readFileSync(new URL(`../data/${name}`,import.meta.url),'utf8'));
const geography=readJSON('geography.json');
let routes;try{routes=readJSON('routes.json')}catch{routes={routes:{}}}
const busFile=new URL('../data/buses.json',import.meta.url);
let buses={stops:[],sources:[],note:'Importa feeds GTFS oficiales para activar el criterio de proximidad a paradas de autobús.'};
let busStamp='';
function currentBuses(){
 try{
  const stat=statSync(busFile),stamp=`${stat.ino}:${stat.mtimeMs}:${stat.size}`;
  if(stamp!==busStamp){buses=readJSON('buses.json');busStamp=stamp}
 }catch(e){
  if(e.code!=='ENOENT')throw e;
  buses={stops:[],sources:[],note:'Importa feeds GTFS oficiales para activar el criterio de proximidad a paradas de autobús.'};busStamp='';
 }
 return buses;
}
export const places=geography.places;
const transitFile=new URL('../data/transit.json',import.meta.url);
let transit={},transitStamp='';
function currentTransit(){
 try{
  const stat=statSync(transitFile),stamp=`${stat.ino}:${stat.mtimeMs}:${stat.size}`;
  if(stamp!==transitStamp){transit=readJSON('transit.json').routes??{};transitStamp=stamp}
 }catch(e){if(e.code!=='ENOENT')throw e;transit={};transitStamp=''}
 return transit;
}
export function getDataset(){
 return {...geography,stations,amenities,routes:routes.routes,transit:currentTransit(),buses:currentBuses(),meta:{...geography.meta,routing:routes.note,routeGenerated:routes.generated,transitConfigured:Boolean(process.env.OTP_URL),poiNote:'Muestra inicial incompleta; distancias en línea recta a coordenadas aproximadas.'}};
}
export async function getListings({place,mode}){
 const p=places.find(x=>x.id===place);
 if(!p)return {source:'none',items:[],searches:[]};
 const operation=mode==='rent'?'alquiler':'venta';
 const query=encodeURIComponent(`${operation} vivienda ${p.name} ${p.province}`);
 return {source:'portal-search',items:[],searches:['Idealista','Fotocasa','pisos.com'].map((name,i)=>({name,url:`https://www.google.com/search?q=site%3A${['idealista.com/inmueble/','fotocasa.es','pisos.com'][i]}+${query}`})),note:'Búsquedas externas, sin inventario de anuncios conectado.'};
}
