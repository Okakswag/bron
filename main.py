import os
import hashlib
import uuid
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

# подгружаем переменные из .env
load_dotenv()

# настройки подключения к бд
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "house")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "123")

app = FastAPI(title="УютДом")

# подключаем статику и шаблоны
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# храним токены сессий
sessions = {}


# подключение к postgres
def get_db():
    try:
        connection = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD,
            cursor_factory=RealDictCursor
        )
        return connection
    except Exception as err:
        print(f"ошибка подключения к базе: {err}")
        raise HTTPException(
            status_code=500,
            detail="база данных не подключена"
        )


# хешируем пароль
def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


# схемы для запросов
class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class BookingRequest(BaseModel):
    house_id: int
    check_in: str
    check_out: str
    guests: int
    total_price: int


# ищем юзера по токену в сессиях
def get_current_user(request: Request):
    token = request.headers.get("Authorization")
    if not token or token not in sessions:
        return None

    user_id = sessions[token]
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, email FROM users WHERE id = %s", (user_id,))
            user = cur.fetchone()
            return dict(user) if user else None
    except Exception as e:
        print(f"ошибка юзера: {e}")
        return None
    finally:
        if conn:
            conn.close()


# главная страница со списком домов
@app.get("/", response_class=HTMLResponse)
async def home_page(request: Request):
    houses = []
    try:
        conn = get_db()
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM houses ORDER BY id ASC")
            rows = cur.fetchall()
            for row in rows:
                item = dict(row)
                # делим строку удобств на список
                raw_features = item.get("features", "") or ""
                item["features_list"] = [f.strip() for f in raw_features.split(",") if f.strip()]
                houses.append(item)
        conn.close()
    except Exception as e:
        print(f"ошибка загрузки домов: {e}")

    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"houses": houses}
    )


# регистрация нового пользователя
@app.post("/api/register")
async def register_user(data: RegisterRequest):
    if len(data.password) < 4:
        raise HTTPException(status_code=400, detail="пароль минимум 4 символа")

    email = data.email.lower().strip()
    name = data.name.strip()
    hashed_pwd = hash_password(data.password)

    conn = get_db()
    try:
        with conn.cursor() as cur:
            # проверяем есть ли уже такой email
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cur.fetchone():
                raise HTTPException(status_code=400, detail="такой email уже существует")

            # добавляем запись в таблицу users
            cur.execute(
                "INSERT INTO users (name, email, password) VALUES (%s, %s, %s) RETURNING id",
                (name, email, hashed_pwd)
            )
            new_user_id = cur.fetchone()["id"]
            conn.commit()
    finally:
        conn.close()

    # сохраняем токен
    token = str(uuid.uuid4())
    sessions[token] = new_user_id

    return {
        "status": "success",
        "token": token,
        "user": {"id": new_user_id, "name": name, "email": email}
    }


# вход в аккаунт
@app.post("/api/login")
async def login_user(data: LoginRequest):
    email = data.email.lower().strip()
    hashed_pwd = hash_password(data.password)

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, email FROM users WHERE email = %s AND password = %s",
                (email, hashed_pwd)
            )
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=401, detail="неверная почта или пароль")
            user_data = dict(user)
    finally:
        conn.close()

    # выдаем токен
    token = str(uuid.uuid4())
    sessions[token] = user_data["id"]

    return {
        "status": "success",
        "token": token,
        "user": user_data
    }


# проверка залогинен ли
@app.get("/api/me")
async def get_me(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="не авторизован")
    return {"user": user}


# бронирование дома
@app.post("/api/book")
async def make_booking(data: BookingRequest, request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="нужно войти в аккаунт")

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO bookings (user_id, house_id, check_in, check_out, guests, total_price)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (user["id"], data.house_id, data.check_in, data.check_out, data.guests, data.total_price))
            conn.commit()
    finally:
        conn.close()

    return {"status": "ok", "message": "дом забронирован"}


# список броней для личного кабинета
@app.get("/api/my-bookings")
async def get_my_bookings(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="не авторизован")

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT b.id, b.check_in::text, b.check_out::text, b.guests, b.total_price,
                       h.title, h.location, h.image
                FROM bookings b
                JOIN houses h ON b.house_id = h.id
                WHERE b.user_id = %s
                ORDER BY b.id DESC
            """, (user["id"],))
            rows = cur.fetchall()
            bookings = [dict(r) for r in rows]
    finally:
        conn.close()

    return {"bookings": bookings}


# отмена бронирования
@app.delete("/api/book/{booking_id}")
async def cancel_booking(booking_id: int, request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="не авторизован")

    conn = get_db()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM bookings WHERE id = %s AND user_id = %s",
                (booking_id, user["id"])
            )
            conn.commit()
    finally:
        conn.close()

    return {"status": "deleted"}


# запуск сервера
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
