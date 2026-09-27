"""Refresh OSRM driving times from municipal reference points to Sol.
Use a private OSRM server for repeated/bulk work: OSRM_URL=http://localhost:5000.
Requests are sequential, cached in data/routes.json and spaced >=1.1s.
"""
import json, os, time, urllib.request
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
places=json.loads((ROOT/'data/geography.json').read_text())['places']
path=ROOT/'data/routes.json'
existing=json.loads(path.read_text()) if path.exists() else {'routes':{}}
base=os.environ.get('OSRM_URL','https://router.project-osrm.org').rstrip('/')
pending=[p for p in places if p['locationSource']=='geonames' and p['id'] not in existing['routes']]
for start in range(0,len(pending),60):
 chunk=pending[start:start+60]
 coords=';'.join(f"{p['lon']},{p['lat']}" for p in chunk)+';-3.7038,40.4168'
 url=base+'/table/v1/driving/'+coords+'?sources='+';'.join(str(i) for i in range(len(chunk)))+'&destinations='+str(len(chunk))+'&annotations=duration,distance'
 try:
  request=urllib.request.Request(url,headers={'User-Agent':'ZonasMadridLocalMVP/0.2 (local research prototype)'})
  with urllib.request.urlopen(request,timeout=45) as r:result=json.load(r)
  if result.get('code')!='Ok':raise ValueError(result.get('code'))
  timestamp=datetime.now(timezone.utc).isoformat()
  for i,p in enumerate(chunk):
   seconds=result['durations'][i][0]
   if seconds is None or result['sources'][i]['distance']>500:continue
   existing['routes'][p['id']]={'minutes':round(seconds/60,1),'km':round(result['distances'][i][0]/1000,2),'origin':[p['lon'],p['lat']],'source':'OSRM / OpenStreetMap','traffic':False,'calculatedAt':timestamp,'dataVersion':result.get('data_version'),'snappedOriginMeters':round(result['sources'][i]['distance']),'snappedDestinationMeters':round(result['destinations'][0]['distance']),'destination':[-3.7038,40.4168]}
  existing.update({'provider':base,'generated':timestamp,'destination':{'name':'Puerta del Sol (acceso viario próximo)','lat':40.4168,'lon':-3.7038},'note':'Duración calculada sobre red viaria, sin tráfico en directo ni aparcamiento/tramo final a pie.'})
  path.write_text(json.dumps(existing,ensure_ascii=False,separators=(',',':')))
  print(f"{start+len(chunk)}/{len(pending)} procesados; {len(existing['routes'])} rutas disponibles",flush=True)
 except Exception as e:
  print(f'Error de proveedor, se conserva caché: {e}',flush=True);break
 time.sleep(1.1)
