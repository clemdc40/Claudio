// Weather via open-meteo.com — free, no API key

const WMO = {
  0: ['Ciel dégagé', '☀️'],
  1: ['Principalement dégagé', '🌤️'], 2: ['Partiellement nuageux', '⛅'], 3: ['Couvert', '☁️'],
  45: ['Brouillard', '🌫️'], 48: ['Brouillard givrant', '🌫️'],
  51: ['Bruine légère', '🌦️'], 53: ['Bruine', '🌦️'], 55: ['Bruine dense', '🌧️'],
  61: ['Pluie légère', '🌧️'], 63: ['Pluie', '🌧️'], 65: ['Pluie forte', '🌧️'],
  71: ['Neige légère', '🌨️'], 73: ['Neige', '🌨️'], 75: ['Neige forte', '❄️'],
  77: ['Grains de neige', '🌨️'],
  80: ['Averses légères', '🌦️'], 81: ['Averses', '🌧️'], 82: ['Averses violentes', '⛈️'],
  85: ['Averses de neige', '🌨️'], 86: ['Averses de neige fortes', '❄️'],
  95: ['Orage', '⛈️'], 96: ['Orage avec grêle', '⛈️'], 99: ['Orage fort avec grêle', '⛈️']
};

function wmo(code) {
  return WMO[code] || ['Inconnu', '🌡️'];
}

export async function fetchWeather(city) {
  // Geocoding
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr&format=json`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!geoRes.ok) throw new Error('Géocodage échoué');
  const geoData = await geoRes.json();
  const loc = geoData.results?.[0];
  if (!loc) throw new Error(`Ville "${city}" introuvable`);

  // Forecast
  const params = new URLSearchParams({
    latitude: loc.latitude,
    longitude: loc.longitude,
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,precipitation',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum',
    timezone: 'auto',
    forecast_days: 4,
    wind_speed_unit: 'kmh'
  });
  const wRes = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!wRes.ok) throw new Error('Météo indisponible');
  const w = await wRes.json();

  return buildWeatherCard(loc, w);
}

function buildWeatherCard(loc, w) {
  const c = w.current;
  const d = w.daily;
  const [desc, icon] = wmo(c.weather_code);

  const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const days = d.time.slice(0, 4).map((dateStr, i) => {
    const [di, ei] = wmo(d.weather_code[i]);
    const dow = i === 0 ? "Auj." : i === 1 ? "Dem." : dayNames[new Date(dateStr).getDay()];
    return `
      <div class="weather-day">
        <span class="weather-day__name">${dow}</span>
        <span class="weather-day__icon">${ei}</span>
        <span class="weather-day__temps"><b>${Math.round(d.temperature_2m_max[i])}°</b> <span>${Math.round(d.temperature_2m_min[i])}°</span></span>
      </div>`;
  }).join('');

  const html = `
<div class="weather-card">
  <div class="weather-card__main">
    <div class="weather-card__left">
      <div class="weather-card__city">${loc.name}${loc.country_code ? ', ' + loc.country_code : ''}</div>
      <div class="weather-card__temp">${Math.round(c.temperature_2m)}°C</div>
      <div class="weather-card__desc">${desc} · Ressenti ${Math.round(c.apparent_temperature)}°C</div>
      <div class="weather-card__details">
        <span>💧 ${c.relative_humidity_2m}%</span>
        <span>🌬️ ${Math.round(c.wind_speed_10m)} km/h</span>
        ${c.precipitation > 0 ? `<span>🌧️ ${c.precipitation} mm</span>` : ''}
      </div>
    </div>
    <div class="weather-card__icon-big">${icon}</div>
  </div>
  <div class="weather-card__forecast">${days}</div>
</div>`;

  // Also return text summary for the model context
  const text = `Météo à ${loc.name} : ${Math.round(c.temperature_2m)}°C, ${desc}, ressenti ${Math.round(c.apparent_temperature)}°C, humidité ${c.relative_humidity_2m}%, vent ${Math.round(c.wind_speed_10m)} km/h.`;

  return { html, text };
}
