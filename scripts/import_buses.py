"""Extract active bus boarding stops from one or more official GTFS ZIPs.

Usage: python3 scripts/import_buses.py --download-crtm
       python3 scripts/import_buses.py --gtfs operator=/path/to/feed.zip
Multiple --gtfs inputs may be combined with --download-crtm.
"""
import argparse
import csv
import hashlib
import io
import json
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from zipfile import ZipFile
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
CRTM_URL = 'https://crtm.maps.arcgis.com/sharing/rest/content/items/885399f83408473c8d815e40c5e702b7/data'
BUS_TYPES = {'3', *map(str, range(700, 800))}

def rows(z, name):
    try:
        member = next(n for n in z.namelist() if n.split('/')[-1].lower() == name)
    except StopIteration:
        return iter(())
    return csv.DictReader(io.TextIOWrapper(z.open(member), encoding='utf-8-sig', newline=''))

def reference_day(today=None):
    today = today or datetime.now(ZoneInfo('Europe/Madrid')).date()
    return next(today + timedelta(days=i) for i in range(8) if (today + timedelta(days=i)).weekday() < 5)

def active_services(z, day):
    key=day.strftime('%Y%m%d')
    weekday=day.strftime('%A').lower()
    active={r['service_id'] for r in rows(z,'calendar.txt') if r.get('start_date','')<=key<=r.get('end_date','') and r.get(weekday)=='1'}
    for r in rows(z,'calendar_dates.txt'):
        if r.get('date')==key:
            if r.get('exception_type')=='1': active.add(r['service_id'])
            elif r.get('exception_type')=='2': active.discard(r['service_id'])
    return active

def download_crtm():
    request=urllib.request.Request(CRTM_URL, headers={'User-Agent':'ZonasMadridMVP/0.3'})
    with urllib.request.urlopen(request,timeout=90) as response:
        contents=response.read(100_000_001)
    if len(contents)>100_000_000: raise ValueError('GTFS CRTM demasiado grande (>100 MB)')
    if not contents.startswith(b'PK'): raise ValueError('El enlace CRTM no ha devuelto un ZIP GTFS; comprueba el portal oficial')
    return contents

def extract(contents, label, day, source):
    counts=defaultdict(lambda:{'trips':0,'routes':set()})
    with ZipFile(io.BytesIO(contents)) as z:
        stops={}
        for r in rows(z,'stops.txt'):
            try: lat,lon=float(r['stop_lat']),float(r['stop_lon'])
            except (KeyError,ValueError): continue
            if not (39.1<=lat<=42.1 and -5.9<=lon<=-1.9): continue
            stops[r['stop_id']]={'name':r.get('stop_name',''),'lat':lat,'lon':lon}
        routes={r['route_id']:r.get('route_short_name') or r.get('route_long_name') or r['route_id'] for r in rows(z,'routes.txt') if r.get('route_type') in BUS_TYPES}
        active=active_services(z,day)
        if not active: raise ValueError(f'{label}: no hay calendarios válidos para {day.isoformat()}')
        trips={r['trip_id']:r['route_id'] for r in rows(z,'trips.txt') if r.get('service_id') in active and r.get('route_id') in routes}
        if not trips: raise ValueError(f'{label}: no hay autobuses activos para {day.isoformat()}')
        for r in rows(z,'stop_times.txt'):
            trip=r.get('trip_id')
            sid=r.get('stop_id')
            if trip not in trips or sid not in stops or r.get('pickup_type','0')=='1':continue
            item=counts[sid]
            item['trips']+=1
            item['routes'].add(routes[trips[trip]])
        result=[]
        for sid,v in counts.items():
            stop=stops[sid]
            result.append({'id':label+':'+sid,'name':stop['name'],'lat':stop['lat'],'lon':stop['lon'],
                           'dailyTrips':v['trips'],'lines':len(v['routes']),
                           'examples':sorted(v['routes'])[:5],
                           'source':label})
        return {'stops':result,'source':{'name':label,'url':source,'sha256':hashlib.sha256(contents).hexdigest(),
                                        'activeTrips':len(trips),'boardingStops':len(result)}}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download-crtm',action='store_true',help='Descarga GTFS interurbano oficial de CRTM')
    parser.add_argument('--gtfs',action='append',default=[],metavar='NOMBRE=ZIP',help='Añade un GTFS local (repetible)')
    parser.add_argument('--date',help='Día laborable de referencia YYYY-MM-DD (por defecto el próximo)')
    args=parser.parse_args()
    if not args.download_crtm and not args.gtfs: parser.error('Indica --download-crtm o al menos un --gtfs NOMBRE=ZIP')
    day=date.fromisoformat(args.date) if args.date else reference_day()
    result={'schemaVersion':2,'referenceDate':day.isoformat(),
            'note':'Paradas de autobús con subida permitida y viajes programados para el día indicado; cualquier destino. Cobertura limitada a los feeds importados.',
            'stops':[],'sources':[]}
    inputs=[]
    if args.download_crtm: inputs.append(('CRTM interurbanos',download_crtm(),CRTM_URL))
    for option in args.gtfs:
        if '=' not in option: parser.error('--gtfs debe tener forma NOMBRE=ZIP')
        label,path=option.split('=',1)
        inputs.append((label,Path(path).read_bytes(),str(Path(path).resolve())))
    for label,contents,source in inputs:
        partial=extract(contents,label,day,source)
        result['stops']+=partial['stops']
        result['sources'].append(partial['source'])
    if not result['stops']: raise ValueError('No hay paradas con viajes activos; revisa feeds y calendario')
    path=ROOT/'data'/'buses.json'
    temporary=path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    temporary.replace(path)
    print(json.dumps({'date':result['referenceDate'],'stops':len(result['stops']),'sources':result['sources']},ensure_ascii=False))

if __name__=='__main__': main()
