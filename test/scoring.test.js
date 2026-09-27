import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {places,getDataset} from '../src/providers.js';
import {score,scoreMetrics,defaultWeights,distance,withinBudget,nearestBusStop,makeBusLookup,minimumTravel} from '../src/scoring.js';
import {buildIndex,populationMatches,contains} from '../src/geo.js';
import {handler} from '../server.js';
import {createServer} from 'node:http';

const data=getDataset();
const madrid=places.find(p=>p.name==='Madrid');
const alcala=places.find(p=>p.name==='Alcalá de Henares');

test('precios públicos conservan unidades, fuentes y periodo',()=>{
 assert.equal(places.length,1128);
 assert.equal(madrid.buy.value,4184);
 assert.equal(madrid.buy.unit,'€/m²');
 assert.equal(madrid.buy.period,'2024');
 assert.equal(madrid.rent.value,868.8);
 assert.equal(madrid.rent.unit,'€/mes');
 assert.equal(places.filter(p=>p.crime).length,44);
 assert.equal(alcala.crime.unit,'por 1.000 habitantes');
 assert.equal(alcala.crime.period,'2023');
 assert.equal(places.filter(p=>p.buy).length,45);
 assert.equal(places.filter(p=>p.rent).length,313);
});

test('tiempos de ruta proceden del trazado viario y conservan metadatos',()=>{
 assert.ok(Object.keys(data.routes).length>=1100);
 assert.equal(data.routes[alcala.id].source,'OSRM / OpenStreetMap');
 assert.ok(data.routes[alcala.id].minutes>30 && data.routes[alcala.id].minutes<45);
 assert.equal(data.routes[alcala.id].traffic,false);
});

test('score con datos faltantes declara cobertura y no fabrica valores',()=>{
 const full=score(alcala,data,defaultWeights,'buy',alcala);
 assert.ok(full.total>=0&&full.total<=100);
 assert.equal(full.metrics.transit,null);
 assert.equal(full.metrics.travel,full.metrics.car);
 assert.equal(full.metrics.school,null);
 const missing=scoreMetrics({price:null,travel:null,rail:null,ave:null,green:null,hospital:null,crime:null},{price:100,travel:100});
 assert.equal(missing.total,null);
 assert.equal(missing.coverage,0);
 assert.deepEqual(missing.missing,['price','travel']);
 const partial=scoreMetrics({...full.metrics,price:null},{price:100,travel:100},'buy');
 assert.equal(partial.coverage,50);
 assert.equal(partial.missing[0],'price');
});

test('pesos, filtro demográfico y asignación por polígono',()=>{
 const price=score(alcala,data,{price:100},'buy',alcala);
 const road=score(alcala,data,{travel:100},'buy',alcala);
 assert.notEqual(price.total,road.total);
 assert.equal(score(alcala,data,{price:0,travel:0},'buy',alcala).total,null);
 assert.equal(distance(alcala,alcala),0);
 assert.ok(populationMatches(alcala,5000,200000));
 assert.ok(!populationMatches(alcala,200000,Infinity));
 assert.equal(buildIndex(places)(alcala)?.id,alcala.id);
 const ring=[[0,0],[2,0],[2,2],[0,2],[0,0]],hole=[[.5,.5],[1.5,.5],[1.5,1.5],[.5,1.5],[.5,.5]];
 const shape={bbox:[0,0,2,2],geometry:{type:'Polygon',coordinates:[ring,hole]}};
 assert.equal(contains(shape,{lon:.25,lat:.25}),true);
 assert.equal(contains(shape,{lon:1,lat:1}),false);
});

test('presupuesto excluye precios superiores y desconocidos antes de puntuar',()=>{
 assert.equal(withinBudget(madrid,'buy',350000,90),false);
 assert.equal(withinBudget(madrid,'buy',400000,90),true);
 assert.equal(withinBudget(madrid,'buy',350000,60),true);
 assert.equal(withinBudget(madrid,'rent',800),false);
 assert.equal(withinBudget(madrid,'rent',900),true);
 const withoutPrice=places.find(p=>!p.buy);
 assert.equal(withinBudget(withoutPrice,'buy',350000,90),false);
 assert.equal(withinBudget(withoutPrice,'buy',0,90),true);
});

test('bus puntúa solo la cercanía, y tiempo a Sol usa la modalidad más rápida disponible',()=>{
 const stops=[{lat:alcala.lat,lon:alcala.lon,name:'Alcalá',dailyTrips:8,examples:['223']}];
 const nearby=nearestBusStop(alcala,stops);
 assert.equal(nearestBusStop(alcala,makeBusLookup(stops)(alcala)).name,nearby.name);
 const farther=nearestBusStop({...alcala,lat:alcala.lat+.02},stops);
 assert.ok(nearby.km<farther.km);
 assert.ok(scoreMetrics({busStop:nearby},{bus:100}).values.bus>scoreMetrics({busStop:farther},{bus:100}).values.bus);
 assert.equal(nearestBusStop(alcala,[]),null);
 assert.deepEqual(minimumTravel(35,20),['Transporte público',20]);
 assert.deepEqual(minimumTravel(35,null),['Coche',35]);
 assert.equal(minimumTravel(null,null),null);
 assert.equal(score(alcala,data,{bus:100},'buy',alcala).total,null);
});

test('API sirve datos, valida municipio y ofrece búsquedas sin inventar anuncios',async()=>{
 const server=createServer(handler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  const response=await fetch(origin+'/api/data');
  assert.equal(response.status,200);
  assert.equal((await response.json()).places.length,1128);
  const listing=await (await fetch(origin+`/api/listings?place=${alcala.id}&mode=buy`)).json();
  assert.deepEqual(listing.items,[]);
  assert.ok(listing.searches.length);
  assert.equal((await fetch(origin+'/api/route?place=unknown')).status,400);
  assert.equal((await fetch(origin+'/src/providers.js')).status,404);
  assert.equal((await fetch(origin+'/src/app.js')).status,200);
 }finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()))}
});
