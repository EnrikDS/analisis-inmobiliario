"""Build bundled public data. Optional refresh: python scripts/build_data.py --download.
Requires shapely (only for rebuilding, not for running the app).
No market prices, coordinates or population are fabricated.
"""
import csv, json, re, sys, unicodedata, urllib.request, zipfile, hashlib
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict
from shapely.geometry import shape, mapping, Point
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(sys.argv[sys.argv.index('--cache')+1]) if '--cache' in sys.argv else ROOT/'.data-cache'
CACHE.mkdir(exist_ok=True)
SOURCES = {
 'municipalities.geojson': 'https://zenodo.org/api/records/20431328/files/pop_ES_2023_LR.geojson/content',
 'geonames-ES.zip': 'https://download.geonames.org/export/dump/ES.zip',
 'ine-prices-large.csv': 'https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/69330.csv?nocab=1',
 'buy-madrid.csv': 'https://datos.comunidad.madrid/dataset/8cb70b8c-c1e2-43f7-826a-1a22c573a743/resource/ef4a2c7a-4273-4116-9ff2-d5f77020ca04/download/valor-tasado-de-la-vivienda-libre-por-municipios-de-mas-de-25.00-habitantes.-total-base-2005.-mu.csv',
 'buy-provinces.csv': 'https://cdn.mivau.gob.es/portal-web-mivau/Datos_MIVAU/CSV/VDP006_01.csv',
 'rent.csv': 'https://cdn.mivau.gob.es/portal-web-mivau/Datos_MIVAU/CSV/VDP001_01.csv',
}
PROVINCES={'05':'Ávila','19':'Guadalajara','28':'Madrid','40':'Segovia','45':'Toledo'}
def norm(s):
 s=re.sub(r',\s*(El|La|Los|Las)$', '', s, flags=re.I)
 s=re.sub(r'\((El|La|Los|Las)\)', '', s, flags=re.I)
 s=''.join(c for c in unicodedata.normalize('NFKD',s) if not unicodedata.combining(c)).lower()
 return re.sub(r'[^a-z0-9]','',re.sub(r'^(el|la|los|las)\s+', '', s.strip()))
def rows(name,encoding='utf-8-sig'):
 return list(csv.DictReader((CACHE/name).open(encoding=encoding),delimiter=';'))
def number(s,spanish=False):
 try:return float(s.replace('.','').replace(',','.') if spanish else s.replace(',','.'))
 except (ValueError,AttributeError):return None
def geometry(g):
 def rounded(v):return [rounded(x) for x in v] if isinstance(v,(tuple,list)) else round(v,6)
 obj=mapping(g);return {'type':obj['type'],'coordinates':rounded(obj['coordinates'])}
def record(value,period,source,kind,unit,**other):
 return dict(value=value,period=period,source=source,kind=kind,unit=unit,**other)
for name,url in SOURCES.items():
 if '--download' in sys.argv or not (CACHE/name).exists():
  print('Downloading',name,flush=True)
  with urllib.request.urlopen(url,timeout=90) as r:(CACHE/name).write_bytes(r.read())

features=[f for f in json.loads((CACHE/'municipalities.geojson').read_text())['features'] if f['properties']['codmun_ine'][:2] in PROVINCES]
geo=defaultdict(list)
with zipfile.ZipFile(CACHE/'geonames-ES.zip') as z:
 for line in z.read('ES.txt').decode().splitlines():
  r=line.split('\t')
  if r[6]=='P' and r[12][:2] in PROVINCES:geo[r[12]].append(r)
prices={}
crime={}
for r in rows('ine-prices-large.csv'):
 if r['Indicadores']=='Total infracciones penales (Tasa por mil habitantes)' and r['Municipios']:
  v=number(r['Total'],True)
  if v is not None and 0<=v<1000 and int(r['Periodo'])<=datetime.now().year:
   key=norm(r['Municipios'])
   if key not in crime or r['Periodo']>crime[key]['period']:
    crime[key]=record(v,r['Periodo'],'ine-crime','Infracciones penales registradas','por 1.000 habitantes')
 if r['Indicadores']!='Precio medio por metro cuadrado de la vivienda (Euros/m2)' or not r['Municipios']:continue
 v=number(r['Total'],True)
 if not v or int(r['Periodo'])>datetime.now().year:continue
 key=norm(r['Municipios'])
 if key not in prices or r['Periodo']>prices[key]['period']:
  prices[key]=record(v,r['Periodo'],'ine-sales','Compraventa media','€/m²')
rent={}
for r in rows('rent.csv'):
 if r['COD_PROVINCIA'] not in PROVINCES or r['ELEMENTO']!='PRECIO' or r['TIPO_VIVIENDA']!='COLECTIVA' or r['TIPO_MEDIDA']!='MEDIANA':continue
 v=number(r['VALOR'])
 if not v:continue
 code=r['COD_POSTAL'] # Despite the source column name these are INE municipal identifiers.
 if code not in rent or r['AÑO']>rent[code]['period']:
  rent[code]=record(v,r['AÑO'],'mivau-rent','Mediana de alquiler declarado (vivienda colectiva)','€/mes',name=r['NOMBRE_MUNICIPIO'])
appraisals={}
for r in rows('buy-madrid.csv','cp1252'):
 v=number(r['Valor'])
 if not v:continue
 code='28'+r['Código territorio'][:3]
 if code not in appraisals or r['Año']>appraisals[code]['period']:
  appraisals[code]=record(v,r['Año'],'madrid-appraisals','Tasación media','€/m²')
province_prices={}
for r in rows('buy-provinces.csv'):
 code=r['CPRO'].zfill(2)
 if code not in PROVINCES or r['Régimen']!='Libre':continue
 v=number(r['Valor']);period=r['Año']+'-T'+r['Trimestre']
 if v and (code not in province_prices or period>province_prices[code]['period']):province_prices[code]=record(v,period,'mivau-appraisals','Tasación media provincial','€/m²')

places=[];by_province=defaultdict(list)
for f in features:
 p=f['properties'];code=p['codmun_ine'];g=shape(f['geometry']);by_province[code[:2]].append(g)
 candidates=[r for r in geo[code] if g.buffer(.002).covers(Point(float(r[5]),float(r[4])))]
 same=[r for r in candidates if norm(r[1])==norm(p['nombre']) or r[7]=='PPLA3']
 chosen=sorted(same or candidates,key=lambda r:int(r[14]),reverse=True)
 point=Point(float(chosen[0][5]),float(chosen[0][4])) if chosen else g.representative_point()
 rr=rent.get(code)
 # Join using stable INE municipal code; names may retain older official forms.
 if rr and norm(rr['name'])!=norm(p['nombre']):print(f'Name variant for {code}: {p["nombre"]} / {rr["name"]}',flush=True)
 places.append(dict(id=code,name=p['nombre'],province=PROVINCES[code[:2]],provinceCode=code[:2],population=p['pob_23'],populationYear=2023,lat=round(point.y,6),lon=round(point.x,6),locationSource='geonames' if chosen else 'representative-point',buy=prices.get(norm(p['nombre'])),rent=rr,crime=crime.get(norm(p['nombre'])),appraisal=appraisals.get(code),geometry=geometry(g),bbox=list(g.bounds)))
regions=[]
for code,geometries in by_province.items():
 # Join boundaries with <200m gaps from independent source simplification.
 g=unary_union([x.buffer(.001) for x in geometries]).buffer(-.001).simplify(.001,preserve_topology=True)
 p=g.representative_point()
 regions.append(dict(id=code,name=PROVINCES[code],geometry=geometry(g),bbox=list(g.bounds),label=[p.x,p.y],appraisal=province_prices.get(code)))
places.sort(key=lambda p:p['population'],reverse=True)
meta=dict(generated=datetime.now(timezone.utc).isoformat(),populationYear=2023,geometry='MITECO/IGN 2023, derivado de Gallego-Castillo (2026), simplificado ≈100–200 m',counts=dict(municipalities=len(places),buy=sum(bool(p['buy']) for p in places),rent=sum(bool(p['rent']) for p in places),crime=sum(bool(p['crime']) for p in places),townCoordinates=sum(p['locationSource']=='geonames' for p in places)),sources=[dict(file=k,url=v,sha256=hashlib.sha256((CACHE/k).read_bytes()).hexdigest()) for k,v in SOURCES.items()])
(ROOT/'data').mkdir(exist_ok=True)
(ROOT/'data'/'geography.json').write_text(json.dumps(dict(places=places,regions=regions,meta=meta),ensure_ascii=False,separators=(',',':')))
print(json.dumps(meta['counts']),flush=True)
