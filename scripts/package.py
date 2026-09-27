"""Package deliverable without flattening directories or including caches/secrets."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
files=[root/name for name in ['package.json','server.js','index.html','style.css','README.md','iniciar-ubuntu.sh','.gitignore']]
for folder in ['src','data','docs','scripts','test']:
 files.extend(p for p in (root/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
with ZipFile(root/'zonas-madrid-mvp.zip','w',ZIP_DEFLATED) as z:
 for p in files:z.write(p,arcname=p.relative_to(root))
 assert 'src/providers.js' in z.namelist()
 assert 'data/geography.json' in z.namelist()
print(root/'zonas-madrid-mvp.zip')
