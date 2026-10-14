"""Unaltered young-tree V2/V3 comparisons; no brightness correction."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import sys
root=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
for before in sorted((root/'extra-before').glob('*.png')):
 after=root/'extra-after'/before.name
 if not after.exists():continue
 images=[Image.open(p).convert('RGB') for p in [before,after]];w,h=images[0].size;assert images[1].size==(w,h)
 c=Image.new('RGB',(w*2,h+38),(30,35,38));d=ImageDraw.Draw(c);f=ImageFont.truetype(fontpath,18 if w<500 else 24)
 for i,(im,label) in enumerate(zip(images,['V2 / 18ad2bf','V3 / 64a8d87'])):
  c.paste(im,(i*w,38));d.text((i*w+12,7),label,font=f,fill='white')
 c.save(out/(before.stem+'-comparison.png'))
frames=[root/f'motion-{side}/frames/{i:03}.png' for i in range(12) for side in ['before','after']]
if all(p.exists() for p in frames):
 c=Image.new('RGB',(2340,882),(30,35,38));d=ImageDraw.Draw(c);f=ImageFont.truetype(fontpath,20)
 for n,i in enumerate([0,5,11]):
  for k,side in enumerate(['before','after']):
   im=Image.open(root/f'motion-{side}/frames/{i:03}.png').convert('RGB');assert im.size==(390,844)
   x=n*780+k*390;c.paste(im,(x,38));d.text((x+10,7),f'{"V2" if k==0 else "V3"} / frame {i}',font=f,fill='white')
 c.save(out/'motion-contact-sheet.png')
 c=Image.new('RGB',(1560,3*448),(30,35,38));d=ImageDraw.Draw(c);f=ImageFont.truetype(fontpath,16)
 for i in range(12):
  x=(i%4)*390;y=(i//4)*448;d.text((x+6,y+3),f'frame {i:02} / V2 | V3',font=f,fill='white')
  for k,side in enumerate(['before','after']):
   im=Image.open(root/f'motion-{side}/frames/{i:03}.png').convert('RGB').resize((195,422),Image.Resampling.LANCZOS);c.paste(im,(x+k*195,y+26))
 c.save(out/'motion-all-frames.png')
