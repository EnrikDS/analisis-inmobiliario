"""Refresh official INE municipal crime rates in existing geography.json without GIS packages."""
import csv
import json
import re
import unicodedata
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
URL='https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/69330.csv?nocab=1'
INDICATOR='Total infracciones penales (Tasa por mil habitantes)'

def norm(s):
    s=re.sub(r',\s*(El|La|Los|Las)$','',s,flags=re.I)
    s=re.sub(r'\((El|La|Los|Las)\)','',s,flags=re.I)
    s=''.join(c for c in unicodedata.normalize('NFKD',s) if not unicodedata.combining(c)).lower()
    return re.sub(r'[^a-z0-9]','',re.sub(r'^(el|la|los|las)\s+','',s.strip()))

def refresh(csv_bytes,geography):
    import io
    records={}
    for row in csv.DictReader(io.StringIO(csv_bytes.decode('utf-8-sig')),delimiter=';'):
        if row['Indicadores']!=INDICATOR or not row['Municipios']:continue
        try:
            rate=float(row['Total'].replace('.','').replace(',','.'))
            year=int(row['Periodo'])
        except (ValueError,TypeError):continue
        if not 0<=rate<1000 or year>datetime.now().year:continue
        key=norm(row['Municipios'])
        if key not in records or year>int(records[key]['period']):
            records[key]={'value':rate,'period':str(year),'source':'ine-crime','kind':'Infracciones penales registradas','unit':'por 1.000 habitantes'}
    for p in geography['places']:p['crime']=records.get(norm(p['name']))
    geography['meta']['counts']['crime']=sum(bool(p['crime']) for p in geography['places'])
    return geography

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--csv',type=Path,help='CSV INE ya descargado, útil sin conexión')
    args=parser.parse_args()
    contents=args.csv.read_bytes() if args.csv else urllib.request.urlopen(URL,timeout=90).read()
    destination=ROOT/'data'/'geography.json'
    data=refresh(contents,json.loads(destination.read_text(encoding='utf-8')))
    temporary=destination.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    temporary.replace(destination)
    print(f"INE: {data['meta']['counts']['crime']} municipios con tasa oficial")
