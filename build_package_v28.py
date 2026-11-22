from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json, subprocess, re
D=Path(__file__).parent
items=['index.html','entregas-clientes.html','entregas-clientes.js','entregas-contingentes.html',
       'notas-transferencias.html','repositorio.html','calendario.html','escaner.html','laboratorio.html',
       'gestark-updates.js','gestark-ui.css','gestark-version.json','LEEME_REDISENO_GESTARK_2026.11.21.28.txt']
for name in items:
 p=D/name
 assert p.is_file() and p.stat().st_size>0,name
for name in ['entregas-clientes.js','gestark-updates.js']:
 subprocess.run(['node','--check',str(D/name)],check=True)
v=json.loads((D/'gestark-version.json').read_text())
assert v['version']=='2026.11.21.28'
assert v['labVersion']=='2026.11.21.15'
assert v['contingencyVersion']=='2026.11.21.23'
assert v['clientsVersion']=='2026.11.21.28'
assert "const VERSION = '2026.11.21.28'" in (D/'gestark-updates.js').read_text()
assert (D/'gestark-updates.js').read_text().count('applyDesignAndNavigation();')==1
for name in items:
 if name.endswith('.html'):
  assert './gestark-updates.js?v=2026.11.21.28' in (D/name).read_text(),name
# Append a checksums file inside the package to support installation auditing.
checksum='''GESTARK 2026.11.21.28 · MANIFIESTO DE ARCHIVOS\nPunto anterior respaldado: 806183ac51f54243bfc6d6fd2b99a519f6712933\n\n'''
for name in items:
 checksum+=hashlib.sha256((D/name).read_bytes()).hexdigest()+'  '+name+'\n'
out=Path('/mnt/data/Gestark_Rediseno_Operativo_Boton_Central_Clientes_2026.11.21.28.zip')
with ZipFile(out,'w',compression=ZIP_DEFLATED,compresslevel=9) as z:
 for name in items:z.write(D/name,arcname=name)
 z.writestr('SHA256_ARCHIVOS.txt',checksum)
with ZipFile(out,'r') as z:
 assert z.testzip() is None
 assert sorted(z.namelist())==sorted(items+['SHA256_ARCHIVOS.txt'])
 for name in items:
  assert z.read(name)==(D/name).read_bytes()
print('CREATED',out)
print('BYTES',out.stat().st_size,'FILES',len(items)+1)
print(checksum)
