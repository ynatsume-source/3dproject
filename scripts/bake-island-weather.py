# Bake a year of hourly weather at Kayama for Dot's world (ADR 0006/0007): the island's weather is the Earth's
# past weather replayed on the island's calendar. Source: Open-Meteo historical archive (ERA5 reanalysis —
# observations assimilated into a model, not raw station readings), CC BY 4.0.
# Usage: python3 scripts/bake-island-weather.py <open-meteo archive json> <year>
#   (the json: archive-api.open-meteo.com/v1/archive?latitude=24.361&longitude=123.997&start_date=Y-01-01&end_date=Y-12-31
#    &hourly=temperature_2m,relative_humidity_2m,precipitation,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover
#    &wind_speed_unit=ms&timezone=Asia%2FTokyo)
import json, sys
src, year = sys.argv[1], int(sys.argv[2])
h = json.load(open(src))['hourly']
n = len(h['time'])
keep = 365 * 24   # (a leap year's last day is dropped: the island's year has 365 days)
rows = []
for i in range(min(n, keep)):
    rows += [round(h['temperature_2m'][i] * 10), round(h['relative_humidity_2m'][i]), round(h['precipitation'][i] * 10),
             round(h['pressure_msl'][i] * 10) - 9000, round(h['wind_speed_10m'][i] * 10), round(h['wind_direction_10m'][i] / 2),
             round(h['wind_gusts_10m'][i] * 10), round(h['cloud_cover'][i])]
out = {'source': 'Open-Meteo historical weather archive (ERA5 reanalysis), CC BY 4.0', 'place': 'Kayama 24.361N 123.997E', 'year': year,
       'fields': ['air*10', 'rh%', 'rain*10 mm/h', 'pressure*10-9000 hPa', 'wind*10 m/s', 'windDir/2', 'gust*10 m/s', 'cloud%'], 'rows': rows}
json.dump(out, open(f'src/data/weather/kayama-{year}.json', 'w'), separators=(',', ':'))
print(f'kayama-{year}.json', len(rows) // 8, 'hours')
