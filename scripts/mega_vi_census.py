"""Convert acquired INE municipal GPKG to a dated, checksum-backed reference.
No name-only population joins and no partial cross-municipal total promotion.
"""
from pathlib import Path
import sqlite3,json,hashlib,datetime,struct
from shapely import from_wkb
from shapely.ops import transform,unary_union
from shapely.geometry import mapping
from pyproj import Transformer
root=Path(__file__).resolve().parents[1]
archive=root/'.tmp/mega-vi/ine-evora.zip'
database=root/'.tmp/mega-vi/ine/C21_LUGF0705.gpkg'
source='https://mapas.ine.pt/download/filesGPG/2021localitiesFregs/municipios/C21_LUGF0705.zip'
at=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z')
checksum='sha256:'+hashlib.sha256(archive.read_bytes()).hexdigest()
connection=sqlite3.connect(database);connection.row_factory=sqlite3.Row
assert connection.execute('SELECT srs_id FROM gpkg_contents').fetchone()[0]==3763
project=Transformer.from_crs(3763,4326,always_xy=True).transform
groups={}
for row in connection.execute('SELECT * FROM C21_LUGF0705'):
    groups.setdefault(row['LG_COD'],[]).append(dict(row))
records=[]
for code,rows in groups.items():
    geometries=[]
    for row in rows:
        blob=row['Shape'];assert blob[:2]==b'GP'
        envelope=(blob[3]>>1)&7;offset=8+{0:0,1:32,2:48,3:48,4:64}[envelope]
        geometries.append(from_wkb(blob[offset:]))
    local=unary_union(geometries)
    # Representative point lies inside the census footprint; it is not an address.
    point=transform(project,local.representative_point())
    complete=len(set(r['FREGUESIA'] for r in rows))==int(rows[0]['STATUS_FR'])
    values=[r['N_INDIVIDUOS'] for r in rows]
    population={'authority':'INE','value':int(sum(values)),'referenceYear':2021,'geographicUnit':'SETTLEMENT','sourceUrl':source,'sourceRecordId':code,'retrievedAt':at,'provenanceRef':checksum,'meaning':'Resident population at Census 2021; not current presence.'} if complete and all(v is not None and v>=0 and int(v)==v for v in values) else None
    records.append({'id':'ine:settlement:2021:'+code,'name':rows[0]['LG_DSG'],'kind':'settlement','municipality':rows[0]['CC_DSG'],'municipalityCode':rows[0]['MUNICIPIO'],'coordinate':[point.x,point.y],'geometry':mapping(transform(project,local)),'geometryRole':'CENSUS_2021_SETTLEMENT_FOOTPRINT','population':population,'source':'INE Census 2021','sourceUrl':source,'receivedAt':at,'provenanceRef':checksum,'sourceRecordId':code,'populationState':'COMPLETE_SETTLEMENT' if population else 'PARTIAL_MUNICIPAL_EXTRACT'})
output=root/'data/reference/community-intelligence/ine-evora-2021.json';output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps({'schemaVersion':'vigia.census-settlements.v1','sourceUrl':source,'retrievedAt':at,'archiveSha256':checksum,'referenceYear':2021,'sourceCrs':'EPSG:3763','outputCrs':'EPSG:4326','records':records},ensure_ascii=False,separators=(',',':')))
print(json.dumps({'settlements':len(records),'completePopulations':sum(r['population'] is not None for r in records),'output':str(output)}))
