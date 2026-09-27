import {score,scoreMetrics,metrics,criteria,defaultWeights,withinBudget,minimumTravel,makeBusLookup} from './scoring.js';
import {polygons,buildIndex,populationMatches} from './geo.js';
const $=id=>document.getElementById(id),canvas=$('map'),ctx=canvas.getContext('2d');
const thresholds=[0,100,500,1000,2500,5000,10000,20000,50000,100000,250000,1000000,4000000];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=0)=>Number.isFinite(n)?new Intl.NumberFormat('es-ES',{maximumFractionDigits:d}).format(n):'Sin dato';
const sources={
 'ine-sales':{name:'INE · Indicadores Urbanos (operaciones notariales)',url:'https://www.ine.es/jaxiT3/Tabla.htm?t=69330'},
 'ine-crime':{name:'INE · Indicadores Urbanos (Ministerio del Interior)',url:'https://www.ine.es/jaxiT3/Tabla.htm?t=69330'},
 'mivau-rent':{name:'MIVAU · SERPAVI, alquiler declarado',url:'https://cdn.mivau.gob.es/portal-web-mivau/Datos_MIVAU/CSV/VDP001_01.csv'},
 'madrid-appraisals':{name:'Comunidad de Madrid · MIVAU',url:'https://datos.comunidad.madrid/dataset/1004050'},
 'mivau-appraisals':{name:'MIVAU · Valor tasado provincial',url:'https://cdn.mivau.gob.es/portal-web-mivau/Datos_MIVAU/CSV/VDP006_01.csv'}
};
let data,lookup,selected=null,weights={...defaultWeights},mode='buy',zoom=1,center={lat:40.4,lon:-3.7},bounds,grid=[],visible=[],drag=null,raf=0,routeGeometry=null;
let transitDate='',transitTime='08:00',selectionToken=0;
const listCache=new Map();
function viewport(){const w=canvas.clientWidth,h=canvas.clientHeight;return {w,h,scale:Math.min(w/((bounds[2]-bounds[0])*.76),h/(bounds[3]-bounds[1]))*.92*zoom}}
function project(lat,lon){const {w,h,scale}=viewport();return {x:w/2+(lon-center.lon)*scale*.76,y:h/2-(lat-center.lat)*scale}}
function unproject(x,y){const {w,h,scale}=viewport();return {lat:center.lat-(y-h/2)/scale,lon:center.lon+(x-w/2)/(scale*.76)}}
function filterMatch(p){return populationMatches(p,thresholds[+$('pop-min').value],thresholds[+$('pop-max').value])&&(!$('priced-only').checked||Boolean(p[mode]))&&withinBudget(p,mode,$('budget').value,$('area').value)}
function pathGeometry(geometry){ctx.beginPath();for(const polygon of polygons(geometry))for(const ring of polygon){ring.forEach(([lon,lat],i)=>{const p=project(lat,lon);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.closePath()}}
function scheduleDraw(){if(!raf)raf=requestAnimationFrame(()=>{raf=0;draw()})}
function fit(){center={lon:(bounds[0]+bounds[2])/2,lat:(bounds[1]+bounds[3])/2};zoom=1;scheduleDraw()}
function cellMetrics(cell){if(!cell.cached)cell.cached=metrics(cell.point,data,mode,cell.place);const m=cell.cached;m.priceRecord=cell.place[mode];m.price=m.priceRecord?.value??null;m.road=data.routes[cell.place.id]??null;m.car=m.road?.minutes??null;m.transitRecord=data.transit?.[cell.place.id]??null;m.transit=m.transitRecord?.minutes??null;const travel=minimumTravel(m.car,m.transit);m.travel=travel?.[1]??null;m.travelMode=travel?.[0]??null;return m}
function draw(){
 if(!data)return;
 const {w,h}=viewport(),dpr=devicePixelRatio||1;
 if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr)}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#edf2f4';ctx.fillRect(0,0,w,h);
 // Province fills make the geographical coverage visible even if filters hide every town.
 for(const region of data.regions){pathGeometry(region.geometry);ctx.fillStyle='#dae4e6';ctx.fill('evenodd')}
 const cells=[];
 for(const cell of grid){
  if(!filterMatch(cell.place))continue;
  const a=project(cell.point.lat+.01125,cell.point.lon-.015),b=project(cell.point.lat-.01125,cell.point.lon+.015);
  if(b.x<0||a.x>w||b.y<0||a.y>h)continue;
  const s=scoreMetrics(cellMetrics(cell),weights,mode);cell.current=s;cells.push({a,b,s});
 }
 const scores=cells.map(c=>c.s.total).filter(Number.isFinite).sort((a,b)=>a-b);
 const low=scores[Math.floor(scores.length*.1)]??0,high=scores[Math.floor(scores.length*.9)]??100;
 const span=Math.max(8,high-low),mid=(low+high)/2;
 for(const {a,b,s} of cells){
  const normalized=s.total===null?null:Math.max(0,Math.min(1,.5+(s.total-mid)/span));
  ctx.fillStyle=normalized===null?'#b6c3c9':`hsla(${14+normalized*160},80%,${54-normalized*15}%,${s.coverage<100?.62:.94})`;
  ctx.fillRect(a.x,a.y,Math.max(.6,b.x-a.x-.25),Math.max(.6,b.y-a.y-.25));
 }
 $('color-low').textContent=fmt(low);$('color-high').textContent=fmt(high);
 // Draw provincial borders last, with a light casing, so they stay legible above heatmap cells.
 for(const region of data.regions){pathGeometry(region.geometry);ctx.strokeStyle='#ffffff';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#334b65';ctx.lineWidth=1.6;ctx.stroke()}
 if(selected&&filterMatch(selected)){pathGeometry(selected.geometry);ctx.strokeStyle='#075c73';ctx.lineWidth=2;ctx.stroke()}
 if(routeGeometry){ctx.beginPath();routeGeometry.coordinates.forEach(([lon,lat],i)=>{const p=project(lat,lon);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.lineWidth=3;ctx.strokeStyle='#8e36b8';ctx.stroke()}
 const occupied=[];ctx.textBaseline='middle';
 for(const p of visible){
  const xy=project(p.lat,p.lon);if(xy.x<0||xy.x>w||xy.y<0||xy.y>h)continue;
  ctx.beginPath();ctx.arc(xy.x,xy.y,p.id===selected?.id?5:Math.max(2,Math.min(4,Math.log10(p.population||1)-1)),0,Math.PI*2);ctx.fillStyle=p.id===selected?.id?'#006e76':'#16354f';ctx.fill();
  const name=p.name,tx=xy.x+7;ctx.font=(p.id===selected?.id?'bold ':'')+'12px system-ui';const tw=ctx.measureText(name).width;
  const box={x:tx-2,y:xy.y-9,w:tw+4,h:18};
  if(p.id!==selected?.id&&occupied.some(o=>box.x<o.x+o.w&&box.x+box.w>o.x&&box.y<o.y+o.h&&box.y+box.h>o.y))continue;
  occupied.push(box);ctx.fillStyle='#fffffff0';ctx.fillRect(box.x,box.y,box.w,box.h);ctx.fillStyle='#16354f';ctx.fillText(name,tx,xy.y);
 }
 for(const region of data.regions){const p=project(region.label[1],region.label[0]);if(p.x<20||p.x>w-20||p.y<20||p.y>h-20)continue;ctx.font='bold 14px system-ui';ctx.textAlign='center';ctx.strokeStyle='#ffffffd9';ctx.lineWidth=4;ctx.strokeText(region.name.toUpperCase(),p.x,p.y);ctx.fillStyle='#344a69';ctx.fillText(region.name.toUpperCase(),p.x,p.y);ctx.textAlign='left'}
 const sol=project(40.4168,-3.7038);ctx.beginPath();ctx.arc(sol.x,sol.y,6,0,Math.PI*2);ctx.fillStyle='#e5355b';ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=2;ctx.stroke();
 if(selected&&filterMatch(selected)){const p=project(selected.lat,selected.lon);ctx.beginPath();ctx.arc(p.x,p.y,10,0,Math.PI*2);ctx.strokeStyle='#102f46';ctx.lineWidth=2;ctx.stroke()}
 $('coverage').textContent=`${fmt(visible.length)} de ${fmt(data.places.length)} municipios · límites provinciales visibles`;
 $('map-notice').hidden=visible.length>0;$('map-notice').textContent='Ningún municipio cumple estos filtros. Amplía la población, el presupuesto o desactiva «Solo con precio municipal».';
}
function refreshFilters(){
 visible=data.places.filter(filterMatch);
 $('pop-min-value').textContent=fmt(thresholds[+$('pop-min').value]);$('pop-max-value').textContent=+$('pop-max').value===12?'Sin máximo':fmt(thresholds[+$('pop-max').value]);
 $('summary').textContent=`${fmt(visible.filter(p=>p[mode]).length)} con precio municipal · ${fmt(visible.filter(p=>data.routes[p.id]).length)} con ruta por carretera · ${fmt(visible.filter(p=>p.crime).length)} con tasa de criminalidad · Grid ≈2,5 km`;
 $('town-list').innerHTML=visible.map(p=>`<button data-place="${p.id}" class="${p.id===selected?.id?'selected-town':''}">${esc(p.name)} <span class="muted">${fmt(p.population)}</span></button>`).join('');
 if(selected&&!filterMatch(selected)){selected=null;routeGeometry=null;selectionToken++;$('details').innerHTML='<h2>Selecciona un municipio</h2><p>El municipio anterior queda fuera del filtro de población o presupuesto. Sin precio municipal publicado no se puede comprobar si cabe en el presupuesto.</p>'}
 scheduleDraw();
}
function sourceLine(record){const s=sources[record.source];return `<p class="source-note">${esc(record.kind)} · ${esc(record.period)}<br><a href="${esc(s?.url??'#')}" target="_blank" rel="noopener">${esc(s?.name??record.source)}</a></p>`}
function kv(label,value){return `<div class="kv"><span>${label}</span><b>${value}</b></div>`}
function renderListings(p){const key=p.id+mode,cached=listCache.get(key);if(cached){paint(cached);return}const active=selectionToken;fetch(`/api/listings?place=${p.id}&mode=${mode}`).then(r=>r.json()).then(v=>{listCache.set(key,v);if(active===selectionToken)paint(v)}).catch(()=>{if(active===selectionToken&&$('listings'))$('listings').textContent='No se pueden cargar las búsquedas.'});function paint(v){if(!$('listings'))return;$('listings').innerHTML=`<div class="search-links">${v.searches.map(a=>`<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.name)} ↗</a>`).join('')}</div><p class="source-note">Búsquedas externas; no hay inventario de anuncios conectado.</p>`}}
function detail(){
 if(!selected)return;
 const p=selected,s=score(p,data,weights,mode,p),m=s.metrics,price=p[mode],budget=Number($('budget').value)||0,area=Number($('area').value)||90;
 const estimate=price?(mode==='buy'?price.value*area:price.value):null;
 const province=data.regions.find(r=>r.id===p.provinceCode),transitLink=`https://www.google.com/maps/dir/?api=1&origin=${p.lat},${p.lon}&destination=40.4168,-3.7038&travelmode=transit`;
 const nearby=x=>x?`${esc(x.name)} · ${fmt(x.km,1)} km`:'Sin dato';
 const road=m.road;
 $('details').innerHTML=`<div class="place-tag">${esc(p.province)} · ${fmt(p.population)} habitantes (2023)</div><h2>${esc(p.name)}</h2>
 <div class="score"><strong>${s.total??'—'}</strong><span>/ 100 · ${s.coverage<100?'score parcial':'según tus pesos'}<span class="coverage">Datos para el ${s.coverage}% del peso activo</span></span></div>
 ${s.coverage<100?'<p class="source-note">Faltan criterios. Se excluyen del promedio; compara municipios con una cobertura similar.</p>':''}
 <h3>${mode==='buy'?'Precio de compraventa':'Alquiler declarado'}</h3>
 ${price?`${kv(price.kind,`${fmt(price.value,mode==='rent'?1:0)} ${esc(price.unit)}`)}${sourceLine(price)}<p class="data-note">${mode==='buy'?'Precio medio de operaciones notariales.':'Mediana de contratos declarados de vivienda colectiva.'} Referencia histórica; no es el precio de los anuncios actuales.</p>`:'<p class="data-note">Sin precio municipal publicado en la fuente incorporada. El criterio precio no puntúa aquí.</p>'}
 ${estimate!==null?`<p class="${budget&&estimate>budget?'caveat':'muted'}">${mode==='buy'?`Referencia para ${fmt(area)} m²`:'Mediana mensual (no ajustada por superficie)'}: <b>${fmt(estimate)} ${mode==='buy'?'€':'€/mes'}</b>${budget?` · ${estimate>budget?'supera':'dentro de'} tu presupuesto de ${fmt(budget)} €`:''}</p>`:''}
 ${mode==='buy'&&!price&&province.appraisal?`<p class="source-note">Referencia de toda la provincia: ${fmt(province.appraisal.value)} €/m² de tasación (${esc(province.appraisal.period)}). No se usa como precio del municipio ni en su score.</p>`:''}
 <h3>Trayectos desde el núcleo de referencia</h3>
 ${kv('Tiempo mínimo disponible a Sol',m.travel!==null?`${fmt(m.travel)} min · ${esc(m.travelMode)}`:'Sin trayecto calculado')}
 <p class="source-note">Mínimo entre coche y transporte público cuando hay tiempo verificado para ambas modalidades. Por ahora hay rutas precalculadas de coche; sin motor de transporte público el mínimo solo refleja coche. El coche no incluye tráfico, aparcamiento ni el tramo a pie.</p>
 ${kv('Coche, acceso próximo a Sol',road?`${fmt(road.minutes)} min · ${fmt(road.km,1)} km`:'Sin ruta calculada')}
 ${road?`<p class="source-note">Red viaria OSRM · sin tráfico en directo. Último acceso a ${fmt(road.snappedDestinationMeters)} m en línea recta de Sol; no incluye aparcamiento ni el tramo a pie. Cálculo: ${esc(road.calculatedAt.slice(0,10))}.</p>`:''}
 ${p.locationSource!=='geonames'?'<p class="source-note">Coordenada representativa del término municipal, no un núcleo verificado.</p>':''}
 <button class="route-btn" id="route-button">Ver / actualizar ruta por carretera</button><div id="route-status" class="source-note" role="status"></div>
 ${kv('Transporte público a Sol',m.transit!==null?`${fmt(m.transit)} min`:'Pendiente de motor con horarios')}
 <p class="source-note">${data.meta.transitConfigured?'Consulta para una fecha y hora concretas (hora de Madrid).':'No se asigna un tiempo inventado. El adaptador OpenTripPlanner está preparado; necesita un servidor con GTFS.'}</p>
 ${data.meta.transitConfigured?`<div class="route-form"><input id="travel-date" type="date" aria-label="Fecha del viaje" value="${transitDate}"><input id="travel-time" type="time" aria-label="Hora del viaje en Madrid" value="${transitTime}"><button id="transit-button">Calcular</button></div><div id="transit-status" class="source-note" role="status"></div>`:''}
 <p><a href="${transitLink}" target="_blank" rel="noopener noreferrer">Consultar transporte público en Google Maps ↗</a></p>
 <h3>Servicios cercanos · muestra inicial</h3>${kv('Cercanías',nearby(m.rail))}${kv('Alta velocidad',nearby(m.ave))}${kv('Zona verde',nearby(m.green))}${kv('Hospital',nearby(m.hospital))}${kv('Parada de bus',m.busStop?`${esc(m.busStop.name)} · ${fmt(m.busStop.km,1)} km`:'Sin parada importada próxima')}
 ${m.busStop?`<p class="source-note">${fmt(m.busStop.dailyTrips)} expediciones programadas el ${esc(data.buses.referenceDate)} · ${fmt(m.busStop.lines)} líneas. Ejemplos: ${esc(m.busStop.examples?.join(', ')??'')}. ${esc(m.busStop.source)}. El destino del bus no afecta a este criterio.</p>`:''}
 <p class="source-note">Bus, Cercanías y alta velocidad puntúan solo por distancia continua a una parada o estación. Cobertura limitada a los datos importados; la ausencia no demuestra que no exista servicio. Los otros puntos siguen siendo una muestra incompleta.</p>
 <h3>Criminalidad municipal</h3>
 ${p.crime?`${kv('Infracciones penales registradas',`${fmt(p.crime.value,1)} por 1.000 hab.`)}${sourceLine(p.crime)}<p class="source-note">Dato municipal: no describe la seguridad de una calle. Puede incluir ciberdelitos y verse afectado por visitantes y denuncias.</p>`:'<p class="source-note">Sin tasa municipal publicada. No se asigna una tasa provincial al municipio.</p>'}
 <h3>Desglose por criterio</h3>${criteria.map(([k,label])=>`<div class="barrow"><span>${label}</span><div class="bar"><i style="width:${s.values[k]===null?0:Math.round(s.values[k]*100)}%"></i></div><b>${s.values[k]===null?'—':Math.round(s.values[k]*100)}</b></div>`).join('')}
 <h3>Buscar viviendas</h3><div id="listings"><p class="source-note">Cargando búsquedas…</p></div>`;
 $('route-button').onclick=loadRoad;
 if($('transit-button'))$('transit-button').onclick=loadTransit;
 renderListings(p);
}
async function loadRoad(){const p=selected,token=selectionToken;$('route-button').disabled=true;$('route-status').textContent='Consultando la red viaria…';try{const r=await fetch(`/api/route?place=${p.id}`),body=await r.json();if(!r.ok)throw Error(body.error||'No se pudo calcular la ruta');data.routes[p.id]=body;if(token===selectionToken){routeGeometry=body.geometry;detail();$('route-status').textContent='Ruta actualizada. Trazado morado en el mapa.'}refreshFilters()}catch(e){if(token===selectionToken&&$('route-status')){$('route-status').textContent=`${e.message}. Se conserva el dato anterior, si existe.`;$('route-status').classList.add('error');$('route-button').disabled=false}}}
async function loadTransit(){const p=selected,token=selectionToken;transitDate=$('travel-date').value;transitTime=$('travel-time').value;$('transit-button').disabled=true;$('transit-status').textContent='Buscando horarios y transbordos…';try{const r=await fetch(`/api/transit?place=${p.id}&date=${transitDate}&time=${transitTime}`),body=await r.json();if(!r.ok)throw Error(body.error);if(body.status!=='ok')throw Error(body.message);data.transit??={};data.transit[p.id]=body;if(token===selectionToken){detail();$('transit-status').textContent=`${body.date} ${body.time} (Madrid) · ${body.itinerary.numberOfTransfers} transbordos`}scheduleDraw()}catch(e){if(token===selectionToken&&$('transit-status')){$('transit-status').textContent=e.message;$('transit-button').disabled=false}}}
function selectPlace(p,recenter=false){selected=p;selectionToken++;routeGeometry=null;if(recenter){center={lat:p.lat,lon:p.lon};zoom=Math.max(zoom,3)}detail();refreshFilters()}
function sliderUI(){
 $('sliders').innerHTML=criteria.map(([k,label])=>{const readyBus=data.buses?.schemaVersion===2&&data.buses.stops?.length;const disabled=k==='school'||(k==='bus'&&!readyBus)||(k==='crime'&&!data.meta.counts.crime);return `<div class="criterion ${disabled?'disabled':''}"><label for="weight-${k}"><span>${label}</span><output id="value-${k}">${weights[k]}</output></label><input id="weight-${k}" type="range" min="0" max="100" value="${weights[k]}" ${disabled?'disabled':''}>${k==='bus'&&readyBus?`<span class="status">${fmt(data.buses.stops.length)} paradas importadas · ${esc(data.buses.referenceDate)}</span>`:k==='crime'&&!disabled?`<span class="status">${fmt(data.meta.counts.crime)} municipios con dato · INE</span>`:disabled?`<span class="status">${k==='bus'?'Reimporta GTFS para incluir todas las paradas':'Sin datos conectados'}</span>`:''}</div>`}).join('');
 for(const [k] of criteria)$(`weight-${k}`).oninput=e=>{weights[k]=Number(e.target.value);$(`value-${k}`).textContent=weights[k];scheduleDraw();detail()};
}
function buildGrid(){const stepY=.0225,stepX=.03;for(let y=Math.floor(bounds[1]/stepY)*stepY;y<=bounds[3];y+=stepY)for(let x=Math.floor(bounds[0]/stepX)*stepX;x<=bounds[2];x+=stepX){const point={lat:y,lon:x},place=lookup(point);if(place)grid.push({point,place})}}
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,center:{...center},moved:false};canvas.setPointerCapture(e.pointerId);$('hover').hidden=true});
canvas.addEventListener('pointermove',e=>{
 if(!data)return;
 if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)drag.moved=true;if(drag.moved){const v=viewport();center={lat:drag.center.lat+dy/v.scale,lon:drag.center.lon-dx/(v.scale*.76)};scheduleDraw()}return}
 const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,p=hitPlace(x,y);const el=$('hover');el.hidden=!p;if(p){el.textContent=`${p.name} · ${fmt(p.population)} hab. · ${p[mode]?`${fmt(p[mode].value)} ${p[mode].unit}`:'Sin precio municipal'}`;el.style.left=Math.min(x+12,rect.width-250)+'px';el.style.top=(y+15)+'px'}
});
function hitPlace(x,y){let closest=null,dist=12;for(const p of visible){const xy=project(p.lat,p.lon),d=Math.hypot(x-xy.x,y-xy.y);if(d<dist){closest=p;dist=d}}if(closest)return closest;const p=lookup(unproject(x,y));return p&&filterMatch(p)?p:null}
canvas.addEventListener('pointerup',e=>{if(!drag)return;if(!drag.moved&&data){const r=canvas.getBoundingClientRect(),p=hitPlace(e.clientX-r.left,e.clientY-r.top);if(p)selectPlace(p)}drag=null});
canvas.addEventListener('pointercancel',()=>drag=null);canvas.addEventListener('pointerleave',()=>{$('hover').hidden=true});
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.6,Math.min(25,zoom*(e.deltaY<0?1.13:.885)));scheduleDraw()},{passive:false});
$('zoomin').onclick=()=>{zoom=Math.min(25,zoom*1.4);scheduleDraw()};$('zoomout').onclick=()=>{zoom=Math.max(.6,zoom/1.4);scheduleDraw()};$('fit').onclick=fit;
$('reset').onclick=()=>{weights={...defaultWeights,bus:data.buses?.schemaVersion===2&&data.buses.stops?.length?45:0};sliderUI();scheduleDraw();detail()};
$('mode').onchange=e=>{mode=e.target.value;$('budget').value=mode==='buy'?350000:1500;$('budget').step=mode==='buy'?10000:50;$('area-label').hidden=mode==='rent';selectionToken++;refreshFilters();detail()};
$('budget').oninput=()=>{if(data){refreshFilters();detail()}};$('area').oninput=()=>{if(data){refreshFilters();detail()}};
for(const id of ['pop-min','pop-max'])$(id).oninput=()=>{if(+$('pop-min').value>+$('pop-max').value){$(id==='pop-min'?'pop-max':'pop-min').value=$(id).value}refreshFilters()};
$('priced-only').onchange=refreshFilters;
$('town-list').onclick=e=>{const button=e.target.closest('button[data-place]');if(button)selectPlace(data.places.find(p=>p.id===button.dataset.place),true)};
$('search').onchange=e=>{const q=e.target.value.toLocaleLowerCase(),p=data.places.find(p=>`${p.name} (${p.province})`.toLocaleLowerCase()===q||p.name.toLocaleLowerCase()===q);if(p){$('pop-min').value=0;$('pop-max').value=12;$('priced-only').checked=false;if(!filterMatch(p)){$('details').innerHTML=`<h2>${esc(p.name)}</h2><p>Fuera de presupuesto o sin precio municipal publicado. Ajusta el presupuesto para mostrar este municipio.</p>`;selected=null;routeGeometry=null;selectionToken++;refreshFilters();return}selectPlace(p,true)}};
fetch('/api/data').then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json()}).then(v=>{
 data=v;weights.bus=data.buses?.schemaVersion===2&&data.buses.stops?.length?45:0;if(weights.bus)data.busLookup=makeBusLookup(data.buses.stops);lookup=buildIndex(data.places);bounds=[Math.min(...data.regions.map(p=>p.bbox[0])),Math.min(...data.regions.map(p=>p.bbox[1])),Math.max(...data.regions.map(p=>p.bbox[2])),Math.max(...data.regions.map(p=>p.bbox[3]))];
 $('town-options').innerHTML=data.places.map(p=>`<option value="${esc(p.name)} (${esc(p.province)})"></option>`).join('');
 const madridDate=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const datePart=type=>madridDate.find(part=>part.type===type).value;
 transitDate=`${datePart('year')}-${datePart('month')}-${datePart('day')}`;
 buildGrid();sliderUI();fit();selected=data.places.find(p=>p.id==='28005');refreshFilters();detail();new ResizeObserver(scheduleDraw).observe(canvas);
}).catch(e=>{$('coverage').textContent='No se han podido cargar los datos';$('map-notice').hidden=false;$('map-notice').textContent=`${e.message}. Comprueba que has descomprimido el ZIP completo y arrancado npm start.`});
