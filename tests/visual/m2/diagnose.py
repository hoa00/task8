import json
import sys
from collections import Counter
from pathlib import Path
from PIL import Image, ImageChops

report = json.loads(Path(sys.argv[1]).read_text())
rows = []
for sample in report['samples']:
    if sample['status'] != 'failed' or not sample['captures']:
        continue
    capture = sample['captures'][0]
    source = Image.open(capture['source']['path']).convert('RGBA')
    target = Image.open(capture['target']['path']).convert('RGBA')
    positions = [(i % source.width, i // source.width) for i, (a, b) in enumerate(zip(source.getdata(), target.getdata())) if a != b]
    boxes = Counter((x // 100 * 100, y // 100 * 100) for x, y in positions)
    rows.append({'id': sample['id'], 'pixels': len(positions), 'bbox': [min(x for x, y in positions), min(y for x, y in positions), max(x for x, y in positions), max(y for x, y in positions)] if positions else None, 'tiles': boxes.most_common(8), 'animations': [[a['name'] for a in side['animations']] for side in sample['geometry']], 'sourceTargetScroller': [side['scrollers'] for side in sample['geometry']]})
print(json.dumps({'reportStatus': report['status'], 'completed': sum(sample['status'] != 'running' for sample in report['samples']), 'failed': rows}, indent=2))
