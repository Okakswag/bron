// выбранная категория и текущий юзер
let currentCategory = 'Все';
let currentUser = null;

// старт при открытии страницы
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    setupDefaultDates();
});

// ставим дефолтные даты заезда и выезда
function setupDefaultDates() {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 2);
    document.getElementById('bookCheckIn').value = today.toISOString().split('T')[0];
    document.getElementById('bookCheckOut').value = tomorrow.toISOString().split('T')[0];
}

// берем токен из localstorage
function getToken() {
    return localStorage.getItem('auth_token');
}

// проверяем авторизацию
async function checkSession() {
    const token = getToken();
    if (!token) return updateAuthUI(null);

    try {
        const res = await fetch('/api/me', {
            headers: { 'Authorization': token }
        });
        if (res.ok) {
            const data = await res.json();
            updateAuthUI(data.user);
        } else {
            localStorage.removeItem('auth_token');
            updateAuthUI(null);
        }
    } catch (e) {
        updateAuthUI(null);
    }
}

// переключаем кнопки в шапке
function updateAuthUI(user) {
    currentUser = user;
    const guestBox = document.getElementById('guestBox');
    const userBox = document.getElementById('userBox');
    const myBookingsBtn = document.getElementById('myBookingsBtn');
    const userNameDisplay = document.getElementById('userNameDisplay');

    if (user) {
        guestBox.classList.add('hidden');
        userBox.classList.remove('hidden');
        myBookingsBtn.classList.remove('hidden');
        userNameDisplay.textContent = user.name;
    } else {
        guestBox.classList.remove('hidden');
        userBox.classList.add('hidden');
        myBookingsBtn.classList.add('hidden');
    }
}

// открываем окно входа/регистрации
function openAuthModal(mode) {
    document.getElementById('authModal').classList.remove('hidden');
    switchAuthTab(mode);
}

// закрываем модалку
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// переключаем табы вход/регистрация
function switchAuthTab(mode) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');

    if (mode === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        tabLogin.classList.remove('active');
        tabRegister.classList.add('active');
    }
}

// отправка формы регистрации
async function submitRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const errBox = document.getElementById('regError');
    errBox.classList.add('hidden');

    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();
    if (!res.ok) {
        errBox.textContent = data.detail || 'Ошибка регистрации';
        errBox.classList.remove('hidden');
        return;
    }

    localStorage.setItem('auth_token', data.token);
    updateAuthUI(data.user);
    closeModal('authModal');
    showToast(`Добро пожаловать, ${data.user.name}!`);
}

// отправка формы входа
async function submitLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errBox = document.getElementById('loginError');
    errBox.classList.add('hidden');

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
        errBox.textContent = data.detail || 'Ошибка входа';
        errBox.classList.remove('hidden');
        return;
    }

    localStorage.setItem('auth_token', data.token);
    updateAuthUI(data.user);
    closeModal('authModal');
    showToast('Вы успешно вошли в аккаунт');
}

// выход из профиля
function logout() {
    localStorage.removeItem('auth_token');
    updateAuthUI(null);
    showToast('Вы вышли из аккаунта');
}

// выбор категории
function setCategory(cat, btn) {
    currentCategory = cat;
    document.querySelectorAll('.category-tabs .tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    filterHouses();
}

// фильтрация и поиск домов
function filterHouses() {
    const query = document.getElementById('searchInput').value.toLowerCase().trim();
    const minGuests = parseInt(document.getElementById('guestsFilter').value, 10);

    document.querySelectorAll('.house-card').forEach(card => {
        const cat = card.dataset.category;
        const guests = parseInt(card.dataset.guests, 10);
        const searchStr = card.dataset.search;

        const matchCat = currentCategory === 'Все' || cat === currentCategory;
        const matchGuests = guests >= minGuests;
        const matchSearch = !query || searchStr.includes(query);

        if (matchCat && matchGuests && matchSearch) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
}

// открываем окно бронирования
function openBookingModal(id, title, price, maxGuests) {
    if (!currentUser) {
        showToast('Сначала войдите в аккаунт');
        openAuthModal('login');
        return;
    }
    document.getElementById('bookHouseId').value = id;
    document.getElementById('bookHouseTitle').textContent = title;
    document.getElementById('bookHousePrice').value = price;
    const guestsInput = document.getElementById('bookGuests');
    const max = parseInt(maxGuests, 10) || 2;
    guestsInput.max = max;
    guestsInput.value = Math.min(2, max);

    calculateTotal();
    document.getElementById('bookingModal').classList.remove('hidden');
}

// считаем сумму брони
function calculateTotal() {
    const price = parseInt(document.getElementById('bookHousePrice').value || '0', 10);
    const checkIn = new Date(document.getElementById('bookCheckIn').value);
    const checkOut = new Date(document.getElementById('bookCheckOut').value);

    const diff = Math.round((checkOut - checkIn) / (1000 * 60 * 60 * 24));
    const days = diff > 0 ? diff : 1;
    const total = days * price;

    document.getElementById('bookTotalDisplay').textContent = total.toLocaleString('ru-RU') + ' ₽';
    return total;
}

// отправляем бронь на сервер
async function submitBooking(e) {
    e.preventDefault();
    const house_id = parseInt(document.getElementById('bookHouseId').value, 10);
    const check_in = document.getElementById('bookCheckIn').value;
    const check_out = document.getElementById('bookCheckOut').value;
    const guests = parseInt(document.getElementById('bookGuests').value, 10);
    const total_price = calculateTotal();
    const errBox = document.getElementById('bookError');
    errBox.classList.add('hidden');

    if (new Date(check_out) <= new Date(check_in)) {
        errBox.textContent = 'Дата выезда должна быть позже даты заезда';
        errBox.classList.remove('hidden');
        return;
    }

    const res = await fetch('/api/book', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': getToken()
        },
        body: JSON.stringify({ house_id, check_in, check_out, guests, total_price })
    });

    if (!res.ok) {
        const data = await res.json();
        errBox.textContent = data.detail || 'Ошибка при бронировании';
        errBox.classList.remove('hidden');
        return;
    }

    closeModal('bookingModal');
    showToast('Дом успешно забронирован!');
}

// личный кабинет: список броней
async function openCabinetModal(e) {
    if (e) e.preventDefault();
    document.getElementById('cabinetModal').classList.remove('hidden');
    const list = document.getElementById('bookingsList');
    list.innerHTML = '<p>Загрузка...</p>';

    const res = await fetch('/api/my-bookings', {
        headers: { 'Authorization': getToken() }
    });
    const data = await res.json();

    if (!data.bookings || data.bookings.length === 0) {
        list.innerHTML = '<p style="color:#6E675F;">У вас пока нет активных бронирований.</p>';
        return;
    }

    list.innerHTML = data.bookings.map(b => `
        <div class="booking-item">
            <img src="${b.image}" alt="${b.title}">
            <div class="booking-info">
                <h4>${b.title}</h4>
                <p>${b.location}</p>
                <p>Заезд: <strong>${b.check_in}</strong> • Выезд: <strong>${b.check_out}</strong> (${b.guests} гост.)</p>
                <p>Сумма: <strong>${b.total_price.toLocaleString('ru-RU')} ₽</strong></p>
            </div>
            <button class="btn btn-outline btn-sm" onclick="cancelBooking(${b.id})">Отменить</button>
        </div>
    `).join('');
}

// отмена брони
async function cancelBooking(id) {
    await fetch(`/api/book/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': getToken() }
    });
    showToast('Бронирование отменено');
    openCabinetModal();
}

// тост внизу экрана
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3200);
}
