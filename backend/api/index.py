import os
import sqlite3
import sys

# Ensure backend modules can be imported when running this file directly
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

from routes import api
from auth import ensure_admin
from database import init_db, db
from flask_cors import CORS
from flask import Flask, jsonify


def create_app():

    app = Flask(__name__)

    db_path = os.path.join(BASE_DIR, "turf.db")

    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["UPLOAD_FOLDER"] = os.path.join(BASE_DIR, "uploads")
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    CORS(app)
    init_db(app)

    app.register_blueprint(api)

    @app.get("/")
    def root():
        return jsonify({"status": "NEARBY TURF FINDER & BOOKING SYSTEM API"})

    def ensure_schema():
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        # Turfs: ensure maps_link exists and is populated.
        cur.execute("PRAGMA table_info(turfs);")
        turf_cols = [row[1] for row in cur.fetchall()]
        if "maps_link" not in turf_cols:
            cur.execute("ALTER TABLE turfs ADD COLUMN maps_link TEXT")
        if {"id", "turf_name", "location", "maps_link"}.issubset(set(turf_cols + ["maps_link"])):
            cur.execute("SELECT id, turf_name, location, maps_link FROM turfs")
            rows = cur.fetchall()
            for turf_id, turf_name, location, maps_link in rows:
                if not maps_link:
                    query = f"{turf_name} {location}".strip().replace(" ", "+")
                    link = f"https://www.google.com/maps/search/?api=1&query={query}"
                    cur.execute("UPDATE turfs SET maps_link=? WHERE id=?", (link, turf_id))

        # Bookings: migrate older schema (customer_name/phone/booking_date) to newer schema
        # expected by SQLAlchemy models (user_id/date/status). The legacy schema may also
        # have NOT NULL constraints that make inserts fail, so we rebuild the table.
        cur.execute("PRAGMA table_info(bookings);")
        booking_cols = [row[1] for row in cur.fetchall()]
        legacy_booking_cols = {"customer_name", "phone", "booking_date"}

        if booking_cols and (legacy_booking_cols & set(booking_cols)):
            # Clean up any previous partial migration.
            cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='bookings_legacy'"
            )
            if cur.fetchone():
                cur.execute("DROP TABLE bookings_legacy")

            cur.execute("ALTER TABLE bookings RENAME TO bookings_legacy")
            cur.execute(
                """
                CREATE TABLE bookings (
                    id INTEGER PRIMARY KEY,
                    user_id INTEGER,
                    turf_id INTEGER NOT NULL,
                    date TEXT NOT NULL,
                    time_slot TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'confirmed',
                    created_at DATETIME
                )
                """
            )

            # Build a compatible SELECT depending on which columns existed.
            user_expr = "user_id" if "user_id" in booking_cols else "NULL"
            date_expr = (
                "COALESCE(date, booking_date)"
                if ("date" in booking_cols and "booking_date" in booking_cols)
                else ("date" if "date" in booking_cols else "booking_date")
            )
            status_expr = "COALESCE(status, 'BOOKED')" if "status" in booking_cols else "'BOOKED'"
            created_expr = "created_at" if "created_at" in booking_cols else "CURRENT_TIMESTAMP"

            cur.execute(
                f"""
                INSERT INTO bookings (id, user_id, turf_id, date, time_slot, status, created_at)
                SELECT id, {user_expr}, turf_id, {date_expr}, time_slot, {status_expr}, {created_expr}
                FROM bookings_legacy
                """
            )
            cur.execute("DROP TABLE bookings_legacy")

            # Refresh columns after rebuild.
            cur.execute("PRAGMA table_info(bookings);")
            booking_cols = [row[1] for row in cur.fetchall()]

        if booking_cols:
            if "user_id" not in booking_cols:
                cur.execute("ALTER TABLE bookings ADD COLUMN user_id INTEGER")
            if "date" not in booking_cols:
                cur.execute("ALTER TABLE bookings ADD COLUMN date TEXT")
            if "players_count" not in booking_cols:
                cur.execute("ALTER TABLE bookings ADD COLUMN players_count INTEGER")
            if "special_notes" not in booking_cols:
                cur.execute("ALTER TABLE bookings ADD COLUMN special_notes TEXT")
            if "payment_screenshot" not in booking_cols:
                cur.execute("ALTER TABLE bookings ADD COLUMN payment_screenshot TEXT")
            if "status" not in booking_cols:
                cur.execute("ALTER TABLE bookings ADD COLUMN status TEXT")
            if "created_at" not in booking_cols:
                cur.execute("ALTER TABLE bookings ADD COLUMN created_at DATETIME")
            if "updated_at" not in booking_cols:
                cur.execute("ALTER TABLE bookings ADD COLUMN updated_at DATETIME")
            if "admin_message" not in booking_cols:
                cur.execute("ALTER TABLE bookings ADD COLUMN admin_message TEXT")

            # Normalize null status values for older rows.
            cur.execute("UPDATE bookings SET status = COALESCE(status, 'confirmed')")
            cur.execute("UPDATE bookings SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)")

        # Admin sessions table (token auth for admin API endpoints).
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='admin_sessions'"
        )
        if not cur.fetchone():
            cur.execute(
                """
                CREATE TABLE admin_sessions (
                    id INTEGER PRIMARY KEY,
                    admin_id INTEGER NOT NULL,
                    token TEXT NOT NULL UNIQUE,
                    created_at DATETIME,
                    FOREIGN KEY (admin_id) REFERENCES admins(id)
                )
                """
            )

        # Refund requests table (created via SQLAlchemy, but keep as safety for existing DBs).
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='refund_requests'"
        )
        if not cur.fetchone():
            cur.execute(
                """
                CREATE TABLE refund_requests (
                    id INTEGER PRIMARY KEY,
                    booking_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at DATETIME,
                    FOREIGN KEY (booking_id) REFERENCES bookings(id),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
                """
            )

        conn.commit()
        conn.close()

    with app.app_context():
        db.create_all()
        ensure_schema()
        ensure_admin("admin", "admin123")

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", os.getenv("FLASK_RUN_PORT", "5000")))
    app.run(host="0.0.0.0", port=port, debug=True)
