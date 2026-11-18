"""Generate the skin layout illustration; optional dependency: CairoSVG."""
from pathlib import Path
import cairosvg

def rect(x,y,w,h,c,r=0): return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{c}"/>'

def line(x1,y1,x2,y2,c,w=1): return f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{c}" stroke-width="{w}"/>'

def dot(x,y,r,c): return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"/>'

def mixer(bg, panel, colors, light=False, style="default"):
 s=rect(0,0,160,120,bg)+rect(0,0,160,16,panel)
 for x in [8,17,26]: s+=dot(x,8,2,"#77818a")
 s+=rect(116,5,30,5,"#50606a",2)
 for i,x in enumerate([22,47,72,97,122]):
  c=colors[i%len(colors)];s+=rect(x,23,17,92,panel,2)+rect(x+3,28,11,4,c,1)+rect(x+3,38,11,9,"#41474a",1)+rect(x+3,50,11,9,"#41474a",1)
  s+=rect(x+7,66,3,37,"#586064",1)+rect(x+4,77+(i%3)*5,9,7,"#e6e5dc",2)+rect(x+3,108,11,3,c,1)
 return s

def rack():
 s=rect(0,0,160,120,"#202226")
 for y,c in [(20,"#6ba3c0"),(46,"#9bb783"),(72,"#d4ac7e")]:
  s+=rect(21,y,118,21,"#34383b",2)+rect(26,y+5,23,11,"#17191b",1)
  for x in [62,78,94,110,126]:s+=dot(x,y+10,4,c)+dot(x,y+10,2,"#34383b")
 return s

ROOT=Path(__file__).resolve().parent.parent/"assets"
ROOT.mkdir(exist_ok=True)
mark=rack()
svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">{mark}</svg>'
(ROOT/"preview.svg").write_text(svg+"\n",encoding="utf-8")
cairosvg.svg2png(bytestring=svg.encode(),write_to=str(ROOT/"preview.png"),output_width=160,output_height=120)
