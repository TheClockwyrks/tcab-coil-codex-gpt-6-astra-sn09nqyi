"""One-time authorship. Requires draw, draw-sheet, sfx-synth and music.
The production build only copies the resulting committed assets.
"""
import json
import array
import math
import pathlib
import subprocess
import tempfile
import wave

ROOT = pathlib.Path(__file__).resolve().parents[1]
TMP = pathlib.Path(tempfile.mkdtemp(prefix='coil-assets-'))

def run(tool, *args):
    subprocess.run([tool, *map(str, args)], check=True, stdout=subprocess.DEVNULL)

def sprite(name, frame=None):
    pixels = []
    for y in range(32):
        for x in range(32):
            color = None
            if name == 'body':
                d = abs(y - 15.5)
                if d < 11:
                    color = '#12695e' if d > 9 else '#24ba94' if d > 6 else '#59e6b0'
                    if y in (8, 9): color = '#a0ffd0'
                    if (x + abs(y-16)) % 12 < 2 and d < 7: color = '#2bc697'
            elif name == 'corner':
                radius = math.hypot(31.5-x, 31.5-y)
                d = abs(radius - 16)
                if d < 11:
                    color = '#12695e' if d > 9 else '#24ba94' if d > 6 else '#59e6b0'
                    if 22 < radius < 24: color = '#a0ffd0'
                    if abs(x-y) < 2 and d < 7: color = '#2bc697'
            elif name == 'tail':
                d = abs(y-15.5)
                width = min(11, 1 + x * .52)
                if d < width:
                    color = '#12695e' if d > width-2 else '#24ba94' if d > width-4 else '#59e6b0'
                    if y == int(16-width+3) and x > 8: color = '#a0ffd0'
            else:
                d = abs(y-15.5)
                width = 10 if x < 6 else 13 if x < 23 else 11 if x < 28 else 8
                if d < width and x < 31:
                    color = '#168d78' if d > width-2 else '#62edbc' if d > width-4 else '#b9ffdc'
                    if 5 < x < 13 and abs(y-15.5) < 5: color = '#73eaba'
                    if 16 <= x <= 23 and y in range(7,12): color = '#063239'
                    if 20 <= x <= 22 and y in (7,8,9): color = '#f6fff0'
                    if 16 <= x <= 23 and y in range(20,25): color = '#063239'
                    if 20 <= x <= 22 and y in (20,21,22): color = '#f6fff0'
                    opening = [0, 3, 7, 4][frame]
                    if x >= 23 and abs(y-15.5) <= opening * (x-21)/9:
                        color = None
                    if opening and x in (25,26) and y in (14-opening,17+opening): color = '#ffffff'
                    if not opening and x >= 26 and y == 16: color = '#168d78'
            if color: pixels.append({'op':'set_pixel','x':x,'y':y,'color':color+'ff'})
    ops = TMP / f'{name}{frame}.json'
    ops.write_text(json.dumps(pixels))
    dest = ROOT / 'assets/snake' / (f'head/{frame}.png' if frame is not None else f'{name}.png')
    run('draw-sheet' if frame is not None else 'draw','render','--actions',ops,'--out',dest,'--width',32,'--height',32,'--no-layers')

for name in ('body','corner','tail'): sprite(name)
for frame in range(4): sprite('head',frame)

def config(name, duration):
    p = TMP / f'{name}.json'
    p.write_text(json.dumps({'sample_rate':44100,'channels':'stereo','max_duration_ms':duration,'seed':27,
        'actions':str(TMP/f'{name}-ops.json'),'preview':str(TMP/f'{name}.png'),
        'wav':str(ROOT/f'assets/audio/{name}.wav'),'mid':str(TMP/f'{name}.mid')}))
    return p

for name, voices in {
    'eat':[('triangle',880,65,-13,1320),('sine',440,45,-18,660)],
    'combo-up':[('triangle',1320,110,-17,1760),('sine',1760,140,-22,2640)],
    'death':[('saw',150,550,-17,35),('sine',80,650,-10,28),('noise',80,180,-25,80)],
}.items():
    cfg = config(name, 900)
    run('sfx-synth','--config',cfg,'init')
    for i,(osc,freq,duration,gain,end) in enumerate(voices):
        v = f'v{i}'
        run('sfx-synth','--config',cfg,'add-voice','--name',v,'--wave',osc,'--freq',freq,'--dur',duration,f'--gain={gain}')
        run('sfx-synth','--config',cfg,'set-envelope','--voice',v,'--env','pluck' if name != 'death' else 'linear')
        run('sfx-synth','--config',cfg,'set-pitch','--voice',v,'--slide-to',end,'--over',duration)
    run('sfx-synth','--config',cfg,'render')

cfg = config('music', 16000)
run('music','--config',cfg,'init')
run('music','--config',cfg,'set-tempo','--bpm',120)
for name, inst, gain, env in [('bass','triangle',-22,'pluck'),('glass','sine',-29,'pluck'),('pad','triangle',-35,'swell')]:
    run('music','--config',cfg,'define-track','--name',name,'--instrument',inst)
    run('music','--config',cfg,'set-track-fx','--track',name,f'--gain={gain}','--env',env)
for bar, root in enumerate([45,45,41,43,45,48,41,43]):
    for beat in range(4):
        run('music','--config',cfg,'add-note','--track','bass','--pitch',root+(12 if beat==3 else 0),'--t',bar*4+beat,'--dur',.65,'--velocity',80)
    for step,offset in enumerate([12,19,24,19]):
        run('music','--config',cfg,'add-note','--track','glass','--pitch',root+offset,'--t',bar*4+step+.5,'--dur',.35,'--velocity',65)
    for offset in [12,15,19]:
        run('music','--config',cfg,'add-note','--track','pad','--pitch',root+offset,'--t',bar*4,'--dur',3.8,'--velocity',55)
run('music','--config',cfg,'render')
# Keep exactly eight bars, removing the renderer's extra release padding.
p = ROOT/'assets/audio/music.wav'
with wave.open(str(p),'rb') as f:
    params = f.getparams()
    data = f.readframes(44100*16)
    data += bytes(44100*16*params.nchannels*params.sampwidth-len(data))
    samples = array.array('h',data)
    data = array.array('h',(round(sample*1.6) for sample in samples)).tobytes()
with wave.open(str(p),'wb') as f:
    f.setparams(params)
    f.writeframes(data)
print('Produced seven sprites and four audio files.')
