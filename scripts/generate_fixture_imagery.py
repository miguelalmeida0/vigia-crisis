from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random, math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'apps/api/test/fixtures/web-assets/fixtures/locations'
OUT.mkdir(parents=True, exist_ok=True)

LOCATIONS = [
    ('1816','Sao Pedro do Sul', 41),
    ('1823','Viseu', 83),
    ('0508','Proenca-a-Nova', 137),
    ('0502','Castelo Branco', 191),
    ('1013','Pedrogao Grande', 251),
    ('0809','Monchique', 307),
    ('0603','Arganil', 359),
    ('0402','Braganca', 419),
]

W,H = 1600,1100
try:
    FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 22)
    FONT_SM = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 16)
except Exception:
    FONT = ImageFont.load_default(); FONT_SM = FONT

def clamp(x): return max(0,min(255,int(x)))

def texture(seed, season=0):
    rnd=random.Random(seed)
    base=Image.new('RGB',(W,H),(58+season*2,74+season,48))
    d=ImageDraw.Draw(base,'RGBA')
    # large land parcels
    palette=[(72,103,51,255),(91,116,59,255),(118,105,58,255),(132,121,71,255),(58,91,48,255),(99,84,49,255)]
    for _ in range(240):
        x=rnd.randint(-120,W-40); y=rnd.randint(-100,H-40)
        ww=rnd.randint(70,260); hh=rnd.randint(55,210)
        col=list(rnd.choice(palette));
        if season: col[1]=clamp(col[1]+rnd.randint(-4,12)); col[0]=clamp(col[0]+rnd.randint(-2,8))
        d.rectangle([x,y,x+ww,y+hh], fill=tuple(col), outline=(35,50,30,70), width=2)
    # forest clumps
    for _ in range(420):
        x=rnd.randint(0,W); y=rnd.randint(0,H); r=rnd.randint(8,38)
        c=rnd.choice([(24,68,37,180),(28,78,42,170),(40,85,46,150),(19,59,34,180)])
        d.ellipse([x-r,y-r,x+r,y+r], fill=c)
    # settlements
    for cluster in range(5):
        cx=rnd.randint(180,W-180); cy=rnd.randint(160,H-160)
        for _ in range(rnd.randint(30,70)):
            x=cx+rnd.randint(-130,130); y=cy+rnd.randint(-100,100)
            ww=rnd.randint(7,18); hh=rnd.randint(7,18)
            d.rectangle([x,y,x+ww,y+hh],fill=(191,184,157,190),outline=(95,88,76,100))
    # roads
    for _ in range(7):
        pts=[]
        y=rnd.randint(80,H-80)
        for x in range(-50,W+100,100):
            y += rnd.randint(-25,25)
            pts.append((x,y))
        d.line(pts,fill=(198,185,148,145),width=rnd.randint(4,8))
        d.line(pts,fill=(112,103,83,150),width=2)
    # mild sensor texture
    noise=Image.new('L',(W,H),0); nd=ImageDraw.Draw(noise)
    for _ in range(4500):
        x=rnd.randrange(W); y=rnd.randrange(H); v=rnd.randint(15,55)
        nd.point((x,y),fill=v)
    noise=noise.filter(ImageFilter.GaussianBlur(2))
    tint=Image.new('RGB',(W,H),(0,0,0)); tint.putalpha(noise)
    base=Image.alpha_composite(base.convert('RGBA'),tint.convert('RGBA')).convert('RGB')
    return base

def add_change(img, seed, kind):
    rnd=random.Random(seed+999)
    im=img.copy(); d=ImageDraw.Draw(im,'RGBA')
    # deterministic area around center-right so before/after comparison is obvious
    cx=850 + rnd.randint(-180,180); cy=560+rnd.randint(-120,120)
    if kind==0: # vegetation break / clearing
        poly=[(cx-170,cy-75),(cx+190,cy-95),(cx+210,cy+10),(cx-140,cy+65)]
        d.polygon(poly, fill=(147,118,71,190), outline=(218,187,109,150))
        for y in range(cy-60,cy+55,18): d.line([(cx-130,y),(cx+160,y+rnd.randint(-8,8))],fill=(192,157,94,110),width=4)
    elif kind==1: # roadside accumulation
        for _ in range(70):
            x=cx+rnd.randint(-120,120); y=cy+rnd.randint(-60,60); r=rnd.randint(3,12)
            d.rectangle([x-r,y-r,x+r,y+r],fill=rnd.choice([(167,137,88,210),(118,104,82,220),(87,82,72,220)]))
        d.line([(cx-240,cy+110),(cx+260,cy-95)],fill=(206,190,151,190),width=14)
    else: # access degradation / fallen material
        d.line([(cx-280,cy+120),(cx+300,cy-120)],fill=(193,180,145,200),width=16)
        for _ in range(18):
            x=cx+rnd.randint(-110,110); y=cy+rnd.randint(-80,80)
            d.line([(x-35,y-15),(x+35,y+15)],fill=(59,47,29,245),width=8)
    return im, (cx,cy)

def watermark(im, name, state):
    im=im.copy(); d=ImageDraw.Draw(im,'RGBA')
    d.rectangle([18,H-68,W-18,H-18],fill=(4,7,5,185))
    d.text((34,H-56),f'SYNTHETIC DEMO FIXTURE  |  {name.upper()}  |  {state.upper()}',font=FONT_SM,fill=(242,236,219,235))
    return im

for idx,(code,name,seed) in enumerate(LOCATIONS):
    before=texture(seed,0)
    current=texture(seed,1)
    # blend same underlying terrain to keep registration strong
    current=Image.blend(before,current,0.22)
    current, center=add_change(current,seed,idx%3)
    before=watermark(before,name,'comparable')
    current=watermark(current,name,'current')
    radar=Image.new('RGB',(W,H),(19,26,28))
    rd=ImageDraw.Draw(radar,'RGBA')
    rr=random.Random(seed)
    for _ in range(2200):
        x=rr.randrange(W); y=rr.randrange(H); g=rr.randint(60,180)
        rd.ellipse([x-2,y-1,x+2,y+1],fill=(g,g,g,rr.randint(25,90)))
    for _ in range(10):
        y=rr.randrange(H); rd.line([(0,y),(W,y+rr.randint(-120,120))],fill=(91,157,167,90),width=3)
    radar=radar.filter(ImageFilter.GaussianBlur(1.2)); radar=watermark(radar,name,'radar fallback')
    before.save(OUT/f'{code}-before.webp','WEBP',quality=86,method=6)
    current.save(OUT/f'{code}-current.webp','WEBP',quality=88,method=6)
    radar.save(OUT/f'{code}-radar.webp','WEBP',quality=82,method=6)
    # normalized polygon around finding center for UI overlay
    cx,cy=center
    x=(cx/W)*100; y=(cy/H)*100
    finding={
        'code':code,'place':name,
        'finding': idx%3,
        'polygonPct': [[x-8,y-6],[x+9,y-7],[x+10,y+5],[x-7,y+6]]
    }
    (OUT/f'{code}.json').write_text(__import__('json').dumps(finding))
print(f'generated {len(LOCATIONS)*3} images in {OUT}')
