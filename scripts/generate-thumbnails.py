"""Package locally rendered shader stills. Run tests/collection-render.py first.
Requires Pillow. No third-party artwork is downloaded or bundled.
"""
from pathlib import Path
from io import BytesIO
import json, base64
from PIL import Image, ImageOps
ROOT=Path(__file__).resolve().parents[1]
metadata=json.loads((ROOT/'docs/collection-metadata.json').read_text())
ids=['ripple','glass','mandelbrot','spectrum']+[v[0] for v in metadata]
images={}
for id in ids:
    source=ROOT/'artifacts'/'collection'/f'{id}.png'
    if not source.exists(): raise SystemExit(f'Missing {source}; run the renderer test first.')
    image=ImageOps.fit(Image.open(source).convert('RGB'),(240,152),method=Image.Resampling.LANCZOS)
    stream=BytesIO(); image.save(stream,format='JPEG',quality=86,optimize=True)
    images[id]='data:image/jpeg;base64,'+base64.b64encode(stream.getvalue()).decode('ascii')
(ROOT/'src/visuals/thumbnails.ts').write_text('// Generated from our actual shaders. Rebuild using scripts/generate-thumbnails.py.\nexport const THUMBNAILS: Record<string, string> = '+json.dumps(images,separators=(',',':'))+';\n')
print(f'Packaged {len(images)} locally rendered thumbnails.')
