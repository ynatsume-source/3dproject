"""Compose unaltered paired screenshots and sampled motion frames; no brightness correction."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys
root=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
for before in sorted((root/'extra-before').glob('*.png')):
 after=root/'extra-after'/before.name
 if not after.exists():continue
 images=[Image.open(p).convert('RGB') for p in [before,after]]
 w,h=images[0].size;assert images[1].size==(w,h)
 canvas=Image.new('RGB',(w*2,h+38),(30,35,38));draw=ImageDraw.Draw(canvas)
 font=ImageFont.truetype(font_path,18 if w<500 else 24)
 for i,(im,label) in enumerate(zip(images,['Before / main','After / restored'])):
  canvas.paste(im,(i*w,38));draw.text((i*w+12,7),label,font=font,fill='white')
 canvas.save(out/(before.stem+'-comparison.png'))
frames=[root/f'motion-{side}/frames/{i:03}.png' for i in [0,5,11] for side in ['before','after']]
if all(p.exists() for p in frames):
 canvas=Image.new('RGB',(1280,3*394),(30,35,38));draw=ImageDraw.Draw(canvas);font=ImageFont.truetype(font_path,20)
 for k,p in enumerate(frames):
  col=k%2;row=k//2;im=Image.open(p).convert('RGB');assert im.size==(640,360)
  canvas.paste(im,(col*640,row*394+34));draw.text((col*640+12,row*394+5),f'{"Before" if col==0 else "After"} / frame {[0,5,11][row]}',font=font,fill='white')
 canvas.save(out/'motion-contact-sheet.png')
# Fixed small control regions outside the restored foliage, not a whole-image quality test.
import json
controls=[]
for before in sorted((root/'extra-before').glob('*.png')):
 after=root/'extra-after'/before.name
 if not after.exists():continue
 a,b=[Image.open(p).convert('RGB') for p in [before,after]]
 boxes={'young_trunk':(190,410,195,500),'hearth':(324,414,355,443),'clear_ground':(220,430,270,470)} if a.width==390 else {'young_trunk':(633,370,641,450),'hearth':(782,347,849,382),'clear_ground':(550,430,580,460)}
 for name,box in boxes.items():
  aa,bb=a.crop(box).tobytes(),b.crop(box).tobytes()
  changed=sum(aa[i:i+3]!=bb[i:i+3] for i in range(0,len(aa),3))
  controls.append({'case':before.stem,'region':name,'box':box,'changedPixels':changed,'pixels':(box[2]-box[0])*(box[3]-box[1])})
(out/'control-regions.json').write_text(json.dumps({'note':'Fixed small rendered control patches; not proof that every other object/pixel is unchanged. Foliage occlusion is expected to change.', 'regions':controls},indent=2)+'\n')
all_frames=[root/f'motion-{side}/frames/{i:03}.png' for i in range(12) for side in ['before','after']]
if all(p.exists() for p in all_frames):
 canvas=Image.new('RGB',(1280,6*206),(30,35,38));draw=ImageDraw.Draw(canvas);font=ImageFont.truetype(font_path,16)
 for i in range(12):
  x=(i%2)*640;y=(i//2)*206
  draw.text((x+8,y+3),f'frame {i:02} / main (left) | restored (right)',font=font,fill='white')
  for k,side in enumerate(['before','after']):
   im=Image.open(root/f'motion-{side}/frames/{i:03}.png').convert('RGB').resize((320,180),Image.Resampling.LANCZOS)
   canvas.paste(im,(x+k*320,y+26))
 canvas.save(out/'motion-all-frames.png')
