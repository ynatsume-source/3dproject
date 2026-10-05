# Bake a year of hourly weather at Kayama for Dot's world (ADR 0006/0007): the island's weather is the Earth's past
# weather replayed on the island's calendar.
#  - measured (what the science core may take, environment.source 'record'): JMA surface observations at Ishigaki
#    (station 47918), hourly — sea-level pressure, rain, air temperature, humidity, wind (at the station's anemometer)
#  - for the look of the sky only (never sent to the science core): cloud and gusts from the Open-Meteo archive
#    (ERA5 reanalysis, CC BY 4.0), which the station does not report hourly
# The island's year has 365 days: Feb 29 is left out.
# Usage: python3 scripts/bake-island-weather.py <jma json (scratch fetch)> <open-meteo archive json> <year>
import json, sys, datetime
jma, om, year = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))['hourly'], int(sys.argv[3])
NA = -32768
idx = {t: i for i, t in enumerate(om['time'])}
rows, missing = [], 0
d = datetime.date(year, 1, 1)
while d.year == year:
    if not (d.month == 2 and d.day == 29):
        day, prev = jma.get(d.isoformat(), []), jma.get((d - datetime.timedelta(days=1)).isoformat(), [])
        for h in range(24):
            # JMA's rows are hours 1..24 (the reading at that hour; rain over the hour before it): local hour h is row h,
            # and midnight is the day before's 24th
            j = (day[h - 1] if h - 1 < len(day) else None) if h else (prev[23] if len(prev) > 23 else None)
            i = idx.get(f'{d.isoformat()}T{h:02d}:00')
            def m(k, scale, off=0):
                v = j[k] if j and j[k] is not None else None
                return NA if v is None else round(v * scale) - off
            row = [m(2, 10), m(3, 1), m(1, 10), m(0, 10, 9000), m(4, 10), NA if not j or j[5] is None else round(j[5] / 2)]
            missing += sum(1 for x in row if x == NA)
            row += [round(om['wind_gusts_10m'][i] * 10) if i is not None else NA, round(om['cloud_cover'][i]) if i is not None else NA]
            rows += row
    d += datetime.timedelta(days=1)
out = {'source': 'measured: JMA surface observations, Ishigaki (47918); sky only: Open-Meteo archive (ERA5 reanalysis, CC BY 4.0)',
       'station': 'jma-47918', 'year': year, 'na': NA,
       'fields': ['air*10', 'rh%', 'rain*10 mm/h', 'seaLevelPressure*10-9000 hPa', 'wind*10 m/s', 'windDir/2', 'gust*10 m/s (ERA5, look only)', 'cloud% (ERA5, look only)'], 'rows': rows}
json.dump(out, open(f'src/data/weather/kayama-{year}.json', 'w'), separators=(',', ':'))
print(f'kayama-{year}.json', len(rows) // 8, 'hours,', missing, 'measured values missing')
