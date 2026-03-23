import os
import uuid
from datetime import datetime, timedelta
import json
import urllib.parse
import urllib.request
import urllib.error

from flask import Blueprint, current_app, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from auth import create_user, verify_admin, verify_user
from database import db
from models import AdminSession, Booking, RefundRequest, TimeSlot, Turf, User


api = Blueprint("api", __name__)


def build_maps_link(turf_name, location):
    query = f"{turf_name} {location}".strip().replace(" ", "+")
    return f"https://www.google.com/maps/search/?api=1&query={query}"


def normalize_status(value):
    if value is None:
        return None
    return str(value).strip().lower()


def is_reserved_status(value):
    # Backwards compatibility: old system used "BOOKED".
    return normalize_status(value) in {"pending", "confirmed", "booked"}


def is_booked_status(value):
    # Slot is considered unavailable only after admin confirmation.
    return normalize_status(value) in {"confirmed", "booked"}


def allowed_image(filename):
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in {"jpg", "jpeg", "png"}


def parse_slot_datetime(date_str, time_slot):
    # date_str is expected "YYYY-MM-DD"; time_slot like "07:00 AM"
    return datetime.strptime(f"{date_str} {time_slot}", "%Y-%m-%d %I:%M %p")


def parse_requested_datetime(date_str, time_str):
    if not date_str or not time_str:
        raise ValueError("date and time required")

    raw = f"{date_str} {time_str}".strip()
    for fmt in ("%Y-%m-%d %I:%M %p", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    raise ValueError("Invalid date/time format")


def classify_weather(temp_c, condition_main, wind_speed_mps):
    condition = (condition_main or "").strip().lower()
    is_rainy = condition in {"rain", "thunderstorm"}
    too_hot = temp_c is not None and temp_c > 35
    heavy_wind = wind_speed_mps is not None and wind_speed_mps >= 10

    if is_rainy:
        return "risky", "Rain/thunderstorm expected, consider another slot."
    if too_hot:
        return "risky", "Very hot weather expected, consider another slot."
    if heavy_wind:
        return "risky", "High winds expected, consider another slot."

    return "safe", "Cool and calm weather, good to play."


class OpenWeatherHttpError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def fetch_openweather_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "find-your-turf/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            body = resp.read().decode("utf-8")
        return json.loads(body)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8") if hasattr(exc, "read") else ""
        message = "OpenWeatherMap request failed."
        try:
            payload = json.loads(raw) if raw else {}
            message = payload.get("message") or message
        except Exception:
            pass
        raise OpenWeatherHttpError(exc.code, message) from exc


def fetch_openweather_geocode(location, api_key):
    params = {
        "q": location,
        "limit": 1,
        "appid": api_key,
    }
    url = "https://api.openweathermap.org/geo/1.0/direct?" + urllib.parse.urlencode(params)
    results = fetch_openweather_json(url)
    if not results:
        raise ValueError("Location not found for weather lookup. Try a nearby city name.")
    return results[0]


def fetch_openweather_forecast(location, api_key):
    geo = fetch_openweather_geocode(location, api_key)
    lat = geo.get("lat")
    lon = geo.get("lon")
    if lat is None or lon is None:
        raise ValueError("Unable to resolve location coordinates for weather lookup.")

    params = {
        "lat": lat,
        "lon": lon,
        "appid": api_key,
        "units": "metric",
    }
    url = "https://api.openweathermap.org/data/2.5/forecast?" + urllib.parse.urlencode(params)
    forecast = fetch_openweather_json(url)

    # Attach resolved place info for nicer display on frontend.
    if isinstance(forecast, dict):
        forecast.setdefault("city", {})
        forecast["city"].setdefault("name", geo.get("name") or location)
        forecast["city"].setdefault("country", geo.get("country"))
    return forecast


@api.get("/uploads/<path:filename>")
def uploads(filename):
    return send_from_directory(current_app.config["UPLOAD_FOLDER"], filename)


@api.get("/api/weather")
def get_weather():
    location = (request.args.get("location") or "").strip()
    date_str = (request.args.get("date") or "").strip()
    time_str = (request.args.get("time") or "").strip()

    missing = [k for k, v in [("location", location), ("date", date_str), ("time", time_str)] if not v]
    if missing:
        return jsonify({"error": "Missing parameters", "missing": missing}), 400

    try:
        target_dt = parse_requested_datetime(date_str, time_str)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    api_key = os.getenv("OPENWEATHER_API_KEY") or os.getenv("OPENWEATHERMAP_API_KEY") or ""
    if not api_key:
        return jsonify({"error": "Weather service is not configured (missing OPENWEATHER_API_KEY)."}), 500

    try:
        forecast = fetch_openweather_forecast(location, api_key)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404
    except OpenWeatherHttpError as exc:
        if exc.status_code == 401:
            return jsonify({"error": "Invalid OpenWeatherMap API key."}), 502
        if exc.status_code == 404:
            return jsonify({"error": "Location not found for weather lookup."}), 404
        current_app.logger.warning("OpenWeatherMap HTTP error %s: %s", exc.status_code, exc.message)
        return jsonify({"error": "Failed to fetch weather forecast."}), 502
    except urllib.error.URLError:
        current_app.logger.exception("OpenWeatherMap network error")
        return jsonify({"error": "Unable to reach weather provider. Check internet access and try again."}), 502
    except Exception:
        current_app.logger.exception("OpenWeatherMap fetch failed")
        return jsonify({"error": "Failed to fetch weather forecast."}), 502

    items = forecast.get("list") or []
    if not items:
        return jsonify({"error": "No forecast data available for this location."}), 404

    # Prefer matches on the requested date; OpenWeatherMap forecasts are in 3-hour intervals.
    candidates = []
    for item in items:
        dt_txt = (item.get("dt_txt") or "").strip()
        if dt_txt.startswith(date_str):
            candidates.append(item)

    if not candidates:
        return jsonify({"error": "No forecast available for the selected date (OpenWeatherMap provides up to ~5 days)."}), 404

    def item_dt(item):
        dt_txt = item.get("dt_txt")
        try:
            return datetime.strptime(dt_txt, "%Y-%m-%d %H:%M:%S")
        except Exception:
            return None

    best = None
    best_delta = None
    for item in candidates:
        d = item_dt(item)
        if not d:
            continue
        delta = abs((d - target_dt).total_seconds())
        if best is None or delta < best_delta:
            best = item
            best_delta = delta

    if not best:
        return jsonify({"error": "Unable to match a forecast time for the selected slot."}), 404

    temp_c = best.get("main", {}).get("temp")
    weather_obj = (best.get("weather") or [{}])[0] or {}
    condition_main = weather_obj.get("main") or "Unknown"
    condition_desc = weather_obj.get("description") or condition_main
    wind_speed_mps = best.get("wind", {}).get("speed")

    status, message = classify_weather(temp_c, condition_main, wind_speed_mps)

    return jsonify(
        {
            "location": forecast.get("city", {}).get("name") or location,
            "matched_time": best.get("dt_txt"),
            "temperature": round(float(temp_c), 1) if temp_c is not None else None,
            "condition": str(condition_desc).title(),
            "condition_main": condition_main,
            "wind_speed": wind_speed_mps,
            "status": status,
            "message": message,
        }
    )


@api.post("/api/register")
def register():
    payload = request.get_json(silent=True) or {}
    required = ["name", "email", "password", "phone_number", "location"]
    missing = [key for key in required if key not in payload or not payload[key]]
    if missing:
        return jsonify({"error": "Missing fields", "fields": missing}), 400

    if User.query.filter_by(email=payload["email"]).first():
        return jsonify({"error": "Email already registered"}), 409

    user = create_user(payload)
    return jsonify({"message": "Registered", "user": user.to_dict()}), 201


@api.post("/api/login")
def login():
    payload = request.get_json(silent=True) or {}
    email = payload.get("email")
    password = payload.get("password")
    if not email or not password:
        return jsonify({"error": "Email and password required"}), 400

    user = verify_user(email, password)
    if not user:
        return jsonify({"error": "Invalid credentials"}), 401

    return jsonify({"message": "Login success", "user": user.to_dict()})


@api.post("/api/admin-login")
def admin_login():
    payload = request.get_json(silent=True) or {}
    username = payload.get("username")
    password = payload.get("password")
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    admin = verify_admin(username, password)
    if not admin:
        return jsonify({"error": "Invalid admin credentials"}), 401

    token = uuid.uuid4().hex
    session = AdminSession(admin_id=admin.id, token=token)
    db.session.add(session)
    db.session.commit()

    return jsonify(
        {
            "message": "Admin login success",
            "admin": {"username": admin.username, "token": token},
        }
    )


def extract_bearer_token():
    auth = (request.headers.get("Authorization") or "").strip()
    if not auth:
        return None
    parts = auth.split(None, 1)
    if len(parts) != 2:
        return None
    if parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def require_admin_auth():
    token = extract_bearer_token() or (request.headers.get("X-Admin-Token") or "").strip() or None
    if not token:
        return None
    session = AdminSession.query.filter_by(token=token).first()
    if not session:
        return None
    return session.admin


def admin_required(handler):
    def wrapped(*args, **kwargs):
        admin = require_admin_auth()
        if not admin:
            return jsonify({"error": "Admin authentication required"}), 401
        return handler(*args, **kwargs)

    wrapped.__name__ = handler.__name__
    return wrapped


@api.get("/api/turfs")
def get_turfs():
    turfs = Turf.query.order_by(Turf.rating.desc()).all()
    return jsonify([t.to_dict() for t in turfs])


@api.get("/api/turf/<int:turf_id>/slots")
def get_turf_slots(turf_id):
    turf = Turf.query.get(turf_id)
    if not turf:
        return jsonify({"error": "Turf not found"}), 404

    date = request.args.get("date")
    slots = TimeSlot.query.filter_by(
        turf_id=turf_id).order_by(TimeSlot.id.asc()).all()

    # If date is provided, check for existing bookings
    slot_data = []
    booked_time_slots = set()
    if date:
        bookings = Booking.query.filter_by(turf_id=turf_id, date=date).all()
        for booking in bookings:
            if is_booked_status(booking.status):
                booked_time_slots.add(booking.time_slot)
    for slot in slots:
        slot_dict = slot.to_dict()
        if date:
            slot_dict["availability_status"] = "BOOKED" if slot.time_slot in booked_time_slots else "AVAILABLE"
        slot_data.append(slot_dict)

    return jsonify({"turf": turf.to_dict(), "slots": slot_data})


@api.post("/api/booking-request")
def booking_request():
    form = request.form or {}
    user_id = form.get("user_id")
    turf_id = form.get("turf_id")
    date = form.get("date")
    time_slot = form.get("time_slot")
    players_count = form.get("players_count")
    special_notes = form.get("special_notes")
    user_name = (form.get("user_name") or "").strip()
    phone_number = (form.get("phone_number") or "").strip()

    missing = [k for k in ["user_id", "turf_id", "date", "time_slot"] if not form.get(k)]
    if missing:
        return jsonify({"error": "Missing fields", "fields": missing}), 400

    user = User.query.get(int(user_id))
    if not user:
        return jsonify({"error": "User not found"}), 404

    if user_name:
        user.name = user_name
    if phone_number:
        user.phone_number = phone_number

    turf = Turf.query.get(int(turf_id))
    if not turf:
        return jsonify({"error": "Turf not found"}), 404

    existing = Booking.query.filter_by(turf_id=int(turf_id), date=date, time_slot=time_slot).all()
    if any(is_booked_status(b.status) for b in existing):
        return jsonify({"error": "Slot not available"}), 409

    screenshot = request.files.get("payment_screenshot")
    if not screenshot or not screenshot.filename:
        return jsonify({"error": "Payment screenshot required"}), 400
    if not allowed_image(screenshot.filename):
        return jsonify({"error": "Only jpg, jpeg, png allowed"}), 400

    safe_name = secure_filename(screenshot.filename)
    ext = safe_name.rsplit(".", 1)[-1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    screenshot.save(os.path.join(current_app.config["UPLOAD_FOLDER"], filename))

    parsed_players_count = None
    if players_count not in (None, ""):
        try:
            parsed_players_count = int(players_count)
        except ValueError:
            return jsonify({"error": "players_count must be a number"}), 400

    booking = Booking(
        user_id=int(user_id),
        turf_id=int(turf_id),
        date=date,
        time_slot=time_slot,
        players_count=parsed_players_count,
        special_notes=(special_notes or "").strip() or None,
        payment_screenshot=f"uploads/{filename}",
        status="pending",
    )
    db.session.add(booking)
    db.session.commit()

    return (
        jsonify(
            {
                "message": "Booking request submitted. Waiting for admin confirmation.",
                "booking": booking.to_dict(),
            }
        ),
        201,
    )


@api.get("/api/my-bookings")
def my_bookings():
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    bookings = Booking.query.filter_by(user_id=int(user_id)).order_by(Booking.created_at.desc()).all()
    return jsonify([b.to_dict() for b in bookings])


@api.get("/api/booking/<int:booking_id>")
def booking_details(booking_id):
    booking = Booking.query.get(booking_id)
    if not booking:
        return jsonify({"error": "Booking not found"}), 404
    return jsonify(booking.to_dict())


@api.post("/api/book-slot")
def book_slot():
    return jsonify({"error": "Deprecated endpoint. Use /api/booking-request with payment screenshot."}), 410


@api.get("/api/admin/bookings")
@admin_required
def admin_bookings():
    bookings = Booking.query.order_by(Booking.created_at.desc()).all()
    return jsonify([b.to_dict() for b in bookings])


@api.get("/api/admin/users")
@admin_required
def admin_users():
    users = User.query.order_by(User.created_at.desc()) if hasattr(
        User, "created_at") else User.query.order_by(User.id.desc())
    return jsonify([u.to_dict() for u in users])


@api.post("/api/admin/add-turf")
@admin_required
def admin_add_turf():
    payload = request.get_json(silent=True) or {}
    required = ["turf_name", "location",
                "rating", "price_per_hour", "image_url"]
    missing = [key for key in required if key not in payload or not payload[key]]
    if missing:
        return jsonify({"error": "Missing fields", "fields": missing}), 400

    maps_link = build_maps_link(payload["turf_name"], payload["location"])
    turf = Turf(
        turf_name=payload["turf_name"],
        location=payload["location"],
        rating=float(payload["rating"]),
        price_per_hour=int(payload["price_per_hour"]),
        image_url=payload["image_url"],
        maps_link=maps_link,
    )
    db.session.add(turf)
    db.session.commit()
    return jsonify(turf.to_dict()), 201


@api.delete("/api/admin/delete-turf")
@admin_required
def admin_delete_turf():
    payload = request.get_json(silent=True) or {}
    turf_id = payload.get("turf_id")
    if not turf_id:
        return jsonify({"error": "turf_id required"}), 400

    turf = Turf.query.get(turf_id)
    if not turf:
        return jsonify({"error": "Turf not found"}), 404

    db.session.delete(turf)
    db.session.commit()
    return jsonify({"message": "Turf deleted"})


@api.post("/api/admin/create-slots")
@admin_required
def admin_create_slots():
    payload = request.get_json(silent=True) or {}
    turf_id = payload.get("turf_id")
    slots = payload.get("slots", [])
    if not turf_id or not slots:
        return jsonify({"error": "turf_id and slots required"}), 400

    created = []
    for slot in slots:
        exists = TimeSlot.query.filter_by(
            turf_id=turf_id, time_slot=slot).first()
        if not exists:
            new_slot = TimeSlot(turf_id=turf_id, time_slot=slot,
                                availability_status="AVAILABLE")
            db.session.add(new_slot)
            created.append(slot)
    db.session.commit()

    return jsonify({"message": "Slots created", "created": created})


@api.post("/api/admin/slot-status")
@admin_required
def admin_slot_status():
    payload = request.get_json(silent=True) or {}
    slot_id = payload.get("slot_id")
    status = payload.get("status")
    if not slot_id or status not in ["AVAILABLE", "BOOKED", "UNAVAILABLE"]:
        return jsonify({"error": "slot_id and valid status required"}), 400

    slot = TimeSlot.query.get(slot_id)
    if not slot:
        return jsonify({"error": "Slot not found"}), 404

    slot.availability_status = status
    db.session.commit()
    return jsonify({"message": "Slot updated", "slot": slot.to_dict()})


@api.post("/api/admin/cancel-booking")
@admin_required
def admin_cancel_booking():
    payload = request.get_json(silent=True) or {}
    booking_id = payload.get("booking_id")
    if not booking_id:
        return jsonify({"error": "booking_id required"}), 400

    booking = Booking.query.get(booking_id)
    if not booking:
        return jsonify({"error": "Booking not found"}), 404

    booking.status = "cancelled"
    slot = TimeSlot.query.filter_by(
        turf_id=booking.turf_id, time_slot=booking.time_slot).first()
    if slot:
        slot.availability_status = "AVAILABLE"

    db.session.commit()
    return jsonify({"message": "Booking cancelled"})


@api.post("/api/admin/confirm-booking")
@admin_required
def admin_confirm_booking():
    payload = request.get_json(silent=True) or {}
    booking_id = payload.get("booking_id")
    if not booking_id:
        return jsonify({"error": "booking_id required"}), 400

    booking = Booking.query.get(int(booking_id))
    if not booking:
        return jsonify({"error": "Booking not found"}), 404

    others = Booking.query.filter(
        Booking.turf_id == booking.turf_id,
        Booking.date == booking.date,
        Booking.time_slot == booking.time_slot,
        Booking.id != booking.id,
    ).all()

    # Allow confirmation only if the slot is still free for that date.
    if any(is_booked_status(other.status) for other in others):
        return jsonify({"error": "Slot already confirmed for this date/time"}), 409

    booking.status = "confirmed"
    booking.admin_message = (
        f"Booking confirmed by admin on {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}."
    )

    # Reject other pending requests for the same slot (best-effort).
    for other in others:
        if normalize_status(other.status) == "pending":
            other.status = "rejected"
            other.admin_message = (
                "This slot was confirmed for another request. Please choose a different slot."
            )

    db.session.commit()
    return jsonify({"message": "Booking confirmed successfully.", "booking": booking.to_dict()})


@api.post("/api/admin/reject-booking")
@admin_required
def admin_reject_booking():
    payload = request.get_json(silent=True) or {}
    booking_id = payload.get("booking_id")
    if not booking_id:
        return jsonify({"error": "booking_id required"}), 400

    booking = Booking.query.get(int(booking_id))
    if not booking:
        return jsonify({"error": "Booking not found"}), 404

    booking.status = "rejected"
    booking.admin_message = (
        "Booking rejected by admin. Payment could not be verified. Please contact admin if this is a mistake."
    )
    db.session.commit()
    return jsonify({"message": "Booking rejected successfully.", "booking": booking.to_dict()})


@api.post("/api/refund-request")
def refund_request():
    payload = request.get_json(silent=True) or {}
    booking_id = payload.get("booking_id")
    user_id = payload.get("user_id")
    reason = (payload.get("reason") or "").strip()

    if not booking_id or not user_id or not reason:
        return jsonify({"error": "booking_id, user_id, reason required"}), 400

    booking = Booking.query.get(int(booking_id))
    if not booking or int(booking.user_id) != int(user_id):
        return jsonify({"error": "Booking not found"}), 404

    if normalize_status(booking.status) != "cancelled":
        return jsonify({"error": "Refund allowed only for cancelled bookings"}), 409

    slot_dt = parse_slot_datetime(booking.date, booking.time_slot)
    if datetime.now() > (slot_dt - timedelta(hours=3)):
        return jsonify({"error": "Refund allowed only if requested at least 3 hours before slot time"}), 409

    existing = RefundRequest.query.filter_by(booking_id=int(booking_id)).order_by(RefundRequest.id.desc()).first()
    if existing and normalize_status(existing.status) in {"pending", "approved"}:
        return jsonify({"error": "Refund request already exists"}), 409

    rr = RefundRequest(booking_id=int(booking_id), user_id=int(user_id), reason=reason, status="pending")
    db.session.add(rr)
    db.session.commit()
    return jsonify({"message": "Refund request submitted", "refund": rr.to_dict()}), 201


@api.get("/api/admin/refunds")
@admin_required
def admin_refunds():
    refunds = RefundRequest.query.order_by(RefundRequest.created_at.desc()).all()
    return jsonify([r.to_dict() for r in refunds])


@api.post("/api/admin/refund-action")
@admin_required
def admin_refund_action():
    payload = request.get_json(silent=True) or {}
    refund_id = payload.get("refund_request_id")
    action = normalize_status(payload.get("action"))
    if not refund_id or action not in {"approved", "rejected"}:
        return jsonify({"error": "refund_request_id and action required"}), 400

    rr = RefundRequest.query.get(int(refund_id))
    if not rr:
        return jsonify({"error": "Refund request not found"}), 404

    rr.status = action
    db.session.commit()
    return jsonify({"message": "Refund updated", "refund": rr.to_dict()})
