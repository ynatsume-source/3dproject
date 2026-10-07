# Add the sea to the island's weather record (ADR 0006/0007): hourly wave height, swell height, swell period and swell
# direction at Kayama, from the Open-Meteo marine archive (Météo-France MFWAM wave model, CC BY 4.0) — for the look of
# the sea and for what the residents can see of it (a long swell before a storm); never sent to the science core.
# Each kayama-<year>.json row gains four fields after the eight it has; Feb 29 is left out, as in the bake.
# Usage: python3 scripts/add-island-waves.py <year> <marine json (scratch fetch: hourly wave_height, swell_wave_height,
#   swell_wave_period, swell_wave_direction; timezone Asia/Tokyo; models=meteofrance_wave)>
import json, sys, datetime
year, mf = int(sys.argv[1]), json.load(open(sys.argv[2]))['hourly']
path = f'src/data/weather/kayama-{year}.json'
rec = json.load(open(path)); NA = rec['na']
F0 = 8; assert len(rec['fields']) == F0, 'already has the sea'
idx = {t: i for i, t in enumerate(mf['time'])}
rows, out, k, missing = rec['rows'], [], 0, 0
d = datetime.date(year, 1, 1)
while d.year == year:
    if not (d.month == 2 and d.day == 29):
        for h in range(24):
            i = idx.get(f'{d.isoformat()}T{h:02d}:00')
            def m(key, scale):
                v = mf[key][i] if i is not None else None
                return NA if v is None else round(v * scale)
            add = [m('wave_height', 100), m('swell_wave_height', 100), m('swell_wave_period', 10), NA if i is None or mf['swell_wave_direction'][i] is None else round(mf['swell_wave_direction'][i] / 2)]
            missing += sum(1 for x in add if x == NA)
            out += rows[k * F0:(k + 1) * F0] + add; k += 1
    d += datetime.timedelta(days=1)
assert k * F0 == len(rows)
rec['rows'] = out
rec['fields'] += ['waveHeight cm (MFWAM, look and sight)', 'swellHeight cm (MFWAM)', 'swellPeriod*10 s (MFWAM)', 'swellDir/2 (MFWAM, from)']
rec['source'] += '; sea only: Open-Meteo marine archive (Meteo-France MFWAM, CC BY 4.0)'
json.dump(rec, open(path, 'w'), separators=(',', ':'))
print(path, k, 'hours,', missing, 'sea values missing')
