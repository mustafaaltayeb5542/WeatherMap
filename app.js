'use strict';

const CONFIG = {
    DEFAULT_LAT: 15.5007,
    DEFAULT_LNG: 32.5599,
    DEFAULT_ZOOM: 6,

    OWM_API_KEY: '42c73ac27ab262e6dc364abf43644b9a',
    OWM_BASE_URL: 'https://api.openweathermap.org/data/2.5',

    NOMINATIM_URL: 'https://nominatim.openstreetmap.org/search',

    FAVORITES_KEY: 'weathermap_favorites'
};

const DOM = {
    form: document.getElementById('weather-form'),
    locationInput: document.getElementById('location-input'),
    getWeatherBtn: document.getElementById('get-weather-btn'),
    btnText: document.querySelector('.btn-text'),
    btnSpinner: document.querySelector('.btn-spinner'),
    mapContainer: document.getElementById('map'),
    loadingSpinner: document.getElementById('loading-spinner'),
    errorAlert: document.getElementById('error-alert'),
    errorMessage: document.getElementById('error-message'),
    errorClose: document.getElementById('error-close'),
    favoritesSection: document.getElementById('favorites-section'),
    favoritesList: document.getElementById('favorites-list'),
    forecastSection: document.getElementById('forecast-section'),
    forecastContainer: document.getElementById('forecast-container')
};

const state = {
    map: null,
    marker: null,
    currentLocation: null,
    favorites: []
};

let errorTimeout = null;

function showLoading() {
    DOM.loadingSpinner.classList.remove('hidden');
    DOM.getWeatherBtn.disabled = true;
    DOM.btnText.textContent = 'Loading...';
    DOM.btnSpinner.classList.remove('hidden');
}

function hideLoading() {
    DOM.loadingSpinner.classList.add('hidden');
    DOM.getWeatherBtn.disabled = false;
    DOM.btnText.textContent = 'Get Weather';
    DOM.btnSpinner.classList.add('hidden');
}

function showError(message) {
    DOM.errorMessage.textContent = message;
    DOM.errorAlert.classList.remove('hidden');

    if (errorTimeout) {
        clearTimeout(errorTimeout);
    }

    errorTimeout = setTimeout(() => {
        DOM.errorAlert.classList.add('hidden');
        errorTimeout = null;
    }, 8000);
}

function hideError() {
    DOM.errorAlert.classList.add('hidden');

    if (errorTimeout) {
        clearTimeout(errorTimeout);
        errorTimeout = null;
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function loadFavorites() {
    try {
        const stored = localStorage.getItem(CONFIG.FAVORITES_KEY);
        state.favorites = stored ? JSON.parse(stored) : [];
    } catch (e) {
        state.favorites = [];
    }

    renderFavorites();
}

function saveFavorites() {
    try {
        localStorage.setItem(
            CONFIG.FAVORITES_KEY,
            JSON.stringify(state.favorites)
        );
    } catch (e) {
        console.warn('Could not save favorites:', e);
    }
}

function addFavorite(cityName) {
    const normalized = cityName.trim().toLowerCase();

    if (!normalized) {
        return;
    }

    if (state.favorites.some(f => f.toLowerCase() === normalized)) {
        return;
    }

    state.favorites.push(cityName.trim());
    saveFavorites();
    renderFavorites();
}

function removeFavorite(cityName) {
    state.favorites = state.favorites.filter(
        f => f.toLowerCase() !== cityName.toLowerCase()
    );

    saveFavorites();
    renderFavorites();
}

function renderFavorites() {
    if (state.favorites.length === 0) {
        DOM.favoritesSection.classList.add('hidden');
        return;
    }

    DOM.favoritesSection.classList.remove('hidden');
    DOM.favoritesList.innerHTML = '';

    state.favorites.forEach(city => {
        const chip = document.createElement('button');

        chip.type = 'button';
        chip.className = 'favorite-chip';
        chip.dataset.city = city;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = city;

        const removeSpan = document.createElement('span');
        removeSpan.className = 'remove-fav';
        removeSpan.textContent = '×';
        removeSpan.title = 'Remove from favorites';

        chip.appendChild(nameSpan);
        chip.appendChild(removeSpan);

        chip.addEventListener('click', event => {
            if (event.target === removeSpan) {
                return;
            }

            DOM.locationInput.value = city;
            DOM.form.requestSubmit();
        });

        removeSpan.addEventListener('click', event => {
            event.stopPropagation();
            removeFavorite(city);
        });

        DOM.favoritesList.appendChild(chip);
    });
}

function initMap() {
    state.map = L.map(DOM.mapContainer, {
        center: [CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG],
        zoom: CONFIG.DEFAULT_ZOOM,
        zoomControl: true
    });

    L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
            attribution:
                '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }
    ).addTo(state.map);

    const defaultIcon = L.divIcon({
    className: 'custom-default-marker',
    html: '<div></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
});

    state.marker = L.marker(
        [CONFIG.DEFAULT_LAT, CONFIG.DEFAULT_LNG],
        {
            icon: defaultIcon
        }
    ).addTo(state.map);

    state.marker
        .bindPopup(
            '<div style="text-align:center;font-family:Roboto,sans-serif;">' +
            '<strong>Khartoum, Sudan</strong><br>' +
            '<small>Default location</small>' +
            '</div>'
        )
        .openPopup();
}

async function geocodeLocation(locationName) {
    const url =
        `${CONFIG.NOMINATIM_URL}?q=${encodeURIComponent(locationName)}` +
        '&format=json&limit=1&addressdetails=1';

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(
            `Geocoding failed: ${response.status} ${response.statusText}`
        );
    }

    const data = await response.json();

    if (!data || data.length === 0) {
        throw new Error(
            `Location "${locationName}" was not found. Please try again.`
        );
    }

    const result = data[0];

    return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name,
        cityName: result.name || locationName,
        country: result.address?.country || ''
    };
}

async function fetchCurrentWeather(lat, lng) {
    const url =
        `${CONFIG.OWM_BASE_URL}/weather?lat=${lat}&lon=${lng}` +
        `&appid=${CONFIG.OWM_API_KEY}&units=metric&lang=en`;

    const response = await fetch(url);

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error(
                'Invalid OpenWeatherMap API key. Please check the API key in app.js.'
            );
        }

        throw new Error(
            `Failed to fetch weather data: ${response.status}`
        );
    }

    return await response.json();
}

async function fetchForecast(lat, lng) {
    const url =
        `${CONFIG.OWM_BASE_URL}/forecast?lat=${lat}&lon=${lng}` +
        `&appid=${CONFIG.OWM_API_KEY}&units=metric&lang=en`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Failed to fetch forecast data: ${response.status}`
        );
    }

    return await response.json();
}

function updateMapLocation(lat, lng, cityName) {
    if (state.marker) {
        state.map.removeLayer(state.marker);
    }

    state.map.flyTo([lat, lng], 10, {
        duration: 1.5,
        easeLinearity: 0.25
    });

    const customIcon = L.divIcon({
        className: 'custom-weather-marker',
        html:
            '<div style="background:#e74c3c;width:20px;height:20px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3);"></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 26],
        popupAnchor: [0, -26]
    });

    state.marker = L.marker([lat, lng], {
        icon: customIcon,
        title: cityName
    }).addTo(state.map);
}

function buildWeatherInfoWindow(weather, cityName) {
    const iconCode = weather.weather[0].icon;
    const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
    const temp = Math.round(weather.main.temp);
    const feelsLike = Math.round(weather.main.feels_like);
    const humidity = weather.main.humidity;
    const windSpeed = weather.wind.speed;
    const clouds = weather.clouds.all;
    const description = capitalize(weather.weather[0].description);
    const country = weather.sys?.country || '';

    return `
        <div class="weather-infowindow">
            <h3>📍 ${cityName}${country ? ', ' + country : ''}</h3>

            <div class="weather-main">
                <img class="weather-icon" src="${iconUrl}" alt="${description}" />
                <div>
                    <div class="weather-temp">${temp}°C</div>
                    <div class="weather-desc">${description}</div>
                </div>
            </div>

            <div class="weather-details">
                <span>💧 ${humidity}%</span>
                <span>💨 ${windSpeed} m/s</span>
                <span>☁️ ${clouds}%</span>
                <span>🌡️ ${feelsLike}°C</span>
            </div>

            <div class="popup-actions">
                <button class="share-btn" id="share-weather-btn">📤 Share</button>
                <button class="save-btn" id="save-weather-btn">⭐ Save</button>
               
            </div>
        </div>
    `;
}
function openInfoWindow(weather, cityName) {
    const html = buildWeatherInfoWindow(weather, cityName);

    state.map.once('popupopen', (e) => {
        const popupElement = e.popup.getElement();
        if (!popupElement) return;

        const shareBtn = popupElement.querySelector('#share-weather-btn');
        const saveBtn  = popupElement.querySelector('#save-weather-btn');

        if (shareBtn) {
            shareBtn.addEventListener('click', async () => {
                try {
                    await shareWeather(weather, cityName);
                } catch (error) {
                    console.error('Share failed:', error);
                    showError('Could not share weather information.');
                }
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                addFavorite(cityName);
                showTemporaryToast(`⭐ "${cityName}" added to favorites`);
            });
        }
    });

    state.marker
        .bindPopup(html, {
            maxWidth: 320,
            className: 'weather-popup'
        })
        .openPopup();
}


async function shareWeather(weather, cityName) {
    const temp = Math.round(weather.main.temp);
    const description =
        capitalize(weather.weather[0].description);
    const humidity = weather.main.humidity;
    const windSpeed = weather.wind.speed;

    const text =
        `🌤️ Weather in ${cityName}:\n` +
        `🌡️ Temperature: ${temp}°C\n` +
        `☁️ Condition: ${description}\n` +
        `💧 Humidity: ${humidity}%\n` +
        `💨 Wind: ${windSpeed} m/s\n` +
        `— via WeatherMap SPA`;

    if (navigator.share) {
    try {
        await navigator.share({
            title: `Weather in ${cityName}`,
            text: text,
            url: window.location.href
        });

        return;
        } catch (error) {
            if (error.name === 'AbortError') {
                return;
            }
        }
    }

    try {
        await navigator.clipboard.writeText(text);

        showTemporaryToast(
            'Weather information has been copied to the clipboard!'
        );
    } catch (error) {
        const textarea =
            document.createElement('textarea');

        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';

        document.body.appendChild(textarea);
        textarea.select();

        try {
            document.execCommand('copy');

            showTemporaryToast(
                'Weather information has been copied!'
            );
        } catch (e) {
            showError(
                'Failed to copy the data. Please try manually.'
            );
        }

        document.body.removeChild(textarea);
    }
}

function showTemporaryToast(message) {
    const toast = document.createElement('div');

    toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: #27ae60;
        color: #fff;
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        z-index: 9999;
        font-family: Roboto, sans-serif;
        font-size: 0.95rem;
        animation: slideDown 0.3s ease-out;
    `;

    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.3s';
        toast.style.opacity = '0';

        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 2500);
}

function renderForecast(forecastData) {
    if (!forecastData || !Array.isArray(forecastData.list)) {
        DOM.forecastSection.classList.add('hidden');
        return;
    }

    const dailyMap = new Map();

    forecastData.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const dayKey =
            date.toISOString().split('T')[0];

        const hour = date.getHours();

        if (
            !dailyMap.has(dayKey) ||
            Math.abs(hour - 12) <
            Math.abs(
                new Date(
                    dailyMap.get(dayKey).dt * 1000
                ).getHours() - 12
            )
        ) {
            dailyMap.set(dayKey, item);
        }
    });

    const days =
        Array.from(dailyMap.values()).slice(0, 5);

    DOM.forecastContainer.innerHTML = '';

    DOM.forecastSection.classList.remove('hidden');

    days.forEach(day => {
        const date = new Date(day.dt * 1000);

        const dayName =
            date.toLocaleDateString(
                'en-US',
                {
                    weekday: 'long'
                }
            );

        const dateStr =
            date.toLocaleDateString(
                'en-US',
                {
                    month: 'short',
                    day: 'numeric'
                }
            );

        const iconUrl =
            `https://openweathermap.org/img/wn/${day.weather[0].icon}@2x.png`;

        const temp =
            Math.round(day.main.temp);

        const desc =
            capitalize(day.weather[0].description);

        const humidity =
            day.main.humidity;

        const wind =
            day.wind.speed;

        const card =
            document.createElement('div');

        card.className =
            'forecast-card';

        card.innerHTML = `
            <div class="forecast-day">
                ${dayName}
            </div>

            <div style="font-size:0.75rem;color:#7f8c8d;">
                ${dateStr}
            </div>

            <img
                class="forecast-icon"
                src="${iconUrl}"
                alt="${desc}"
            />

            <div class="forecast-temp">
                ${temp}°C
            </div>

            <div class="forecast-desc">
                ${desc}
            </div>

            <div class="forecast-details">
                <span>💧 ${humidity}%</span>
                <span>💨 ${wind} m/s</span>
            </div>
        `;

        DOM.forecastContainer.appendChild(card);
    });
}

async function handleFormSubmit(event) {
    event.preventDefault();

    hideError();

    const locationName =
        DOM.locationInput.value.trim();

    if (!locationName) {
        showError('Please enter a city name.');
        return;
    }

    showLoading();

    try {
        const location =
            await geocodeLocation(locationName);

        state.currentLocation =
            location;

        const [weather, forecast] =
            await Promise.all([
                fetchCurrentWeather(
                    location.lat,
                    location.lng
                ),

                fetchForecast(
                    location.lat,
                    location.lng
                ).catch(() => null)
            ]);

        updateMapLocation(
            location.lat,
            location.lng,
            location.cityName
        );

        openInfoWindow(
            weather,
            location.cityName
        );

        if (forecast) {
            renderForecast(
                forecast
            );
        } else {
            DOM.forecastSection.classList.add(
                'hidden'
            );
        }

        DOM.locationInput.value = '';

    } catch (error) {
        console.error(
            'WeatherMap error:',
            error
        );

        showError(
            error.message ||
            'An unexpected error occurred. Please try again.'
        );

    } finally {
        hideLoading();
    }
}

function init() {
    initMap();

    loadFavorites();

    DOM.form.addEventListener(
        'submit',
        handleFormSubmit
    );

    DOM.errorClose.addEventListener(
        'click',
        hideError
    );

    console.log(
        'WeatherMap SPA initialized successfully.'
    );
}

document.addEventListener(
    'DOMContentLoaded',
    init
);
