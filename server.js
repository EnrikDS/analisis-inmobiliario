import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getListings, getDataset, places } from './src/providers.js';
import { drivingRoute, transitRoute } from './src/routing.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const familyPassword = process.env.FAMILY_PASSWORD || '';
const familyUser = process.env.FAMILY_USER || 'familia';
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8'};
function safeEqual(a,b) {
  return timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
}
function authorized(header) {
  if (!familyPassword) return true;
  if (!header?.startsWith('Basic ')) return false;
  try {
    const decoded=Buffer.from(header.slice(6),'base64').toString('utf8');
    const colon=decoded.indexOf(':');
    return colon>=0 && safeEqual(decoded.slice(0,colon),familyUser) && safeEqual(decoded.slice(colon+1),familyPassword);
  } catch { return false; }
}
export const handler = async (req,res) => {
  try {
    if (!authorized(req.headers.authorization)) {
      res.writeHead(401,{'www-authenticate':'Basic realm="Zonas para vivir", charset="UTF-8"','cache-control':'no-store','content-type':'text/plain; charset=utf-8'});
      return res.end('Se necesita la contraseña familiar.');
    }
    const url = new URL(req.url,'http://localhost');
    if (url.pathname === '/api/data') return send(res,200,getDataset());
    if (url.pathname === '/api/listings') return send(res,200,await getListings({place:url.searchParams.get('place'),mode:url.searchParams.get('mode')}));
    if (url.pathname === '/api/route' || url.pathname === '/api/transit') {
      const place=places.find(p=>p.id===url.searchParams.get('place'));
      if(!place)return send(res,400,{error:'Municipio desconocido'});
      try {
        const body=url.pathname==='/api/route'?await drivingRoute(place):await transitRoute(place,url.searchParams.get('date')||'',url.searchParams.get('time')||'');
        return send(res,200,body);
      }catch(e){return send(res,502,{error:e.message})}
    }
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = resolve(root,'.'+requested);
    const publicPaths=['/index.html','/style.css','/README.md','/docs/routing.md','/docs/sources.md','/src/app.js','/src/scoring.js','/src/geo.js'];
    if (!file.startsWith(root) || !publicPaths.includes(requested)) return send(res,404,{error:'No encontrado'});
    const bytes=await readFile(file); res.writeHead(200,{'content-type':types[extname(file)],'cache-control':'no-store'});res.end(bytes);
  } catch(e) {send(res,e.code === 'ENOENT'?404:500,{error:e.code === 'ENOENT'?'No encontrado':'Error del servidor'});}
};
function send(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 if (!['127.0.0.1','localhost','::1'].includes(host) && !familyPassword) {
  console.error('Configura FAMILY_PASSWORD antes de exponer la aplicación fuera de tu equipo.');
  process.exit(1);
 }
 const server=http.createServer(handler);
 server.on('error',e=>{
  if(e.code==='EADDRINUSE')console.error(`El puerto ${port} ya está ocupado. Detén la instancia anterior con Ctrl+C en su terminal o ejecuta PORT=${port+1} npm start y abre http://localhost:${port+1}.`);
  else console.error(`No se pudo iniciar el servidor: ${e.message}`);
  process.exitCode=1;
 });
 server.listen(port,host,()=>console.log(`http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));
}
