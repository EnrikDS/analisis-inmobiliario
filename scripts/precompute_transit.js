// Requires a running OpenTripPlanner GTFS GraphQL server (see docs/routing.md).
// Example: OTP_URL=http://localhost:8080/otp/gtfs/v1 node scripts/precompute_transit.js --date=2026-09-28 --time=08:00
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {places} from '../src/providers.js';
import {transitRoute} from '../src/routing.js';

if(!process.env.OTP_URL){console.error('Falta OTP_URL: este cálculo necesita OpenTripPlanner con GTFS operativo.');process.exit(1)}
const arg=name=>process.argv.find(x=>x.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const date=arg('date'),time=arg('time')??'08:00',minPopulation=Number(arg('min-pop')??0),limit=Number(arg('limit')??places.length);
if(!/^\d{4}-\d{2}-\d{2}$/.test(date??'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!Number.isFinite(minPopulation)||!Number.isFinite(limit)){
 console.error('Uso: OTP_URL=... node scripts/precompute_transit.js --date=AAAA-MM-DD [--time=08:00] [--min-pop=5000] [--limit=100]');process.exit(1)
}
const path=fileURLToPath(new URL('../data/transit.json',import.meta.url));
const existing=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):null;
const result=existing?.date===date&&existing?.time===time?existing:{date,time,source:'OpenTripPlanner / GTFS',routes:{},failed:{}};
function save(){writeFileSync(path+'.tmp',JSON.stringify(result));renameSync(path+'.tmp',path)}
let processed=0;
for(const p of places.filter(x=>x.population>=minPopulation).slice(0,limit)){
 if(result.routes[p.id])continue;
 try{
  const r=await transitRoute(p,date,time);
  if(r.status==='ok'){result.routes[p.id]={minutes:r.minutes,source:r.source,date,time,mode:'public-transit'};delete result.failed[p.id]}
  else result.failed[p.id]=r.message;
 }catch(e){result.failed[p.id]=e.message}
 if(++processed%10===0){save();console.log(`${processed} municipios consultados; ${Object.keys(result.routes).length} rutas obtenidas`)}
}
save();console.log(JSON.stringify({date,time,precomputed:Object.keys(result.routes).length,failed:Object.keys(result.failed).length}));
